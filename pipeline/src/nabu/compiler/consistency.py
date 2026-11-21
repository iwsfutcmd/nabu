"""Readings fixed by their words (ADR 0135).

A token's reading follows from how it is written and what it writes, the lexemes and the feature
values chosen on each: two tokens annotated alike read alike. Where they do not, either the course
has a mistake, or a distinction it has not annotated (two lexemes of one spelling, a lexeme the
script does not write, a gendered suffix): the fix is a lexeme or a feature value, never a reading
that hides the cause. A token marked `readingVariant` is free variation and is left out.

The check covers every reading scheme a course's tokens pin, and the vowel marks a vocalization
gives (ADR 0053) where the course has one: a word's marked form is its reading then.

- **Filling in.** A token that pins no reading in a scheme the orthography's words pin takes the
  one every other token of its form reads, where they agree: a form is pinned once (grc's Attic
  lengths, ADR 0135). Where they disagree, nothing is filled.
- **Binding.** A scheme may mark a word bound to the next (the Tiberian reading's "-" before a
  maqaf, the scheme's `bound`): the reading ends with the mark exactly where the next token holds
  the binding character (`reading.bound`), and readings are compared and filled without it.
- **Spelling.** A scheme whose readings spell their words (Attic: the reading without its vowel
  lengths, the scheme's `spelling` plug-in) is checked against each token (`reading.spelling`).
- **Severity.** Words read two ways are `reading.inconsistent` (an error) in a course that has
  switched the check on (`consistentReadings`), `reading.inconsistent-pending` (a warning) in one
  still being cleaned up.
"""

from __future__ import annotations

from collections.abc import Callable, Iterator, Mapping, Sequence
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any, cast

from nabu.compiler import tokens as tk
from nabu.compiler.diagnostics import Diagnostics, Loc
from nabu.lexicon import Language
from nabu.schema.models import CourseSource, SentenceForm, SourceToken
from nabu.schemes import plugins, schemes

if TYPE_CHECKING:
    from nabu.compiler.build import Unit

#: How a token is annotated: (orthography, as written, what it writes (its lexemes, each with the
#: feature values chosen there, as a form's key), its context, whether it is bound to the next).
Key = tuple[str, str, str | None, str | None, bool]
#: The kind of reading compared: a scheme's id, or MARKS for a vocalization's marked form.
MARKS = ":marks"


def _bound(scheme: str) -> tuple[str, str] | None:
    """The scheme's (mark, binding character), if it marks bound words."""
    found = schemes().get(scheme)
    if found is None or found.bound is None:
        return None
    return found.bound.mark, found.bound.before


def _folded(reading: str) -> str:
    """A reading as the check compares it: a capital (a sentence's start, a title) is no other
    reading. Python's default mapping, every scheme's so far (nabu.schemes._lower)."""
    return reading.lower()


def _readings(token: Mapping[str, Any]) -> dict[str, str]:
    """A compiled token's readings."""
    return cast(dict[str, str], token.get("readings") or {})


def key_of(orth: str, written: str, token: Mapping[str, Any], bound: bool) -> Key:
    """How a compiled token (a dict) is annotated."""
    context = token.get("_context")
    return (orth, written, tk.analysis(token), None if context is None else str(context), bound)


def _source_key(orth: str, t: SourceToken, bound: bool) -> Key:
    return (orth, t.surface, tk.source_analysis(t), t.context, bound)


def _binds(scheme: str, nxt: Mapping[str, Any] | None) -> bool:
    """Whether the next token binds a word, as the scheme marks binding."""
    b = _bound(scheme)
    return b is not None and nxt is not None and b[1] in str(nxt["surface"])


def source_forms(units: Sequence[Unit]) -> Iterator[tuple[str, SentenceForm]]:
    """Every authored form: each sentence's and each story line's, by orthography."""
    for unit in units:
        for s in unit.source.sentences:
            yield from s.forms.items()
        for story in unit.source.stories or []:
            for step in story.steps:
                if step.line is not None:
                    yield from step.line.forms.items()


def fills(units: Sequence[Unit]) -> dict[tuple[Key, str], str]:
    """(form, scheme) → the reading every token of the form that pins one reads, where they agree
    (bound marks left off): what a token pinning none takes."""
    seen: dict[tuple[Key, str], dict[str, str]] = {}
    for orth, form in source_forms(units):
        for t in form.tokens or []:
            if t.readingVariant or not t.readings:
                continue
            for scheme, reading in t.readings.items():
                # A pinned reading says whether its word is bound (reading.bound checks the text).
                b = _bound(scheme)
                key = _source_key(orth, t, b is not None and reading.endswith(b[0]))
                seen.setdefault((key, scheme), {}).setdefault(_folded(reading), reading)
    return {k: next(iter(v.values())) for k, v in seen.items() if len(v) == 1}


