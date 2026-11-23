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

from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field
from typing import Any

from nabu.corecli import CoreCli
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
