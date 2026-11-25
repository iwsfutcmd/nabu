"""Each lexeme's lexical form against what the course writes (docs/rules-design.md, stage 1).

A lexeme's `form` (lexicons/<lang>/lexemes.yaml) is spelled by each orthography's `spell` statement
(its profile's, and its vocalization layer's: the marked text the voices read), with the language's
notation (language.yaml). The spelling, or one of the statement's free alternatives, must be what
the lexicon spells the lexeme first in that orthography; the marked text must be the course's
vocalization of that spelling. An allomorph with a form is checked against its own first spelling.
A verb's form is its radicals (a `RadicalForm`): it is checked through its citation cell (its own
`citation`, else its category's in language.yaml: apc's he-past), realised by the rules first
(core-cli `realise`, forms that pin spellings only passed over), so a lemma is what the rules give.
So is a string form of a category the language declares `stemmed` (bar's verbs: the stem red, whose
lemma is the infinitive redn).

@nabu/core spells and compares (core-cli `spell`, one batch for the course): never here. The
compiler reports each mismatch as the warning `form.projection`; `nabu forms` lists every lexeme.
"""

from __future__ import annotations

import json
from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, cast

import yaml

from nabu.corecli import CoreCli
from nabu.formkey import form_key
from nabu.lexicon import Language
from nabu.schema import OrthographyProfile
from nabu.schema.models import LexemeForm, RadicalForm

#: The suffix naming a vocalization layer's spelling: `apc-Arab/standard#vocalized`.
LAYER = "#"


@dataclass(frozen=True)
class Check:
    """One spelling of a form: where (an orthography, or an orthography's layer), what the statement
    writes, what the course has there (None where it has nothing to compare with), and whether
    that is the spelling, an alternative or neither."""

    where: str
    spelling: str
    expected: str | None
    found: str | None
    #: The allomorph's index, for an allomorph's form.
    allomorph: int | None = None

    @property
    def mismatch(self) -> bool:
        return self.expected is not None and self.found is None


@dataclass(frozen=True)
class Entry:
    """A lexeme: its form as stored (a string, or a verb's radicals), and its checks."""

    lexeme: str
    kind: str  # string, stem (a string of a `stemmed` category), radical, other, none
    form: str | None
    checks: list[Check] = field(default_factory=lambda: [])


@dataclass(frozen=True)
class Report:
    entries: list[Entry]
    #: What could not be checked at all (no notation, a statement that does not compile).
    problems: list[str] = field(default_factory=lambda: [])

    def counts(self) -> dict[str, int]:
        kinds = [e.kind for e in self.entries]
        checked = [c for e in self.entries for c in e.checks if c.expected is not None]
        allomorphs = {
            (e.lexeme, c.allomorph)
            for e in self.entries
            for c in e.checks
            if c.allomorph is not None
        }
        return {
            "stored": len(kinds) - kinds.count("none"),
            "string": kinds.count("string") + kinds.count("stem"),
            "allomorphs": len(allomorphs),
            "checked": len(checked),
            "radical": kinds.count("radical"),
            "skipped, another kind": kinds.count("other"),
            "mismatched": sum(1 for c in checked if c.found is None),
            "lexemes mismatched": sum(1 for e in self.entries if any(c.mismatch for c in e.checks)),
            "no form": kinds.count("none"),
        }


def _vocalized(words: Mapping[str, str], marks: Any, spelling: str) -> str | None:
    """The course's marked text for a spelling: its own entry, else the entry of the same letters
    (a spelling written with a shadda, an entry without)."""
    if spelling in words:
        return words[spelling]
    bare = marks.sub("", spelling)
    for key, marked in words.items():
        if marks.sub("", key) == bare:
            return marked
    return None


