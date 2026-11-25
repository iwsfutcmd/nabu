"""The course compiler (gameplan §7.5): stages 1–7 and 9; audio (stage 8) arrives in Phase 5.

compile_course() returns diagnostics and, when there are no errors, the bundle's content;
write_bundle() (package.py) turns that into content-addressed files. Every diagnostic carries
file:line.
"""

from __future__ import annotations

import hashlib
import json
import unicodedata
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, cast

import regex
import yaml
from pydantic import BaseModel, ValidationError

from nabu import forms as lexical_forms
from nabu import lexicon as lx
from nabu import sitelen_pona
from nabu.analyzers import Analyzer, analyzers_by_tool
from nabu.compiler import consistency
from nabu.compiler import text as tx
from nabu.compiler import tokens as tk
from nabu.compiler.audio import ShippedClip, check_audio
from nabu.compiler.counts import Counted, count
from nabu.compiler.diagnostics import Diagnostics, Loc
from nabu.compiler.readings import pin_lexeme_readings
from nabu.compiler.scenarios import compile_scenarios
from nabu.compiler.script import compile_alphabets, with_alphabets
from nabu.compiler.source import Doc, load_doc
from nabu.compiler.stories import LineForm, compile_stories
from nabu.corecli import CoreCli
from nabu.drills.rbnf import icu_version, spellout, transform
from nabu.items import Content
from nabu.paradigms import Refused, paradigms
from nabu.paths import I18N_GENERATED, PROFILES
from nabu.projections import leftovers, unaccounted
from nabu.schema.models import (
    BundleLexicon,
    BundleUnit,
    CourseSource,
    LogographsStep,
    OrthographyProfile,
    Persons,
    SentenceForm,
    SentenceSource,
    UnitSource,
    VocalizationSource,
)
from nabu.schemes import plugins, schemes

#: What counts towards a sentence's new material (i+1): lexemes, the feature values a node
#: introduces and rules. A script track's letters do not.
I_PLUS_ONE_KINDS = ("lexeme", "feature", "rule")
CORRECT = ("CORRECT", "CORRECT_ALT")


def load_profiles() -> dict[str, OrthographyProfile]:
    out: dict[str, OrthographyProfile] = {}
    for path in sorted(PROFILES.glob("*.yaml")):
        profile = OrthographyProfile.model_validate(
            yaml.safe_load(path.read_text(encoding="utf-8"))
        )
        out[profile.id] = profile
    return out


def load_exemplars() -> dict[str, dict[str, list[str]]]:
    return json.loads((I18N_GENERATED / "exemplars.json").read_text(encoding="utf-8"))


@dataclass
class Unit:
    doc: Doc
    source: UnitSource
    #: A drill the compiler made (stage 4), not authored text: its forms are not linted as prose.
    generated: bool = False


@dataclass
class Compiled:
    """Everything stage 9 needs to write a bundle."""

    course: CourseSource
    #: The bundle's units, as its schema types them (nabu.items walks the items in them).
    units: list[BundleUnit] = field(default_factory=lambda: [])
    #: The bundle's lexicon: the course's lexemes, the labels of its feature values, its rules.
    lexicon: BundleLexicon = field(
        default_factory=lambda: BundleLexicon.model_validate({"language": "und", "lexemes": []})
    )
    #: What each KC id of the course became (its aliases.yaml), where the course has one.
    aliases: dict[str, Any] | None = None
    orthographies: list[str] = field(default_factory=lambda: [])
    support: list[str] = field(default_factory=lambda: [])
    licenses: dict[str, int] = field(default_factory=lambda: {})
    provenance: dict[str, int] = field(default_factory=lambda: {})
    # What the two summaries above count, one entry each.
    counted: list[Counted] = field(default_factory=lambda: [])
    # bundle path → (bytes, SPDX license, attribution source)
    images: dict[str, tuple[bytes, str, str | None]] = field(default_factory=lambda: {})
    # audio: bundle path → (bytes, SPDX license, credit); item → {normal, slow} clips (audio.json)
    audio_files: dict[str, tuple[bytes, str, str]] = field(default_factory=lambda: {})
    audio_items: dict[str, dict[str, ShippedClip]] = field(default_factory=lambda: {})
    # (item, orthography) → token surfaces as written, where vowel marks were added (ADR 0053)
    written: dict[tuple[str, str], list[str]] = field(default_factory=lambda: {})
    # Each lexeme's lexical form against what the course writes (`nabu forms`; stage 1 of rules)
    forms: lexical_forms.Report | None = None
    #: The course's tokens against the language's rules (stage 2), where it has rules.
    tokens: lexical_forms.TokenReport | None = None

    @property
    def content(self) -> Content:
        """The course's units and lexicon together: what its items are walked from."""
        return Content(self.units, self.lexicon)


@dataclass
class Vocalized:
    """One orthography's vowel marks (ADR 0053): each word's marked form; the ambiguous ones;
    a lexeme's first spelling, where another word's entry marks its letters otherwise."""

    words: dict[str, str]
    ambiguous: set[str]
    marks: regex.Pattern[str]
    loc: Loc
    lexemes: dict[str, str] = field(default_factory=lambda: {})


@dataclass
class Ctx:
    diags: Diagnostics
    cli: CoreCli
    profiles: dict[str, OrthographyProfile]
    exemplars: dict[str, dict[str, list[str]]]
    analyzers: dict[str, Analyzer]
    #: The course's language: its lexicon and what it declares.
    lang: lx.Language
    #: Rules the compiler names itself (a drill's), with what a learner is shown for each.
    made_rules: dict[str, dict[str, Any]] = field(default_factory=lambda: {})
    vocalization: dict[str, Vocalized] = field(default_factory=lambda: {})
    written: dict[tuple[str, str], list[str]] = field(default_factory=lambda: {})
    # Each orthography's script (`script_of`), as it is first needed.
    scripts: dict[str, tx.Script] = field(default_factory=lambda: {})
    # What each word reads, by how it is annotated (ADR 0135).
    observed: consistency.Observed = field(default_factory=consistency.Observed)


# ------------------------------------------------------------ helpers


def _pydantic_errors(doc: Doc, error: ValidationError, diags: Diagnostics) -> None:
    """Reports each schema error at the deepest source line it resolves to. For a union (a unit
    given inline or as a path), only the most specific branch's errors are kept."""
    resolved: list[tuple[list[str | int], str]] = []
    for e in error.errors():
        cur: Any = doc.data
        path: list[str | int] = []
        for el in e["loc"]:
            if isinstance(cur, list) and isinstance(el, int) and el < len(cast(list[Any], cur)):
                path.append(el)
                cur = cast(list[Any], cur)[el]
            elif isinstance(cur, dict) and el in cur:
                path.append(el)
                cur = cast(dict[str, Any], cur)[cast(str, el)]
        resolved.append((path, e["msg"]))
    deepest: dict[str | int, int] = {}
    for path, _ in resolved:
        head = path[0] if path else ""
        deepest[head] = max(deepest.get(head, 0), len(path))
    for path, msg in resolved:
        if len(path) < deepest[path[0] if path else ""]:
            continue
        where = ".".join(str(p) for p in path) or "(root)"
        diags.report("parse.schema", f"{where}: {msg}", doc.loc(*path))


def _validate[M: BaseModel](model: type[M], doc: Doc, diags: Diagnostics) -> M | None:
    try:
        return model.model_validate(doc.data)
    except ValidationError as error:
        _pydantic_errors(doc, error, diags)
        return None


def _lang_for(profile: OrthographyProfile, target: str) -> str:
    """The profile's language tag plus the course target's region (fa-Arab + IR → fa-Arab-IR)."""
    parts = target.split("-")
    region = next(
        (p for p in parts[1:] if (len(p) == 2 and p.isupper()) or (len(p) == 3 and p.isdigit())),
        None,
    )
    lang = profile.lang
    has_region = any(
        (len(p) == 2 and p.isupper()) or (len(p) == 3 and p.isdigit()) for p in lang.split("-")[1:]
    )
    return (
        f"{lang}-{region}"
        if region and not has_region and profile.lang.split("-")[0] == parts[0]
        else lang
    )


def _unit_kind(profile: OrthographyProfile) -> str:
    for step in profile.normalize:
        root = getattr(step, "root", step)
        if getattr(root, "whitespace", None) == "remove":
            return "grapheme"
    return "token"


def _ruby_schemes(profile: OrthographyProfile) -> list[str]:
    """Every reading layer shown as ruby, in profile order: Jyutping for yue; Pinyin, Jyutping and
    Baxter's Middle Chinese for lzh (ADR 0071), each pinned on every Han word."""
    return [
        layer.scheme
        for layer in profile.annotations or []
        if layer.kind == "reading" and layer.render == "ruby" and layer.scheme is not None
    ]


def _exemplar_sets(
    exemplars: dict[str, dict[str, list[str]]], profile: OrthographyProfile
) -> tuple[set[str], set[str]] | None:
    """Letter/mark/number/symbol and punctuation code points from the profile's CLDR exemplars.
    A script CLDR has no locale for (sitelen pona, ADR 0086) lists its whole repertoire in
    `exemplarsExtra`, with no `exemplars`: the audit then checks against that alone."""
    if profile.exemplars is None:
        if not profile.exemplarsExtra:
            return None
        data: dict[str, list[str]] = {}
    else:
        key = profile.exemplars.removeprefix("cldr:").replace("_", "-")
        found = exemplars.get(key) or exemplars.get(key.split("-")[0])
        if found is None:
            return None
        data = found
    chars: set[str] = set()
    for kind in ("main", "auxiliary", "index", "numbers"):
        for item in data.get(kind, []):
            chars.update(item)
            chars.update(item.lower())
    punct: set[str] = {c for item in data.get("punctuation", []) for c in item}
    for extra in profile.exemplarsExtra or []:
        # An extra that is punctuation (Hebrew sof pasuq) joins the punctuation set.
        for c in extra:
            (punct if unicodedata.category(c)[0] == "P" else chars).add(c)
    return chars, punct


def script_of(profile: OrthographyProfile, exemplars: dict[str, dict[str, list[str]]]) -> tx.Script:
    """The profile's script: the Unicode scripts its subtag stands for. One Unicode does not
    encode (a private-use subtag) is what the profile lists: its exemplars, and, if it writes
    each word as a logograph (a `logographs` step: sitelen pona, ADR 0086), those of them that
    are not the step's cartouche marks."""
    code = profile.lang.split("-")[1]
    scripts = tx.unicode_scripts(code)
    # An orthography written in a reading scheme's syllables: the scheme whose answers it holds.
    writes = next((n for n, s in schemes().items() if s.answer == profile.id), None)
    if scripts is not None:
        return tx.Script(code, scripts, syllables=writes)
    sets = _exemplar_sets(exemplars, profile)
    own = frozenset(sets[0]) if sets is not None else frozenset[str]()
    for step in profile.normalize:
        root = getattr(step, "root", step)
        if isinstance(root, LogographsStep):
            marks = root.logographs.cartouche
            cartouche = None if marks is None else (marks.open, marks.close)
            return tx.Script(code, None, own, own - set(cartouche or ()), cartouche)
    return tx.Script(code, None, own)


