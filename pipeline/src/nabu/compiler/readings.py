"""Pinned readings on KC forms (ADR 0117): one reading per word of every form of a KC, for every
reading scheme the orthography's words pin.

A word card shows a KC's form with its reading (Jyutping as ruby), a voice that reads a scheme says
the form from its reading (the Tiberian reading of Biblical Hebrew, Attic, sitelen Lasina), and a
minimal pair compares two forms' readings. All of them take the reading pinned here, on the form's
own tokens; none looks one up in the sentences itself, so a card's clip and its ruby can never come
from two readings of one word.

Nothing is guessed: a reading comes from the course's own tokens. A KC's entry may choose one of
them for its first form (its `readings`, ADR 0117's amendment: hbo's sense:ad reads ʿaḏ, free, where
its lessons tie with the maqaf-bound ʿaḏ-). Otherwise it is, in this order:

1. the readings of the KC's sense spelled as the form, in the lesson sentences: the most common, a
   tie going to the first in course order;
2. the same in story lines, for a word no lesson sentence has: an authentic passage's readings are
   often its context's (a pausal form, a word bound by maqaf);
3. the KC's share of longer words, from their ruby: 禮拜 in 禮拜一 (lai5 baai3 jat1) is lai5 baai3;
4. where the scheme cites a word otherwise than a sentence says it (its `cite` plug-in: Attic
   writes καί for a sentence's καὶ), the KC's sense in sentences, cited the same way;
5. the reading every token spelled as the form has, when they all agree; a polyphone gets none.

The profile's ruby layers also get ruby: the reading split over the word's characters, where it
lines up with them.
"""

from __future__ import annotations

from collections.abc import Callable, Iterator, Mapping
from dataclasses import dataclass, field
from typing import Any, cast

from nabu.compiler import text as tx
from nabu.schemes import plugins, schemes

#: Tokens that carry a reading: what a voice reads (nabu.audio.course reads the same kinds).
WORD_KINDS = ("word", "number")

Key = tuple[str, str]
"""(KC id, surface)."""


def _most_common(readings: list[str]) -> str:
    """The reading seen most often; of several seen as often, the first seen."""
    counts: dict[str, int] = {}
    for r in readings:
        counts[r] = counts.get(r, 0) + 1
    best = max(counts.values())
    return next(r for r in readings if counts[r] == best)


def _shares(token: dict[str, Any], scheme: str) -> Iterator[tuple[str, str, str]]:
    """(morph KC, morph surface, its share of the token's reading): the syllables its ruby pairs
    with the morph's characters. A word without ruby in the scheme (a loanword in Latin letters)
    is not split."""
    surface = str(token["surface"])
    ruby = cast(
        list[dict[str, str]], cast(dict[str, Any], token.get("ruby") or {}).get(scheme) or []
    )
    morphs = cast(list[dict[str, str]], token.get("morphs") or [])
    if not morphs or [s["base"] for s in ruby] != tx.graphemes(surface):
        return
    if [g for m in morphs for g in tx.graphemes(m["surface"])] != tx.graphemes(surface):
        return
    at = 0
    for m in morphs:
        n = len(tx.graphemes(m["surface"]))
        share = " ".join(s["text"] for s in ruby[at : at + n])
        at += n
        if share and m.get("kc"):
            yield m["kc"], m["surface"], share


@dataclass
class Seen:
    """Every reading a scheme's tokens pin in one orthography, as the order above looks them up."""

    scheme: str
    cite: Callable[[str], str] | None
    lessons: dict[Key, list[str]] = field(default_factory=lambda: {})
    lines: dict[Key, list[str]] = field(default_factory=lambda: {})
    shares: dict[Key, list[str]] = field(default_factory=lambda: {})
    cited: dict[Key, list[str]] = field(default_factory=lambda: {})
    surfaces: dict[str, list[str]] = field(default_factory=lambda: {})

    def add(self, tokens: list[dict[str, Any]], own: dict[Key, list[str]]) -> None:
        for t in tokens:
            reading = cast(dict[str, str], t.get("readings") or {}).get(self.scheme)
            if t.get("kind") not in WORD_KINDS or reading is None:
                continue
            surface = str(t["surface"])
            self.surfaces.setdefault(surface, []).append(reading)
            if t.get("sense"):
                sense = f"sense:{t['sense']}"
                own.setdefault((sense, surface), []).append(reading)
                if self.cite is not None:
                    key = (sense, self.cite(surface))
                    self.cited.setdefault(key, []).append(self.cite(reading))
            for kc, part, share in _shares(t, self.scheme):
                self.shares.setdefault((kc, part), []).append(share)
                self.surfaces.setdefault(part, []).append(share)

    def _steps(self, kc: str, surface: str) -> list[tuple[dict[Key, list[str]], Key]]:
        """The order's first four steps: each table, and the key it looks a KC's form word up by."""
        return [
            (self.lessons, (kc, surface)),
            (self.lines, (kc, surface)),
            (self.shares, (kc, surface)),
            (self.cited, (kc, surface if self.cite is None else self.cite(surface))),
        ]

    def pick(self, kc: str, surface: str) -> str | None:
        """The reading of a KC's form word (the module's docstring), or None."""
        for table, key in self._steps(kc, surface):
            found = table.get(key)
            if found:
                return _most_common(found)
        seen = set(self.surfaces.get(surface, []))
        return seen.pop() if len(seen) == 1 else None

    def given(self, kc: str, surface: str) -> set[str]:
        """Every reading the course's tokens give a KC's form word: each step's, and every token's
        spelled as the form (a polyphone's several). A KC's own reading must be one of them."""
        found = set(self.surfaces.get(surface, []))
        for table, key in self._steps(kc, surface):
            found.update(table.get(key, []))
        return found


