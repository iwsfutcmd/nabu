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

from collections.abc import Callable, Iterator, Mapping, Sequence
from dataclasses import dataclass, field

from nabu.compiler import text as tx
from nabu.items import WORD_KINDS, ItemKind, iter_items
from nabu.schema.models import BundleUnit, RubySegment, TokenModel
from nabu.schemes import plugins, schemes

Key = tuple[str, str]
"""(KC id, surface)."""


def _most_common(readings: list[str]) -> str:
    """The reading seen most often; of several seen as often, the first seen."""
    counts: dict[str, int] = {}
    for r in readings:
        counts[r] = counts.get(r, 0) + 1
    best = max(counts.values())
    return next(r for r in readings if counts[r] == best)


def _shares(token: TokenModel, scheme: str) -> Iterator[tuple[str, str, str]]:
    """(morph KC, morph surface, its share of the token's reading): the ruby text over the
    morph's part of the word (syllables over characters, or characters over Jyutping syllables,
    ADR 0126). A word without ruby in the scheme (a loanword in Latin letters), or whose ruby
    crosses a morph's edge, is not split."""
    surface = token.surface
    ruby = (token.ruby or {}).get(scheme) or []
    morphs = token.morphs or []
    if not morphs or "".join(s.base for s in ruby) != surface:
        return
    if "".join(m.surface for m in morphs) != surface:
        return
    # Spaced syllables stay spaced; characters are not.
    joiner = " " if " " in ((token.readings or {}).get(scheme) or "") else ""
    spans: list[tuple[int, int, str]] = []
    at = 0
    for seg in ruby:
        spans.append((at, at + len(seg.base), seg.text))
        at += len(seg.base)
    start = 0
    for m in morphs:
        end = start + len(m.surface)
        inside = [(a, b, text) for a, b, text in spans if a >= start and b <= end]
        if sum(b - a for a, b, _ in inside) != end - start:
            return
        share = joiner.join(text for _, _, text in inside)
        start = end
        if share and m.kc:
            yield m.kc, m.surface.strip(), share


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

    def add(self, tokens: Sequence[TokenModel], own: dict[Key, list[str]]) -> None:
        for t in tokens:
            reading = (t.readings or {}).get(self.scheme)
            if t.kind not in WORD_KINDS or reading is None:
                continue
            surface = t.surface
            self.surfaces.setdefault(surface, []).append(reading)
            if t.sense:
                sense = f"sense:{t.sense}"
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


def _refused(table: Seen, kc: str, words: Sequence[TokenModel], reading: str) -> str | None:
    """Why a KC's own reading cannot be pinned on its first form's words, or None."""
    if len(words) != 1:
        return f"its first form has {len(words)} words; a KC's own reading is one word's"
    surface = words[0].surface
    given = table.given(kc, surface)
    if reading not in given:
        return (
            f"no token gives {surface} the reading {reading!r}; "
            f"the course's give {', '.join(sorted(given)) or 'none'}"
        )
    return None


def _tokens(
    units: Sequence[BundleUnit], orth: str, kind: ItemKind
) -> Iterator[Sequence[TokenModel]]:
    """The orthography's tokens of every sentence (or every story line), in course order."""
    for item in iter_items(units):
        tokens = item.forms.get(orth)
        if item.kind == kind and tokens is not None:
            yield tokens


def pinned_schemes(units: Sequence[BundleUnit], orth: str) -> list[str]:
    """Every scheme a word of the orthography's sentences or story lines pins a reading in."""
    found: set[str] = set()
    kinds: tuple[ItemKind, ...] = ("sentence", "line")
    for kind in kinds:
        for tokens in _tokens(units, orth, kind):
            for t in tokens:
                if t.kind in WORD_KINDS:
                    found.update(t.readings or {})
    return sorted(found)


def seen(units: Sequence[BundleUnit], orth: str, scheme: str) -> Seen:
    """The readings a scheme's tokens pin in an orthography, lessons before story lines."""
    cite = plugins(scheme).cite if scheme in schemes() else None
    out = Seen(scheme, cite)
    for tokens in _tokens(units, orth, "sentence"):
        out.add(tokens, out.lessons)
    for tokens in _tokens(units, orth, "line"):
        out.add(tokens, out.lines)
    return out


