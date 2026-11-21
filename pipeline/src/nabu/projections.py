"""What a course's words leave to learn by the profiles' and schemes' statements (ADR 0148).

The statements are read by @nabu/core (packages/core/src/project), and this module only asks it,
through core-cli, one process for the whole course: never re-implement the reading here. For each
orthography of the course whose profile reads a word's sound off its spelling (`sound: {from:
spelling}`), how many of the course's distinct word spellings have another spelling of the same
sound (`sound-spellings`: a spelling leftover, what a spelling card can ask); for each scheme that
relates its readings to an orthography of the course (`of`), the tokens whose pinned reading its
statement cannot relate to their spelling (`reading-spells`): the review list.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass, field

from nabu.corecli import CoreCli
from nabu.items import Content, iter_items
from nabu.schema import OrthographyProfile
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


def _words(content: Content, orthography: str) -> list[str]:
    """The course's distinct word spellings in an orthography, in course order."""
    seen: dict[str, None] = {}
    for item in iter_items(content):
        for token in item.forms.get(orthography, []):
            if token.kind == "lexical":
                seen.setdefault(token.surface, None)
    return list(seen)


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


def report(
    content: Content,
    orthographies: Iterable[str],
    profiles: dict[str, OrthographyProfile],
    cli: CoreCli,
) -> Report:
    orths = list(orthographies)
    spelling: list[SpellingReport] = []
    for orth in orths:
        profile = profiles.get(orth)
        if profile is None or profile.sound is None or profile.sound.from_ != "spelling":
            continue
        words = _words(content, orth)
        traded: list[tuple[str, list[str]]] = []
        for word in words:
            normalized = str(cli.result("normalize", profile=orth, text=word))
            others = [str(s) for s in cli.result("sound-spellings", profile=orth, text=normalized)]
            if others:
                traded.append((word, others))
        spelling.append(SpellingReport(orth, len(words), len(traded), traded[:EXAMPLES]))
    reading: list[ReadingReport] = []
    for scheme in schemes().values():
        if scheme.of is None or str(scheme.of) not in orths:
            continue
        orth = str(scheme.of)
        tokens = 0
        missing: list[Unaccounted] = []
        for item, surface, value in _readings(content, orth, scheme.id):
            tokens += 1
            found = cli.result("reading-spells", scheme=scheme.id, reading=value, spelling=surface)
            if found is None:
                missing.append(Unaccounted(item, surface, value))
        reading.append(ReadingReport(scheme.id, orth, tokens, missing))
    return Report(spelling, reading)


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
