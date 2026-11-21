"""Pinned readings on a lexeme's spellings (ADR 0117): one reading per word of every spelling of
an entry, for every reading scheme the orthography's words pin.

A word card shows an entry's spelling with its reading (Jyutping as ruby), a voice that reads a
scheme says it from its reading (the Tiberian reading of Biblical Hebrew, Attic, sitelen Lasina),
and a minimal pair compares two entries' readings. All of them take the reading pinned here, on
the spelling's own tokens; none looks one up in the sentences itself, so a card's clip and its
ruby can never come from two readings of one word.

Nothing is guessed: a reading comes from the course's own tokens. An entry may choose one of them
for its first spelling (its `readings`, ADR 0117's amendment: hbo's lexeme:ad reads ʿaḏ, free,
where its lessons tie with the maqaf-bound ʿaḏ-); in a scheme read over whole words (`ruby: word`,
ADR 0129) it may give its own, as chg's verb stems do (بار- reads bar). So it may for a spelling
no token has, which the course has nothing to take a reading from (ADR 0133: a lemma its
sentences only inflect, ᾰ̓γορᾱ́ where they have ἀγορᾶς and ἀγορᾷ, which an alphabet track asks).
Otherwise it is, in this order:

1. the readings of the tokens whose base is the lexeme, spelled as the entry, in the lesson
   sentences: the most common, a tie going to the first in course order;
2. the same in story lines, for a word no lesson sentence has: an authentic passage's readings are
   often its context's (a pausal form, a word bound by maqaf);
3. the lexeme's share of a token that writes several, from its ruby: 禮拜 in 禮拜一 (lai5 baai3
   jat1) is lai5 baai3;
4. where the scheme cites a word otherwise than a sentence says it (its `cite` plug-in: Attic
   writes καί for a sentence's καὶ), the lexeme's tokens in sentences, cited the same way;
5. the reading every token spelled as the entry has, when they all agree; a polyphone gets none.

The profile's ruby layers also get ruby: the reading split over the word's characters, where it
lines up with them.
"""

from __future__ import annotations

from collections.abc import Callable, Iterator, Mapping, Sequence
from dataclasses import dataclass, field

from nabu.compiler import text as tx
from nabu.items import WORD_KINDS, Content, ItemKind, iter_items
from nabu.schema.models import BundleLexicon, BundleUnit, RubySegment, TokenModel
from nabu.schemes import plugins, schemes

Key = tuple[str, str]
"""(lexeme id, surface)."""


def base_lexeme(token: TokenModel) -> str | None:
    """The lexeme a token's others are merged onto: the one marked, or its only one."""
    parts = token.lexemes or []
    if len(parts) == 1:
        return str(parts[0].lexeme)
    return next((str(p.lexeme) for p in parts if p.base), None)


def _most_common(readings: list[str]) -> str:
    """The reading seen most often; of several seen as often, the first seen."""
    counts: dict[str, int] = {}
    for r in readings:
        counts[r] = counts.get(r, 0) + 1
    best = max(counts.values())
    return next(r for r in readings if counts[r] == best)