#: Where a pinned reading goes: (unit, KC, orthography, form, token), by index.
Place = tuple[int, int, str, int, int]


@dataclass
class _Pin:
    """What a KC form's word gets: a reading per scheme, and ruby where a layer shows it."""

    readings: dict[str, str] = field(default_factory=lambda: {})
    ruby: dict[str, list[RubySegment]] = field(default_factory=lambda: {})


def _pinned(units: Sequence[BundleUnit], pins: Mapping[Place, _Pin]) -> list[BundleUnit]:
    """The units with each KC form's words given what `pins` says."""
    out: list[BundleUnit] = []
    for ui, unit in enumerate(units):
        kcs = list(unit.kcs)
        for ki, kc in enumerate(kcs):
            forms = dict(kc.forms or {})
            changed = False
            for orth, texts in forms.items():
                new_texts = list(texts)
                for fi, text in enumerate(texts):
                    tokens = list(text.tokens)
                    for ti, t in enumerate(tokens):
                        pin = pins.get((ui, ki, orth, fi, ti))
                        if pin is None:
                            continue
                        update: dict[str, object] = {
                            "readings": {**(t.readings or {}), **pin.readings}
                        }
                        if pin.ruby:
                            update["ruby"] = {**(t.ruby or {}), **pin.ruby}
                        tokens[ti] = t.model_copy(update=update)
                    if tokens != list(text.tokens):
                        new_texts[fi] = text.model_copy(update={"tokens": tokens})
                if new_texts != list(texts):
                    forms[orth] = new_texts
                    changed = True
            if changed:
                kcs[ki] = kc.model_copy(update={"forms": forms})
        out.append(unit.model_copy(update={"kcs": kcs}) if kcs != list(unit.kcs) else unit)
    return out


def pin_kc_readings(
    units: Sequence[BundleUnit],
    orthographies: list[str],
    ruby_layers: Callable[[str], list[str]],
    script_of: Callable[[str], tx.Script],
    own: Mapping[str, Mapping[str, str]] | None = None,
) -> tuple[list[BundleUnit], list[Refusal]]:
    """The units with a reading pinned, in every scheme the orthography's words pin, on each word
    of every KC form (the module's docstring), and ruby on the orthography's ruby layers
    (`ruby_layers`).

    `own`: the readings KC entries choose for their first form (their `readings`), by KC id and
    scheme. Also returns those it cannot pin (a form of several words, a reading no token gives
    the word, a scheme no orthography of the KC's forms pins); their words take the order's."""
    own = own or {}
    taken: set[tuple[str, str]] = set()
    refused: list[Refusal] = []
    pins: dict[Place, _Pin] = {}
    for orth in orthographies:
        ruby = set(ruby_layers(orth))
        script = script_of(orth)
        for scheme in pinned_schemes(units, orth):
            table = seen(units, orth, scheme)
            for ui, u in enumerate(units):
                for ki, kc in enumerate(u.kcs):
                    for fi, form in enumerate((kc.forms or {}).get(orth, [])):
                        words = [
                            (ti, t) for ti, t in enumerate(form.tokens) if t.kind in WORD_KINDS
                        ]
                        chosen = own.get(kc.id, {}).get(scheme) if fi == 0 else None
                        if chosen is not None:
                            taken.add((kc.id, scheme))
                            why = _refused(table, kc.id, [t for _, t in words], chosen)
                            if why is not None:
                                refused.append(Refusal(kc.id, scheme, f"{orth}: {why}"))
                                chosen = None
                        for ti, t in words:
                            reading = chosen if chosen is not None else table.pick(kc.id, t.surface)
                            if reading is None:
                                continue
                            pin = pins.setdefault((ui, ki, orth, fi, ti), _Pin())
                            pin.readings[scheme] = reading
                            if (
                                scheme not in ruby
                                or t.kind != "word"
                                or not tx.ruby_bearing(t.surface, script)
                            ):
                                continue
                            segments = tx.ruby_segments(t.surface, reading, script)
                            if segments is not None:
                                pin.ruby[scheme] = [RubySegment.model_validate(s) for s in segments]
    for kc_id, by_scheme in own.items():
        for scheme in by_scheme:
            if (kc_id, scheme) not in taken:
                message = f"no orthography of its forms has words that pin {scheme}"
                refused.append(Refusal(kc_id, scheme, message))
    return _pinned(units, pins), refused