def check(
    lang: Language,
    orthographies: Iterable[str],
    profiles: Mapping[str, OrthographyProfile],
    vocalization: Mapping[str, tuple[Mapping[str, str], Any]]
    | Mapping[str, tuple[Mapping[str, str], Any, Mapping[str, str]]],
    cli: CoreCli,
) -> Report:
    """Every lexeme of the lexicon with its form spelled in each of the course's orthographies whose
    profile states `spell` (and in each layer that states one, against `vocalization`: per
    orthography its words, the marks pattern they are compared without and, optionally, its
    entries by lexeme for a first spelling)."""
    notation = lang.declared.notation
    spelling: list[tuple[str, str | None]] = []  # (orthography, layer)
    for orth in orthographies:
        profile = profiles.get(orth)
        if profile is None:
            continue
        if profile.spell is not None:
            spelling.append((orth, None))
        for layer in profile.annotations or []:
            if layer.spell is not None:
                spelling.append((orth, layer.id))
    entries: list[Entry] = []
    problems: list[str] = []
    # (entry index, where, allomorph, expected, request)
    asks: list[tuple[int, str, int | None, str | None, dict[str, Any]]] = []
    dumped = (
        notation.model_dump(mode="json", by_alias=True, exclude_none=True) if notation else None
    )
    citations = lang.declared.citation or {}
    stemmed = {str(c) for c in lang.declared.stemmed or []}
    # A radical form's lemma, or a stem's: (entry index, its spellings), realised in its citation
    # cell below.
    cited: list[tuple[int, Mapping[str, list[str]], dict[str, Any]]] = []
    targets_of: dict[int, list[tuple[int | None, str, Mapping[str, list[str]]]]] = {}
    for lexeme in lang.lexicon.lexemes:
        ident = str(lexeme.id)
        form = lexeme.form
        allomorphs = [(i, a) for i, a in enumerate(lexeme.allomorphs or []) if a.form]
        if form is None and not allomorphs:
            entries.append(Entry(ident, "none", None))
            continue
        if form is not None and not isinstance(form, str):
            kind = "radical" if isinstance(form, RadicalForm) else "other"
            entries.append(Entry(ident, kind, None))
            cell = lexeme.citation or (
                citations.get(lexeme.pos) if lexeme.pos is not None else None
            )
            if kind == "radical" and cell is not None and dumped is not None:
                spelled = {str(k): v for k, v in (lexeme.spelled or {}).items()}
                request = {
                    "op": "realise",
                    **language_args(lang),
                    "lexeme": ident,
                    "cell": {str(k): str(v) for k, v in dict(cell).items()},
                    "spellings": False,
                }
                cited.append((len(entries) - 1, spelled, request))
            continue
        cell = lexeme.citation or (citations.get(lexeme.pos) if lexeme.pos is not None else None)
        stem = form is not None and str(lexeme.pos) in stemmed and cell is not None
        kind = "stem" if stem else "string" if form is not None else "none"
        entries.append(Entry(ident, kind, form))
        if dumped is None:
            problems.append(f"{ident}: a form, and {lang.code} declares no notation")
            continue
        targets: list[tuple[int | None, str, Mapping[str, list[str]]]] = []
        spelled = {str(k): v for k, v in (lexeme.spelled or {}).items()}
        if stem and cell is not None:
            # A stem: its lemma is its citation cell as the rules give it (a target below).
            request = {
                "op": "realise",
                **language_args(lang),
                "lexeme": ident,
                "cell": {str(k): str(v) for k, v in dict(cell).items()},
                "spellings": False,
            }
            cited.append((len(entries) - 1, spelled, request))
        elif form is not None:
            targets.append((None, form, spelled))
        for i, a in allomorphs:
            targets.append((i, str(a.form), {str(k): v for k, v in (a.spelled or {}).items()}))
        targets_of[len(entries) - 1] = targets
    if cited:
        realised = cli.batch([c[2] for c in cited])
        for (index, spelled, request), result in zip(cited, realised, strict=True):
            if not result["ok"]:
                problems.append(
                    f"{entries[index].lexeme}: its citation cell {request['cell']} does not "
                    f"realise: {json.dumps(result['error'], ensure_ascii=False)}"
                )
                continue
            text = str(result["value"]["form"])
            if entries[index].kind == "radical":
                entries[index] = Entry(entries[index].lexeme, "radical", text)
                targets_of[index] = [(None, text, spelled)]
            else:
                # A stem: its lemma first, then its allomorphs' forms as they are.
                targets_of[index] = [(None, text, spelled), *targets_of.get(index, [])]
    for index in sorted(targets_of):
        for allomorph, text, spelled in targets_of[index]:
            for orth, layer in spelling:
                first = (spelled.get(orth) or [None])[0]
                expected: str | None = first
                where = orth
                if layer is not None:
                    where = f"{orth}{LAYER}{layer}"
                    found = vocalization.get(orth)
                    # An allomorph is a piece of a word: the vocalization marks words, never it (its
                    # marks are checked where tokens write it).
                    expected = (
                        _vocalized(found[0], found[1], first)
                        if found and first and allomorph is None
                        else None
                    )
                    by_lexeme: Mapping[str, str] = found[2] if found and len(found) > 2 else {}
                    if allomorph is None and entries[index].lexeme in by_lexeme:
                        expected = by_lexeme[entries[index].lexeme]
                request: dict[str, Any] = {
                    "op": "spell",
                    "profile": orth,
                    "notation": dumped,
                    "form": text,
                }
                if layer is not None:
                    request["layer"] = layer
                if expected is not None:
                    request["expected"] = expected
                asks.append((index, where, allomorph, expected, request))
    if asks:
        results = cli.batch([a[4] for a in asks])
        for (index, where, allomorph, expected, _), result in zip(asks, results, strict=True):
            entries[index].checks.append(
                Check(where, str(result["spelling"]), expected, result.get("expected"), allomorph)
            )
    return Report(entries, problems)


