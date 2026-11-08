"""Toki Pona as eSpeak NG phonemes (ADR 0085).

No synthesizer has a Toki Pona voice, but its sounds are few and every voice has them: the
consonants p t k s m n l j w and the vowels a e i o u, in syllables (C)V(n), the stress on the first
syllable of a word (pu). eSpeak NG's Esperanto table names these phonemes as Toki Pona spells them
(j is [j], w is [w]), so a word is given to it as phonemes, `[[t'oki]]`, never as text: read as
Esperanto text, jan would be januaro and the stress would fall on the penult.

The course pins each word's sitelen Lasina spelling as its `lasina` reading, and a voice with
`reading: lasina` says it through this conversion (`PHONEME_SCHEMES` in nabu.audio.course).
"""

from __future__ import annotations

import re

CONSONANTS = "ptksmnljw"
VOWELS = "aeiou"
# A syllable: an optional consonant, a vowel, and an n that no vowel follows (linja's lin-); or an
# n alone (the word n, hm). Names keep the same shape.
_SYLLABLE = re.compile(rf"[{CONSONANTS}]?[{VOWELS}](?:n(?![{VOWELS}]))?|n(?![{VOWELS}])")


class TokiPonaPhonemeError(ValueError):
    """A reading that is not a Toki Pona word: a letter outside the fourteen, or a cluster."""


def syllables(reading: str) -> list[str]:
    """A word's syllables: kepeken → ke pe ken, linja → lin ja, akesi → a ke si."""
    word = reading.lower()
    out: list[str] = []
    at = 0
    while at < len(word):
        m = _SYLLABLE.match(word, at)
        if m is None:
            raise TokiPonaPhonemeError(f"{reading!r} is not a Toki Pona word")
        out.append(m.group(0))
        at = m.end()
    if not out:
        raise TokiPonaPhonemeError("an empty reading")
    return out


def espeak(reading: str) -> str:
    """The word as eSpeak NG phoneme mnemonics for its eo table, in [[ ]], stressed on the first
    syllable: toki → [[t'oki]], akesi → [['akesi]]."""
    first, *rest = syllables(reading)
    at = next((i for i, c in enumerate(first) if c in VOWELS), 0)
    return f"[[{first[:at]}'{first[at:]}{''.join(rest)}]]"