def _script(ctx: Ctx, orth: str) -> tx.Script:
    found = ctx.scripts.get(orth)
    if found is None:
        found = ctx.scripts[orth] = script_of(ctx.profiles[orth], ctx.exemplars)
    return found


def _letter_maps(profile: OrthographyProfile) -> dict[str, str]:
    """Keys the profile folds away in normalization (not punctuation): canonical-content check."""
    out: dict[str, str] = {}
    for step in profile.normalize:
        root = getattr(step, "root", step)
        mapping = getattr(root, "map", None)
        if isinstance(mapping, dict):
            for k, v in cast(dict[str, str], mapping).items():
                out[k] = v
        removed = getattr(root, "remove", None)
        if isinstance(removed, list):
            for r in cast(list[str], removed):
                out[r] = ""
    return out


def _allowed_invisibles(profile: OrthographyProfile) -> set[str]:
    allowed: set[str] = set()
    if profile.match is not None and profile.match.zwnj is not None:
        allowed.add(tx.ZWNJ)
    return allowed


# ------------------------------------------------------------ stage 2 & 3


def _outside_exemplars(letters: set[str], text: str) -> list[str]:
    """The script audit's test (`text.script-audit`): characters of `text` that are no space,
    invisible, joiner or punctuation and not among the exemplar letters (`_exemplar_sets`)."""
    return sorted(
        {
            c
            for c in text
            if not c.isspace()
            and c not in tx.ALWAYS_INVISIBLE
            and c not in (tx.ZWNJ, tx.ZWJ)
            and unicodedata.category(c)[0] != "P"
            and c not in letters
            and c.lower() not in letters
        }
    )


def _outside_script(ctx: Ctx, orth: str, text: str, marked: bool) -> list[str]:
    """What of a text is not its orthography's script, as the script audit and the token check
    have it: letters of another script (`foreign_letters`) and, for a spelling (not the marked
    text, whose vowel signs CLDR does not list), characters outside the exemplars."""
    found = set(tx.foreign_letters(text, _script(ctx, orth)))
    sets = _exemplar_sets(ctx.exemplars, ctx.profiles[orth])
    if sets is not None and not marked:
        found.update(_outside_exemplars(sets[0], text))
    return sorted(found)


def _hygiene(
    ctx: Ctx,
    profile: OrthographyProfile,
    script: tx.Script,
    text: str,
    toks: list[dict[str, Any]],
    loc: Loc,
) -> None:
    diags = ctx.diags
    sets = _exemplar_sets(ctx.exemplars, profile)
    if sets is not None:
        letters, punct = sets
        outside = _outside_exemplars(letters, text)
        if outside:
            diags.report(
                "text.script-audit",
                f"outside the {profile.exemplars or 'listed'} exemplars: {' '.join(outside)}",
                loc,
            )
        foreign_punct = sorted(
            {c for c in text if unicodedata.category(c)[0] == "P" and c not in punct}
        )
        if foreign_punct:
            diags.report(
                "text.punctuation-audit",
                f"punctuation not in the {profile.exemplars or 'listed'} exemplars: "
                + " ".join(foreign_punct),
                loc,
            )
    for tok in toks:
        if tok.get("kind", "lexical") == "lexical":
            foreign = tx.foreign_letters(tok["surface"], script)
            if foreign:
                diags.report(
                    "text.mixed-script",
                    f"{tok['surface']!r} mixes {' '.join(foreign)} into {script.code} text",
                    loc,
                )
    folds = [k for k in _letter_maps(profile) if k in text and unicodedata.category(k[0])[0] != "P"]
    if folds:
        shown = " ".join(f"U+{ord(k):04X}" if len(k) == 1 else repr(k) for k in folds)
        diags.report(
            "text.non-canonical", f"uses characters its profile normalizes away: {shown}", loc
        )
    presentation = tx.presentation_forms(text)
    if presentation:
        diags.report(
            "text.non-canonical",
            "uses presentation forms, not the characters they stand for: "
            + " ".join(f"U+{ord(c):04X}" for c in presentation),
            loc,
        )


def _form(ctx: Ctx, course: CourseSource, unit: Unit, si: int, orth: str) -> dict[str, Any] | None:
    form = unit.source.sentences[si].forms[orth]
    at = ("sentences", si, "forms", orth)
    return compile_form(ctx, course, unit.doc, at, form, orth, warn=not unit.generated)


def compile_form(
    ctx: Ctx,
    course: CourseSource,
    doc: Doc,
    at: tuple[str | int, ...],
    form: SentenceForm,
    orth: str,
    warn: bool = True,
) -> dict[str, Any] | None:
    """A sentence or story line form (text, tokens) → TaggedText, with stages 2-3 checks.
    `warn`: false for generated sentences (drills), which have no tokens to vocalize by hand."""
    profile = ctx.profiles[orth]
    script = _script(ctx, orth)
    loc = doc.loc(*at)
    text = form.text
    diags = ctx.diags

    analyzer = ctx.analyzers.get(profile.segmentation.content)
    if form.tokens:
        authored: list[dict[str, Any]] = []
        for t in form.tokens:
            d: dict[str, Any] = {"surface": t.surface}
            if t.kind is not None:
                d["kind"] = t.kind
            if t.lexeme is not None and t.lexemes:
                diags.report(
                    "parse.token-lexemes",
                    f"{t.surface!r} names its lexeme ({t.lexeme}) and lists several: one or the "
                    "other",
                    doc.loc(*at, "tokens"),
                )
            if t.feats and t.lexeme is None:
                diags.report(
                    "parse.token-lexemes",
                    f"{t.surface!r} has feature values and names no lexeme to have them",
                    doc.loc(*at, "tokens"),
                )
            parts = tk.written(t)
            if parts:
                d["lexemes"] = parts
            if t.readings:
                d["readings"] = dict(t.readings)
            if t.variants:
                d["variants"] = list(t.variants)
            if t.tile is not None:
                d["tileGroup"] = t.tile
            if t.vocalized is not None:
                d["_vocalized"] = t.vocalized
            if t.readingVariant:
                d["_readingVariant"] = True
            if t.context is not None:
                d["_context"] = t.context
            authored.append(d)
        toks, error = tx.align(text, authored)
        if error is not None:
            diags.report("parse.token-mismatch", error, doc.loc(*at, "tokens"))
            return None
    else:
        segment = (
            analyzer.segment if analyzer is not None and _unit_kind(profile) == "grapheme" else None
        )
        toks = tx.auto_tokens(text, segment, script)

    # kinds and default tile groups
    explicit = [t["tileGroup"] for t in toks if "tileGroup" in t]
    next_group = max(explicit, default=-1) + 1
    for t in toks:
        t.setdefault("kind", tx.token_kind(t["surface"]))
        if t["kind"] in ("lexical", "number") and "tileGroup" not in t:
            t["tileGroup"] = next_group
            next_group += 1

    # stage 3: readings fixed by their words (ADR 0135), then ruby for every ruby layer
    if form.tokens:
        consistency.fill_and_check(ctx.observed, diags, orth, toks, loc)
    for scheme in _ruby_schemes(profile):
        whole = scheme in schemes() and schemes()[scheme].ruby == "word"
        for t in toks:
            if t["kind"] != "lexical" or not tx.ruby_bearing(t["surface"], script, whole=whole):
                continue
            pinned = t.get("readings", {}).get(scheme)
            guessed = analyzer.reading(scheme, t["surface"]) if analyzer is not None else None
            if pinned is None:
                if guessed is None:
                    diags.report("enrich.missing-reading", f"no {scheme} for {t['surface']!r}", loc)
                    continue
                t.setdefault("readings", {})[scheme] = guessed
            elif guessed is not None and guessed.split() != pinned.split():
                diags.report(
                    "enrich.reading-mismatch",
                    f"{t['surface']!r}: pinned {pinned!r}, "
                    f"{analyzer.name if analyzer else '?'} says {guessed!r}",
                    loc,
                )
            reading = t["readings"][scheme]
            segments = tx.ruby_segments(t["surface"], reading, script, whole=whole)
            if segments is None:
                diags.report(
                    "enrich.ruby-unaligned",
                    f"{t['surface']!r}: {reading!r} does not line up with its characters",
                    loc,
                )
            else:
                t.setdefault("ruby", {})[scheme] = segments

    _hygiene(ctx, profile, script, text, toks, doc.loc(*at, "text"))
    mark_vowels(ctx, orth, toks, loc, warn)
    if form.tokens:
        consistency.observe(ctx.observed, orth, toks, loc, marks=orth in ctx.vocalization)
    tagged = {"lang": _lang_for(profile, course.target), "orthography": orth, "tokens": toks}
    public = {
        **tagged,
        "tokens": [{k: v for k, v in t.items() if not k.startswith("_")} for t in toks],
    }
    ok, issues = ctx.cli.try_result("check-tagged-text", text=public)
    if ok:
        for issue in sorted(set(cast(list[str], issues))):
            lint = {
                "not-nfc": "text.not-nfc",
                "splits-grapheme": "text.splits-grapheme",
                "ruby-mismatch": "enrich.ruby-unaligned",
                "lexemes-mismatch": "parse.token-mismatch",
                "lang-outside-orthography": "parse.unknown-orthography",
            }.get(issue, "parse.token-mismatch")
            diags.report(lint, f"TaggedText invariant: {issue}", loc)
    return tagged


def _load_vocalization(
    ctx: Ctx, course: CourseSource, course_file: Path, display: Callable[[Path], str], doc: Doc
) -> None:
    """The course's vowel marks (ADR 0053), from files next to course.yaml or given inline."""
    for i, item in enumerate(course.vocalization or []):
        if isinstance(item, VocalizationSource):
            source, vdoc = item, doc.sub("vocalization", i)
        else:
            path = course_file.parent / item
            if not path.is_file():
                ctx.diags.report(
                    "parse.schema", f"no vocalization file {item}", doc.loc("vocalization", i)
                )
                continue
            vdoc = load_doc(path, display(path))
            loaded = _validate(VocalizationSource, vdoc, ctx.diags)
            if loaded is None:
                continue
            source = loaded
        orth = str(source.orthography)
        profile = ctx.profiles.get(orth)
        marks_set = (
            profile.match.marks.set
            if profile is not None and profile.match and profile.match.marks
            else None
        )
        if marks_set is None:
            ctx.diags.report(
                "parse.schema", f"{orth} has no marks to vocalize with", vdoc.loc("orthography")
            )
            continue
        marks = regex.compile(marks_set)
        words: dict[str, str] = {}
        for surface, marked in source.words.items():
            key, value = unicodedata.normalize("NFC", surface), unicodedata.normalize("NFC", marked)
            if marks.sub("", value) != marks.sub("", key):
                ctx.diags.report(
                    "vocalization.mismatch",
                    f"{value!r} is not {key!r} with vowel marks",
                    vdoc.loc("words", surface),
                )
                continue
            words[key] = value
        ambiguous = {unicodedata.normalize("NFC", a) for a in (source.ambiguous or {})}
        lexemes = {
            str(k): unicodedata.normalize("NFC", v) for k, v in (source.lexemes or {}).items()
        }
        ctx.vocalization[orth] = Vocalized(words, ambiguous, marks, vdoc.loc("ambiguous"), lexemes)