def format_report(report: Report) -> list[str]:
    """Every lexeme with its form and what each orthography spells from it; mismatches marked;
    the counts last."""
    lines: list[str] = []
    for e in report.entries:
        if e.kind == "none":
            lines.append(f"{e.lexeme}: no form")
            continue
        if e.kind == "other" or (e.kind == "radical" and e.form is None):
            lines.append(f"{e.lexeme}: {e.kind} form (not checked: no citation cell realised)")
            continue
        cited = (
            " (radicals, in its citation cell)"
            if e.kind == "radical"
            else " (a stem: its lemma, then its allomorphs)"
            if e.kind == "stem"
            else ""
        )
        lines.append(f"{e.lexeme}: {escaped(e.form or '')}{cited}")
        for c in e.checks:
            of = "" if c.allomorph is None else f" (allomorph {c.allomorph})"
            if c.expected is None:
                verdict = "nothing to compare"
            elif c.found is None:
                verdict = f"MISMATCH: the course has {c.expected}"
            else:
                verdict = (
                    "the course's" if c.found == "spelling" else "an alternative is the course's"
                )
            lines.append(f"  {c.where}{of}: {c.spelling} ({verdict})")
    lines.extend(report.problems)
    counts = report.counts()
    lines.append(", ".join(f"{n} {what}" for what, n in counts.items()))
    return lines


def escaped(text: str) -> str:
    """The notation's three signs and invisibles shown as escapes, so a review list is readable."""
    return "".join(f"\\u{ord(c):04x}" if c in "\u065c\u065d\u06df\u200c\u200d" else c for c in text)


# ------------------------------------------------------------ stage 2: the course's tokens


@dataclass(frozen=True)
class Site:
    """One token of the course in one orthography, as its source writes it: where (the item, the
    file and line), its surface, the marked text the course's vocalization gives it (None where it
    gives none, or the orthography has no vocalization), and the lexemes it writes, each with the
    feature values chosen there (`{lexeme, feats?, base?}`, as core-cli's `realise-token` takes
    them)."""

    item: str
    orth: str
    file: str
    line: int
    surface: str
    marked: str | None
    written: list[dict[str, Any]]
    #: The base lexeme of the next token of the same text, if any (an allomorph's `before`).
    following: str | None = None
    #: What the token writes of its base lexeme (its part's surface, or the whole token's).
    base_surface: str | None = None

    @property
    def key(self) -> str:
        """The token's form key: its lexemes, each with its values (`nabu.formkey`)."""
        return form_key([(str(w["lexeme"]), w.get("feats")) for w in self.written])


@dataclass(frozen=True)
class Spelling:
    """What a statement spells from the realised form (where: the orthography, or its layer), what
    the course has there, and whether it is the spelling, an alternative, or neither (None)."""

    where: str
    spelling: str
    alternatives: list[str]
    expected: str
    found: str | None


@dataclass(frozen=True)
class TokenCheck:
    """A token's verdict. `given`: the rules give what it writes; `form`: a pinned or listed form of
    its lexeme does; `unaccounted`: neither (the lint `form.unaccounted`), with `reason` where the
    rules give nothing (no rule for the cell, a lexeme it writes with no form)."""

    site: Site
    verdict: str
    reason: str = ""
    form: str | None = None
    status: str | None = None
    steps: list[dict[str, str]] = field(default_factory=lambda: [])
    spellings: list[Spelling] = field(default_factory=lambda: [])

    @property
    def missed(self) -> list[Spelling]:
        return [s for s in self.spellings if s.found is None]


