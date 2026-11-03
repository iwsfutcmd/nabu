"""The course compiler (gameplan §7.5): stages 1–7 and 9; audio (stage 8) arrives in Phase 5.

compile_course() returns diagnostics and, when there are no errors, the bundle's content;
write_bundle() (package.py) turns that into content-addressed files. Every diagnostic carries
file:line.
"""

from __future__ import annotations

import hashlib
import json
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, cast

import yaml
from pydantic import BaseModel, ValidationError

from nabu.analyzers import Analyzer, analyzers_by_tool
from nabu.compiler import text as tx
from nabu.compiler.diagnostics import Diagnostics, Loc
from nabu.compiler.source import Doc, load_doc
from nabu.corecli import CoreCli
from nabu.drills.rbnf import icu_version, spellout, transform
from nabu.paths import I18N_GENERATED, PROFILES
from nabu.schema.models import CourseSource, OrthographyProfile, SentenceSource, UnitSource

I_PLUS_ONE_KINDS = ("sense", "form", "construction")
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


@dataclass
class Compiled:
    """Everything stage 9 needs to write a bundle."""

    course: CourseSource
    units: list[dict[str, Any]] = field(default_factory=lambda: [])
    orthographies: list[str] = field(default_factory=lambda: [])
    support: list[str] = field(default_factory=lambda: [])
    licenses: dict[str, int] = field(default_factory=lambda: {})
    provenance: dict[str, int] = field(default_factory=lambda: {})
    # bundle path → (bytes, SPDX license, attribution source)
    images: dict[str, tuple[bytes, str, str | None]] = field(default_factory=lambda: {})


@dataclass
class Ctx:
    diags: Diagnostics
    cli: CoreCli
    profiles: dict[str, OrthographyProfile]
    exemplars: dict[str, dict[str, list[str]]]
    analyzers: dict[str, Analyzer]


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


def _ruby_scheme(profile: OrthographyProfile) -> str | None:
    for layer in profile.annotations or []:
        if layer.kind == "reading" and layer.render == "ruby":
            return layer.scheme
    return None


def _exemplar_sets(ctx: Ctx, profile: OrthographyProfile) -> tuple[set[str], set[str]] | None:
    """Letter/mark/number/symbol and punctuation code points from the profile's CLDR exemplars."""
    if profile.exemplars is None:
        return None
    key = profile.exemplars.removeprefix("cldr:").replace("_", "-")
    data = ctx.exemplars.get(key) or ctx.exemplars.get(key.split("-")[0])
    if data is None:
        return None
    chars: set[str] = set()
    for kind in ("main", "auxiliary", "index", "numbers"):
        for item in data.get(kind, []):
            chars.update(item)
            chars.update(item.lower())
    for extra in profile.exemplarsExtra or []:
        chars.update(extra)
    punct: set[str] = {c for item in data.get("punctuation", []) for c in item}
    return chars, punct


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


