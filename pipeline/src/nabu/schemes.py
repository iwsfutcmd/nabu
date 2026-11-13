"""Reading schemes (ADR 0109): how a token's pinned reading is written, such as Jyutping, Pinyin,
Baxter's Middle Chinese, sitelen Lasina, the Tiberian reading or Attic with its vowel lengths.

What a scheme *is* is data: profiles/schemes/<id>.yaml (schemas/reading-scheme.schema.json), the
same files core reads (@nabu/schema/schemes): its language, how its readings divide, a typed
syllable's shape, its tones and their pitch. Shared rules are written once, against that data, and
pinned to core's by the conformance vectors (`syllables`, `tone`: conformance/pronounce.json).

What the pipeline *does* with a scheme's readings, where it can, is code, registered by scheme in
`plugins`: eSpeak NG phonemes and IPA for voices, whether a spelling settles a reading, phones for
alignment, a word card's citation form, and readings of written text for the round trip. A new
scheme is a data file; it needs code only for what voices and checks do with it.
"""

from __future__ import annotations

import unicodedata
from collections.abc import Callable
from dataclasses import dataclass
from functools import cache

import regex
import yaml

from nabu.paths import PROFILES
from nabu.schema.models import ReadingScheme

SCHEMES = PROFILES / "schemes"
#: IPA tone letters for Chao's 1 (lowest) to 5 (highest).
TONE_LETTERS = "˩˨˧˦˥"


@cache
def schemes() -> dict[str, ReadingScheme]:
    """Every reading scheme in profiles/schemes, by id."""
    out: dict[str, ReadingScheme] = {}
    for path in sorted(SCHEMES.glob("*.yaml")):
        data = ReadingScheme.model_validate(yaml.safe_load(path.read_text(encoding="utf-8")))
        if f"{data.id}.yaml" != path.name:
            raise ValueError(f"profiles/schemes/{path.name}: its id is {data.id}")
        out[data.id] = data
    return out


def scheme(name: str) -> ReadingScheme:
    """A reading scheme by its id; ValueError for one profiles/schemes does not have."""
    found = schemes().get(name)
    if found is None:
        raise ValueError(f"no reading scheme {name!r} in profiles/schemes")
    return found


# ------------------------------------------------------------------------- shared with core


def _lower(text: str, locale: str) -> str:
    """Lowercased in a locale. Python's mapping is Unicode's default, which is every scheme's
    locale's so far; a Turkic or Lithuanian one would need its own (core's caseFold)."""
    if locale.split("-")[0] in ("tr", "az", "lt"):
        raise NotImplementedError(f"lowercasing in {locale}")
    return text.lower()


def syllables(name: str, text: str) -> list[str] | None:
    """A reading as typed, in syllables as the scheme's data shapes them: lowercased, what may
    stand between syllables dropped, syllables end to end; None where it is not syllables. Core's
    readingSyllables (conformance: reading-syllables)."""
    typed = scheme(name).typed
    if typed is None:
        raise ValueError(f"no syllable shape for {name}")
    lowered = _lower(unicodedata.normalize("NFC", text), typed.locale)
    squeezed = regex.sub(typed.between, "", lowered)
    found: list[str] = regex.findall(typed.syllable, squeezed)
    return found if found and "".join(found) == squeezed else None


def find_syllables(name: str, text: str) -> list[str]:
    """Every syllable of the scheme's shape in `text`, whatever stands around them (an analyzer's
    or a recognizer's output: "nei5hou2")."""
    typed = scheme(name).typed
    if typed is None:
        raise ValueError(f"no syllable shape for {name}")
    return regex.findall(typed.syllable, _lower(unicodedata.normalize("NFC", text), typed.locale))


def tone(name: str, syllable: str) -> str | None:
    """A syllable's tone: its tone marks, where they are a tone of the scheme; None otherwise.
    Core's toneOf (conformance: reading-tone)."""
    tones = scheme(name).tones
    if tones is None:
        raise ValueError(f"no tones in {name}")
    marks = "".join(regex.findall(tones.marks, syllable))
    return marks if marks and marks in tones.values else None


def toneless(name: str, syllable: str) -> str:
    """A syllable without its tone marks: what syllables a tone apart share."""
    tones = scheme(name).tones
    return syllable if tones is None else regex.sub(tones.marks, "", syllable)


def tone_letters(name: str, value: str, checked: bool = False) -> str:
    """A tone's contour as IPA tone letters, from its data: 55 is ˥˥; in a checked syllable, its
    shorter contour where it has one."""
    tones = scheme(name).tones
    if tones is None or value not in tones.values:
        raise ValueError(f"no tone {value!r} in {name}")
    t = tones.values[value]
    letters = t.checked if checked and t.checked is not None else t.letters
    return "".join(TONE_LETTERS[int(d) - 1] for d in letters)


# ---------------------------------------------------------------------------- plug-ins


@dataclass(frozen=True)
class Plugins:
    """What the pipeline does with a scheme's readings, where it can (each optional)."""

    #: A word's reading as eSpeak NG phoneme input ([[...]]): a voice says it, never as text.
    espeak: Callable[[str], str] | None = None
    #: A word's reading as IPA a Piper voice takes ([[...]], its symbol table).
    piper: Callable[[str], str] | None = None
    #: A reading as IPA, for a voice that takes inline IPA (`pronounce`).
    ipa: Callable[[str], str] | None = None
    #: Whether a word's spelling alone says its reading (no IPA needed for it).
    settled: Callable[[str, str], bool] | None = None
    #: A reading's phones, as the aligner and the phone scorer know them.
    phones: Callable[[str], list[str]] | None = None
    #: A word's reading as a word card cites the word (Attic: the acute a sentence's grave is).
    cite: Callable[[str], str] | None = None
    #: Readings of written characters, one per grapheme (None where it has none): the round trip
    #: compares a transcript by reading where the language has a scheme that reads it.
    read: Callable[[list[str]], list[str | None]] | None = None


@cache
def plugins(name: str) -> Plugins:
    """The scheme's plug-ins; ValueError for a scheme with no data."""
    scheme(name)
    from nabu.audio import attic, jyutping, tiberian, toki_pona

    registry = {
        "jyutping": Plugins(
            ipa=jyutping.ipa,
            settled=jyutping.settled,
            phones=jyutping.phones,
            read=jyutping.of_characters,
        ),
        "tiberian": Plugins(espeak=tiberian.espeak, piper=tiberian.piper),
        "lasina": Plugins(espeak=toki_pona.espeak),
        "attic": Plugins(espeak=attic.espeak, piper=attic.piper, cite=attic.cited),
    }
    return registry.get(name, Plugins())


def reader(language: str) -> str | None:
    """The scheme that reads a language's written characters (Jyutping for Cantonese), if any."""
    return next(
        (s.id for s in schemes().values() if s.language == language and plugins(s.id).read),
        None,
    )