def _split_marked(marked: str, parts: list[str], marks: regex.Pattern[str]) -> list[str] | None:
    """A marked word cut where its parts (morphs) are cut: each piece keeps its letters' marks.
    The parts are compared by their letters, since a part can carry marks of its own (a shadda
    written in the source). None when the letters do not line up."""
    clusters: list[str] = regex.findall(r"\X", marked)
    out: list[str] = []
    at = 0
    for part in parts:
        want = len(tx.graphemes(part))
        piece = "".join(clusters[at : at + want])
        if marks.sub("", piece) != marks.sub("", part):
            return None
        out.append(piece)
        at += want
    return out if at == len(clusters) else None


def _fill_marks(surface: str, base: str, marks: regex.Pattern[str]) -> str | None:
    """A partly marked word with the marks it lacks, letter by letter: a letter whose marks the
    vocalization's include (a shadda alone, say) takes the vocalization's; a letter marked
    otherwise (an ezafe's kasra) keeps its own. None when the letters do not line up."""
    have: list[str] = regex.findall(r"\X", surface)
    add: list[str] = regex.findall(r"\X", base)
    if len(have) != len(add):
        return None
    out: list[str] = []
    for a, b in zip(have, add, strict=True):
        if marks.sub("", a) != marks.sub("", b):
            return None
        own, given = marks.findall(a), marks.findall(b)
        out.append(b if all(own.count(m) <= given.count(m) for m in own) else a)
    return "".join(out)


def mark_vowels(
    ctx: Ctx, orth: str, toks: list[dict[str, Any]], loc: Loc, warn: bool = True
) -> None:
    """Gives each word its vowel marks (ADR 0053), from the token's own `vocalized`, else the
    course's vocalization of its surface. A word written with some marks keeps them and takes
    the rest from the vocalization of its letters. A word with several vocalizations and no
    `vocalized` of its own stays as written, with a warning (`warn`). Where the token writes
    several lexemes, each one's letters are marked to match."""
    lex = ctx.vocalization.get(orth)
    profile = ctx.profiles.get(orth)
    for t in toks:
        own = t.pop("_vocalized", None)
        if t.get("kind") != "lexical":
            continue
        surface = str(t["surface"])
        if own is not None:
            marks_set = (
                profile.match.marks.set
                if profile is not None and profile.match and profile.match.marks
                else None
            )
            marked = unicodedata.normalize("NFC", own)
            if marks_set is None or regex.sub(marks_set, "", marked) != regex.sub(
                marks_set, "", surface
            ):
                ctx.diags.report(
                    "vocalization.mismatch", f"{marked!r} is not {surface!r} with vowel marks", loc
                )
                continue
            marks = regex.compile(marks_set)
        elif lex is None:
            continue
        else:
            marks = lex.marks
            letters = marks.sub("", surface)
            exact = lex.words.get(surface)
            base = lex.words.get(letters)
            if exact is not None:
                marked = exact
            elif base is not None:
                filled = _fill_marks(surface, base, marks) if letters != surface else base
                if filled is None:
                    continue
                marked = filled
            else:
                if warn and letters in lex.ambiguous and letters == surface:
                    ctx.diags.report(
                        "vocalization.ambiguous",
                        f"{surface!r} has several vocalizations: give this token its own "
                        "`vocalized`",
                        loc,
                    )
                continue
        if marked == surface:
            continue
        parts = tk.lexemes_of(t)
        letters = tk.split_surfaces(parts)
        if letters is not None:
            pieces = _split_marked(marked, letters, marks)
            if pieces is None:
                continue
            for part, piece in zip(parts, pieces, strict=True):
                part["surface"] = piece
        t["_written"] = surface
        t["surface"] = marked


def marked(ctx: Ctx, orth: str, text: dict[str, Any], lexeme: str | None) -> dict[str, Any]:
    """An entry's spelling (TaggedText) with its vowel marks. A spelling is a string with no
    token of its own to choose between vocalizations, so an ambiguous one stays as written. The
    entry's first spelling, which voices read, keeps its written surfaces in `ctx.written`; it
    takes the vocalization's own entry for its lexeme where there is one (a homograph of another
    word's entry: daras beside dars)."""
    tokens: list[dict[str, Any]] = text["tokens"]
    voc = ctx.vocalization.get(orth)
    own = None if voc is None or lexeme is None else voc.lexemes.get(lexeme)
    lexical = [t for t in tokens if t.get("kind") == "lexical"]
    if own is not None and len(lexical) == 1:
        lexical[0]["_vocalized"] = own
    mark_vowels(ctx, orth, tokens, Loc("", 0), warn=False)
    if lexeme is not None and any("_written" in t for t in tokens):
        ctx.written[(lexeme, orth)] = [str(t.get("_written", t["surface"])) for t in tokens]
    for t in tokens:
        t.pop("_written", None)
    return text


def support_text(ctx: Ctx, orth: str, text: str, target: str) -> dict[str, Any]:
    profile = ctx.profiles[orth]
    toks = tx.auto_tokens(text, None, _script(ctx, orth))
    for i, t in enumerate(x for x in toks if x["kind"] in ("lexical", "number")):
        t["tileGroup"] = i
    return {"lang": _lang_for(profile, target), "orthography": orth, "tokens": toks}


# ------------------------------------------------------------ the compiler


def _course_file(path: Path) -> Path:
    return path / "course.yaml" if path.is_dir() else path


def lexicons_dir(course_file: Path) -> Path:
    """Where a course's lexicons are kept: the repo's lexicons/, beside courses/; for a course
    kept elsewhere (a test's), a lexicons/ folder beside it or above it."""
    here = course_file.parent
    for folder in (here, here.parent, here.parent.parent):
        if (folder / "lexicons").is_dir():
            return folder / "lexicons"
    return here.parent.parent / "lexicons"


def compile_course(
    path: Path,
    cli: CoreCli,
    profiles: dict[str, OrthographyProfile] | None = None,
    analyzers: dict[str, Analyzer] | None = None,
    audio: bool = True,
    lexicons: Path | None = None,
) -> tuple[Diagnostics, Compiled | None]:
    """`audio=False` leaves out the checks of the audio index: the audio commands write that
    index, so a broken one must not stop them mending it. `lexicons`: where the course's
    language keeps its lexicon, if not the repo's lexicons/."""
    diags = Diagnostics()
    course_file = _course_file(path)
    base = course_file.parent.parent

    def display(p: Path) -> str:
        return p.relative_to(base).as_posix()

    # ---- stage 1: parse
    doc = load_doc(course_file, display(course_file))
    course = _validate(CourseSource, doc, diags)
    if course is None:
        return diags, None
    if course.own is not None:
        # A course kept in one file carries its lexicon itself.
        language = lx.Language(
            course.lexicon,
            course_file.parent,
            course.own.lexicon,
            course.own.language,
            doc.sub("own", "lexicon"),
            doc.sub("own", "language"),
        )
    else:
        found, problems = lx.load_language(lexicons or lexicons_dir(course_file), course.lexicon)
        for problem in problems:
            diags.report("parse.schema", problem.message, problem.loc)
        if found is None:
            return diags, None
        language = found
    ctx = Ctx(
        diags,
        cli,
        profiles if profiles is not None else load_profiles(),
        load_exemplars(),
        analyzers if analyzers is not None else analyzers_by_tool(),
        language,
    )
    units: list[Unit] = []
    for i, item in enumerate(course.units):
        if isinstance(item, str):
            unit_path = course_file.parent / item
            udoc = load_doc(unit_path, display(unit_path))
            source = _validate(UnitSource, udoc, diags)
            if source is not None:
                units.append(Unit(udoc, source))
        else:
            units.append(Unit(doc.sub("units", i), item))
    if diags.errors:
        return diags, None

    for orth in [*course.orthographies, *course.support]:
        if orth not in ctx.profiles:
            diags.report(
                "parse.unknown-orthography",
                f"no profile {orth} in profiles/",
                doc.loc("orthographies"),
            )
    if diags.errors:
        return diags, None

    _load_vocalization(ctx, course, course_file, display, doc)
    _names(ctx, course, doc)
    _drills(ctx, course, doc, units)
    _duplicates(ctx, units)
    for unit in units:
        for si, s in enumerate(unit.source.sentences):
            for orth in s.forms:
                if orth not in course.orthographies:
                    diags.report(
                        "parse.unknown-orthography",
                        f"{orth} is not one of the course's orthographies",
                        unit.doc.loc("sentences", si, "forms", orth),
                    )

    _nfc_and_invisibles(ctx, course, doc, units)
    _lexicon(ctx, course, doc)
    # A form pinned once fills its other tokens' readings (ADR 0135).
    ctx.observed.prepare(units)
    consistency.check_own(diags, ctx.lang, list(course.orthographies))

    # ---- stages 2–3: forms → TaggedText
    compiled_forms: dict[tuple[int, int], dict[str, dict[str, Any]]] = {}
    for ui, unit in enumerate(units):
        for si, s in enumerate(unit.source.sentences):
            forms: dict[str, dict[str, Any]] = {}
            for orth in s.forms:
                if orth in course.orthographies:
                    tagged = _form(ctx, course, unit, si, orth)
                    if tagged is not None:
                        forms[orth] = tagged
            compiled_forms[(ui, si)] = forms
            _transliteration(ctx, unit, si, s)

    # ---- stage 5: curriculum
    taught = _taught(ctx, units)
    sentence_parts = _curriculum(ctx, course, units, compiled_forms, taught)
    stories = compile_stories(ctx, course, units, compiled_forms, taught)
    scenarios = compile_scenarios(ctx, course, units)
    consistency.report(ctx.observed, diags, course)
    # ---- stage 6: grading
    _grading(ctx, course, units)
    # ---- stage 7: glossary, tiles (script tracks once readings are pinned, below)
    used = _used(units, compiled_forms, stories.lines, taught)
    _glossary(ctx, course, units, compiled_forms, stories.lines, used)
    # ---- stage 9: packaging lints
    compiled = Compiled(
        course=course, orthographies=list(course.orthographies), support=list(course.support)
    )
    _packaging(ctx, course, units, compiled)
    image_paths = _images(ctx, used, compiled)
    if diags.errors:
        return diags, None
    # From here on the course is the bundle's typed units and lexicon: a key mistyped or a shape
    # changed fails here, as the course compiles.
    bundled = [
        BundleUnit.model_validate(
            _bundle_unit(ctx, course, ui, unit, compiled_forms, sentence_parts)
            | ({"stories": stories.by_unit[ui]} if ui in stories.by_unit else {})
            | ({"scenarios": scenarios[ui]} if ui in scenarios else {})
        )
        for ui, unit in enumerate(units)
    ]
    lexicon = BundleLexicon.model_validate(_bundle_lexicon(ctx, course, used, image_paths))
    compiled.written = ctx.written
    # Every word of an entry's spellings takes one reading per scheme, which word cards show,
    # voices read and minimal pairs compare (ADR 0117); an entry may choose its first
    # spelling's (`readings`).
    compiled.units = bundled
    compiled.lexicon, refused = pin_lexeme_readings(
        lexicon,
        bundled,
        list(course.orthographies),
        lambda orth: _ruby_schemes(ctx.profiles[orth]),
        lambda orth: _script(ctx, orth),
        {
            str(entry.id): entry.readings
            for entry in ctx.lang.lexicon.lexemes
            if entry.readings and str(entry.id) in used
        },
    )
    for r in refused:
        ctx.diags.report(
            "lexeme.reading",
            f"{r.lexeme}: {r.message}",
            ctx.lang.loc(r.lexeme, "readings", r.scheme),
        )
    # ---- stage 7: script tracks, which ask a lexeme as its pinned reading (ADR 0133)
    alphabets = compile_alphabets(
        diags,
        course,
        units,
        compiled.lexicon,
        ctx.lang,
        ctx.profiles,
        lambda o, t: support_text(ctx, o, t, course.target),
        ctx.cli,
    )
    compiled.units = with_alphabets(compiled.units, alphabets)
    # ---- stage 3 (on the bundle): what the statements leave to learn (ADR 0148)
    compiled.lexicon = leftovers(
        compiled.lexicon, compiled.units, course.orthographies, ctx.profiles, ctx.cli
    )
    _unaccounted(ctx, units, compiled)
    _forms(ctx, compiled)
    sites = _token_forms(ctx, units, compiled)
    # ---- stage 4 of rules in a lexicon: each lexeme's forms, as the rules give them
    if sites is not None:
        unshipped: list[Refused] = []
        compiled.lexicon = paradigms(
            compiled.lexicon,
            ctx.lang,
            sites,
            compiled.units,
            course.orthographies,
            ctx.profiles,
            ctx.cli,
            lambda orth, text, marked: _outside_script(ctx, orth, text, marked),
            unshipped,
        )
        for r in unshipped:
            ctx.diags.report(
                "form.spelling-script",
                f"{r.lexeme} {r.cell} ({r.where}): {r.orth} spells {r.spelling!r}, with "
                f"{' '.join(r.outside)} outside its script: not shipped",
                ctx.lang.loc(r.lexeme),
            )
    aliases = course_file.parent / "aliases.yaml"
    if aliases.is_file():
        compiled.aliases = yaml.safe_load(aliases.read_text(encoding="utf-8"))
    if audio:
        check_audio(ctx, course, course_file, display, compiled)
    if diags.errors:
        return diags, None
    return diags, compiled