def _hygiene(
    ctx: Ctx, profile: OrthographyProfile, text: str, toks: list[dict[str, Any]], loc: Loc
) -> None:
    diags = ctx.diags
    sets = _exemplar_sets(ctx, profile)
    if sets is not None:
        letters, punct = sets
        outside = sorted(
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
        if outside:
            diags.report(
                "text.script-audit",
                f"outside the {profile.exemplars} exemplars: {' '.join(outside)}",
                loc,
            )
        foreign_punct = sorted(
            {c for c in text if unicodedata.category(c)[0] == "P" and c not in punct}
        )
        if foreign_punct:
            diags.report(
                "text.punctuation-audit",
                f"punctuation not in the {profile.exemplars} exemplars: {' '.join(foreign_punct)}",
                loc,
            )
    script = profile.lang.split("-")[1]
    for tok in toks:
        if tok.get("kind", "word") == "word":
            foreign = tx.foreign_letters(tok["surface"], script)
            if foreign:
                diags.report(
                    "text.mixed-script",
                    f"{tok['surface']!r} mixes {' '.join(foreign)} into {script} text",
                    loc,
                )
    folds = [k for k in _letter_maps(profile) if k in text and unicodedata.category(k[0])[0] != "P"]
    presentation = [c for c in text if 0xFB50 <= ord(c) <= 0xFDFF or 0xFE70 <= ord(c) <= 0xFEFC]
    if folds or presentation:
        shown = " ".join(
            f"U+{ord(c):04X}" if len(k) == 1 else repr(k)
            for k in folds + presentation
            for c in k[:1]
        )
        diags.report(
            "text.non-canonical", f"uses characters its profile normalizes away: {shown}", loc
        )


def _form(ctx: Ctx, course: CourseSource, unit: Unit, si: int, orth: str) -> dict[str, Any] | None:
    sentence = unit.source.sentences[si]
    form = sentence.forms[orth]
    profile = ctx.profiles[orth]
    loc = unit.doc.loc("sentences", si, "forms", orth)
    text = form.text
    diags = ctx.diags

    analyzer = ctx.analyzers.get(profile.segmentation.content)
    if form.tokens:
        authored: list[dict[str, Any]] = []
        for t in form.tokens:
            d: dict[str, Any] = {"surface": t.surface}
            if t.kind is not None:
                d["kind"] = t.kind
            if t.sense is not None:
                d["sense"] = t.sense
            if t.readings:
                d["readings"] = dict(t.readings)
            if t.morphs:
                d["morphs"] = [m.model_dump() for m in t.morphs]
            if t.variants:
                d["variants"] = list(t.variants)
            if t.tile is not None:
                d["tileGroup"] = t.tile
            if t.form is not None:
                d["_form"] = t.form
            authored.append(d)
        toks, error = tx.align(text, authored)
        if error is not None:
            diags.report(
                "parse.token-mismatch",
                error,
                unit.doc.loc("sentences", si, "forms", orth, "tokens"),
            )
            return None
    else:
        segment = (
            analyzer.segment if analyzer is not None and _unit_kind(profile) == "grapheme" else None
        )
        toks = tx.auto_tokens(text, segment)

    # kinds and default tile groups
    explicit = [t["tileGroup"] for t in toks if "tileGroup" in t]
    next_group = max(explicit, default=-1) + 1
    for t in toks:
        t.setdefault("kind", tx.token_kind(t["surface"]))
        if t["kind"] in ("word", "number") and "tileGroup" not in t:
            t["tileGroup"] = next_group
            next_group += 1

    # stage 3: readings and ruby
    scheme = _ruby_scheme(profile)
    if scheme is not None:
        for t in toks:
            if t["kind"] != "word" or not tx.HAN.search(t["surface"]):
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
            segments = tx.ruby_segments(t["surface"], reading)
            if segments is None:
                diags.report(
                    "enrich.ruby-unaligned",
                    f"{t['surface']!r}: {reading!r} does not line up with its characters",
                    loc,
                )
            else:
                t["ruby"] = {scheme: segments}

    _hygiene(ctx, profile, text, toks, unit.doc.loc("sentences", si, "forms", orth, "text"))
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
                "morphs-mismatch": "parse.token-mismatch",
                "lang-outside-orthography": "parse.unknown-orthography",
            }.get(issue, "parse.token-mismatch")
            diags.report(lint, f"TaggedText invariant: {issue}", loc)
    return tagged


def _support_text(ctx: Ctx, orth: str, text: str, target: str) -> dict[str, Any]:
    profile = ctx.profiles[orth]
    toks = tx.auto_tokens(text)
    for i, t in enumerate(x for x in toks if x["kind"] in ("word", "number")):
        t["tileGroup"] = i
    return {"lang": _lang_for(profile, target), "orthography": orth, "tokens": toks}


# ------------------------------------------------------------ the compiler


def _course_file(path: Path) -> Path:
    return path / "course.yaml" if path.is_dir() else path