@dataclass(frozen=True)
class Refusal:
    """A reading a KC's entry chose (its `readings`) that cannot be pinned, and why."""

    kc: str
    scheme: str
    message: str


def _refused(table: Seen, kc: str, words: list[dict[str, Any]], reading: str) -> str | None:
    """Why a KC's own reading cannot be pinned on its first form's words, or None."""
    if len(words) != 1:
        return f"its first form has {len(words)} words; a KC's own reading is one word's"
    surface = str(words[0]["surface"])
    given = table.given(kc, surface)
    if reading not in given:
        return (
            f"no token gives {surface} the reading {reading!r}; "
            f"the course's give {', '.join(sorted(given)) or 'none'}"
        )
    return None


def _sentence_tokens(units: list[dict[str, Any]], orth: str) -> Iterator[list[dict[str, Any]]]:
    for u in units:
        for s in cast(list[dict[str, Any]], u["sentences"]):
            form = cast(dict[str, Any] | None, s["forms"].get(orth))
            if form is not None:
                yield cast(list[dict[str, Any]], form["text"]["tokens"])


def _line_tokens(units: list[dict[str, Any]], orth: str) -> Iterator[list[dict[str, Any]]]:
    for u in units:
        for story in cast(list[dict[str, Any]], u.get("stories", [])):
            for step in cast(list[dict[str, Any]], story["steps"]):
                line = cast(dict[str, Any], step.get("line") or {}).get("forms", {}).get(orth)
                if line is not None:
                    yield cast(list[dict[str, Any]], line["tokens"])


def pinned_schemes(units: list[dict[str, Any]], orth: str) -> list[str]:
    """Every scheme a word of the orthography's sentences or story lines pins a reading in."""
    found: set[str] = set()
    for tokens in [*_sentence_tokens(units, orth), *_line_tokens(units, orth)]:
        for t in tokens:
            if t.get("kind") in WORD_KINDS:
                found.update(cast(dict[str, str], t.get("readings") or {}))
    return sorted(found)


def seen(units: list[dict[str, Any]], orth: str, scheme: str) -> Seen:
    """The readings a scheme's tokens pin in an orthography, lessons before story lines."""
    cite = plugins(scheme).cite if scheme in schemes() else None
    out = Seen(scheme, cite)
    for tokens in _sentence_tokens(units, orth):
        out.add(tokens, out.lessons)
    for tokens in _line_tokens(units, orth):
        out.add(tokens, out.lines)
    return out


def pin_kc_readings(
    units: list[dict[str, Any]],
    orthographies: list[str],
    ruby_layers: Callable[[str], list[str]],
    script_of: Callable[[str], tx.Script],
    own: Mapping[str, Mapping[str, str]] | None = None,
) -> list[Refusal]:
    """Pins a reading, in every scheme the orthography's words pin, on each word of every KC form
    (the module's docstring), and ruby on the orthography's ruby layers (`ruby_layers`).

    `own`: the readings KC entries choose for their first form (their `readings`), by KC id and
    scheme. Returns those it cannot pin (a form of several words, a reading no token gives the
    word, a scheme no orthography of the KC's forms pins); their words take the order's."""
    own = own or {}
    taken: set[tuple[str, str]] = set()
    refused: list[Refusal] = []
    for orth in orthographies:
        ruby = set(ruby_layers(orth))
        script = script_of(orth)
        for scheme in pinned_schemes(units, orth):
            table = seen(units, orth, scheme)
            for u in units:
                for kc in cast(list[dict[str, Any]], u["kcs"]):
                    kc_id = str(kc["id"])
                    forms = cast(dict[str, list[dict[str, Any]]], kc.get("forms") or {})
                    for i, form in enumerate(forms.get(orth, [])):
                        words = [
                            t
                            for t in cast(list[dict[str, Any]], form["tokens"])
                            if t.get("kind") in WORD_KINDS
                        ]
                        chosen = own.get(kc_id, {}).get(scheme) if i == 0 else None
                        if chosen is not None:
                            taken.add((kc_id, scheme))
                            why = _refused(table, kc_id, words, chosen)
                            if why is not None:
                                refused.append(Refusal(kc_id, scheme, f"{orth}: {why}"))
                                chosen = None
                        for t in words:
                            surface = str(t["surface"])
                            reading = chosen if chosen is not None else table.pick(kc_id, surface)
                            if reading is None:
                                continue
                            t.setdefault("readings", {})[scheme] = reading
                            if (
                                scheme not in ruby
                                or t["kind"] != "word"
                                or not tx.ruby_bearing(surface, script)
                            ):
                                continue
                            segments = tx.ruby_segments(surface, reading)
                            if segments is not None:
                                t.setdefault("ruby", {})[scheme] = segments
    for kc_id, by_scheme in own.items():
        for scheme in by_scheme:
            if (kc_id, scheme) not in taken:
                message = f"no orthography of its forms has words that pin {scheme}"
                refused.append(Refusal(kc_id, scheme, message))
    return refused