def _unaccounted(ctx: Ctx, units: list[Unit], compiled: Compiled) -> None:
    """The review list (ADR 0148): each token whose pinned reading, in a scheme stated `of` its
    orthography, the scheme's statement cannot relate to its spelling (`projection.unaccounted`),
    at its sentence, story line or lexicon entry."""
    where: dict[str, Loc] = {}
    for unit in units:
        for si, s in enumerate(unit.source.sentences):
            where[s.id] = unit.doc.loc("sentences", si)
        for k, story in enumerate(unit.source.stories or []):
            for step in range(len(story.steps)):
                where[f"{story.id}#{step}"] = unit.doc.loc("stories", k, "steps", step)
    for found in unaccounted(compiled.content, compiled.orthographies, ctx.cli):
        for u in found.unaccounted:
            loc = where.get(u.item) or ctx.lang.loc(u.item)
            ctx.diags.report(
                "projection.unaccounted",
                f"{u.item}: '{u.surface}' read {u.reading!r}: {found.scheme}'s statement does not "
                f"relate the reading to the spelling",
                loc,
            )


def _forms(ctx: Ctx, compiled: Compiled) -> None:
    """Each lexeme's lexical form against what the course writes (`form.projection`,
    docs/rules-design.md stage 1): spelled by @nabu/core in each orthography and layer that states
    `spell`; the report is kept for `nabu forms`."""
    vocalized = {o: (v.words, v.marks, v.lexemes) for o, v in ctx.vocalization.items()}
    report = lexical_forms.check(ctx.lang, compiled.orthographies, ctx.profiles, vocalized, ctx.cli)

    def allomorph_form(lexeme: str, index: int) -> str | None:
        entry = ctx.lang.get(lexeme)
        return None if entry is None else (entry.allomorphs or [])[index].form

    compiled.forms = report
    for problem in report.problems:
        ctx.diags.report("form.projection", problem, ctx.lang.declared_doc.loc())
    for entry in report.entries:
        for c in entry.checks:
            if not c.mismatch:
                continue
            path: tuple[str | int, ...] = (
                ("form",) if c.allomorph is None else ("allomorphs", c.allomorph, "form")
            )
            form = entry.form if c.allomorph is None else allomorph_form(entry.lexeme, c.allomorph)
            ctx.diags.report(
                "form.projection",
                f"'{entry.lexeme} {c.where}': its form {lexical_forms.escaped(form or '')}"
                f" spells {lexical_forms.escaped(c.spelling)} there, where the course has "
                f"{c.expected}",
                ctx.lang.loc(entry.lexeme, *path),
            )


def _marked_of(ctx: Ctx, orth: str, surface: str, own: str | None) -> str | None:
    """The marked text the course gives a word (ADR 0053), as `mark_vowels` finds it: the token's
    own `vocalized`, else the vocalization's entry for its surface or for its letters, else the
    surface itself where it is written with marks. None where the orthography has no vocalization
    or the word has no marked text."""
    lex = ctx.vocalization.get(orth)
    if lex is None:
        return None
    if own is not None:
        return unicodedata.normalize("NFC", own)
    letters = lex.marks.sub("", surface)
    exact = lex.words.get(surface)
    if exact is not None:
        return exact
    base = lex.words.get(letters)
    if base is not None:
        return _fill_marks(surface, base, lex.marks) if letters != surface else base
    return surface if letters != surface else None


def _token_sites(ctx: Ctx, units: list[Unit]) -> list[lexical_forms.Site]:
    """Every authored token of the course's sentences and story lines, in each orthography, with
    where it is written and the lexemes it writes (drills, generated, are left out)."""
    sites: list[lexical_forms.Site] = []

    def add(item: str, orth: str, form: SentenceForm, loc: Loc) -> None:
        tokens = [
            (
                t,
                [
                    {k: v for k, v in part.items() if k in ("lexeme", "feats", "base")}
                    for part in tk.written(t)
                ],
            )
            for t in form.tokens or []
        ]
        # A phrase lexeme written over several tokens (kell sene w enti salme) is one word in one
        # cell: the values any of its tokens chooses are the phrase's.
        phrase: dict[str, dict[str, Any]] = {}
        for _, written in tokens:
            if len(written) == 1 and _is_phrase(ctx, str(written[0]["lexeme"])):
                phrase.setdefault(str(written[0]["lexeme"]), {}).update(
                    written[0].get("feats") or {}
                )
        for _, written in tokens:
            if len(written) == 1 and phrase.get(str(written[0]["lexeme"])):
                written[0] = {**written[0], "feats": phrase[str(written[0]["lexeme"])]}
        for i, (t, written) in enumerate(tokens):
            if not written:
                continue
            # The next token that writes a lexeme: its base, which an allomorph may be chosen by.
            following = next((_base_of(w) for _, w in tokens[i + 1 :] if w), None)
            marked = _marked_of(ctx, orth, t.surface, t.vocalized)
            parts = tk.written(t)
            base = parts[0] if len(parts) == 1 else next((p for p in parts if p.get("base")), None)
            base_surface = (
                None
                if base is None
                else str(base.get("surface", t.surface) if len(parts) > 1 else t.surface)
            )
            sites.append(
                lexical_forms.Site(
                    item,
                    orth,
                    loc.file,
                    loc.line,
                    t.surface,
                    marked,
                    written,
                    following,
                    base_surface,
                )
            )

    for unit in units:
        if unit.generated:
            continue
        for si, s in enumerate(unit.source.sentences):
            for orth, form in s.forms.items():
                add(s.id, str(orth), form, unit.doc.loc("sentences", si, "forms", orth, "tokens"))
        for k, story in enumerate(unit.source.stories or []):
            for step, st in enumerate(story.steps):
                if st.line is None:
                    continue
                for orth, form in st.line.forms.items():
                    at = ("stories", k, "steps", step, "line", "forms", orth, "tokens")
                    add(f"{story.id}#{step}", str(orth), form, unit.doc.loc(*at))
    return sites


def _pinned_forms(ctx: Ctx, sites: list[lexical_forms.Site]) -> None:
    """The language's pinned forms against its rules and the course (docs/rules-design.md, section
    5): `form.pinned-differs` (a pinned spelling no token of its cell writes), `form.redundant` (a
    pinned form the rules give: prune it), `form.rule-debt` (the rest, counted)."""
    pinned = lexical_forms.check_pinned(ctx.lang, sites, ctx.profiles, ctx.cli)
    debt: set[str] = set()
    for p in pinned:
        loc = ctx.lang.loc(p.lexeme, "forms", p.index)
        key = ";".join(f"{k}={v}" for k, v in sorted(p.feats.items()))
        for orth, spelling in p.differs:
            ctx.diags.report(
                "form.pinned-differs",
                f"'{p.lexeme}|form:{key} {orth}': it pins {spelling!r}, which no token of the "
                f"course writes of {p.lexeme} in that cell",
                loc,
            )
        if p.redundant:
            ctx.diags.report(
                "form.redundant",
                f"'{p.lexeme}|form:{key}': the rules give it in every spelling it pins "
                f"({', '.join(f'{o}: {s}' for o, s in sorted(p.rules.items()))}); "
                "`nabu forms prune` removes it",
                loc,
            )
        else:
            debt.add(p.lexeme)
    count = sum(1 for p in pinned if not p.redundant)
    if count:
        ctx.diags.report(
            "form.rule-debt",
            f"{ctx.lang.code}: {count} pinned forms on {len(debt)} lexemes the rules do not give "
            f"yet ({', '.join(sorted(debt))})",
            ctx.lang.declared_doc.loc(),
        )


def _is_phrase(ctx: Ctx, lexeme: str) -> bool:
    """Whether a lexeme's form is a phrase (a form with a space: several tokens write it)."""
    entry = ctx.lang.get(lexeme)
    return entry is not None and isinstance(entry.form, str) and " " in entry.form


def _base_of(written: list[dict[str, Any]]) -> str | None:
    """A token's base lexeme: its only one, or the one marked `base`."""
    if len(written) == 1:
        return str(written[0]["lexeme"])
    return next((str(w["lexeme"]) for w in written if w.get("base")), None)


def _token_forms(
    ctx: Ctx, units: list[Unit], compiled: Compiled
) -> list[lexical_forms.Site] | None:
    """Every token of the course against what the language's rules give (`form.unaccounted`,
    docs/rules-design.md stage 2): realised and spelled by @nabu/core. Only for a language with
    realisation rules or a notation (a language that does not inflect: its tokens stand in their
    citation cells); the report is kept for `nabu forms`. The sites checked, for the paradigms."""
    if not ctx.lang.declared.realisation and ctx.lang.declared.notation is None:
        return None
    sites = _token_sites(ctx, units)
    report = lexical_forms.check_tokens(ctx.lang, sites, ctx.profiles, ctx.cli)
    _pinned_forms(ctx, sites)
    compiled.tokens = report
    if report is None:
        return sites
    for c in report.checks:
        if c.verdict != "unaccounted":
            continue
        site = c.site
        missed = c.missed
        wheres = " ".join(s.where for s in missed) or site.orth
        gave = (
            "; ".join(f"{s.where} spells {s.spelling}, the course has {s.expected}" for s in missed)
            if missed
            else c.reason
        )
        form = lexical_forms.escaped(c.form or "")
        ctx.diags.report(
            "form.unaccounted",
            f"'{site.key} {wheres}': {site.item} writes {site.surface!r}; the rules give "
            f"{form or 'nothing'}: {gave}",
            Loc(site.file, site.line),
        )
    return sites


