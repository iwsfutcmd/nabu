"""Pinned readings on KC forms (ADR 0117): one reading per word of every form of a KC, for every
reading scheme the orthography's words pin.

A word card shows a KC's form with its reading (Jyutping as ruby), a voice that reads a scheme says
the form from its reading (the Tiberian reading of Biblical Hebrew, Attic, sitelen Lasina), and a
minimal pair compares two forms' readings. All of them take the reading pinned here, on the form's
own tokens; none looks one up in the sentences itself, so a card's clip and its ruby can never come
from two readings of one word.

Nothing is guessed: a reading comes from the course's own tokens, in this order:

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

from collections.abc import Callable, Iterator
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

    def pick(self, kc: str, surface: str) -> str | None:
        """The reading of a KC's form word (the module's docstring), or None."""
        for table, key in (
            (self.lessons, (kc, surface)),
            (self.lines, (kc, surface)),
            (self.shares, (kc, surface)),
            (self.cited, (kc, surface if self.cite is None else self.cite(surface))),
        ):
            found = table.get(key)
            if found:
                return _most_common(found)
        seen = set(self.surfaces.get(surface, []))
        return seen.pop() if len(seen) == 1 else None


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
) -> None:
    """Pins a reading, in every scheme the orthography's words pin, on each word of every KC form
    (the module's docstring), and ruby on the orthography's ruby layers (`ruby_layers`)."""
    for orth in orthographies:
        ruby = set(ruby_layers(orth))
        script = script_of(orth)
        for scheme in pinned_schemes(units, orth):
            table = seen(units, orth, scheme)
            for u in units:
                for kc in cast(list[dict[str, Any]], u["kcs"]):
                    forms = cast(dict[str, list[dict[str, Any]]], kc.get("forms") or {})
                    for form in forms.get(orth, []):
                        for t in cast(list[dict[str, Any]], form["tokens"]):
                            if t.get("kind") not in WORD_KINDS:
                                continue
                            surface = str(t["surface"])
                            reading = table.pick(str(kc["id"]), surface)
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
