"""A language's lexicon and its declaration, from a converted course (docs/migration-design.md).

An entry is today's KC under its new name. What the course's tokens write of it is counted as
occurrences: a lexeme, the feature values named there and its spelling in every orthography of
the sentence, paired, since a sentence names the same lexemes in the same order in each. An
occurrence the entry's own spelling does not account for becomes a pinned form or an allomorph
(ADR 0145: every form the stated rules do not reach is pinned or listed, never neither).
"""

from __future__ import annotations

import collections
import posixpath
import unicodedata
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from nabu.migrate.convert import Converter, Finding, Part, Tok
from nabu.migrate.plan import Feats
from nabu.migrate.source import _OPTIONAL_MARKS, fold, obj, seq  # pyright: ignore[reportPrivateUsage]
from nabu.yamlio import INVISIBLE

Json = dict[str, Any]
Key = tuple[tuple[str, str], ...]


def key_of(feats: Feats) -> Key:
    return tuple(sorted(feats.items()))


def is_cited(cell: Key, citation: Feats) -> bool:
    """Whether a token with these values stands in its entry's own cell: every value it names
    is the citation cell's. A token names less than the cell where its lexeme has a feature of
    itself (casa: Number alone) or none (grc σύ: no gender); a form that serves several cases
    names the citation's among them (τέκνον); a token that names nothing is its entry."""
    return all(
        k in citation and set(v.split(",")) & set(str(citation[k]).split(",")) for k, v in cell
    )


@dataclass(frozen=True)
class Occurrence:
    lexeme: str
    feats: Key
    spelled: tuple[tuple[str, str], ...]
    """(orthography, letters as written), for every orthography of the item."""
    bound: bool
    """Written joined to another lexeme."""
    item: str
    readings: tuple[tuple[str, str], ...] = ()
    """(scheme, reading) the token pins, where it is a token of its own."""


def offsets(text: str, surfaces: list[str]) -> list[tuple[int, int]]:
    """Where each token stands in its text: tokens are aligned to it in order."""
    out: list[tuple[int, int]] = []
    at = 0
    for s in surfaces:
        found = text.find(s, at)
        if found < 0:
            raise ValueError(f"token {s!r} is not in {text!r} after {at}")
        out.append((found, found + len(s)))
        at = found + len(s)
    return out


@dataclass
class Run:
    """One lexeme as a form writes it: an entry of several tokens (buenos días) counted once."""

    lexeme: str
    feats: Feats
    surface: str
    bound: bool
    readings: tuple[tuple[str, str], ...] = ()


Written = tuple[str, list[tuple[str, Feats, str]], bool, tuple[tuple[str, str], ...]]
"""A token for `runs`: its surface, the lexemes it writes (name, values, letters), whether it
names its one lexeme itself, and the readings it pins."""


def runs(text: str, tokens: list[Written], multiword: Callable[[str], bool]) -> list[Run]:
    """A form's lexemes in order. An entry written as several tokens is one run, and may begin
    or end inside a token written with other lexemes (apc b + tishrin, then el tene; 3id, then
    milad + its ending)."""
    spans = offsets(text, [t[0] for t in tokens])
    out: list[Run] = []
    last: tuple[str, int] | None = None
    for (surface, parts, alone, readings), (start, end) in zip(tokens, spans, strict=True):
        if alone and len(parts) == 1:
            lexeme, feats, _ = parts[0]
            if last is not None and last[0] == lexeme and multiword(lexeme):
                run = out[-1]
                run.surface = text[last[1] : end]
                run.feats = {**run.feats, **feats}
                continue
            out.append(Run(lexeme, dict(feats), surface, False, readings))
            last = (lexeme, start)
            continue
        at = start
        first = True
        for lexeme, feats, letters in parts:
            if first and last is not None and last[0] == lexeme and multiword(lexeme):
                run = out[-1]
                run.surface = text[last[1] : at + len(letters)]
                run.feats = {**run.feats, **feats}
                run.bound = True
            else:
                out.append(Run(lexeme, dict(feats), letters, True))
            first = False
            last = (lexeme, at)
            at += len(letters)
        if at != end:
            last = None
    return out


