"""Jyutping → IPA: phones for aligning and checking Cantonese audio, and IPA with tones for
synthesizers that read it.

eSpeak NG's Cantonese voice spells its phonemes in Jyutping-like strings ("aanɡ4"), which do
not match the IPA phones the speech model knows. This table gives the standard IPA of each
initial and final (Linguistic Society of Hong Kong), split into the phones the model uses:
long vowels marked, and aspirates written ph, th, kh, tsh as in its vocabulary. Tones are not
phones here: the model does not hear Cantonese tones, and the round-trip check compares
segments.
"""

from __future__ import annotations

import json
import re
from functools import cache

import regex

from nabu.paths import PROFILES

INITIALS: dict[str, list[str]] = {
    "b": ["p"],
    "p": ["ph"],
    "m": ["m"],
    "f": ["f"],
    "d": ["t"],
    "t": ["th"],
    "n": ["n"],
    "l": ["l"],
    "g": ["k"],
    "k": ["kh"],
    "ng": ["ŋ"],
    "h": ["h"],
    "gw": ["k", "w"],
    "kw": ["kh", "w"],
    "w": ["w"],
    "z": ["ts"],
    "c": ["tsh"],
    "s": ["s"],
    "j": ["j"],
}

# Nucleus and coda of every final.
FINALS: dict[str, list[str]] = {
    "aa": ["aː"], "aai": ["aː", "i"], "aau": ["aː", "u"], "aam": ["aː", "m"], "aan": ["aː", "n"],
    "aang": ["aː", "ŋ"], "aap": ["aː", "p"], "aat": ["aː", "t"], "aak": ["aː", "k"],
    "a": ["ɐ"], "ai": ["ɐ", "i"], "au": ["ɐ", "u"], "am": ["ɐ", "m"], "an": ["ɐ", "n"],
    "ang": ["ɐ", "ŋ"], "ap": ["ɐ", "p"], "at": ["ɐ", "t"], "ak": ["ɐ", "k"],
    "e": ["ɛː"], "ei": ["e", "i"], "eu": ["ɛː", "u"], "em": ["ɛː", "m"], "eng": ["ɛː", "ŋ"],
    "ep": ["ɛː", "p"], "ek": ["ɛː", "k"],
    "i": ["iː"], "iu": ["iː", "u"], "im": ["iː", "m"], "in": ["iː", "n"], "ing": ["ɪ", "ŋ"],
    "ip": ["iː", "p"], "it": ["iː", "t"], "ik": ["ɪ", "k"],
    "o": ["ɔː"], "oi": ["ɔː", "i"], "ou": ["o", "u"], "on": ["ɔː", "n"], "ong": ["ɔː", "ŋ"],
    "ot": ["ɔː", "t"], "ok": ["ɔː", "k"],
    "oe": ["œ"], "oeng": ["œ", "ŋ"], "oek": ["œ", "k"],
    "eoi": ["ɵ", "y"], "eon": ["ɵ", "n"], "eot": ["ɵ", "t"],
    "u": ["uː"], "ui": ["uː", "i"], "un": ["uː", "n"], "ung": ["ʊ", "ŋ"], "ut": ["uː", "t"],
    "uk": ["ʊ", "k"],
    "yu": ["yː"], "yun": ["yː", "n"], "yut": ["yː", "t"],
    # Syllabic nasals: m4 唔, ng5 五.
    "m": ["m"], "ng": ["ŋ"],
}  # fmt: skip

_SYLLABLE = re.compile(r"^(gw|kw|ng|[bpmfdtnlgkhwzcsj])?([a-z]+?)([1-6])$")


def syllable_phones(syllable: str) -> list[str]:
    """IPA phones of one Jyutping syllable with its tone number (tone dropped)."""
    s = syllable.strip().lower()
    if s in ("m1", "m2", "m3", "m4", "m5", "m6"):
        return ["m"]
    if re.fullmatch(r"ng[1-6]", s):
        return ["ŋ"]
    match = _SYLLABLE.match(s)
    if match is None:
        raise ValueError(f"not a Jyutping syllable: {syllable!r}")
    initial, final, _tone = match.groups()
    if final not in FINALS:
        raise ValueError(f"unknown Jyutping final {final!r} in {syllable!r}")
    return [*(INITIALS[initial] if initial else []), *FINALS[final]]


def phones(reading: str) -> list[str]:
    """IPA phones of a space-separated Jyutping reading."""
    return [p for syllable in reading.split() for p in syllable_phones(syllable)]


# IPA for synthesizers that read it (gameplan §10.1): standard symbols (aspiration ʰ, affricate
# ts, labialized kʷ), Chao tone letters, syllables joined by ".". Final stops are written
# plainly: Cantonese stops are unreleased anyway.
IPA_INITIALS: dict[str, str] = {
    "b": "p", "p": "pʰ", "m": "m", "f": "f", "d": "t", "t": "tʰ", "n": "n", "l": "l",
    "g": "k", "k": "kʰ", "ng": "ŋ", "h": "h", "gw": "kʷ", "kw": "kʷʰ", "w": "w",
    "z": "ts", "c": "tsʰ", "s": "s", "j": "j",
}  # fmt: skip
IPA_SYLLABIC = {"m": "m\u0329", "ng": "ŋ\u030d"}
# Tones 1-6 as Chao contours; checked syllables (stop codas) are short: 1, 3, 6 → 5, 3, 2.
TONES = {"1": "˥˥", "2": "˧˥", "3": "˧˧", "4": "˨˩", "5": "˨˧", "6": "˨˨"}
CHECKED_TONES = {"1": "˥", "3": "˧", "6": "˨"}


def syllable_ipa(syllable: str) -> str:
    """IPA of one Jyutping syllable, with its tone: "hong4" → "hɔːŋ˨˩"."""
    s = syllable.strip().lower()
    nasal = re.fullmatch(r"(m|ng)([1-6])", s)
    if nasal is not None:
        return IPA_SYLLABIC[nasal.group(1)] + TONES[nasal.group(2)]
    match = _SYLLABLE.match(s)
    if match is None or match.group(2) not in FINALS:
        raise ValueError(f"not a Jyutping syllable: {syllable!r}")
    initial, final, tone = match.groups()
    rhyme = "".join(FINALS[final])
    checked = final[-1] in "ptk"
    contour = CHECKED_TONES.get(tone, TONES[tone]) if checked else TONES[tone]
    return (IPA_INITIALS[initial] if initial else "") + rhyme + contour


def ipa(reading: str) -> str:
    """IPA of a space-separated Jyutping reading: "ngan4 hong4" → "ŋɐn˨˩.hɔːŋ˨˩"."""
    return ".".join(syllable_ipa(s) for s in reading.split())


@cache
def _table() -> dict[str, frozenset[str]]:
    data = json.loads((PROFILES / "tables" / "jyutping-ime.json").read_text(encoding="utf-8"))
    readings: dict[str, list[str]] = data["readings"]
    return {
        char: frozenset(r for entry in entries for r in entry.split(","))
        for char, entries in readings.items()
    }


def settled(surface: str, reading: str) -> bool:
    """Whether the spelling alone says the pinned reading: every character has exactly one
    reading in the character table (Unihan kCantonese), and it is the pinned one. Polyphones
    (行 hang4/hong4), colloquial readings (生 saang1) and particle tones (呀 aa3) are not."""
    chars: list[str] = regex.findall(r"\X", surface)
    syllables = reading.split()
    if len(chars) != len(syllables):
        return False
    table = _table()
    return all(table.get(c) == frozenset([s]) for c, s in zip(chars, syllables, strict=True))