@dataclass(frozen=True)
class TokenReport:
    checks: list[TokenCheck]
    #: The language checked, and how core-cli is told it (`language_args`).
    lang: Language
    source: dict[str, Any] = field(default_factory=lambda: {})

    def counts(self) -> dict[str, int]:
        verdicts = [c.verdict for c in self.checks]
        return {
            "tokens": len(verdicts),
            "given exactly": verdicts.count("given"),
            "by a pinned or listed form": verdicts.count("form"),
            "unaccounted": verdicts.count("unaccounted"),
        }


def language_args(lang: Language) -> dict[str, Any]:
    """How core-cli is told a language: by its code and the folder its files are in (lexicons/,
    read once and kept), or, for a language kept elsewhere (a one-file course's own), whole."""
    folder = lang.folder
    if folder.name == lang.code and (folder / "language.yaml").is_file():
        return {"lang": lang.code, "lexicons": str(folder.parent)}
    return {
        "language": lang.declared.model_dump(mode="json", by_alias=True, exclude_none=True),
        "lexicon": lang.lexicon.model_dump(mode="json", by_alias=True, exclude_none=True),
    }


def check_tokens(
    lang: Language,
    sites: Iterable[Site],
    profiles: Mapping[str, OrthographyProfile],
    cli: CoreCli,
) -> TokenReport | None:
    """Every token of the course against what the rules give (docs/rules-design.md, stages 2 and
    3), whatever its part of speech: its lexemes realised by @nabu/core (core-cli `realise-token`,
    with the values chosen on each; an uninflected word stands in its citation cell, given by its
    form with no rule; forms that pin spellings only are passed over: they are copies of the
    course, not an account of it), and the form spelled by its orthography's `spell` statement
    (and its layers', against the marked text). A phrase lexeme (a form with a space, written over
    several tokens) is realised once for each of its words, the token's other lexemes joined to
    it, and the token is the word that spells as it is written. It is `given` where each spelling
    is the course's or a free alternative of it (compared as core's `spelledAs` does; the marked
    layer exactly), `form` where blocking took a pinned or listed form of its lexeme to give it,
    `unaccounted` otherwise, with the reason where the rules give nothing. None for a language
    with neither realisation rules nor a notation: nothing is checked, nothing asked. A language
    that declares a notation and no rules (one that does not inflect: yue, lzh, tok) is checked
    all the same: each token stands in its citation cell, given by its lexeme's form."""
    declared = lang.declared
    if not declared.realisation and declared.notation is None:
        return None
    source = language_args(lang)
    notation = (
        declared.notation.model_dump(mode="json", by_alias=True, exclude_none=True)
        if (declared.notation is not None)
        else None
    )
    sites = list(sites)
    # Each site's candidates: one realisation, or one per word of a phrase lexeme.
    candidates: list[list[dict[str, Any]]] = []
    early: dict[int, TokenCheck] = {}
    for n, site in enumerate(sites):
        parts = site.written
        base = parts[0] if len(parts) == 1 else next((p for p in parts if p.get("base")), None)
        if base is None:
            early[n] = TokenCheck(site, "unaccounted", "no base lexeme")
            candidates.append([])
            continue
        entry = lang.get(str(base["lexeme"]))
        request: dict[str, Any] = {
            "op": "realise-token",
            **source,
            "lexemes": parts,
            "spellings": False,
        }
        if site.following is not None:
            request["next"] = site.following
        words = (
            len(entry.form.split(" ")) if entry is not None and isinstance(entry.form, str) else 1
        )
        if words > 1:
            # The phrase whole (one token where an orthography writes it as one word: inshalla),
            # or a word of it.
            candidates.append([request, *({**request, "word": k} for k in range(words))])
        else:
            candidates.append([request])
    flat = [r for c in candidates for r in c]
    realised = iter(_batched(cli, flat))
    results: list[list[Any]] = [[next(realised) for _ in c] for c in candidates]
    spell: list[tuple[int, int, Spelling, dict[str, Any]]] = []
    tried: dict[tuple[int, int], TokenCheck] = {}
    for n, site in enumerate(sites):
        for j, result in enumerate(results[n]):
            if not result["ok"]:
                error = result["error"]
                kind = str(error["kind"])
                lexeme = str(error.get("lexeme", ""))
                if kind in ("form", "unknown-lexeme") and lexeme and lexeme != _base_id(site):
                    reason = f"no form of {lexeme} here"
                elif kind == "no-rule":
                    reason = "no rule for the cell"
                elif kind == "form":
                    reason = "no form"
                else:
                    reason = f"the rules give nothing ({kind})"
                tried[(n, j)] = TokenCheck(site, "unaccounted", reason)
                continue
            value = result["value"]
            form = str(value["form"])
            status = str(value["status"])
            tried[(n, j)] = TokenCheck(
                site,
                "given" if status == "given" else "form",
                "",
                form,
                status,
                list(value["steps"]),
            )
            profile = profiles.get(site.orth)
            if profile is None or notation is None:
                continue
            wheres: list[tuple[str, str | None, str]] = []
            if profile.spell is not None:
                wheres.append((site.orth, None, site.surface))
            for layer in profile.annotations or []:
                if layer.spell is not None and site.marked is not None:
                    wheres.append((f"{site.orth}{LAYER}{layer.id}", layer.id, site.marked))
            # A phrase realised whole: the token is one word of its spelling.
            part = len(results[n]) > 1 and j == 0
            for where, layer, expected in wheres:
                ask: dict[str, Any] = {
                    "op": "spell",
                    "profile": site.orth,
                    "notation": notation,
                    "form": form,
                    "expected": expected,
                }
                if layer is not None:
                    ask["layer"] = layer
                if part:
                    ask["part"] = True
                spell.append((n, j, Spelling(where, "", [], expected, None), ask))
    spelled = _batched(cli, [a for _, _, _, a in spell], results=True)
    found: dict[tuple[int, int], list[Spelling]] = {}
    for (n, j, s, _), result in zip(spell, spelled, strict=True):
        found.setdefault((n, j), []).append(
            Spelling(
                s.where,
                str(result["spelling"]),
                [str(a["spelling"]) for a in result["alternatives"]],
                s.expected,
                result.get("expected"),
            )
        )
    out: list[TokenCheck] = []
    for n in range(len(sites)):
        if n in early:
            out.append(early[n])
            continue
        verdicts: list[TokenCheck] = []
        for j in range(len(results[n])):
            c = tried[(n, j)]
            spellings = found.get((n, j), [])
            if c.verdict in ("given", "form"):
                verdict = (
                    c.verdict if all(s.found is not None for s in spellings) else "unaccounted"
                )
                c = TokenCheck(c.site, verdict, c.reason, c.form, c.status, c.steps, spellings)
            verdicts.append(c)
        # A phrase's token is the word that spells as it is written; else the first try.
        out.append(next((c for c in verdicts if c.verdict != "unaccounted"), verdicts[0]))
    return TokenReport(out, lang, source)