def _images(ctx: Ctx, used: set[str], compiled: Compiled) -> dict[str, str]:
    """The pictures of the course's lexemes → content-addressed bundle paths; licenses and
    provenance join the summary. A picture's file is relative to its lexicon's own file."""
    out: dict[str, str] = {}
    lexicon_dir = ctx.lang.folder
    for entry in ctx.lang.lexicon.lexemes:
        image = entry.image
        if image is None or str(entry.id) not in used:
            continue
        path = lexicon_dir / image.file
        if not path.is_file():
            ctx.diags.report(
                "parse.missing-asset",
                f"{entry.id}: no image file {image.file}",
                ctx.lang.loc(str(entry.id), "image", "file"),
            )
            continue
        data = path.read_bytes()
        digest = hashlib.sha256(data).hexdigest()
        rel = f"images/{path.stem}.{digest[:16]}{path.suffix}"
        compiled.images[rel] = (data, image.license, image.source)
        out[str(entry.id)] = rel
        p = image.provenance
        count(compiled, Counted(rel, image.license, p.status, p.author))
    return out


# ------------------------------------------------------------ stage 1 extras


def _duplicates(ctx: Ctx, units: list[Unit]) -> None:
    seen: dict[str, Loc] = {}

    def check(kind: str, ident: str, loc: Loc) -> None:
        key = f"{kind}:{ident}"
        if key in seen:
            ctx.diags.report(
                "parse.duplicate-id",
                f"{kind} {ident!r} also defined at {seen[key].file}:{seen[key].line}",
                loc,
            )
        else:
            seen[key] = loc

    for unit in units:
        check("unit", unit.source.id, unit.doc.loc("id"))
        for i, grapheme in enumerate(unit.source.graphemes or []):
            check("letter", grapheme.id, unit.doc.loc("graphemes", i))
        for i, node in enumerate(unit.source.nodes):
            check("node", node.id, unit.doc.loc("nodes", i))
        for i, s in enumerate(unit.source.sentences):
            check("sentence", s.id, unit.doc.loc("sentences", i))
        for i, story in enumerate(unit.source.stories or []):
            check("story", story.id, unit.doc.loc("stories", i))
        for i, card in enumerate(unit.source.scenarios or []):
            check("scenario", card.id, unit.doc.loc("scenarios", i))
    for i, entry in enumerate(ctx.lang.lexicon.lexemes):
        check("lexeme", str(entry.id), ctx.lang.doc.loc("lexemes", i))


def _strings(
    data: Any, path: tuple[str | int, ...] = ()
) -> list[tuple[tuple[str | int, ...], str]]:
    """Every string value in a YAML tree, with its path."""
    if isinstance(data, str):
        return [(path, data)]
    if isinstance(data, dict):
        return [x for k, v in cast(dict[str, Any], data).items() for x in _strings(v, (*path, k))]
    if isinstance(data, list):
        return [x for i, v in enumerate(cast(list[Any], data)) for x in _strings(v, (*path, i))]
    return []


def _language_invisibles(ctx: Ctx, tag: str) -> set[str]:
    """What text in a language may hold invisibly: what that language's orthographies allow."""
    language = tag.split("-")[0]
    allowed: set[str] = set()
    for profile in ctx.profiles.values():
        if profile.lang.split("-")[0] == language:
            allowed |= _allowed_invisibles(profile)
    return allowed


def _nfc_and_invisibles(ctx: Ctx, course: CourseSource, doc: Doc, units: list[Unit]) -> None:
    allowed: set[str] = set()
    for orth in course.orthographies:
        allowed |= _allowed_invisibles(ctx.profiles[orth])
    course_doc = Doc(
        doc.file,
        {k: v for k, v in cast(dict[str, Any], doc.data).items() if k != "units"},
        doc.lines,
    )
    docs = [course_doc, *(u.doc for u in units if u.doc.data is not None)]
    # The language's own files: an entry's spellings hold what any orthography of it allows. A
    # one-file course's lexicon is in the course's own document, checked with it.
    own = [] if course.own is not None else [ctx.lang.doc, ctx.lang.declared_doc]
    in_language = _language_invisibles(ctx, ctx.lang.code)
    for d in [*docs, *own]:
        for path, value in _strings(d.data):
            if unicodedata.normalize("NFC", value) != value:
                ctx.diags.report("text.not-nfc", f"{value!r} is not NFC", d.loc(*path))
            here = in_language if any(d is o for o in own) else allowed
            if d is course_doc and len(path) > 1 and path[0] == "names":
                # A name is text in the language it is given in (ADR 0109): a Persian name keeps
                # its ZWNJ whatever course it names.
                here = _language_invisibles(ctx, str(path[1]))
            bad = tx.invisible_chars(value, here)
            if bad:
                ctx.diags.report(
                    "text.invisible", " ".join(f"U+{ord(c):04X}" for c in bad), d.loc(*path)
                )


def _transliteration(ctx: Ctx, unit: Unit, si: int, s: SentenceSource) -> None:
    for orth, form in s.forms.items():
        profile = ctx.profiles.get(orth)
        tl = profile.transliterate if profile is not None else None
        if tl is not None and tl.via == "jyutping" and tl.to in s.forms:
            _jyutping(ctx, unit.doc.loc("sentences", si, "forms", tl.to), form, s.forms[tl.to])
            continue
        if tl is not None and tl.via == "sitelen-pona" and tl.to in s.forms:
            _sitelen_pona(
                ctx, unit.doc.loc("sentences", si, "forms", tl.to, "text"), form, s.forms[tl.to]
            )
            continue
        if tl is None or tl.via != "cldr-transform" or tl.to not in s.forms:
            continue
        target = ctx.profiles[tl.to]
        tid = f"{profile.lang.replace('-', '_')}-{target.lang.replace('-', '_')}" if profile else ""
        converted = transform(tid, form.text)
        pinned = s.forms[tl.to].text
        if converted is not None and converted.casefold() != pinned.casefold():
            ctx.diags.report(
                "enrich.transliteration-mismatch",
                f"{tid} gives {converted!r}; pinned {pinned!r} wins",
                unit.doc.loc("sentences", si, "forms", tl.to, "text"),
            )


def _jyutping(ctx: Ctx, loc: Loc, hant: SentenceForm, pinned: SentenceForm) -> None:
    """A yue sentence's Jyutping form against its characters (ADR 0126): the text and tokens
    `nabu jyutping` writes from the Hant tokens' pinned readings. Its accept set is checked by
    `nabu jyutping --check` (tests), which needs the whole course."""
    from nabu import jyutping

    if not hant.tokens:  # a generated drill: its Jyutping is read from the numeral (_drills)
        return

    def plain(form: SentenceForm) -> list[dict[str, Any]]:
        return [t.model_dump(exclude_none=True) for t in form.tokens or []]

    try:
        text, tokens = jyutping.latin_form(hant.text, plain(hant))
    except ValueError as e:
        ctx.diags.report("enrich.transliteration-mismatch", f"Jyutping: {e}", loc)
        return
    if (text, tokens) != (pinned.text, plain(pinned)):
        ctx.diags.report(
            "enrich.transliteration-mismatch",
            f"the characters give {text!r}, pinned {pinned.text!r}: run `nabu jyutping`",
            loc,
        )


def _sitelen_pona(ctx: Ctx, loc: Loc, latin: SentenceForm, pinned: SentenceForm) -> None:
    """A tok sentence's pinned sitelen pona against its sitelen Lasina (ADR 0086): the words as
    their logographs, each name as the cartouche its sitelen pona token pins."""
    by_lexeme = {t.lexeme: t.surface for t in pinned.tokens or [] if t.lexeme is not None}
    names = {
        t.surface: by_lexeme[t.lexeme]
        for t in latin.tokens or []
        if t.lexeme is not None and t.surface[:1].isupper() and t.lexeme in by_lexeme
    }
    try:
        converted = sitelen_pona.to_sitelen_pona(latin.text, names)
    except sitelen_pona.SitelenPonaError as e:
        ctx.diags.report("enrich.transliteration-mismatch", f"sitelen pona: {e}", loc)
        return
    if converted != pinned.text:
        ctx.diags.report(
            "enrich.transliteration-mismatch",
            f"sitelen pona gives {converted.encode('unicode_escape').decode('ascii')}; "
            f"pinned {pinned.text.encode('unicode_escape').decode('ascii')} wins",
            loc,
        )


# ------------------------------------------------------------ stage 4: drills


def _names(ctx: Ctx, course: CourseSource, doc: Doc) -> None:
    """What the app calls the course (ADR 0109): a name in each support language, so no UI needs a
    message for it, and orthography names and hints only for orthographies the course teaches."""
    names = course.names or {}
    for support in course.support:
        language = ctx.profiles[support].lang.split("-")[0]
        if not any(tag.split("-")[0] == language for tag in names):
            ctx.diags.report(
                "course.names",
                f"no name for the course in its support language {language}: "
                f"names: {{{language}: {{course: …}}}}",
                doc.loc("names") if names else doc.loc("support"),
            )
    for tag, named in names.items():
        for key, given in (("orthographies", named.orthographies), ("hints", named.hints)):
            for orth in given or {}:
                if orth not in course.orthographies:
                    ctx.diags.report(
                        "course.names",
                        f"names.{tag}.{key} names {orth}, which the course does not teach",
                        doc.loc("names", tag, key, orth),
                    )


def _drill_reading(
    profile: OrthographyProfile, course: CourseSource, spelled: str
) -> tuple[str, str] | None:
    """A drill's numeral in the orthography written in its readings (yue's Jyutping, ADR 0126):
    (that orthography, the numeral read by its scheme's `read` plug-in), or None."""
    tl = profile.transliterate
    if tl is None or tl.via != "jyutping" or tl.to not in course.orthographies:
        return None
    writes = next((n for n, sc in schemes().items() if sc.answer == tl.to), None)
    read = plugins(writes).read if writes is not None else None
    if read is None:
        return None
    readings = read(tx.graphemes(spelled))
    if any(r is None for r in readings):
        return None
    return tl.to, " ".join(r for r in readings if r is not None)