def _shares(token: TokenModel, scheme: str) -> Iterator[tuple[str, str, str]]:
    """(lexeme, its letters, its share of the token's reading), for a token that writes several
    lexemes: the ruby text over each one's part of the token (syllables over characters, or
    characters over Jyutping syllables, ADR 0126). A token without ruby in the scheme (a loanword
    in Latin letters), or whose ruby crosses a lexeme's edge, is not split."""
    surface = token.surface
    ruby = (token.ruby or {}).get(scheme) or []
    morphs = [m for m in token.lexemes or [] if m.surface is not None]
    if len(morphs) < 2 or len(morphs) != len(token.lexemes or []):
        return
    if "".join(s.base for s in ruby) != surface:
        return
    if "".join(m.surface or "" for m in morphs) != surface:
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
        letters = m.surface or ""
        end = start + len(letters)
        inside = [(a, b, text) for a, b, text in spans if a >= start and b <= end]
        if sum(b - a for a, b, _ in inside) != end - start:
            return
        share = joiner.join(text for _, _, text in inside)
        start = end
        if share:
            yield str(m.lexeme), letters.strip(), share


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
            sense = base_lexeme(t)
            if sense is not None:
                own.setdefault((sense, surface), []).append(reading)
                if self.cite is not None:
                    key = (sense, self.cite(surface))
                    self.cited.setdefault(key, []).append(self.cite(reading))
            for lexeme, part, share in _shares(t, self.scheme):
                self.shares.setdefault((lexeme, part), []).append(share)
                self.surfaces.setdefault(part, []).append(share)

    def _steps(self, lexeme: str, surface: str) -> list[tuple[dict[Key, list[str]], Key]]:
        """The order's first four steps: each table, and the key it looks a word of an entry's
        spelling up by."""
        return [
            (self.lessons, (lexeme, surface)),
            (self.lines, (lexeme, surface)),
            (self.shares, (lexeme, surface)),
            (self.cited, (lexeme, surface if self.cite is None else self.cite(surface))),
        ]

    def pick(self, lexeme: str, surface: str) -> str | None:
        """The reading of a word of an entry's spelling (the module's docstring), or None."""
        for table, key in self._steps(lexeme, surface):
            found = table.get(key)
            if found:
                return _most_common(found)
        seen = set(self.surfaces.get(surface, []))
        return seen.pop() if len(seen) == 1 else None

    def given(self, lexeme: str, surface: str) -> set[str]:
        """Every reading the course's tokens give a word of an entry's spelling: each step's, and
        every token's spelled so (a polyphone's several). An entry's own reading must be one of
        them, where there are any."""
        found = set(self.surfaces.get(surface, []))
        for table, key in self._steps(lexeme, surface):
            found.update(table.get(key, []))
        return found


@dataclass(frozen=True)
class Refusal:
    """A reading an entry chose (its `readings`) that cannot be pinned, and why."""

    lexeme: str
    scheme: str
    message: str


def _refused(
    table: Seen, lexeme: str, words: Sequence[TokenModel], reading: str, *, adds: bool = False
) -> str | None:
    """Why an entry's own reading cannot be pinned on its first spelling's words, or None. A
    scheme read over whole words (`ruby: word`, ADR 0129) lets the entry give a reading no token
    gives (`adds`): its sentences show a verb's stem only with suffixes (بار in باردی), never
    alone. So does a spelling no token has (ADR 0133): there is no reading of the course's for
    it to contradict."""
    if len(words) != 1:
        return f"its first spelling has {len(words)} words; an entry's own reading is one word's"
    if adds:
        return None
    surface = words[0].surface
    given = table.given(lexeme, surface)
    if given and reading not in given:
        return (
            f"no token gives {surface} the reading {reading!r}; "
            f"the course's give {', '.join(sorted(given)) or 'none'}"
        )
    return None


def _tokens(
    units: Sequence[BundleUnit], orth: str, kind: ItemKind
) -> Iterator[Sequence[TokenModel]]:
    """The orthography's tokens of every sentence (or every story line), in course order."""
    for item in iter_items(Content(units)):
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


#: Where a pinned reading goes: (lexeme, orthography, spelling, token), by index.
Place = tuple[int, str, int, int]


@dataclass
class _Pin:
    """What a word of an entry's spelling gets: a reading per scheme, and ruby where a layer
    shows it."""

    readings: dict[str, str] = field(default_factory=lambda: {})
    ruby: dict[str, list[RubySegment]] = field(default_factory=lambda: {})