def _base_id(site: Site) -> str | None:
    parts = site.written
    base = parts[0] if len(parts) == 1 else next((p for p in parts if p.get("base")), None)
    return None if base is None else str(base["lexeme"])


def _batched(cli: CoreCli, requests: list[dict[str, Any]], results: bool = False) -> list[Any]:
    """One round trip, each distinct request asked once. Realisations come back as values
    (`{ok, value}` or `{ok: false, error}`); spellings (`results`) as their results."""
    keys = [json.dumps(r, sort_keys=True, ensure_ascii=False) for r in requests]
    distinct = list(dict.fromkeys(keys))
    by_key = dict(zip(distinct, cli.batch([json.loads(k) for k in distinct]), strict=True))
    return [by_key[k] for k in keys]


# ------------------------------------------------------------ stage 3: the pinned forms


@dataclass(frozen=True)
class Pinned:
    """A pinned form of a lexeme (`forms[index]`), weighed against the rules and the course: whether
    the rules alone (every pinned form passed over) give each spelling it pins, in each orthography
    it pins one (`redundant`: it can go, `nabu forms prune`); the spellings it pins that no token of
    its lexeme in its cell writes (`differs`, by orthography); whether it pins spellings only."""

    lexeme: str
    index: int
    feats: dict[str, str]
    spelled_only: bool
    redundant: bool
    differs: list[tuple[str, str]]
    rules: dict[str, str]


def _has_values(cell: Mapping[str, str], feats: Mapping[str, str]) -> bool:
    """Whether a token's cell has every value a form names (a comma: one of them)."""
    for k, v in feats.items():
        value = cell.get(k)
        if value is None or not set(str(value).split(",")) <= set(str(v).split(",")):
            return False
    return True


