"""Each lexeme's lexical form against what the course writes (docs/rules-design.md, stage 1).

A lexeme's `form` (lexicons/<lang>/lexemes.yaml) is spelled by each orthography's `spell` statement
(its profile's, and its vocalization layer's: the marked text the voices read), with the language's
notation (language.yaml). The spelling, or one of the statement's free alternatives, must be what
the lexicon spells the lexeme first in that orthography; the marked text must be the course's
vocalization of that spelling. An allomorph with a form is checked against its own first spelling.
A verb's form is its radicals (a `RadicalForm`): it needs a stem template to become a string (stage
2), so it is counted and skipped.

@nabu/core spells and compares (core-cli `spell`, one batch for the course): never here. The
compiler reports each mismatch as the warning `form.projection`; `nabu forms` lists every lexeme.
"""

from __future__ import annotations

import json
from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field
from typing import Any, cast

from nabu.corecli import CoreCli
from nabu.formkey import form_key
from nabu.lexicon import Language
from nabu.schema import OrthographyProfile
from nabu.schema.models import RadicalForm

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
    kind: str  # string, radical, none
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
            "string": kinds.count("string"),
            "allomorphs": len(allomorphs),
            "checked": len(checked),
            "skipped as verbs": kinds.count("radical"),
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
    vocalization: Mapping[str, tuple[Mapping[str, str], Any]],
    cli: CoreCli,
) -> Report:
    """Every lexeme of the lexicon with its form spelled in each of the course's orthographies whose
    profile states `spell` (and in each layer that states one, against `vocalization`: per
    orthography its words and the marks pattern they are compared without)."""
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
    for lexeme in lang.lexicon.lexemes:
        ident = str(lexeme.id)
        form = lexeme.form
        allomorphs = [(i, a) for i, a in enumerate(lexeme.allomorphs or []) if a.form]
        if form is None and not allomorphs:
            entries.append(Entry(ident, "none", None))
            continue
        if form is not None and not isinstance(form, str):
            entries.append(
                Entry(ident, "radical" if isinstance(form, RadicalForm) else "other", None)
            )
            continue
        entries.append(Entry(ident, "string" if form is not None else "none", form))
        if dumped is None:
            problems.append(f"{ident}: a form, and {lang.code} declares no notation")
            continue
        targets: list[tuple[int | None, str, Mapping[str, list[str]]]] = []
        if form is not None:
            targets.append((None, form, {str(k): v for k, v in (lexeme.spelled or {}).items()}))
        for i, a in allomorphs:
            targets.append((i, str(a.form), {str(k): v for k, v in (a.spelled or {}).items()}))
        for allomorph, text, spelled in targets:
            for orth, layer in spelling:
                first = (spelled.get(orth) or [None])[0]
                expected: str | None = first
                where = orth
                if layer is not None:
                    where = f"{orth}{LAYER}{layer}"
                    found = vocalization.get(orth)
                    expected = _vocalized(found[0], found[1], first) if found and first else None
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
                asks.append((len(entries) - 1, where, allomorph, expected, request))
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
        if e.kind in ("radical", "other"):
            lines.append(f"{e.lexeme}: {e.kind} form (skipped until stage 2)")
            continue
        lines.append(f"{e.lexeme}: {escaped(e.form or '')}")
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
    its lexeme does; `unaccounted`: neither (the lint `form.unaccounted`); `no-rule`: not checked,
    for `reason` (no rule for its part of speech, a lexeme it writes with no form yet)."""

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
            "checked": len(verdicts) - verdicts.count("no-rule"),
            "given exactly": verdicts.count("given"),
            "by a pinned or listed form": verdicts.count("form"),
            "unaccounted": verdicts.count("unaccounted"),
            "no rule yet": verdicts.count("no-rule"),
        }


def _covered(lang: Language) -> set[str]:
    """The parts of speech a realisation rule can hold of: its `pos` (if it names one), and every
    feature its `when` names among the part of speech's dimensions (language.yaml)."""
    declared = lang.declared
    dimensions = {str(k): {str(f) for f in v} for k, v in (declared.dimensions or {}).items()}
    out: set[str] = set()
    for rule in declared.realisation or []:
        when = rule.when
        named = {str(k) for k in (when.feats or {})}
        pos = None if when.pos is None else str(when.pos)
        for p, dims in dimensions.items():
            if (pos is None or pos == p) and named <= dims:
                out.add(p)
    return out


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
    """Every token of the course against what the rules give (docs/rules-design.md, stage 2).
    A token whose base lexeme a realisation rule covers is realised by @nabu/core (core-cli
    `realise-token`, the lexemes with the values chosen on each; forms that pin spellings only are
    passed over: they are copies of the course, not an account of it), and the form spelled by its
    orthography's `spell` statement (and its layers', against the marked text). It is `given` where
    each is the course's spelling or a free alternative of it (compared as core's `spelledAs` does;
    the marked layer exactly), `form` where blocking took a pinned or listed form of its lexeme to
    give it, `unaccounted` otherwise. Every other token is counted, `no-rule`, with its reason. None
    for a language with no realisation rules: nothing is checked, nothing asked."""
    declared = lang.declared
    if not declared.realisation:
        return None
    covered = _covered(lang)
    source = language_args(lang)
    notation = (
        declared.notation.model_dump(mode="json", by_alias=True, exclude_none=True)
        if (declared.notation is not None)
        else None
    )
    checks: list[TokenCheck | None] = []
    realise: list[tuple[int, dict[str, Any]]] = []
    sites = list(sites)
    for n, site in enumerate(sites):
        parts = site.written
        base = parts[0] if len(parts) == 1 else next((p for p in parts if p.get("base")), None)
        if base is None:
            checks.append(TokenCheck(site, "no-rule", "no base lexeme"))
            continue
        entry = lang.get(str(base["lexeme"]))
        pos = None if entry is None or entry.pos is None else str(entry.pos)
        if pos is None or pos not in covered:
            checks.append(TokenCheck(site, "no-rule", f"no rule for {pos or 'an affix'}"))
            continue
        if entry is not None and isinstance(entry.form, str) and " " in entry.form:
            # Its form is a phrase, written over several tokens: pinned whole (rules-design.md).
            checks.append(TokenCheck(site, "no-rule", "a lexeme of several words"))
            continue
        request: dict[str, Any] = {
            "op": "realise-token",
            **source,
            "lexemes": parts,
            "spellings": False,
        }
        realise.append((n, request))
        checks.append(None)
    realised = _batched(cli, [r for _, r in realise])
    spell: list[tuple[int, Spelling, dict[str, Any]]] = []
    for (n, _), result in zip(realise, realised, strict=True):
        site = sites[n]
        if not result["ok"]:
            error = result["error"]
            kind = str(error["kind"])
            lexeme = str(error.get("lexeme", ""))
            if kind in ("form", "unknown-lexeme") and lexeme and lexeme != _base_id(site):
                checks[n] = TokenCheck(site, "no-rule", f"no form of {lexeme} here")
            elif kind == "no-rule":
                checks[n] = TokenCheck(site, "no-rule", "no rule for the cell")
            else:
                checks[n] = TokenCheck(site, "unaccounted", f"the rules give nothing ({kind})")
            continue
        value = result["value"]
        form = str(value["form"])
        status = str(value["status"])
        checks[n] = TokenCheck(
            site, "given" if status == "given" else "form", "", form, status, list(value["steps"])
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
            spell.append((n, Spelling(where, "", [], expected, None), ask))
    spelled = _batched(cli, [a for _, _, a in spell], results=True)
    found: dict[int, list[Spelling]] = {}
    for (n, s, _), result in zip(spell, spelled, strict=True):
        found.setdefault(n, []).append(
            Spelling(
                s.where,
                str(result["spelling"]),
                [str(a["spelling"]) for a in result["alternatives"]],
                s.expected,
                result.get("expected"),
            )
        )
    out: list[TokenCheck] = []
    for n, c in enumerate(checks):
        assert c is not None
        spellings = found.get(n, [])
        if c.verdict in ("given", "form"):
            verdict = c.verdict if all(s.found is not None for s in spellings) else "unaccounted"
            c = TokenCheck(c.site, verdict, c.reason, c.form, c.status, c.steps, spellings)
        out.append(c)
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


def format_tokens(report: TokenReport) -> list[str]:
    """The token report: the counts; every unaccounted token grouped by its lexemes and cell, with
    what the rules give and what the course writes, and its items; the tokens a pinned or listed
    form gives; the tokens not checked, by reason."""
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
        if c.verdict == "no-rule":
            reasons[c.reason] = reasons.get(c.reason, 0) + 1
    lines.append("No rule yet, by reason:")
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