def _pinned(lexicon: BundleLexicon, pins: Mapping[Place, _Pin]) -> BundleLexicon:
    """The lexicon with each spelling's words given what `pins` says."""
    lexemes = list(lexicon.lexemes)
    for li, lexeme in enumerate(lexemes):
        forms = dict(lexeme.forms or {})
        changed = False
        for orth, texts in forms.items():
            new_texts = list(texts)
            for fi, text in enumerate(texts):
                tokens = list(text.tokens)
                for ti, t in enumerate(tokens):
                    pin = pins.get((li, orth, fi, ti))
                    if pin is None:
                        continue
                    update: dict[str, object] = {"readings": {**(t.readings or {}), **pin.readings}}
                    if pin.ruby:
                        update["ruby"] = {**(t.ruby or {}), **pin.ruby}
                    tokens[ti] = t.model_copy(update=update)
                if tokens != list(text.tokens):
                    new_texts[fi] = text.model_copy(update={"tokens": tokens})
            if new_texts != list(texts):
                forms[orth] = new_texts
                changed = True
        if changed:
            lexemes[li] = lexeme.model_copy(update={"forms": forms})
    if all(a is b for a, b in zip(lexemes, lexicon.lexemes, strict=True)):
        return lexicon
    return lexicon.model_copy(update={"lexemes": lexemes})


def pin_lexeme_readings(
    lexicon: BundleLexicon,
    units: Sequence[BundleUnit],
    orthographies: list[str],
    ruby_layers: Callable[[str], list[str]],
    script_of: Callable[[str], tx.Script],
    own: Mapping[str, Mapping[str, str]] | None = None,
) -> tuple[BundleLexicon, list[Refusal]]:
    """The lexicon with a reading pinned, in every scheme the orthography's words pin, on each
    word of every spelling of every lexeme (the module's docstring), and ruby on the
    orthography's ruby layers (`ruby_layers`). The readings come from the units' tokens.

    `own`: the readings entries choose for their first spelling (their `readings`), by lexeme
    and scheme. Also returns those it cannot pin (a spelling of several words, a reading no
    token gives the word, a scheme no orthography the entry is spelled in pins); their words
    take the order's."""
    own = own or {}
    taken: set[tuple[str, str]] = set()
    refused: list[Refusal] = []
    pins: dict[Place, _Pin] = {}
    for orth in orthographies:
        ruby = set(ruby_layers(orth))
        script = script_of(orth)
        for scheme in pinned_schemes(units, orth):
            table = seen(units, orth, scheme)
            whole = scheme in schemes() and schemes()[scheme].ruby == "word"
            for li, lexeme in enumerate(lexicon.lexemes):
                ident = str(lexeme.id)
                for fi, form in enumerate((lexeme.forms or {}).get(orth, [])):
                    words = [(ti, t) for ti, t in enumerate(form.tokens) if t.kind in WORD_KINDS]
                    chosen = own.get(ident, {}).get(scheme) if fi == 0 else None
                    if chosen is not None:
                        taken.add((ident, scheme))
                        why = _refused(table, ident, [t for _, t in words], chosen, adds=whole)
                        if why is not None:
                            refused.append(Refusal(ident, scheme, f"{orth}: {why}"))
                            chosen = None
                    for ti, t in words:
                        reading = chosen if chosen is not None else table.pick(ident, t.surface)
                        if reading is None:
                            continue
                        pin = pins.setdefault((li, orth, fi, ti), _Pin())
                        pin.readings[scheme] = reading
                        if (
                            scheme not in ruby
                            or t.kind != "lexical"
                            or not tx.ruby_bearing(t.surface, script, whole=whole)
                        ):
                            continue
                        segments = tx.ruby_segments(t.surface, reading, script, whole=whole)
                        if segments is not None:
                            pin.ruby[scheme] = [RubySegment.model_validate(s) for s in segments]
    for ident, by_scheme in own.items():
        for scheme in by_scheme:
            if (ident, scheme) not in taken:
                message = f"no orthography it is spelled in has words that pin {scheme}"
                refused.append(Refusal(ident, scheme, message))
    return _pinned(lexicon, pins), refused