def check_pinned(
    lang: Language,
    sites: Iterable[Site],
    profiles: Mapping[str, OrthographyProfile],
    cli: CoreCli,
) -> list[Pinned]:
    """Every pinned form of the language's lexicon: realised by @nabu/core in its cell with every
    pinned form passed over (core-cli `realise`, `pinned: false`), spelled by each orthography it
    pins a spelling in, each pinned spelling compared as core's `spelledAs` does; and each pinned
    spelling against what the course's tokens of its lexeme, in a cell with its values, write of it
    (letters compared without the vowel marks the orthography may leave out)."""
    from nabu.vocalization import unmarker

    declared = lang.declared
    if declared.notation is None or not declared.realisation:
        return []
    source = language_args(lang)
    notation = declared.notation.model_dump(mode="json", by_alias=True, exclude_none=True)
    written: dict[tuple[str, str], list[tuple[dict[str, str], str]]] = {}
    for site in sites:
        base = _base_id(site)
        if base is None or site.base_surface is None:
            continue
        part = next(
            (
                w
                for w in site.written
                if str(w["lexeme"]) == base and (len(site.written) == 1 or w.get("base"))
            ),
            None,
        )
        chosen = cast(dict[str, Any], (part or {}).get("feats") or {})
        cell = {str(k): str(v) for k, v in chosen.items()}
        written.setdefault((base, site.orth), []).append((cell, site.base_surface))
    found: list[tuple[str, int, dict[str, str], LexemeForm]] = []
    for lexeme in lang.lexicon.lexemes:
        for i, form in enumerate(lexeme.forms or []):
            if form.status != "pinned":
                continue
            feats = {str(k): str(v) for k, v in (form.feats or {}).items()}
            found.append((str(lexeme.id), i, feats, form))
    realised = _batched(
        cli,
        [
            {"op": "realise", **source, "lexeme": ident, "cell": feats, "pinned": False}
            for ident, _, feats, _ in found
        ],
    )
    asks: list[tuple[int, str, str, dict[str, Any]]] = []
    out: list[Pinned] = []
    rules: list[dict[str, str]] = []
    for n, ((_ident, _i, _feats, form), result) in enumerate(zip(found, realised, strict=True)):
        rules.append({})
        pinned = {str(o): [str(x) for x in v] for o, v in (form.spelled or {}).items()}
        for orth, spellings in pinned.items():
            if orth not in profiles or profiles[orth].spell is None:
                continue
            for spelling in spellings:
                if result["ok"]:
                    asks.append(
                        (
                            n,
                            orth,
                            spelling,
                            {
                                "op": "spell",
                                "profile": orth,
                                "notation": notation,
                                "form": result["value"]["form"],
                                "expected": spelling,
                            },
                        )
                    )
    answers = _batched(cli, [a[3] for a in asks], results=True)
    given: dict[int, list[bool]] = {}
    for (n, orth, _, _), answer in zip(asks, answers, strict=True):
        given.setdefault(n, []).append(answer.get("expected") is not None)
        rules[n][orth] = str(answer["spelling"])
    for n, (ident, i, feats, form) in enumerate(found):
        pinned = {str(o): [str(x) for x in v] for o, v in (form.spelled or {}).items()}
        differs: list[tuple[str, str]] = []
        for orth, spellings in pinned.items():
            strip = unmarker(orth)
            course = {
                strip(surface)
                for cell, surface in written.get((ident, orth), [])
                if _has_values(cell, feats)
            }
            # A phrase's spelling is written word by word, a token each.
            differs.extend(
                (orth, sp) for sp in spellings if not all(strip(w) in course for w in sp.split(" "))
            )
        checks = given.get(n, [])
        out.append(
            Pinned(
                ident,
                i,
                feats,
                form.form is None and form.stem is None,
                bool(checks) and all(checks) and realised[n]["ok"],
                differs,
                rules[n],
            )
        )
    return out