def _runs(conv: Converter, text: str, toks: list[Tok], orth: str) -> list[Run]:
    tokens: list[Written] = []
    for tok in toks:
        parts = [(p.lexeme, dict(p.feats), p.surface) for p in tok.parts]
        alone = len(tok.parts) == 1 and tok.parts[0].alone
        pinned = tuple(sorted((str(k), str(v)) for k, v in obj(tok.rest.get("readings")).items()))
        tokens.append((tok.surface, parts, alone, pinned if alone else ()))
    return runs(text, tokens, lambda lexeme: _multiword(conv, lexeme, orth))


def _multiword(conv: Converter, lexeme: str, orth: str) -> bool:
    forms = conv.forms_of(conv.taken[lexeme], orth)
    return bool(forms) and any(ch.isspace() for ch in forms[0])


def occurrences(conv: Converter) -> tuple[list[Occurrence], list[Finding]]:
    out: list[Occurrence] = []
    findings: list[Finding] = []
    for item in conv.course.items():
        by_orth = {
            orth: _runs(conv, str(item.data["forms"][orth]["text"]), toks, orth)
            for orth, toks in conv.items[item.id].items()
        }
        shapes = {
            orth: [(r.lexeme, key_of(r.feats)) for r in runs] for orth, runs in by_orth.items()
        }
        first = next(iter(shapes.values()))
        if all(s == first for s in shapes.values()):
            # In the course's order of its orthographies, whichever a sentence lists first: two
            # occurrences written alike must pair alike.
            orths = [o for o in conv.course.orthographies if o in by_orth]
            orths += [o for o in by_orth if o not in orths]
            for i, (lexeme, feats) in enumerate(first):
                spelled = tuple((o, by_orth[o][i].surface) for o in orths)
                bound = any(by_orth[o][i].bound for o in orths)
                read = tuple(sorted({r for o in orths for r in by_orth[o][i].readings}))
                out.append(Occurrence(lexeme, feats, spelled, bound, item.id, read))
            continue
        findings.append(
            Finding(
                "orthographies-differ",
                item.id,
                "its orthographies do not name the same lexemes in the same order: "
                + "; ".join(f"{o}: {' '.join(lex for lex, _ in s)}" for o, s in shapes.items()),
            )
        )
        for orth, runs in by_orth.items():
            for r in runs:
                out.append(
                    Occurrence(
                        r.lexeme,
                        key_of(r.feats),
                        ((orth, r.surface),),
                        r.bound,
                        item.id,
                        r.readings,
                    )
                )
    return out, findings


def _marks(text: str) -> int:
    return len(_OPTIONAL_MARKS.findall(unicodedata.normalize("NFD", text)))


def _strip_marks(text: str) -> str:
    return unicodedata.normalize("NFC", _OPTIONAL_MARKS.sub("", unicodedata.normalize("NFD", text)))


class Spellings:
    """How one lexeme is written, cell by cell, with the plain spelling of each way."""

    def __init__(self, entry: dict[str, list[str]]) -> None:
        self.entry = entry
        self.unmarked = {o: all(_marks(f) == 0 for f in fs) for o, fs in entry.items()}
        self.lower = {o: bool(fs) and fs[0][:1].islower() for o, fs in entry.items()}

    def plain(self, orth: str, variants: collections.Counter[str]) -> str:
        """One spelling for the letters several tokens write: the one with the fewest optional
        marks, then the commonest; as the entry is written (no marks, no sentence's capital)."""
        best = INVISIBLE.sub("", min(variants, key=lambda v: (_marks(v), -variants[v], v))).strip()
        if self.unmarked.get(orth, True):
            best = _strip_marks(best)
        if any("\u0370" <= ch <= "\u03ff" or "\u1f00" <= ch <= "\u1fff" for ch in best):
            # A Greek grave is the acute of a word in running text (ADR 0087): the form's own
            # accent is the acute.
            best = unicodedata.normalize(
                "NFC", unicodedata.normalize("NFD", best).replace("\u0300", "\u0301")
            )
        if self.lower.get(orth, False) and best[:1].isupper() and best[1:] == best[1:].lower():
            lowered = best[:1].lower() + best[1:]
            if fold(lowered) == fold(best):
                best = lowered
        return best

    def every(self, orth: str, variants: collections.Counter[str]) -> list[str]:
        """The spellings to keep for one way of writing a cell. Where the entry is written
        without its script's optional marks, the plain one. Where it is written with them (hbo:
        the text is pointed), each pointing the course writes, the commonest first: the same
        letters in pause and before an ending are pointed otherwise."""
        if self.unmarked.get(orth, True):
            plain = self.plain(orth, variants)
            return [plain] if plain else []
        cleaned: collections.Counter[str] = collections.Counter()
        for v, n in variants.items():
            cleaned[INVISIBLE.sub("", v).strip()] += n
        return [v for v, _ in sorted(cleaned.items(), key=lambda kv: (-kv[1], kv[0])) if v]