def compile_course(
    path: Path,
    cli: CoreCli,
    profiles: dict[str, OrthographyProfile] | None = None,
    analyzers: dict[str, Analyzer] | None = None,
) -> tuple[Diagnostics, Compiled | None]:
    diags = Diagnostics()
    course_file = _course_file(path)
    base = course_file.parent.parent

    def display(p: Path) -> str:
        return p.relative_to(base).as_posix()

    ctx = Ctx(
        diags,
        cli,
        profiles if profiles is not None else load_profiles(),
        load_exemplars(),
        analyzers if analyzers is not None else analyzers_by_tool(),
    )

    # ---- stage 1: parse
    doc = load_doc(course_file, display(course_file))
    course = _validate(CourseSource, doc, diags)
    if course is None:
        return diags, None
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
    sentence_kcs = _curriculum(ctx, course, units, compiled_forms)
    # ---- stage 6: grading
    _grading(ctx, course, units)
    # ---- stage 7: glossary, tiles, script tracks
    _glossary(ctx, course, units, compiled_forms)
    # ---- stage 9: packaging lints
    compiled = Compiled(
        course=course, orthographies=list(course.orthographies), support=list(course.support)
    )
    _packaging(ctx, course, units, compiled)
    image_paths = _images(ctx, course_file.parent, units, compiled)
    if diags.errors:
        return diags, None
    compiled.units = [
        _bundle_unit(ctx, course, ui, unit, compiled_forms, sentence_kcs, image_paths)
        for ui, unit in enumerate(units)
    ]
    return diags, compiled


def _images(ctx: Ctx, course_dir: Path, units: list[Unit], compiled: Compiled) -> dict[str, str]:
    """KC images → content-addressed bundle paths; licenses and provenance join the summary."""
    out: dict[str, str] = {}
    for unit in units:
        for ki, kc in enumerate(unit.source.kcs):
            image = kc.image
            if image is None:
                continue
            path = course_dir / image.file
            if not path.is_file():
                ctx.diags.report(
                    "parse.missing-asset",
                    f"{kc.id}: no image file {image.file}",
                    unit.doc.loc("kcs", ki, "image", "file"),
                )
                continue
            data = path.read_bytes()
            digest = hashlib.sha256(data).hexdigest()
            rel = f"images/{path.stem}.{digest[:16]}{path.suffix}"
            compiled.images[rel] = (data, image.license, image.source)
            out[kc.id] = rel
            compiled.licenses[image.license] = compiled.licenses.get(image.license, 0) + 1
            kind = image.provenance.author.split(":", 1)[0]
            for key in (f"status.{image.provenance.status}", f"author.{kind}"):
                compiled.provenance[key] = compiled.provenance.get(key, 0) + 1
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
        for i, kc in enumerate(unit.source.kcs):
            check("kc", kc.id, unit.doc.loc("kcs", i))
        for i, node in enumerate(unit.source.nodes):
            check("node", node.id, unit.doc.loc("nodes", i))
        for i, s in enumerate(unit.source.sentences):
            check("sentence", s.id, unit.doc.loc("sentences", i))


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


def _nfc_and_invisibles(ctx: Ctx, course: CourseSource, doc: Doc, units: list[Unit]) -> None:
    allowed: set[str] = set()
    for orth in course.orthographies:
        allowed |= _allowed_invisibles(ctx.profiles[orth])
    docs = [
        Doc(
            doc.file,
            {k: v for k, v in cast(dict[str, Any], doc.data).items() if k != "units"},
            doc.lines,
        )
    ]
    docs += [u.doc for u in units if u.doc.data is not None]
    for d in docs:
        for path, value in _strings(d.data):
            if unicodedata.normalize("NFC", value) != value:
                ctx.diags.report("text.not-nfc", f"{value!r} is not NFC", d.loc(*path))
            bad = tx.invisible_chars(value, allowed)
            if bad:
                ctx.diags.report(
                    "text.invisible", " ".join(f"U+{ord(c):04X}" for c in bad), d.loc(*path)
                )


def _transliteration(ctx: Ctx, unit: Unit, si: int, s: SentenceSource) -> None:
    for orth, form in s.forms.items():
        profile = ctx.profiles.get(orth)
        tl = profile.transliterate if profile is not None else None
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


# ------------------------------------------------------------ stage 4: drills