def prune(
    folder: Path, profiles: Mapping[str, OrthographyProfile], cli: CoreCli
) -> tuple[list[str], list[str]]:
    """`nabu forms prune <lexicons/lang>` (docs/rules-design.md, section 5): removes from
    lexemes.yaml each pinned form that pins spellings only and whose cell the rules give, every
    pinned form passed over, in each spelling it pins (`check_pinned`'s `redundant`). Written with
    targeted edits (each form is one line of its entry's `forms`; an emptied `forms` goes too),
    proved by parsing the file before and after. Returns (what it removed, the pinned forms it
    kept), each as `lexeme|form:values`. ValueError where the lexicon does not load or the edit
    would change anything else."""
    from nabu.lexicon import load_language

    lang, errors = load_language(folder.parent, folder.name)
    if lang is None:
        raise ValueError("; ".join(e.message for e in errors))
    path = folder / "lexemes.yaml"
    text = path.read_text(encoding="utf-8")
    before = cast(dict[str, Any], yaml.safe_load(text))
    pinned = check_pinned(lang, [], profiles, cli)
    drop = {(p.lexeme, p.index) for p in pinned if p.redundant and p.spelled_only}

    def key(p: Pinned) -> str:
        return f"{p.lexeme}|form:" + ";".join(f"{k}={v}" for k, v in sorted(p.feats.items()))

    removed = [key(p) for p in pinned if (p.lexeme, p.index) in drop]
    kept = [key(p) for p in pinned if (p.lexeme, p.index) not in drop]
    lines = text.split("\n")
    out: list[str] = []
    entry: str | None = None
    index = -1
    in_forms = False
    for line in lines:
        if line.startswith("- id: "):
            entry, index, in_forms = line[len("- id: ") :].strip(), -1, False
        elif line == "  forms:":
            in_forms, index = True, -1
        elif in_forms and line.startswith("  - "):
            index += 1
            if (entry, index) in drop:
                continue
        elif not line.startswith("    ") and not line.startswith("  #"):
            in_forms = False
        out.append(line)
    # An emptied `forms:` goes too (comments between its items do not count as items).
    cleaned: list[str] = []
    for i, line in enumerate(out):
        rest = [x for x in out[i + 1 :] if not x.startswith("  #")]
        if line == "  forms:" and not (rest and rest[0].startswith("  - ")):
            continue
        cleaned.append(line)
    result = "\n".join(cleaned)
    after = cast(dict[str, Any], yaml.safe_load(result))
    expected: list[dict[str, Any]] = []
    for e in cast(list[dict[str, Any]], before["lexemes"]):
        forms = [
            f
            for i, f in enumerate(cast(list[Any], e.get("forms") or []))
            if (e["id"], i) not in drop
        ]
        kept_keys = {k: v for k, v in e.items() if k != "forms"}
        expected.append(kept_keys | ({"forms": forms} if forms else {}))
    rest = {k: v for k, v in after.items() if k != "lexemes"}
    if after["lexemes"] != expected or rest != {k: v for k, v in before.items() if k != "lexemes"}:
        raise ValueError("the edit would change more than the pruned forms: nothing written")
    path.write_text(result, encoding="utf-8")
    return removed, kept


def format_tokens(report: TokenReport) -> list[str]:
    """The token report: the counts; every unaccounted token grouped by its lexemes and cell, with
    what the rules give and what the course writes, and its items; the tokens a pinned or listed
    form gives; the unaccounted tokens the rules give nothing for, by reason."""
    counts = report.counts()
    lines = [
        "Tokens (sentences and story lines, each orthography): "
        + ", ".join(f"{n} {what}" for what, n in counts.items())
    ]
    groups: dict[tuple[str, str, str, str, str], list[str]] = {}
    for c in report.checks:
        if c.verdict != "unaccounted":
            continue
        missed = c.missed or [Spelling(c.site.orth, "", [], c.site.surface, None)]
        for s in missed:
            gave = s.spelling or c.reason
            key = (c.site.key, s.where, escaped(c.form or ""), gave, s.expected)
            groups.setdefault(key, []).append(c.site.item)
    lines.append(f"Unaccounted (form.unaccounted), by lexeme and cell: {len(groups)} groups")
    for (key, where, form, gave, course), items in sorted(groups.items()):
        lines.append(f"  {key}")
        lines.append(
            f"    {where}: the rules give {form or 'nothing'}, spelled {escaped(gave)}; the course "
            f"writes {escaped(course)} ({len(items)}: {', '.join(items)})"
        )
    by_form: dict[tuple[str, str], int] = {}
    for c in report.checks:
        if c.verdict == "form":
            k = (c.site.key, c.status or "")
            by_form[k] = by_form.get(k, 0) + 1
    lines.append("By a pinned or listed form:")
    for (key, status), n in sorted(by_form.items()):
        lines.append(f"  {key}: {status}, {n}")
    reasons: dict[str, int] = {}
    for c in report.checks:
        if c.verdict == "unaccounted" and c.reason:
            reasons[c.reason] = reasons.get(c.reason, 0) + 1
    lines.append("Unaccounted where the rules give nothing, by reason:")
    for reason, n in sorted(reasons.items(), key=lambda x: (-x[1], x[0])):
        lines.append(f"  {reason}: {n}")
    return lines