def _letters(text: str) -> str:
    """Letters with no accent, for an ending: Greek -ός is -ος, Spanish -ción is -cion."""
    bare = "".join(ch for ch in unicodedata.normalize("NFD", text) if not unicodedata.combining(ch))
    return unicodedata.normalize("NFC", bare).casefold()


def _clusters(text: str) -> tuple[set[str], list[tuple[str, set[str]]]]:
    """A text as its letters, each with the marks on it; and the marks it begins with, which sit
    on the letter before it."""
    leading: set[str] = set()
    out: list[tuple[str, set[str]]] = []
    for ch in unicodedata.normalize("NFD", text).casefold():
        if unicodedata.combining(ch):
            (out[-1][1] if out else leading).add(ch)
        else:
            out.append((ch, set()))
    return leading, out


def _ends(spelling: str, ending: str) -> bool:
    """Whether a spelling ends so. An ending written with marks needs them where it has them
    (Hebrew qamats and he, not any he), whatever other marks the letters carry; one written
    without is compared on the letters alone (Greek -ος is -ός)."""
    leading, tail = _clusters(ending)
    _, word = _clusters(spelling)
    if len(tail) > len(word) or (leading and len(tail) >= len(word)):
        return False
    start = len(word) - len(tail)
    for (letter, marks), (want, needed) in zip(word[start:], tail, strict=True):
        if letter != want or not needed <= marks:
            return False
    return not leading or leading <= word[start - 1][1]


def _in_order(spelled: Json, orths: list[str]) -> Json:
    """Spellings by orthography, in the course's order of its orthographies."""
    return {
        **{o: spelled[o] for o in orths if o in spelled},
        **{o: v for o, v in spelled.items() if o not in orths},
    }


def default_for(defaults: list[Json], pos: str | None, spelling: str, feature: str) -> Json | None:
    """The most specific default that speaks of this feature for a lexeme so written."""
    best: Json | None = None
    for d in defaults:
        when = obj(d.get("when"))
        if feature not in obj(d.get("gives")):
            continue
        if "pos" in when and when["pos"] != pos:
            continue
        if "ends" in when and not _ends(spelling, str(when["ends"])):
            continue
        if "starts" in when and not _letters(spelling).startswith(_letters(str(when["starts"]))):
            continue
        if best is None or len(str(when.get("ends", ""))) > len(
            str(obj(best.get("when")).get("ends", ""))
        ):
            best = d
    return best


@dataclass
class Built:
    language: Json
    lexicon: Json
    findings: list[Finding]
    occurrences: list[Occurrence]
    stats: Json
    stored: list[tuple[str, str, str]]
    """The lexical features entries store with no default for their ending: (feature, value,
    the entry's spelling)."""


