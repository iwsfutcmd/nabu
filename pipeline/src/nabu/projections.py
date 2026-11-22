"""What a course's words leave to learn by the profiles' and schemes' statements (ADR 0148).

The statements are read by @nabu/core (packages/core/src/project), and this module only asks it,
through core-cli, one process for the whole course: never re-implement the reading here. For each
orthography of the course whose spelling a spelling card can ask (its profile reads a word's sound
off its spelling, `sound: {from: spelling}`, or knows homophone characters, `match.homophones`),
how many of the course's distinct word spellings have another spelling the card may offer
(`spelling-others`, the card's own rule: a spelling leftover); for each scheme that
relates its readings to an orthography of the course (`of`), the tokens whose pinned reading its
statement cannot relate to their spelling (`reading-spells`): the review list.

The compiler asks the same, in batches (`leftovers`, `unaccounted`): each lexeme's leftovers go
in the bundle, and the review list is its lint `projection.unaccounted`.
"""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field
from typing import Any

from nabu.corecli import CoreCli
from nabu.items import Content, iter_items
from nabu.schema import OrthographyProfile
from nabu.schema.models import BundleLexicon, BundleUnit, Leftovers, TokenModel
from nabu.schemes import schemes

#: How many words with other spellings a report shows, per orthography.
EXAMPLES = 8


@dataclass(frozen=True)
class SpellingReport:
    """One orthography's spelling leftovers: its distinct words, those with another spelling of
    their sound, and a few of them with those spellings."""

    orthography: str
    words: int
    with_others: int
    examples: list[tuple[str, list[str]]] = field(default_factory=lambda: [])


@dataclass(frozen=True)
class Unaccounted:
    """A token whose pinned reading a scheme's statement does not relate to its spelling."""

    item: str
    surface: str
    reading: str


@dataclass(frozen=True)
class ReadingReport:
    """One scheme's relation to an orthography of the course: the tokens with a reading in it, and
    those it cannot relate."""

    scheme: str
    orthography: str
    tokens: int
    unaccounted: list[Unaccounted] = field(default_factory=lambda: [])


@dataclass(frozen=True)
class Report:
    spelling: list[SpellingReport]
    reading: list[ReadingReport]


def _words(content: Content, orthography: str) -> list[TokenModel]:
    """The course's distinct word spellings in an orthography, in course order (the first token of
    each)."""
    seen: dict[str, TokenModel] = {}
    for item in iter_items(content):
        for token in item.forms.get(orthography, []):
            if token.kind == "lexical":
                seen.setdefault(token.surface, token)
    return list(seen.values())


def _readings(content: Content, orthography: str, scheme: str) -> Iterable[tuple[str, str, str]]:
    """(item, surface, reading) for each token pinning a reading in the scheme, each once."""
    seen: set[tuple[str, str, str]] = set()
    for item in iter_items(content):
        for token in item.forms.get(orthography, []):
            reading = (token.readings or {}).get(scheme)
            if token.kind != "lexical" or reading is None:
                continue
            key = (item.id, token.surface, reading)
            if key not in seen:
                seen.add(key)
                yield key


def _spells_otherwise(profile: OrthographyProfile | None) -> bool:
    """Whether a spelling card can ask the orthography's words: its profile reads a word's sound
    off its spelling (`sound: {from: spelling}`) or knows homophone characters
    (`match.homophones`)."""
    if profile is None:
        return False
    if profile.sound is not None and profile.sound.from_ == "spelling":
        return True
    return profile.match is not None and profile.match.homophones is not None


def _token(token: TokenModel, *fields: str) -> dict[str, Any]:
    """A token as core reads it, only the fields asked."""
    return token.model_dump(mode="json", by_alias=True, exclude_none=True, include=set(fields))


def _course_tokens(units: Sequence[BundleUnit], orth: str) -> list[dict[str, Any]]:
    """The ruby of every token of the bundle's sentences in an orthography, in course order: where
    core finds the characters the course reads alike (what `allSentences` gives a card)."""
    return [
        _token(t, "ruby")
        for unit in units
        for sentence in unit.sentences
        if (form := sentence.forms.get(orth)) is not None
        for t in form.text.tokens
        if t.ruby
    ]


def _other_spellings(
    cli: CoreCli, orth: str, words: Sequence[TokenModel], tokens: list[dict[str, Any]]
) -> list[list[str]]:
    """For each word, the other spellings a spelling card may offer for it (`spelling-others`:
    core's `otherSpellings`, as the card finds them), in one round trip."""
    found = cli.result(
        "spelling-others",
        profile=orth,
        words=[_token(w, "surface", "variants", "ruby") for w in words],
        tokens=tokens,
    )
    return [[str(x) for x in f] for f in found]


def _related(cli: CoreCli, triples: Sequence[tuple[str, str, str]]) -> list[bool]:
    """For each (scheme, reading, spelling), whether the scheme's statement relates them."""
    found = cli.batch(
        [
            {"op": "reading-spells", "scheme": sc, "reading": r, "spelling": sp}
            for sc, r, sp in triples
        ]
    )
    return [f is not None for f in found]


def _stated(scheme: str) -> bool:
    """Whether a scheme states its correspondences (a statement, even an empty one)."""
    data = schemes().get(scheme)
    return data is not None and data.correspondences is not None