def paradigm(
    report: TokenReport,
    lexeme: str,
    profiles: Mapping[str, OrthographyProfile],
    orthographies: Iterable[str],
    cli: CoreCli,
) -> list[str]:
    """A lexeme's cells as the rules give them (`nabu forms --paradigm`), in each orthography and
    layer that states `spell`: the cells are those the course's tokens choose on any lexeme of its
    part of speech (the rules give it in each); beside each, what the course writes of this lexeme
    there, if anything. Forms that pin spellings only are passed over, as the token check does."""
    lang = report.lang
    ident = lexeme if lexeme.startswith("lexeme:") else f"lexeme:{lexeme}"
    entry = lang.get(ident)
    if entry is None:
        return [f"{ident}: not in the lexicon of {lang.code}"]
    notation = lang.declared.notation
    if notation is None:
        return [f"{lang.code} declares no notation"]
    dumped = notation.model_dump(mode="json", by_alias=True, exclude_none=True)
    cells: dict[str, dict[str, str]] = {}
    written: dict[tuple[str, str], set[str]] = {}
    for c in report.checks:
        parts = c.site.written
        base = parts[0] if len(parts) == 1 else next((p for p in parts if p.get("base")), None)
        if base is None:
            continue
        other = lang.get(str(base["lexeme"]))
        if other is None or other.pos != entry.pos:
            continue
        chosen = cast(dict[str, str], base.get("feats") or {})
        feats = {str(k): str(v) for k, v in chosen.items()}
        if not feats:
            continue
        cell = form_key([(ident, feats)])
        cells.setdefault(cell, feats)
        if str(base["lexeme"]) == ident and len(parts) == 1:
            written.setdefault((cell, c.site.orth), set()).add(c.site.surface)
    # In the order the language declares its dimensions and their values (language.yaml).
    declared = lang.declared
    dims: list[str] = []
    for pos, named in (declared.dimensions or {}).items():
        if str(pos) == str(entry.pos):
            dims = [str(d) for d in named]
    values = {str(k): [str(x) for x in v] for k, v in (declared.features or {}).items()}

    def order(feats: dict[str, str]) -> list[int]:
        return [
            values.get(d, []).index(feats[d]) if feats.get(d) in values.get(d, []) else 99
            for d in dims
        ]

    ordered = sorted(cells.items(), key=lambda kv: (order(kv[1]), kv[0]))
    results = cli.result(
        "paradigm",
        **report.source,
        lexeme=ident,
        cells=[feats for _, feats in ordered],
        spellings=False,
    )
    wheres: list[tuple[str, str | None]] = []
    for orth in orthographies:
        profile = profiles.get(orth)
        if profile is None:
            continue
        if profile.spell is not None:
            wheres.append((orth, None))
        for layer in profile.annotations or []:
            if layer.spell is not None:
                wheres.append((orth, layer.id))
    asks: list[dict[str, Any]] = []
    for r in results:
        if not r["result"]["ok"]:
            continue
        for orth, layer in wheres:
            ask: dict[str, Any] = {
                "op": "spell",
                "profile": orth,
                "notation": dumped,
                "form": r["result"]["value"]["form"],
            }
            if layer is not None:
                ask["layer"] = layer
            asks.append(ask)
    spelled = iter(cli.batch(asks))
    lines = [f"{ident} ({entry.pos}): {len(ordered)} cells, as the rules give them"]
    for (cell, feats), r in zip(ordered, results, strict=True):
        label = ";".join(f"{k}={feats[k]}" for k in sorted(feats)) or "(no values)"
        result = r["result"]
        if not result["ok"]:
            lines.append(f"  {label}: {json.dumps(result['error'], ensure_ascii=False)}")
            continue
        value = result["value"]
        steps = ", ".join(
            s["rule"].removeprefix("rule:") + (f"|{s['branch']}" if s.get("branch") else "")
            for s in value["steps"]
        )
        lines.append(
            f"  {label}: {escaped(value['form'])} ({value['status']}; {steps or 'no rule'})"
        )
        for orth, layer in wheres:
            s = next(spelled)
            alts = [str(a["spelling"]) for a in s["alternatives"]]
            where = orth if layer is None else f"{orth}{LAYER}{layer}"
            line = f"    {where}: {s['spelling']}"
            if alts:
                line += f" (also {', '.join(alts[:6])}{', …' if len(alts) > 6 else ''})"
            course = written.get((cell, orth)) if layer is None else None
            if course:
                line += f"; the course writes {', '.join(sorted(course))}"
            lines.append(line)
    return lines