def _drills(ctx: Ctx, course: CourseSource, doc: Doc, units: list[Unit]) -> None:
    """A unit per drill: `drill-<kind>` (a unit id, as the offline downloads name it), with one
    node `drill.<kind>` and sentences `drill.<kind>.<value>`. Runtime code tells generated
    sentences by that `drill.` prefix (core's corrections and distractors); the compiler by
    `Unit.generated`."""
    for di, drill in enumerate(course.drills or []):
        loc = doc.loc("drills", di)
        if drill.orthography not in course.orthographies:
            ctx.diags.report(
                "parse.unknown-orthography",
                f"drill orthography {drill.orthography} is not taught",
                loc,
            )
            continue
        profile = ctx.profiles[drill.orthography]
        tag = _lang_for(profile, course.target)
        support_lang = ctx.profiles[course.support[0]].lang.split("-")[0]
        sentences: list[dict[str, Any]] = []
        for value in drill.values:
            spelled = spellout(tag, value)
            if spelled is None:
                ctx.diags.report("drills.rbnf-unavailable", f"no RBNF spellout for {tag}", loc)
                break
            english = spellout("en", value) or str(value)
            forms: dict[str, Any] = {
                drill.orthography: {"text": spelled, "reverse": f"{spelled}\n{value}"}
            }
            latin = _drill_reading(profile, course, spelled)
            if latin is not None:
                to, read = latin
                word = {"surface": read, "readings": {"characters": spelled}}
                forms[to] = {"text": read, "tokens": [word], "reverse": f"{read}\n{value}"}
            sentences.append(
                {
                    "id": f"drill.{drill.kind}.{value}",
                    "node": f"drill.{drill.kind}",
                    "forms": forms,
                    "uses": [f"rule:{drill.kind}"],
                    "translations": {support_lang: f"{value}\n{english}"},
                    "provenance": {
                        "author": f"generated:cldr-rbnf@icu{icu_version() or 'absent'}",
                        "status": "reviewed",
                    },
                    "license": "Unicode-3.0",
                }
            )
        if not sentences:
            continue
        # What a drill practises is a rule the compiler names itself: the spellout's.
        ctx.made_rules[f"rule:{drill.kind}"] = {"gloss": {support_lang: drill.kind}}
        data = {
            "id": f"drill-{drill.kind}",
            "nodes": [
                {
                    "id": f"drill.{drill.kind}",
                    "kind": "practice",
                    "introduces": [f"rule:{drill.kind}"],
                }
            ],
            "sentences": sentences,
        }
        units.append(
            Unit(
                Doc(doc.file, data, doc.lines, ("drills", di)),
                UnitSource.model_validate(data),
                generated=True,
            )
        )


# ------------------------------------------------------------ stage 5: curriculum


@dataclass
class Taught:
    """What the course's nodes introduce, and where on the path."""

    #: Each node's place on the path.
    node_pos: dict[str, int] = field(default_factory=lambda: {})
    #: Each teachable and the place of the node that introduces it.
    introduced: dict[str, int] = field(default_factory=lambda: {})
    #: Where each is introduced, for a diagnostic.
    where: dict[str, Loc] = field(default_factory=lambda: {})

    def values(self, position: int) -> set[str]:
        """The feature values the course has taught by a place on the path: those a node there
        or before it introduces. A token names every value it has; these are the ones a learner
        is taught and credited. One a later node introduces is, until then, only how the token
        is written: a jussive is met before the imperfect it is a form of is taught."""
        return {
            t for t, at in self.introduced.items() if lx.kind_of(t) == "feature" and at <= position
        }


def _taught(ctx: Ctx, units: list[Unit]) -> Taught:
    """The path's teaching order, and that everything a node names exists: a lexeme of the
    language's lexicon, a feature value it declares, a rule it names, a letter a unit lists."""
    lang = ctx.lang
    rules = set(lang.rules()) | set(ctx.made_rules)
    values = lang.feature_values()
    letters = {str(g.id) for unit in units for g in unit.source.graphemes or []}

    def known(teachable: str) -> str | None:
        kind = lx.kind_of(teachable)
        if kind == "lexeme":
            return None if teachable in lang.index else "is not in the lexicon"
        if kind == "rule":
            return None if teachable in rules else "is no rule the language names"
        if kind == "feature":
            return None if teachable in values else "is no value the language declares"
        return None if teachable in letters else "is no letter a unit lists"

    out = Taught()
    position = 0
    for unit in units:
        for ni, node in enumerate(unit.source.nodes):
            out.node_pos[node.id] = position
            loc = unit.doc.loc("nodes", ni)
            for teachable in [*(node.introduces or []), *(node.reinforces or [])]:
                wrong = known(str(teachable))
                if wrong is not None:
                    ctx.diags.report("curriculum.unknown", f"{teachable} {wrong}", loc)
            for teachable in node.introduces or []:
                if str(teachable) not in out.introduced:
                    out.introduced[str(teachable)] = position
                    out.where[str(teachable)] = loc
            position += 1
    return out


def parts_of(
    ctx: Ctx,
    taught: Taught,
    position: int,
    tokens: list[dict[str, Any]],
    into: list[str] | None = None,
) -> list[str]:
    """The parts a form's tokens can give evidence of (ADR 0146), each once, in the order the
    tokens write them: each lexeme, the feature values chosen on it that the course has taught
    by the form's place on the path (`position`), and a lexeme's own part where a token that
    agrees with it shows it (the article of la mano)."""
    out: list[str] = [] if into is None else into
    written = [part for t in tokens for part in tk.lexemes_of(t)]
    values = taught.values(position)
    for part in written:
        refs = [str(part["lexeme"]), *lx.taught_values(tk.feats_of(part), values)]
        out += [r for r in refs if r not in out]
    numbered = {int(part["n"]): part for part in written if "n" in part}
    for part in written:
        head = numbered.get(int(part["head"])) if "head" in part else None
        entry = None if head is None else ctx.lang.get(str(head["lexeme"]))
        if entry is None:
            continue
        stored = entry.feats or {}
        for own in ctx.lang.parts(entry):
            feature = own.partition("|")[2]
            if tk.feats_of(part).get(feature) == str(stored.get(feature)) and own not in out:
                out.append(own)
    return out


def _relations(ctx: Ctx, name: str, tokens: list[dict[str, Any]], loc: Loc) -> None:
    """A form's relations hold together: a lexeme with a head has a relation and the other way
    round, numbers count the lexemes the form writes, and a head is one of them. And every
    feature value a token names is one its language declares."""
    written = [part for t in tokens for part in tk.lexemes_of(t)]
    values = ctx.lang.feature_values()
    numbers = {int(part["n"]) for part in written if "n" in part}
    for i, part in enumerate(written, 1):
        what = str(part["lexeme"])
        for feature, said in tk.feats_of(part).items():
            for value in str(said).split(","):
                if lx.feature_id(feature, value) not in values:
                    ctx.diags.report(
                        "lexicon.undeclared",
                        f"{name}: {what} has {feature}={value}, which the language does not "
                        "declare",
                        loc,
                    )
        if "n" in part and int(part["n"]) != i:
            ctx.diags.report(
                "parse.token-relation",
                f"{name}: {what} is lexeme {i} of the form and says {part['n']}",
                loc,
            )
        if ("head" in part) != ("rel" in part):
            ctx.diags.report(
                "parse.token-relation",
                f"{name}: {what} has a head or a relation, not both",
                loc,
            )
        elif "head" in part and (int(part["head"]) not in numbers or "n" not in part):
            ctx.diags.report(
                "parse.token-relation",
                f"{name}: {what} points at lexeme {part['head']}, which the form does not number",
                loc,
            )


def _curriculum(
    ctx: Ctx,
    course: CourseSource,
    units: list[Unit],
    forms: dict[tuple[int, int], dict[str, dict[str, Any]]],
    taught: Taught,
) -> dict[tuple[int, int], list[str]]:
    """Each sentence's parts, and the path's order: what a sentence writes is in the lexicon and
    introduced by its node or an earlier one, and it brings in no more new material than the
    course allows (i+1)."""
    diags = ctx.diags
    lang = ctx.lang
    rules = set(lang.rules()) | set(ctx.made_rules)
    k = course.iPlusOne or 1
    out: dict[tuple[int, int], list[str]] = {}
    ordered: list[tuple[int, int, int]] = []
    for ui, unit in enumerate(units):
        for si, s in enumerate(unit.source.sentences):
            if s.node not in taught.node_pos:
                diags.report(
                    "curriculum.unknown-node",
                    f"{s.id}: no node {s.node!r}",
                    unit.doc.loc("sentences", si, "node"),
                )
                continue
            parts: list[str] = []
            for orth in course.orthographies:
                tokens = forms.get((ui, si), {}).get(orth, {}).get("tokens", [])
                parts_of(ctx, taught, taught.node_pos[s.node], tokens, parts)
                _relations(ctx, s.id, tokens, unit.doc.loc("sentences", si, "forms", orth))
            parts += [u for u in dict.fromkeys(str(u) for u in s.uses or []) if u not in parts]
            out[(ui, si)] = parts
            ordered.append((taught.node_pos[s.node], ui, si))

    seen: set[str] = set()
    used: set[str] = set()
    for pos, ui, si in sorted(ordered):
        unit = units[ui]
        s = unit.source.sentences[si]
        loc = unit.doc.loc("sentences", si)
        # A lexeme's own part (lexeme:mano|Gender) is taught with its lexeme, never apart.
        named = [part for part in out[(ui, si)] if "|" not in part]
        used.update(named)
        for part in named:
            kind = lx.kind_of(part)
            if (kind == "lexeme" and part not in lang.index) or (
                kind == "rule" and part not in rules
            ):
                diags.report(
                    "curriculum.unknown",
                    f"{s.id} uses {part}, which the language's lexicon does not have",
                    loc,
                )
            elif part not in taught.introduced:
                diags.report(
                    "curriculum.never-introduced",
                    f"{s.id} uses {part}, which no node introduces",
                    loc,
                )
            elif taught.introduced[part] > pos:
                diags.report(
                    "curriculum.introduced-late",
                    f"{s.id} (node {s.node}) uses {part} before the node that introduces it",
                    loc,
                )
        new = [part for part in named if lx.kind_of(part) in I_PLUS_ONE_KINDS and part not in seen]
        if len(new) > k:
            diags.report(
                "curriculum.i-plus-one",
                f"{s.id} brings in {len(new)} new things to learn ({', '.join(new)}); at most {k}",
                loc,
            )
        seen.update(named)

    for teachable, loc in taught.where.items():
        if teachable not in used and lx.kind_of(teachable) in I_PLUS_ONE_KINDS:
            diags.report("curriculum.unused", f"{teachable} is never used in a sentence", loc)
    _one_gender(units, diags)
    return out


def _used(
    units: list[Unit],
    forms: dict[tuple[int, int], dict[str, dict[str, Any]]],
    story_lines: list[LineForm],
    taught: Taught,
) -> set[str]:
    """The lexemes of the language the course is made of: those a node introduces, a token of a
    sentence or a story writes, or an alphabet node practises. The bundle ships these; the
    lexicon may hold more, which another course of the language teaches."""
    out = {t for t in taught.introduced if lx.kind_of(t) == "lexeme"}
    for by_orth in forms.values():
        for form in by_orth.values():
            for t in form["tokens"]:
                out.update(tk.ids_of(t))
    for line in story_lines:
        for t in line.tokens:
            out.update(tk.ids_of(t))
    for unit in units:
        for node in unit.source.nodes:
            out.update(str(t) for t in node.reinforces or [] if lx.kind_of(str(t)) == "lexeme")
            if node.alphabet is not None:
                out.update(str(lexeme) for lexeme in node.alphabet.lexemes)
    return out