def _readings_of(token: TokenModel) -> dict[str, str]:
    """A token's pinned readings, by scheme."""
    return {str(k): str(getattr(v, "root", v)) for k, v in (token.readings or {}).items()}


def leftovers(
    lexicon: BundleLexicon,
    units: Sequence[BundleUnit],
    orthographies: Iterable[str],
    profiles: dict[str, OrthographyProfile],
    cli: CoreCli,
) -> BundleLexicon:
    """The lexicon with each lexeme's leftovers (ADR 0148; the bundle's `leftovers`): `spelling`,
    the course orthographies in which its first spelling (the one word cards show) has another
    spelling a spelling card may offer (`spelling-others`: another spelling of its sound, or a
    character the course reads alike; one is enough, as for the card); `reading`, each
    orthography and stated scheme in
    which a word of that spelling pins a reading the script leaves open somewhere
    (`reading-variants`, with the spelling where the scheme is stated `of` the orthography)."""
    orths = list(orthographies)
    spelling: dict[str, list[str]] = {}
    reading: dict[str, list[dict[str, str]]] = {}
    for orth in orths:
        firsts = [(str(lx.id), (lx.forms or {}).get(orth, [None])[0]) for lx in lexicon.lexemes]
        words = [
            (ident, t)
            for ident, form in firsts
            if form is not None
            for t in form.tokens
            if t.kind == "lexical"
        ]
        if _spells_otherwise(profiles.get(orth)):
            others = _other_spellings(cli, orth, [t for _, t in words], _course_tokens(units, orth))
            for (ident, _), traded in zip(words, others, strict=True):
                if traded and orth not in spelling.setdefault(ident, []):
                    spelling[ident].append(orth)
        asks: list[tuple[str, str, dict[str, Any]]] = []
        for ident, t in words:
            for scheme, value in _readings_of(t).items():
                if not _stated(scheme):
                    continue
                request: dict[str, Any] = {
                    "op": "reading-variants",
                    "scheme": scheme,
                    "reading": value,
                }
                if str(schemes()[scheme].of or "") == orth:
                    request["spelling"] = t.surface
                asks.append((ident, scheme, request))
        for (ident, scheme, _), places in zip(
            asks, cli.batch([a for _, _, a in asks]), strict=True
        ):
            entry = {"orthography": orth, "scheme": scheme}
            if places and entry not in reading.setdefault(ident, []):
                reading[ident].append(entry)
    lexemes: list[Any] = []
    for lx in lexicon.lexemes:
        ident = str(lx.id)
        found: dict[str, Any] = {}
        if spelling.get(ident):
            found["spelling"] = spelling[ident]
        if reading.get(ident):
            found["reading"] = reading[ident]
        lexemes.append(
            lx.model_copy(update={"leftovers": Leftovers.model_validate(found)}) if found else lx
        )
    return lexicon.model_copy(update={"lexemes": lexemes})


def unaccounted(
    content: Content, orthographies: Iterable[str], cli: CoreCli
) -> list[ReadingReport]:
    """For each scheme stated `of` an orthography of the course, the tokens whose pinned reading
    its statement cannot relate to their spelling (`reading-spells`), each (item, surface,
    reading) once: the review list."""
    orths = list(orthographies)
    out: list[ReadingReport] = []
    for scheme in schemes().values():
        if scheme.of is None or str(scheme.of) not in orths:
            continue
        orth = str(scheme.of)
        found = list(_readings(content, orth, scheme.id))
        related = _related(cli, [(scheme.id, value, surface) for _, surface, value in found])
        missing = [
            Unaccounted(item, surface, value)
            for (item, surface, value), ok in zip(found, related, strict=True)
            if not ok
        ]
        out.append(ReadingReport(scheme.id, orth, len(found), missing))
    return out


def report(
    content: Content,
    units: Sequence[BundleUnit],
    orthographies: Iterable[str],
    profiles: dict[str, OrthographyProfile],
    cli: CoreCli,
) -> Report:
    orths = list(orthographies)
    spelling: list[SpellingReport] = []
    for orth in orths:
        if not _spells_otherwise(profiles.get(orth)):
            continue
        words = _words(content, orth)
        others = _other_spellings(cli, orth, words, _course_tokens(units, orth))
        traded = [(w.surface, o) for w, o in zip(words, others, strict=True) if o]
        spelling.append(SpellingReport(orth, len(words), len(traded), traded[:EXAMPLES]))
    return Report(spelling, unaccounted(content, orths, cli))


def _escaped(text: str) -> str:
    """Invisible format characters (a ZWNJ) shown as escapes, so a review list is readable."""
    return "".join(f"\\u{ord(c):04x}" if c in "\u200c\u200d" else c for c in text)


def format_report(r: Report) -> list[str]:
    lines: list[str] = []
    for s in r.spelling:
        what = "words have another spelling of their sound"
        lines.append(f"{s.orthography}: {s.with_others} of {s.words} {what}")
        for word, others in s.examples:
            lines.append(f"  {_escaped(word)}: {', '.join(_escaped(o) for o in others)}")
    for g in r.reading:
        accounted = g.tokens - len(g.unaccounted)
        what = "readings related to their spellings"
        lines.append(f"{g.scheme} of {g.orthography}: {accounted} of {g.tokens} {what}")
        for u in g.unaccounted:
            lines.append(f"  {u.item}: {_escaped(u.surface)} {u.reading} (projection.unaccounted)")
    return lines