def build(conv: Converter) -> Built:
    plan, course = conv.plan, conv.course
    occs, findings = occurrences(conv)
    orths = course.orthographies
    first_orth = orths[0]
    defaults: list[Json] = seq(plan.data.get("defaults"))
    stats: Json = collections.Counter()
    stored: list[tuple[str, str, str]] = []

    # Occurrences by lexeme and cell; each way of writing the cell by its folded letters.
    cells: dict[str, dict[Key, dict[tuple[tuple[str, str], ...], list[Occurrence]]]] = (
        collections.defaultdict(
            lambda: collections.defaultdict(lambda: collections.defaultdict(list))
        )
    )
    for occ in occs:
        folded = tuple((o, fold(s)) for o, s in occ.spelled)
        cells[occ.lexeme][occ.feats][folded].append(occ)

    # The whole tokens each lexeme is the base of, where it is written with others: an entry
    # spelled as one of them is a built word, not a form of the lexeme (uz singlim).
    built_words: dict[str, dict[str, set[str]]] = collections.defaultdict(
        lambda: collections.defaultdict(set)
    )
    for forms_ in conv.items.values():
        for orth_, toks in forms_.items():
            for tok in toks:
                if len(tok.parts) > 1:
                    for part in tok.parts:
                        if part.base:
                            built_words[part.lexeme][orth_].add(fold(tok.surface))
    stems: list[Json] = seq(plan.data.get("stems"))

    def is_stem(
        pos_: str | None, entry_forms: dict[str, list[str]], folded_: tuple[tuple[str, str], ...]
    ) -> bool:
        """Whether a way of writing a lexeme is its entry less the ending its language cites it
        with (uz ich, of ichmoq): the plan states those endings."""
        for rule in stems:
            if rule.get("pos") not in (None, pos_):
                continue
            strip: dict[str, str] = obj(rule.get("strip"))
            add: dict[str, str] = obj(rule.get("add"))
            named = [(o, letters) for o, letters in folded_ if o in strip]
            if named and all(
                letters.endswith(fold(str(add.get(o, ""))))
                and any(
                    fold(f)
                    == letters[: len(letters) - len(fold(str(add.get(o, ""))))]
                    + fold(str(strip[o]))
                    for f in entry_forms.get(o, [])
                )
                for o, letters in named
            ):
                return True
        return False

    used: dict[str, set[str]] = collections.defaultdict(set)
    entries: list[Json] = []
    for lexeme, kc_id in conv.taken.items():
        kc = conv.kcs[kc_id]
        entry: Json = {"id": f"lexeme:{lexeme}"}
        is_sense = kc_id.startswith("sense:")
        pos = conv.lexeme_pos(lexeme)
        fp = None if is_sense else plan.forms[kc_id]
        if pos is not None:
            entry["pos"] = pos
        if fp is not None and fp.realises is not None:
            entry["realises"] = dict(sorted(fp.realises.items()))
        if fp is not None and fp.head is not None:
            entry["head"] = fp.head
        if fp is not None and fp.listed is not None:
            entry["form"] = fp.listed
        if pos is None and (
            fp is None or (fp.realises is None and fp.head is None and fp.listed is None)
        ):
            findings.append(
                Finding(
                    "no-kind",
                    f"lexeme:{lexeme}",
                    "the plan gives it no part of speech, value or head",
                )
            )

        forms_by_orth: dict[str, list[str]] = {
            o: [str(f) for f in obj(kc.get("forms")).get(o, [])] for o in orths
        }
        forms_by_orth = {o: fs for o, fs in forms_by_orth.items() if fs}
        spell = Spellings(forms_by_orth)
        known = {o: {fold(f) for f in fs} for o, fs in forms_by_orth.items()}
        # The cell the entry is spelled in (`is_cited` says which tokens stand in it).
        citation = plan.citation.get(pos or "", {})

        # Lexical features: the KC's own, and what its tokens all say (a noun's gender), unless
        # a default of the language gives it.
        feats: Feats = {str(k): str(v) for k, v in obj(kc.get("features")).items()}
        if fp is not None and fp.has is not None:
            feats.update(fp.has)
        shown = forms_by_orth.get(first_orth, [""])[0] if forms_by_orth else ""
        for feature in plan.lexical.get(pos or "", []):
            value = conv.lexical.get(lexeme, {}).get(feature)
            if lexeme in conv.varying and feature in conv.varying[lexeme]:
                findings.append(
                    Finding(
                        "lexical-varies",
                        f"lexeme:{lexeme}",
                        f"{feature} is {' and '.join(conv.varying[lexeme][feature])} "
                        "on its tokens: "
                        "kept on the tokens, not on the entry",
                    )
                )
                stats["lexical feature chosen by the token"] += 1
                continue
            if value is None:
                findings.append(
                    Finding("lexical-unknown", f"lexeme:{lexeme}", f"no token says its {feature}")
                )
                stats["lexical feature unknown"] += 1
                continue
            d = default_for(defaults, pos, shown, feature)
            if d is not None and str(d["gives"][feature]) == value:
                stats[f"default {d['id']}: gives"] += 1
                continue
            feats[feature] = value
            if d is None or len(str(obj(d.get("when")).get("ends", ""))) == 0:
                # No default speaks of its ending (or only the one for words with none).
                stored.append((feature, value, shown))
            if d is None:
                stats["lexical feature stored: no default speaks"] += 1
                findings.append(
                    Finding(
                        "lexical-stored",
                        f"lexeme:{lexeme}",
                        f"{feature}={value}: no default speaks of {shown}",
                    )
                )
            else:
                stats[f"default {d['id']}: broken"] += 1
                findings.append(
                    Finding(
                        "lexical-exception",
                        f"lexeme:{lexeme}",
                        f"{feature}={value}: {d['id']} would give {d['gives'][feature]} "
                        f"for {shown}",
                    )
                )
        if feats:
            entry["feats"] = dict(sorted(feats.items()))
        if conv.varying.get(lexeme):
            entry["chooses"] = sorted(conv.varying[lexeme])
        for k, v in [*feats.items(), *obj(entry.get("realises")).items()]:
            used[k].update(str(v).split(","))

        for key in ("gloss", "notes"):
            if kc.get(key):
                entry[key] = kc[key]
        if kc.get("image"):
            image = dict(kc["image"])
            # A course's path is relative to its course.yaml; a lexicon's to its own file.
            image["file"] = posixpath.normpath(f"../../courses/{course.id}/{image['file']}")
            entry["image"] = image

        forms: list[Json] = []
        allomorphs: list[Json] = []
        variants_found: dict[str, list[str]] = {}
        unlisted: dict[str, collections.Counter[str]] = {}
        attested: dict[str, set[str]] = collections.defaultdict(set)
        for cell, ways in sorted(cells.get(lexeme, {}).items()):
            for k, v in cell:
                # One form in several values (a Greek neuter, nominative and accusative alike).
                used[k].update(v.split(","))
            for folded, found in sorted(ways.items(), key=lambda kv: (-len(kv[1]), kv[0])):
                for o, f in folded:
                    attested[o].add(f)
                # An orthography the entry has no spelling in asks nothing (apc w, written only
                # joined in Arabic): whatever is written there is its spelling.
                is_entry = is_cited(cell, citation) and all(
                    f in known[o] for o, f in folded if o in known
                )
                if is_entry and forms_by_orth:
                    for o, _ in folded:
                        if o not in known:
                            variants = collections.Counter(dict(x.spelled)[o] for x in found)
                            unlisted.setdefault(o, collections.Counter())[
                                spell.plain(o, variants)
                            ] += len(found)
                    continue
                spelled: Json = {}
                for o, _ in folded:
                    variants: collections.Counter[str] = collections.Counter(
                        dict(x.spelled)[o] for x in found
                    )
                    kept = spell.every(o, variants)
                    if kept:
                        spelled[o] = kept
                if is_cited(cell, citation):
                    own_reading = {str(k): fold(str(v)) for k, v in obj(kc.get("readings")).items()}
                    free = [x for x in found if not x.bound]
                    if (
                        own_reading
                        and free
                        and spelled
                        and all(
                            x.readings
                            and all(own_reading.get(s, fold(r)) == fold(r) for s, r in x.readings)
                            for x in free
                        )
                    ):
                        # Spelled otherwise and read the same: the source's own spelling of the
                        # same word (ADR 0145: a source's spelling is the utterance's).
                        for o, v in spelled.items():
                            variants_found.setdefault(o, []).append(v[0])
                        stats["other spellings of an entry, read the same"] += 1
                        findings.append(
                            Finding(
                                "spelling",
                                f"lexeme:{lexeme}",
                                "also spelled "
                                + " / ".join(v[0] for v in spelled.values())
                                + f" ({len(found)}×, first in {found[0].item})",
                            )
                        )
                        continue
                    # One the script does not write has no letters in any orthography (ADR 0136).
                    allomorph: Json = {"spelled": spelled} if spelled else {"form": ""}
                    allomorphs.append(allomorph)
                    bound = all(x.bound for x in found)
                    if bound and is_stem(pos, forms_by_orth, folded):
                        stats["stems: the entry less its citation ending"] += 1
                    elif is_sense:
                        findings.append(
                            Finding(
                                "written-otherwise",
                                f"lexeme:{lexeme}",
                                ("joined to another lexeme, " if bound else "")
                                + "written "
                                + (" / ".join(v[0] for v in spelled.values()) or "with no letters")
                                + f" ({len(found)}×, first in {found[0].item})"
                                + (": an allomorph, or a form no value names" if not bound else ""),
                            )
                        )
                        stats["written otherwise than the entry"] += 1
                else:
                    forms.append({"feats": dict(cell), "spelled": spelled, "status": "pinned"})
                    stats["pinned forms"] += 1
            if not is_cited(cell, citation) and len(ways) > 1:
                stats["cells written more than one way"] += 1
                letters = sorted({" / ".join(f for _, f in folded) for folded in ways})
                findings.append(
                    Finding(
                        "cell-tie",
                        f"lexeme:{lexeme}",
                        f"{_show_feats(dict(cell))} is written {len(ways)} ways: "
                        f"{', '.join(letters[:8])}",
                    )
                )

        # The KC's forms after the first: a variant spelling stays; an inflected form is already
        # a pinned form above; one no token writes is a finding.
        spelled_out: Json = {}
        for o, fs in forms_by_orth.items():
            keep = [fs[0]]
            for f in fs[1:]:
                where = [
                    cell
                    for cell, ways in cells.get(lexeme, {}).items()
                    for folded in ways
                    if (o, fold(f)) in folded
                ]
                if any(is_cited(cell, citation) for cell in where):
                    # The lexeme itself is written so (fa خانهٔ before the ezafe).
                    keep.append(f)
                    stats["second forms: a variant spelling"] += 1
                elif where:
                    stats["second forms: an inflected form, now pinned"] += 1
                elif fold(f) in built_words.get(lexeme, {}).get(o, set()):
                    stats["second forms: a built word, now its lexemes"] += 1
                else:
                    keep.append(f)
                    stats["second forms: no token writes it"] += 1
                    findings.append(
                        Finding(
                            "second-form",
                            f"lexeme:{lexeme}",
                            f"{f} ({o}) is among its forms and no token writes it",
                        )
                    )
            spelled_out[o] = keep
        for o, more in variants_found.items():
            spelled_out.setdefault(o, [])
            spelled_out[o] += [v for v in more if v not in spelled_out[o]]
        for o, counted in unlisted.items():
            spelled_out[o] = [
                v for v, _ in sorted(counted.items(), key=lambda kv: (-kv[1], kv[0])) if v
            ]
        if spelled_out:
            entry["spelled"] = spelled_out
        if forms_by_orth and pos in ("VERB", "AUX") and citation:
            # A verb's entry that is none of its citation-form tokens and is one of its other
            # forms: with its marks where the entry is written with them (hbo), since a
            # pointed form shares its letters with others.
            def same(
                o: str,
                written: str,
                _spell: Spellings = spell,
                _forms: dict[str, list[str]] = forms_by_orth,
            ) -> bool:
                if _spell.unmarked.get(o, True):
                    return fold(written) == fold(_forms[o][0])
                return INVISIBLE.sub("", written).strip() == _forms[o][0]

            def as_entry(
                found_: list[Occurrence], _forms: dict[str, list[str]] = forms_by_orth
            ) -> bool:
                return any(all(same(o, w) for o, w in x.spelled if o in _forms) for x in found_)

            own = cells.get(lexeme, {})
            in_citation = any(
                as_entry(found_)
                for cell, ways in own.items()
                if is_cited(cell, citation)
                for found_ in ways.values()
            )
            elsewhere = sorted(
                _show_feats(dict(cell))
                for cell, ways in own.items()
                if not is_cited(cell, citation) and any(as_entry(f) for f in ways.values())
            )
            if elsewhere and not in_citation:
                stats["entries spelled as a form other than the citation form"] += 1
                findings.append(
                    Finding(
                        "entry-form",
                        f"lexeme:{lexeme}",
                        "its entry is spelled "
                        f"{' / '.join(fs[0] for fs in forms_by_orth.values())}, "
                        f"which its tokens write as {elsewhere[0]}",
                    )
                )
        shown_built = [
            fs[0]
            for o, fs in forms_by_orth.items()
            if fold(fs[0]) in built_words.get(lexeme, {}).get(o, set())
        ]
        if shown_built and not any(
            fold(fs[0]) in attested.get(o, set()) for o, fs in forms_by_orth.items()
        ):
            stats["entries shown as a built word"] += 1
            findings.append(
                Finding(
                    "entry-built",
                    f"lexeme:{lexeme}",
                    f"its entry is spelled {' / '.join(shown_built)}, "
                    "which the course writes as this lexeme and others: "
                    "the lexeme's own form is not among its spellings",
                )
            )
        if kc.get("readings"):
            entry["readings"] = kc["readings"]
        if forms:
            entry["forms"] = forms
        if allomorphs:
            if not forms_by_orth and len(allomorphs) == 1 and "spelled" in allomorphs[0]:
                # Written one way everywhere: that is its spelling, not an allomorph.
                entry["spelled"] = allomorphs[0]["spelled"]
            else:
                entry["allomorphs"] = allomorphs
        for written in (entry, *forms, *allomorphs):
            if "spelled" in written:
                written["spelled"] = _in_order(obj(written["spelled"]), orths)
        if not cells.get(lexeme):
            stats["lexemes no token writes"] += 1
            findings.append(
                Finding("unused", f"lexeme:{lexeme}", "no sentence or story line writes it")
            )
        entries.append(entry)

    entries.sort(key=lambda e: str(e["id"]))
    lexicon: Json = {
        "language": plan.language,
        "license": course.data["license"],
        "provenance": course.data["provenance"],
        "lexemes": entries,
    }
    declared: dict[str, list[str]] = {
        str(k): [str(x) for x in v] for k, v in obj(plan.data.get("features")).items()
    }
    labels = _labels(conv)
    for said in [*(label["feats"] for label in labels), *(obj(d.get("gives")) for d in defaults)]:
        for k, v in said.items():
            used[str(k)].update(str(v).split(","))
    for cited in plan.citation.values():
        for k, v in cited.items():
            used[str(k)].update(str(v).split(","))
    features: Json = {}
    for name in sorted(set(used) | set(declared)):
        values = sorted(used.get(name, set()) | set(declared.get(name, [])))
        features[name] = values
    language: Json = {
        "id": plan.language,
        "license": course.data["license"],
        "provenance": {"author": plan.author, "status": "draft"},
    }
    for key in ("varieties", "registers"):
        if plan.data.get(key):
            language[key] = plan.data[key]
    language["dimensions"] = obj(plan.data.get("dimensions"))
    if plan.lexical:
        language["lexical"] = plan.lexical
    if plan.citation:
        language["citation"] = plan.citation
    if features:
        language["features"] = features
    if defaults:
        language["defaults"] = defaults
    if plan.data.get("classes"):
        language["classes"] = plan.data["classes"]
    if labels:
        language["labels"] = labels
    return Built(language, lexicon, findings, occs, dict(stats), stored)


def _labels(conv: Converter) -> list[Json]:
    """What a learner is shown for a set of feature values: the gloss and notes of each form KC
    that became values, so nothing a course says of a form is lost."""
    out: list[Json] = []
    for kc_id, kc in conv.kcs.items():
        fp = conv.plan.forms.get(kc_id)
        if fp is None or (fp.feats is None and not fp.by_pos):
            continue
        ways: list[tuple[str | None, Feats]] = []
        if fp.feats is not None:
            ways.append((None, fp.feats))
        ways += [(pos, f) for pos, f in fp.by_pos.items() if f != fp.feats]
        for pos, feats in ways:
            label: Json = {"feats": dict(sorted(feats.items()))}
            if pos is not None:
                label["pos"] = pos
            for key in ("gloss", "notes"):
                if kc.get(key):
                    label[key] = kc[key]
            label["was"] = kc_id
            out.append(label)
    return out


def _show_feats(feats: Feats) -> str:
    return "|".join(f"{k}={v}" for k, v in sorted(feats.items())) or "(no values)"


def part_feats(part: Part) -> Feats:
    return part.feats