def _lexicon(ctx: Ctx, course: CourseSource, doc: Doc) -> None:
    """What a schema cannot say of a lexicon and its language (docs/migration-design.md, "Left
    to lints"): an entry is one kind of lexeme, a form says how it is written, a listed form
    has its statement, and every value, class, variety and register named is one the language
    declares."""
    lang = ctx.lang
    diags = ctx.diags
    declared = lang.declared
    values = lang.feature_values()
    classes = {str(c.id) for c in declared.classes or []}

    def feats_ok(feats: Mapping[str, str] | None, what: str, loc: Loc) -> None:
        for feature, said in (feats or {}).items():
            for value in str(said).split(","):
                if lx.feature_id(str(feature), value) not in values:
                    diags.report(
                        "lexicon.undeclared",
                        f"{what}: {feature}={value} is no value the language declares",
                        loc,
                    )

    if course.variety is not None and str(course.variety) not in (declared.varieties or []):
        diags.report(
            "lexicon.undeclared",
            f"the course teaches {course.variety}, which {lang.code} does not declare",
            doc.loc("variety"),
        )
    for register in course.registers or []:
        if str(register) not in (declared.registers or []):
            diags.report(
                "lexicon.undeclared",
                f"the course teaches the register {register}, which {lang.code} does not declare",
                doc.loc("registers"),
            )
    if lang.lexicon.language != lang.code or declared.id != lang.code:
        diags.report(
            "lexicon.undeclared",
            f"lexicons/{lang.code} holds the lexicon of {lang.lexicon.language} and the "
            f"declaration of {declared.id}",
            lang.doc.loc("language"),
        )
    ids = [str(entry.id) for entry in lang.lexicon.lexemes]
    if ids != sorted(ids):
        first = next(i for i, (a, b) in enumerate(zip(ids, sorted(ids), strict=True)) if a != b)
        diags.report(
            "lexicon.order",
            f"{ids[first]} is out of place: a lexicon is sorted by id, so an entry never moves",
            lang.doc.loc("lexemes", first),
        )
    for entry in lang.lexicon.lexemes:
        ident = str(entry.id)
        loc = lang.loc(ident)
        kinds = [
            k
            for k, v in (("pos", entry.pos), ("realises", entry.realises), ("head", entry.head))
            if v is not None
        ]
        if len(kinds) != 1 and not (not kinds and entry.form is not None):
            diags.report(
                "lexicon.kind",
                f"{ident} has {', '.join(kinds) or 'no part of speech, value or head'}: an entry "
                "is one of the three",
                loc,
            )
        feats_ok(entry.feats, ident, loc)
        feats_ok(entry.realises, ident, loc)
        for name in entry.classes or []:
            if str(name) not in classes:
                diags.report(
                    "lexicon.undeclared", f"{ident}: {name} is no class the language states", loc
                )
        own = lang.own_features(entry)
        for feature in entry.chooses or []:
            if feature not in own:
                diags.report(
                    "lexicon.undeclared",
                    f"{ident} chooses {feature}, which no {entry.pos} of the language has of "
                    "itself",
                    loc,
                )
        for fi, form in enumerate(entry.forms or []):
            floc = lang.loc(ident, "forms", fi)
            feats_ok(form.feats, ident, floc)
            if form.form is None and form.stem is None and not form.spelled:
                diags.report("lexicon.form", f"{ident}: a form with no spelling", floc)
            if form.status == "listed" and form.statement is None:
                diags.report(
                    "lexicon.form",
                    f"{ident}: a listed form needs its statement, that the language has no rule "
                    "for it (ADR 0145)",
                    floc,
                )
    for li, label in enumerate(declared.labels or []):
        feats_ok(label.feats, "a label", lang.declared_doc.loc("labels", li))
    for di, default in enumerate(declared.defaults or []):
        feats_ok(default.gives, f"default {default.id}", lang.declared_doc.loc("defaults", di))


_GENDERS = {"m": "a man", "f": "a woman"}


def _one_gender(units: list[Unit], diags: Diagnostics) -> None:
    """A course that tags one gender of speaker or addressee must tag the other too: where the
    language marks it, both are taught (ADR 0075)."""
    for role, said in (("speaker", "speaking"), ("addressee", "spoken to")):
        first: dict[str, tuple[Unit, int]] = {}
        for unit in units:
            for si, s in enumerate(unit.source.sentences):
                persons = persons_of(s)
                value = getattr(persons, role, None) if persons is not None else None
                if value in _GENDERS and value not in first:
                    first[value] = (unit, si)
        if len(first) == 1:
            ((value, (unit, si)),) = first.items()
            other = "f" if value == "m" else "m"
            diags.report(
                "curriculum.one-gender",
                f"every sentence tagged with its {role} has {_GENDERS[value]} {said}, "
                f"none {_GENDERS[other]}: tag both, as the language marks both (ADR 0075)",
                unit.doc.loc("sentences", si, "tags"),
            )


def persons_of(s: SentenceSource) -> Persons | None:
    """Who says a sentence and who it is said to, where a tag of it says (ADR 0147)."""
    for tag in s.tags or []:
        persons = getattr(tag, "persons", None)
        if persons is not None:
            return cast(Persons, persons)
    return None


# ------------------------------------------------------------ stage 6: grading


def support_key(ctx: Ctx, orth: str) -> str:
    return ctx.profiles[orth].lang.split("-")[0]


def _check_accept(ctx: Ctx, orth: str, source: str, loc: Loc) -> dict[str, Any] | None:
    ok, result = ctx.cli.try_result("accept", profile=orth, accept=source)
    if not ok:
        ctx.diags.report("grading.accept-syntax", str(result), loc)
        return None
    for w in cast(list[str], result["warnings"]):
        if w == "many-paths":
            ctx.diags.report("grading.blowup", f"expands to {result['paths']} answers", loc)
        elif w == "duplicate-after-normalization":
            ctx.diags.report(
                "grading.duplicate", "two alternatives are identical after normalization", loc
            )
    return cast(dict[str, Any], result)


def _grading(ctx: Ctx, course: CourseSource, units: list[Unit]) -> None:
    for unit in units:
        for si, s in enumerate(unit.source.sentences):
            production = s.production if s.production is not None else True
            for orth, form in s.forms.items():
                if orth not in course.orthographies:
                    continue
                loc = unit.doc.loc("sentences", si, "forms", orth)
                if form.reverse is None:
                    if production:
                        ctx.diags.report(
                            "grading.missing-reverse",
                            f"{s.id} is used for production but has no reverse set in {orth}",
                            loc,
                        )
                    continue
                rloc = unit.doc.loc("sentences", si, "forms", orth, "reverse")
                if _check_accept(ctx, orth, form.reverse, rloc) is None:
                    continue
                graded = ctx.cli.result(
                    "grade", profile=orth, accept=form.reverse, answer=form.text
                )
                if graded["verdict"] not in CORRECT:
                    ctx.diags.report(
                        "grading.canonical-missing",
                        f"{form.text!r} grades {graded['verdict']} against its own reverse set",
                        rloc,
                    )
            for support in course.support:
                key = support_key(ctx, support)
                if key not in s.translations:
                    ctx.diags.report(
                        "parse.schema",
                        f"{s.id}: no {key} translation",
                        unit.doc.loc("sentences", si, "translations"),
                    )
                    continue
                _check_accept(
                    ctx,
                    support,
                    s.translations[key],
                    unit.doc.loc("sentences", si, "translations", key),
                )


# ------------------------------------------------------------ stage 7: glossary


def _glossary(
    ctx: Ctx,
    course: CourseSource,
    units: list[Unit],
    forms: dict[tuple[int, int], dict[str, dict[str, Any]]],
    story_lines: list[LineForm],
    used: set[str],
) -> None:
    """Simulate tap-for-gloss with the runtime matcher (core-cli `gloss`: longest match, exact
    and folded passes side by side) over every sentence and story line. The glossary is the
    course's lexemes, each as its entry spells it; a letter is no word to tap (ADR 0088)."""
    diags = ctx.diags
    cli = ctx.cli
    lang = ctx.lang
    for orth in course.orthographies:
        entries: list[tuple[str, str, list[str], Loc]] = []
        for entry in lang.lexicon.lexemes:
            ident = str(entry.id)
            if ident not in used:
                continue
            for fi, surface in enumerate(lang.spelled(entry, orth)):
                entries.append(
                    (
                        ident,
                        surface,
                        cast(list[str], cli.result("fold-units", profile=orth, text=surface)),
                        lang.loc(ident, "spelled", orth, fi),
                    )
                )
        if not entries:
            continue
        glossary = [{"id": ident, "text": surface} for ident, surface, _u, _l in entries]
        hits = [0] * len(entries)
        shadowed: set[str] = set()
        texts: list[tuple[str, list[dict[str, Any]], Loc]] = []
        for ui, unit in enumerate(units):
            for si, s in enumerate(unit.source.sentences):
                form = forms.get((ui, si), {}).get(orth)
                if form is not None:
                    texts.append(
                        (s.id, form["tokens"], unit.doc.loc("sentences", si, "forms", orth))
                    )
        texts += [
            ("a story line", line.tokens, line.doc.loc(*line.at))
            for line in story_lines
            if line.orthography == orth
        ]
        for name, tokens, loc in texts:
            public = [{"surface": t["surface"], "kind": t.get("kind", "lexical")} for t in tokens]
            matches = cast(
                list[dict[str, Any]],
                cli.result("gloss", profile=orth, entries=glossary, tokens=public),
            )
            for m in matches:
                hits[m["entry"]] += 1
            # a word whose own entry would gloss it alone, but a longer entry wins here
            for ti, t in enumerate(tokens):
                sense = tk.base_id(t)
                if sense is None:
                    continue
                own = [ei for ei, e in enumerate(entries) if e[0] == sense]
                tu = cast(list[str], cli.result("fold-units", profile=orth, text=t["surface"]))
                if not own or not tu or not any(entries[ei][2] == tu for ei in own):
                    continue
                covering = [m for m in matches if m["tokenStart"] <= ti < m["tokenEnd"]]
                # A homograph (知 "know", 知 "wise"): an entry spelled like the word, over the word
                # alone, glosses the sense the token names (glossAt), so it does not shadow it.
                homograph = any(
                    m["tokenStart"] == ti
                    and m["tokenEnd"] == ti + 1
                    and entries[cast(int, m["entry"])][2] == tu
                    for m in covering
                )
                won = homograph or any(m["entry"] in own for m in covering)
                if covering and not won and sense not in shadowed:
                    shadowed.add(sense)
                    winner: int = covering[0]["entry"]
                    other_kc, other_surface = entries[winner][0], entries[winner][1]
                    diags.report(
                        "glossary.shadowed",
                        f"{sense} ({t['surface']!r}) loses to {other_kc} ({other_surface!r})",
                        entries[own[0]][3],
                    )
            # tiles must consist of whole runtime units
            tiles: dict[int, str] = {}
            for t in tokens:
                if "tileGroup" in t:
                    tiles[t["tileGroup"]] = tiles.get(t["tileGroup"], "") + t["surface"]
            tile_units = [
                u
                for g in tiles
                for u in cast(list[str], cli.result("fold-units", profile=orth, text=tiles[g]))
            ]
            text = "".join(t["surface"] for t in tokens)
            units_ = cast(list[str], cli.result("fold-units", profile=orth, text=text))
            if tile_units != units_:
                diags.report(
                    "glossary.tile-split",
                    f"{name}: tiles {list(tiles.values())} do not line up with "
                    f"runtime units {units_}",
                    loc,
                )
        # An entry is spelled as its lemma or a variant of it, never as a token the sentences
        # write with several lexemes (ADR 0061): bormoq, not boraman (bor+a+man). A lexeme the
        # script does not write (an empty surface: chg's ezafe, ADR 0136) adds no letters, so a
        # token of one written lexeme and unwritten ones is spelled as that lexeme (ḥażrat-i حضرت).
        analysed: dict[str, list[list[dict[str, Any]]]] = {}
        for _name, tokens, _loc in texts:
            for t in tokens:
                written = {
                    str(part["lexeme"]) for part in tk.lexemes_of(t) if part.get("surface") != ""
                }
                if len(written) > 1:
                    key = unicodedata.normalize("NFC", t["surface"])
                    analysed.setdefault(key, []).append(tk.lexemes_of(t))
        for ident, surface, _u, loc in entries:
            for written in analysed.get(unicodedata.normalize("NFC", surface), []):
                if ident in {part["lexeme"] for part in written}:
                    parts = "+".join(str(part.get("surface", "")) for part in written)
                    diags.report(
                        "lexeme.inflected-form",
                        f"{ident} is spelled {surface!r}, a token of several lexemes ({parts}): "
                        "give the lemma; a tap on the token reaches it through its lexemes",
                        loc,
                    )
                    break
        # An entry's first spelling is its lemma (ADR 0061): a word card shows it, and a tap on
        # an inflected token reaches it through the token's lexemes, so it need not occur as
        # written.
        annotated = {
            ident for _name, tokens, _loc in texts for t in tokens for ident in tk.ids_of(t)
        }
        lemmas = {
            (str(entry.id), (entry.spelled or {}).get(orth, [""])[0])
            for entry in lang.lexicon.lexemes
        }
        for ei, (ident, surface, _u, loc) in enumerate(entries):
            if hits[ei] == 0 and not ((ident, surface) in lemmas and ident in annotated):
                diags.report(
                    "glossary.dead-entry",
                    f"{ident} is spelled {surface!r}, which is never reached in any {orth} "
                    "sentence or story",
                    loc,
                )

    # script-convert tracks
    by_id = {s.id: s for unit in units for s in unit.source.sentences}
    for unit in units:
        for ni, node in enumerate(unit.source.nodes):
            if node.convert is None:
                continue
            for sid in node.convert.sentences:
                s = by_id.get(sid)
                missing = [
                    o
                    for o in (node.convert.from_, node.convert.to)
                    if s is None or o not in s.forms
                ]
                if missing:
                    diags.report(
                        "script.missing-form",
                        f"{node.id}: sentence {sid} has no {', '.join(missing)} form",
                        unit.doc.loc("nodes", ni, "convert"),
                    )