def _drills(ctx: Ctx, course: CourseSource, doc: Doc, units: list[Unit]) -> None:
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
            sentences.append(
                {
                    "id": f"drill.{drill.kind}.{value}",
                    "node": f"drill.{drill.kind}",
                    "forms": {
                        drill.orthography: {"text": spelled, "reverse": f"{spelled}\n{value}"}
                    },
                    "constructions": [f"construction:{drill.kind}"],
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
        data = {
            "id": f"drill-{drill.kind}",
            "kcs": [{"id": f"construction:{drill.kind}", "gloss": {support_lang: drill.kind}}],
            "nodes": [
                {
                    "id": f"drill.{drill.kind}",
                    "kind": "practice",
                    "introduces": [f"construction:{drill.kind}"],
                }
            ],
            "sentences": sentences,
        }
        units.append(
            Unit(Doc(doc.file, data, doc.lines, ("drills", di)), UnitSource.model_validate(data))
        )


# ------------------------------------------------------------ stage 5: curriculum


def _kind(kc: str) -> str:
    return kc.split(":", 1)[0]


def _curriculum(
    ctx: Ctx,
    course: CourseSource,
    units: list[Unit],
    forms: dict[tuple[int, int], dict[str, dict[str, Any]]],
) -> dict[tuple[int, int], list[str]]:
    diags = ctx.diags
    defined: dict[str, Loc] = {}
    prereqs: dict[str, list[str]] = {}
    for unit in units:
        for i, kc in enumerate(unit.source.kcs):
            defined[kc.id] = unit.doc.loc("kcs", i)
            prereqs[kc.id] = list(kc.prerequisites or [])

    node_pos: dict[str, int] = {}
    introduced_at: dict[str, int] = {}
    position = 0
    for unit in units:
        for ni, node in enumerate(unit.source.nodes):
            node_pos[node.id] = position
            for kc in [*(node.introduces or []), *(node.reinforces or [])]:
                if kc not in defined:
                    diags.report(
                        "curriculum.unknown-kc", f"{kc} is not defined", unit.doc.loc("nodes", ni)
                    )
            for kc in node.introduces or []:
                introduced_at.setdefault(kc, position)
            position += 1

    for unit in units:
        for i, kc in enumerate(unit.source.kcs):
            for p in kc.prerequisites or []:
                if p not in defined:
                    diags.report(
                        "curriculum.unknown-kc",
                        f"prerequisite {p} of {kc.id} is not defined",
                        unit.doc.loc("kcs", i),
                    )

    # cycles in the prerequisite DAG
    state: dict[str, int] = {}

    def visit(kc: str, stack: list[str]) -> None:
        state[kc] = 1
        for p in prereqs.get(kc, []):
            if state.get(p) == 1:
                cycle = [*stack[stack.index(p) :], p] if p in stack else [kc, p]
                diags.report("curriculum.cycle", " → ".join(cycle), defined[kc])
            elif state.get(p) is None and p in defined:
                visit(p, [*stack, p])
        state[kc] = 2

    for kc in defined:
        if state.get(kc) is None:
            visit(kc, [kc])

    # the path must be a topological order
    for unit in units:
        for ni, node in enumerate(unit.source.nodes):
            here = node_pos[node.id]
            for kc in node.introduces or []:
                for p in prereqs.get(kc, []):
                    if introduced_at.get(p, 10**9) > here:
                        diags.report(
                            "curriculum.order",
                            f"{node.id} introduces {kc} before its prerequisite {p}",
                            unit.doc.loc("nodes", ni),
                        )

    # sentences: KCs, introduction order, i+1
    k = course.iPlusOne or 1
    out: dict[tuple[int, int], list[str]] = {}
    ordered: list[tuple[int, int, int]] = []
    for ui, unit in enumerate(units):
        for si, s in enumerate(unit.source.sentences):
            if s.node not in node_pos:
                diags.report(
                    "curriculum.unknown-node",
                    f"{s.id}: no node {s.node!r}",
                    unit.doc.loc("sentences", si, "node"),
                )
                continue
            kcs: list[str] = []
            for orth in course.orthographies:
                for t in forms.get((ui, si), {}).get(orth, {}).get("tokens", []):
                    refs = [f"sense:{t['sense']}"] if "sense" in t else []
                    refs += [t["_form"]] if "_form" in t else []
                    refs += [m["kc"] for m in t.get("morphs", [])]
                    kcs += [r for r in dict.fromkeys(refs) if r not in kcs]
            kcs += [c for c in dict.fromkeys(s.constructions or []) if c not in kcs]
            out[(ui, si)] = kcs
            ordered.append((node_pos[s.node], ui, si))

    seen: set[str] = set()
    used: set[str] = set()
    for pos, ui, si in sorted(ordered):
        unit = units[ui]
        s = unit.source.sentences[si]
        loc = unit.doc.loc("sentences", si)
        kcs = out[(ui, si)]
        used.update(kcs)
        for kc in kcs:
            if kc not in defined:
                diags.report(
                    "curriculum.unknown-kc", f"{s.id} uses {kc}, which is not defined", loc
                )
            elif kc not in introduced_at:
                diags.report(
                    "curriculum.never-introduced",
                    f"{s.id} uses {kc}, which no node introduces",
                    loc,
                )
            elif introduced_at[kc] > pos:
                diags.report(
                    "curriculum.introduced-late",
                    f"{s.id} (node {s.node}) uses {kc} before the node that introduces it",
                    loc,
                )
        new = [kc for kc in kcs if _kind(kc) in I_PLUS_ONE_KINDS and kc not in seen]
        if len(new) > k:
            diags.report(
                "curriculum.i-plus-one",
                f"{s.id} brings in {len(new)} new knowledge components "
                f"({', '.join(new)}); at most {k}",
                loc,
            )
        seen.update(kcs)

    for unit in units:
        for i, kc in enumerate(unit.source.kcs):
            if kc.id not in used and _kind(kc.id) in I_PLUS_ONE_KINDS:
                diags.report(
                    "curriculum.unused-kc",
                    f"{kc.id} is never used in a sentence",
                    unit.doc.loc("kcs", i),
                )
    return out


# ------------------------------------------------------------ stage 6: grading


def _support_key(ctx: Ctx, orth: str) -> str:
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
                key = _support_key(ctx, support)
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
) -> None:
    diags = ctx.diags
    cli = ctx.cli
    for orth in course.orthographies:
        entries: list[tuple[str, str, list[str], Loc]] = []
        for unit in units:
            for ki, kc in enumerate(unit.source.kcs):
                for fi, surface in enumerate((kc.forms or {}).get(orth, [])):
                    entries.append(
                        (
                            kc.id,
                            surface,
                            cast(list[str], cli.result("fold-units", profile=orth, text=surface)),
                            unit.doc.loc("kcs", ki, "forms", orth, fi),
                        )
                    )
        hits = [0] * len(entries)
        shadowed: set[str] = set()
        for ui, unit in enumerate(units):
            for si, s in enumerate(unit.source.sentences):
                form = forms.get((ui, si), {}).get(orth)
                if form is None:
                    continue
                units_ = cast(
                    list[str], cli.result("fold-units", profile=orth, text=s.forms[orth].text)
                )
                # runtime longest-match segmentation over the units
                chosen: list[tuple[int, int, int]] = []
                i = 0
                while i < len(units_):
                    best = -1
                    for ei, (_kc, _surface, eu, _loc) in enumerate(entries):
                        if (
                            eu
                            and units_[i : i + len(eu)] == eu
                            and (best < 0 or len(eu) > len(entries[best][2]))
                        ):
                            best = ei
                    if best >= 0:
                        hits[best] += 1
                        chosen.append((i, i + len(entries[best][2]), best))
                        i += len(entries[best][2])
                    else:
                        i += 1
                # a word whose own entry matches here but loses to a longer entry is shadowed
                for t in form["tokens"]:
                    if "sense" not in t:
                        continue
                    sense = f"sense:{t['sense']}"
                    own = [ei for ei, e in enumerate(entries) if e[0] == sense]
                    tu = cast(list[str], cli.result("fold-units", profile=orth, text=t["surface"]))
                    for start in range(len(units_) - len(tu) + 1):
                        if not tu or units_[start : start + len(tu)] != tu:
                            continue
                        exact = any(c[0] == start and c[2] in own for c in chosen)
                        covered = [c for c in chosen if c[0] <= start < c[1] and c[2] not in own]
                        if own and not exact and covered and sense not in shadowed:
                            shadowed.add(sense)
                            other = entries[covered[0][2]]
                            diags.report(
                                "glossary.shadowed",
                                f"{sense} ({t['surface']!r}) loses to {other[0]} ({other[1]!r})",
                                entries[own[0]][3],
                            )
                # tiles must consist of whole runtime units
                tiles: dict[int, str] = {}
                for t in form["tokens"]:
                    if "tileGroup" in t:
                        tiles[t["tileGroup"]] = tiles.get(t["tileGroup"], "") + t["surface"]
                tile_units = [
                    u
                    for g in tiles
                    for u in cast(list[str], cli.result("fold-units", profile=orth, text=tiles[g]))
                ]
                if tile_units != units_:
                    diags.report(
                        "glossary.tile-split",
                        f"{s.id}: tiles {list(tiles.values())} do not line up with "
                        f"runtime units {units_}",
                        unit.doc.loc("sentences", si, "forms", orth),
                    )
        for ei, (kc, surface, _u, loc) in enumerate(entries):
            if hits[ei] == 0:
                diags.report(
                    "glossary.dead-entry",
                    f"{kc} form {surface!r} is never reached in any {orth} sentence",
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
            else:
                compiled.licenses[license_] = compiled.licenses.get(license_, 0) + 1
            if provenance is None:
                ctx.diags.report(
                    "package.provenance",
                    f"{s.id} has no provenance and the course gives no default",
                    loc,
                )
                continue
            if provenance.status == "published" and (
                provenance.reviewedBy is None or provenance.reviewedAt is None
            ):
                ctx.diags.report(
                    "package.unreviewed-published",
                    f"{s.id} is published without reviewedBy/reviewedAt",
                    loc,
                )
            kind = provenance.author.split(":", 1)[0]
            for key in (f"status.{provenance.status}", f"author.{kind}"):
                compiled.provenance[key] = compiled.provenance.get(key, 0) + 1


def _bundle_unit(
    ctx: Ctx,
    course: CourseSource,
    ui: int,
    unit: Unit,
    forms: dict[tuple[int, int], dict[str, dict[str, Any]]],
    kcs: dict[tuple[int, int], list[str]],
    images: dict[str, str],
) -> dict[str, Any]:
    src = unit.source
    target = course.target
    support_by_key = {_support_key(ctx, o): o for o in course.support}

    def support_tt(key: str, text: str) -> dict[str, Any]:
        return _support_text(ctx, support_by_key.get(key, course.support[0]), text, target)

    sentences: list[dict[str, Any]] = []
    for si, s in enumerate(src.sentences):
        out_forms: dict[str, Any] = {}
        for orth, tagged in forms[(ui, si)].items():
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
            "kcs": kcs.get((ui, si), []),
            "production": s.production if s.production is not None else True,
            "provenance": provenance.model_dump(exclude_none=True) if provenance else None,
            "license": s.license or course.license,
        }
        if s.register_ is not None:
            sentence["register"] = s.register_
        sentences.append(sentence)

    nodes: list[dict[str, Any]] = []
    for node in src.nodes:
        n: dict[str, Any] = {
            "id": node.id,
            "kind": node.kind,
            "introduces": list(node.introduces or []),
            "reinforces": list(node.reinforces or []),
            "sentences": list(node.convert.sentences)
            if node.convert
            else [s.id for s in src.sentences if s.node == node.id],
        }
        if node.convert is not None:
            n["convert"] = {"from": node.convert.from_, "to": node.convert.to}
        nodes.append(n)

    kc_out: list[dict[str, Any]] = []
    for kc in src.kcs:
        k: dict[str, Any] = {
            "id": kc.id,
            "kind": _kind(kc.id),
            "prerequisites": list(kc.prerequisites or []),
        }
        if kc.cefr is not None:
            k["cefr"] = kc.cefr
        if kc.gloss:
            k["gloss"] = {lang: support_tt(lang, g) for lang, g in kc.gloss.items()}
        if kc.forms:
            k["forms"] = {
                orth: [_support_text(ctx, orth, f, target) for f in fs]
                for orth, fs in kc.forms.items()
            }
        if kc.id in images:
            k["image"] = images[kc.id]
        kc_out.append(k)

    out: dict[str, Any] = {"id": src.id, "kcs": kc_out, "nodes": nodes, "sentences": sentences}
    if src.cefr is not None:
        out["cefr"] = src.cefr
    if src.title:
        out["title"] = {lang: support_tt(lang, t) for lang, t in src.title.items()}
    return out