@dataclass
class Observed:
    """What every compiled token reads, by how it is annotated."""

    #: (form, kind) → reading → where it is read so.
    readings: dict[tuple[Key, str], dict[str, list[Loc]]] = field(default_factory=lambda: {})
    #: The fill table (`fills`), set before forms compile.
    fill: dict[tuple[Key, str], str] = field(default_factory=lambda: {})
    #: The schemes each orthography's words pin.
    schemes: dict[str, set[str]] = field(default_factory=lambda: {})

    def prepare(self, units: Sequence[Unit]) -> None:
        self.fill = fills(units)
        for key, scheme in self.fill:
            self.schemes.setdefault(key[0], set()).add(scheme)


def fill_and_check(
    observed: Observed,
    diags: Diagnostics,
    orth: str,
    toks: list[dict[str, Any]],
    loc: Loc,
) -> None:
    """Before readings are enriched: fill each word's missing readings from its form's, and check
    bound marks and spellings (the module's docstring)."""
    for i, t in enumerate(toks):
        if t.get("kind") != "word":
            continue
        nxt = toks[i + 1] if i + 1 < len(toks) else None
        if not t.get("_readingVariant"):
            for scheme in observed.schemes.get(orth, set()):
                if scheme in _readings(t):
                    continue
                key = key_of(orth, str(t["surface"]), t, _binds(scheme, nxt))
                reading = observed.fill.get((key, scheme))
                if reading is not None:
                    t.setdefault("readings", {})[scheme] = reading
        for scheme, reading in _readings(t).items():
            b = _bound(scheme)
            if b is not None:
                ends = reading.endswith(b[0])
                follows = nxt is not None and b[1] in str(nxt["surface"])
                if ends != follows:
                    diags.report(
                        "reading.bound",
                        f"{t['surface']!r} reads {reading!r}, "
                        + ("but no " if ends else "but a ")
                        + f"{b[1]!r} follows it",
                        loc,
                    )
            spelling = plugins(scheme).spelling if scheme in schemes() else None
            if spelling is not None and spelling(reading) != t["surface"]:
                diags.report(
                    "reading.spelling",
                    f"{t['surface']!r} reads {reading!r}, which spells {spelling(reading)!r}",
                    loc,
                )


def observe(
    observed: Observed, orth: str, toks: Sequence[Mapping[str, Any]], loc: Loc, marks: bool
) -> None:
    """Once a form is compiled: record what each word reads (`marks`: and its marked form, where
    the orthography has a vocalization). Readings are kept as first seen, compared folded."""
    for i, t in enumerate(toks):
        if t.get("kind") != "word" or t.get("_readingVariant"):
            continue
        nxt = toks[i + 1] if i + 1 < len(toks) else None
        written = str(t.get("_written", t["surface"]))
        for scheme, reading in _readings(t).items():
            at = observed.readings.setdefault(
                (key_of(orth, written, t, _binds(scheme, nxt)), scheme), {}
            )
            at.setdefault(_folded(reading), []).append(loc)
        if marks:
            at = observed.readings.setdefault((key_of(orth, written, t, False), MARKS), {})
            at.setdefault(str(t["surface"]), []).append(loc)


def report(observed: Observed, diags: Diagnostics, course: CourseSource) -> None:
    """Every form read two ways (the module's docstring), once each, at the first token that reads
    it otherwise than the form's first."""
    lint = "reading.inconsistent" if course.consistentReadings else "reading.inconsistent-pending"
    for (key, kind), by in observed.readings.items():
        if len(by) < 2:
            continue
        orth, written, analysis, context, bound = key
        parts = (
            repr(written),
            f"({analysis})" if analysis else "",
            f"in {context}" if context else "",
            "bound" if bound else "",
        )
        what = " ".join(p for p in parts if p)
        values = list(by.items())
        first, firsts = values[0]
        others = "; ".join(f"{v!r} ×{len(locs)}" for v, locs in values[1:])
        label = "its vowel marks" if kind == MARKS else kind
        diags.report(
            lint,
            f"{orth}: {what} reads {label} {first!r} ×{len(firsts)} "
            f"(first at {firsts[0].file}:{firsts[0].line}) and {others}: annotate what tells "
            "them apart (a lexeme, a feature value), or mark a free variant `readingVariant`",
            values[1][1][0],
        )


def check_own(diags: Diagnostics, lang: Language, orthographies: Sequence[str]) -> None:
    """An entry's own readings (ADR 0117) against its first spellings, where the scheme's
    readings spell their words (`reading.spelling`; a citation's accent as the scheme cites)."""
    for entry in lang.lexicon.lexemes:
        for scheme, reading in (entry.readings or {}).items():
            p = plugins(scheme) if scheme in schemes() else None
            if p is None or p.spelling is None:
                continue
            spelled = p.spelling(reading)
            firsts = [(entry.spelled or {}).get(o, [None])[0] for o in orthographies]
            written = [f for f in firsts if f is not None]
            cite: Callable[[str], str] = p.cite or (lambda w: w)
            if written and not any(spelled in (w, cite(w)) for w in written):
                diags.report(
                    "reading.spelling",
                    f"{entry.id} reads {reading!r}, which spells {spelled!r}, not {written[0]!r}",
                    lang.loc(str(entry.id), "readings", scheme),
                )