# ------------------------------------------------------------ stage 9: packaging


def _packaging(ctx: Ctx, course: CourseSource, units: list[Unit], compiled: Compiled) -> None:
    for unit in units:
        for si, s in enumerate(unit.source.sentences):
            loc = unit.doc.loc("sentences", si)
            license_ = s.license or course.license
            provenance = s.provenance or course.provenance
            if license_ is None:
                ctx.diags.report(
                    "package.license",
                    f"{s.id} has no SPDX license and the course gives no default",
                    loc,
                )
            if provenance is None:
                ctx.diags.report(
                    "package.provenance",
                    f"{s.id} has no provenance and the course gives no default",
                    loc,
                )
                count(compiled, Counted(s.id, license_, None, None))
                continue
            if provenance.status == "published" and (
                provenance.reviewedBy is None or provenance.reviewedAt is None
            ):
                ctx.diags.report(
                    "package.unreviewed-published",
                    f"{s.id} is published without reviewedBy/reviewedAt",
                    loc,
                )
            count(compiled, Counted(s.id, license_, provenance.status, provenance.author))


def _bundle_unit(
    ctx: Ctx,
    course: CourseSource,
    ui: int,
    unit: Unit,
    forms: dict[tuple[int, int], dict[str, dict[str, Any]]],
    parts: dict[tuple[int, int], list[str]],
) -> dict[str, Any]:
    src = unit.source
    target = course.target
    support_by_key = {support_key(ctx, o): o for o in course.support}

    def support_tt(key: str, text: str) -> dict[str, Any]:
        return support_text(ctx, support_by_key.get(key, course.support[0]), text, target)

    sentences: list[dict[str, Any]] = []
    for si, s in enumerate(src.sentences):
        out_forms: dict[str, Any] = {}
        for orth, tagged in forms[(ui, si)].items():
            if any("_written" in t for t in tagged["tokens"]):
                ctx.written[(s.id, orth)] = [
                    str(t.get("_written", t["surface"])) for t in tagged["tokens"]
                ]
            entry: dict[str, Any] = {
                "text": {
                    **tagged,
                    "tokens": [
                        {k: v for k, v in t.items() if not k.startswith("_")}
                        for t in tagged["tokens"]
                    ],
                }
            }
            if s.forms[orth].reverse is not None:
                entry["reverse"] = s.forms[orth].reverse
            out_forms[orth] = entry
        translations: dict[str, Any] = {}
        for key, accept in s.translations.items():
            orth = support_by_key.get(key)
            display = (
                ctx.cli.result("accept", profile=orth, accept=accept)["canonicalSource"]
                if orth
                else accept.splitlines()[0]
            )
            translations[key] = {"text": support_tt(key, display), "accept": accept}
        provenance = s.provenance or course.provenance
        sentence: dict[str, Any] = {
            "id": s.id,
            "node": s.node,
            "forms": out_forms,
            "translations": translations,
            "parts": parts.get((ui, si), []),
            "production": s.production if s.production is not None else True,
            "provenance": provenance.model_dump(exclude_none=True) if provenance else None,
            "license": s.license or course.license,
        }
        tags = bundle_tags(s, support_tt)
        if tags:
            sentence["tags"] = tags
        sentences.append(sentence)

    nodes: list[dict[str, Any]] = []
    for node in src.nodes:
        n: dict[str, Any] = {
            "id": node.id,
            "kind": node.kind,
            "introduces": [str(t) for t in node.introduces or []],
            "reinforces": [str(t) for t in node.reinforces or []],
            "sentences": list(node.convert.sentences)
            if node.convert
            else [s.id for s in src.sentences if s.node == node.id],
        }
        if node.convert is not None:
            n["convert"] = {"from": node.convert.from_, "to": node.convert.to}
        nodes.append(n)

    graphemes: list[dict[str, Any]] = []
    for grapheme in src.graphemes or []:
        g: dict[str, Any] = {"id": grapheme.id}
        if grapheme.gloss:
            g["gloss"] = {lang: support_tt(lang, text) for lang, text in grapheme.gloss.items()}
        if grapheme.forms:
            g["forms"] = {
                orth: [marked(ctx, orth, support_text(ctx, orth, f, target), None) for f in fs]
                for orth, fs in grapheme.forms.items()
            }
        graphemes.append(g)

    out: dict[str, Any] = {"id": src.id, "nodes": nodes, "sentences": sentences}
    if graphemes:
        out["graphemes"] = graphemes
    if src.cefr is not None:
        out["cefr"] = src.cefr
    if src.title:
        out["title"] = {lang: support_tt(lang, t) for lang, t in src.title.items()}
    return out


def bundle_tags(
    s: SentenceSource, support_tt: Callable[[str, str], dict[str, Any]]
) -> list[dict[str, Any]]:
    """A sentence's tags as a bundle has them (ADR 0147): a closed set's value as it is, an
    authored situation as text in each support language."""
    out: list[dict[str, Any]] = []
    for tag in s.tags or []:
        persons = getattr(tag, "persons", None)
        register = getattr(tag, "register_", None) or getattr(tag, "register", None)
        situation = getattr(tag, "situation", None)
        if persons is not None:
            out.append({"persons": cast(Persons, persons).model_dump(exclude_none=True)})
        elif register is not None:
            out.append({"register": str(register)})
        elif situation is not None:
            said = cast(dict[str, str], situation)
            out.append({"situation": {lang: support_tt(lang, text) for lang, text in said.items()}})
    return out


def _bundle_lexicon(
    ctx: Ctx, course: CourseSource, used: set[str], images: dict[str, str]
) -> dict[str, Any]:
    """The bundle's lexicon: the course's lexemes as the language's lexicon has them, in its
    order (sorted by id), each with every lexical feature it has (stored, or by a default), the
    parts it has to learn beyond itself, its gloss and its spellings; the labels of the
    language's feature values; the rules the course names."""
    lang = ctx.lang
    target = course.target
    support_by_key = {support_key(ctx, o): o for o in course.support}

    def support_tt(key: str, text: str) -> dict[str, Any]:
        return support_text(ctx, support_by_key.get(key, course.support[0]), text, target)

    def gloss_of(gloss: Any) -> dict[str, Any]:
        return {str(k): support_tt(str(k), str(text)) for k, text in dict(gloss).items()}

    lexemes: list[dict[str, Any]] = []
    for entry in lang.lexicon.lexemes:
        ident = str(entry.id)
        if ident not in used:
            continue
        k: dict[str, Any] = {"id": ident}
        # A choice that asks which lexeme offers only lexemes of the answer's part of speech and
        # lexical features (ADR 0132).
        if entry.pos is not None:
            k["pos"] = entry.pos
        if entry.realises:
            k["realises"] = dict(entry.realises)
        if entry.head is not None:
            k["head"] = entry.head.model_dump(exclude_none=True)
        feats = lang.lexical(entry)
        if feats:
            k["feats"] = feats
        if entry.chooses:
            k["chooses"] = list(entry.chooses)
        own = lang.parts(entry)
        if own:
            k["parts"] = own
        if entry.gloss:
            k["gloss"] = gloss_of(entry.gloss)
        orths = list(entry.spelled or {})
        forms = {
            str(orth): [
                marked(
                    ctx,
                    str(orth),
                    support_text(ctx, str(orth), f, target),
                    ident if i == 0 else None,
                )
                for i, f in enumerate(lang.spelled(entry, str(orth)))
            ]
            for orth in orths
        }
        if forms:
            k["forms"] = forms
        if ident in images:
            k["image"] = images[ident]
        lexemes.append(k)

    out: dict[str, Any] = {"language": lang.code, "lexemes": lexemes}
    if lang.declared.bare:
        out["bare"] = {str(pos): lx.sorted_feats(cell) for pos, cell in lang.declared.bare.items()}
    labels: list[dict[str, Any]] = []
    for label in lang.declared.labels or []:
        if not label.gloss:
            continue
        shown: dict[str, Any] = {"feats": lx.sorted_feats(label.feats)}
        if label.pos is not None:
            shown["pos"] = label.pos
        shown["gloss"] = gloss_of(label.gloss)
        labels.append(shown)
    if labels:
        out["labels"] = labels
    rules: list[dict[str, Any]] = []
    for rule in lang.declared.rules or []:
        named: dict[str, Any] = {"id": str(rule.id)}
        if rule.gloss:
            named["gloss"] = gloss_of(rule.gloss)
        rules.append(named)
    for ident, made in ctx.made_rules.items():
        rules.append({"id": ident, "gloss": gloss_of(made["gloss"])})
    if rules:
        out["rules"] = sorted(rules, key=lambda r: str(r["id"]))
    return out
