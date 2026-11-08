"""The Tiberian reading of Biblical Hebrew (ADR 0081) → eSpeak NG phonemes, and IPA.

A word's pinned reading in the `tiberian` scheme is an SBL academic transliteration:
- consonants ʾ b ḇ g ḡ d ḏ h w z ḥ ṭ y k ḵ l m n s ʿ p p̄ ṣ q r ś š t ṯ, a doubled letter for a
  dagesh forte;
- vowels a ā e ē i o (qamets qatan) ō u, matres ê î ô û â, vocal shewa ə, hatefs ă ĕ ŏ;
- an acute on the stressed vowel where the stress is not on the last syllable (ʾéreṣ,
  šāmáyim); a final hyphen on a word joined by maqaf to the next, which has no stress of its own
  (ʾeṯ- hāʾôr).

The sounds follow Geoffrey Khan's description of the Tiberian tradition (*The Tiberian
Pronunciation Tradition of Biblical Hebrew*, 2020):
- qamets (gadol and qatan) [ɔ], pataḥ [a], segol [ɛ], ṣere [e], ḥireq [i], ḥolem [o],
  qibbuṣ and shureq [u];
- vowel length follows stress and the syllable: long when stressed or in an open syllable,
  short in an unstressed closed one; shewa and the ḥaṭefs are short;
- vocal shewa is [a], but the following vowel before a guttural (ʾ h ḥ ʿ) and [i] before y;
- the begadkefat letters without dagesh are spirants [v ɣ ð x f θ]; vav is [v];
- ḥet [ħ], ʿayin [ʕ], ʾalef [ʔ] only where a vowel follows it; ṭet and ṣade pharyngealized,
  qof [q]; a doubled letter is long;
- a furtive pataḥ (rûaḥ) is a short [a] glide before the final guttural, never stressed;
- a final h after e ē o ō is a silent mater (śāḏeh), and the y of -āyw is silent (-āw).

What eSpeak NG's phoneme tables cannot say is approximated. The voice is eSpeak's Arabic
table, the one with [ħ ʕ q] and the emphatics: it has no [ɛ] or [ɔ], so segol is said [e] and
qamets as the backed [ɑ] of its emphatic context; and it has no uvular resh, so resh is the
alveolar [r] Khan describes beside alveolars, everywhere. No Modern Hebrew voice is used.
"""

from __future__ import annotations

import unicodedata
from dataclasses import dataclass, replace

# NFD combining marks of the scheme.
MACRON, CIRCUMFLEX, BREVE, ACUTE, CARON = "̄", "̂", "̆", "́", "̌"
DOT_BELOW, LINE_BELOW = "̣", "̱"

#: Consonants (NFD spelling) → (IPA, eSpeak mnemonic in the ar table).
CONSONANTS: dict[str, tuple[str, str]] = {
    "ʾ": ("ʔ", "?"),
    "b": ("b", "b"),
    "b" + LINE_BELOW: ("v", "v"),
    "g": ("ɡ", "g"),
    "g" + MACRON: ("ɣ", "Q"),
    "d": ("d", "d"),
    "d" + LINE_BELOW: ("ð", "D"),
    "h": ("h", "h"),
    "w": ("v", "v"),
    "z": ("z", "z"),
    "h" + DOT_BELOW: ("ħ", "H"),
    "t" + DOT_BELOW: ("tˤ", "t["),
    "y": ("j", "j"),
    "k": ("k", "k"),
    "k" + LINE_BELOW: ("x", "x"),
    "l": ("l", "l"),
    "m": ("m", "m"),
    "n": ("n", "n"),
    "s": ("s", "s"),
    "ʿ": ("ʕ", "A"),
    "p": ("p", "p"),
    "p" + MACRON: ("f", "f"),
    "s" + DOT_BELOW: ("sˤ", "s["),
    "q": ("q", "q"),
    "r": ("r", "r"),
    "s" + ACUTE: ("s", "s"),
    "s" + CARON: ("ʃ", "S"),
    "t": ("t", "t"),
    "t" + LINE_BELOW: ("θ", "T"),
}
GUTTURALS = {"ʾ", "h", "h" + DOT_BELOW, "ʿ"}

#: Vowels (NFD, without stress) → quality: one of the scheme's seven Tiberian qualities.
VOWELS: dict[str, str] = {
    "a": "a",
    "a" + MACRON: "ɔ",
    "a" + CIRCUMFLEX: "ɔ",  # final qamets he
    "e": "ɛ",
    "e" + MACRON: "e",
    "e" + CIRCUMFLEX: "e",  # ṣere or segol yod; SBL writes both ê
    "i": "i",
    "i" + CIRCUMFLEX: "i",
    "o": "ɔ",  # qamets qatan
    "o" + MACRON: "o",
    "o" + CIRCUMFLEX: "o",
    "u": "u",
    "u" + CIRCUMFLEX: "u",
    "a" + BREVE: "a",
    "e" + BREVE: "ɛ",
    "o" + BREVE: "ɔ",
    "ə": "ə",
}
#: Vowels that are short whatever the syllable: shewa and the ḥaṭefs.
REDUCED = {"ə", "a" + BREVE, "e" + BREVE, "o" + BREVE}
#: Tiberian quality → eSpeak mnemonic (the ar table has no ɛ or ɔ; see the module docstring).
ESPEAK_VOWELS = {"a": "a", "ɔ": "a.", "e": "e", "ɛ": "e", "i": "i", "o": "o", "u": "u"}
#: Vowels after which a final h is a silent mater lectionis.
MATER_H = {"e", "e" + MACRON, "o", "o" + MACRON}


@dataclass(frozen=True)
class Segment:
    kind: str  # "C" or "V"
    spelling: str  # NFD, stress mark removed
    stressed: bool = False


def segments(reading: str) -> list[Segment]:
    """A word's reading split into consonants and vowels (NFD), stress noted on its vowel."""
    text = unicodedata.normalize("NFD", reading.strip().lower()).removesuffix("-")
    out: list[Segment] = []
    i = 0
    while i < len(text):
        base = text[i]
        j = i + 1
        while j < len(text) and unicodedata.combining(text[j]):
            j += 1
        marks = text[i + 1 : j]
        stressed = ACUTE in marks and base in "aeiouə"
        spelling = base + (marks.replace(ACUTE, "") if stressed else marks)
        if spelling in VOWELS:
            out.append(Segment("V", spelling, stressed))
        elif spelling in CONSONANTS:
            out.append(Segment("C", spelling))
        else:
            raise ValueError(f"{reading!r}: {spelling!r} is not in the tiberian scheme")
        i = j
    return out


@dataclass(frozen=True)
class Phone:
    ipa: str
    espeak: str
    vowel: bool = False
    stressed: bool = False
    #: A consonant written twice (dagesh forte): said long.
    doubled: bool = False


def _shewa(following: list[Segment]) -> str:
    """Vocal shewa's quality (Khan): [a], the next vowel's before a guttural, [i] before y."""
    if following and following[0].kind == "C":
        if following[0].spelling in GUTTURALS and len(following) > 1 and following[1].kind == "V":
            quality = VOWELS[following[1].spelling]
            return "a" if quality == "ə" else quality
        if following[0].spelling == "y":
            return "i"
    return "a"


def phones(reading: str) -> list[Phone]:
    """A word's phones in order.

    Stress falls on the vowel the reading marks, else on the last full vowel (a furtive pataḥ
    never takes it); a word ending in a hyphen (joined by maqaf) has none."""
    proclitic = reading.strip().endswith("-")
    segs = segments(reading)
    # Silent letters: ʾ with no vowel after it; a final mater h; the y of -āyw.
    kept: list[Segment] = []
    for k, s in enumerate(segs):
        nxt = segs[k + 1] if k + 1 < len(segs) else None
        prev = segs[k - 1] if k > 0 else None
        if s.kind == "C" and s.spelling == "ʾ" and (nxt is None or nxt.kind != "V"):
            continue
        if (
            s.kind == "C"
            and s.spelling == "h"
            and nxt is None
            and prev is not None
            and prev.kind == "V"
            and prev.spelling in MATER_H
        ):
            continue
        if (
            s.kind == "C"
            and s.spelling == "y"
            and prev is not None
            and prev.spelling == "a" + MACRON
            and nxt is not None
            and nxt.spelling == "w"
            and k + 2 == len(segs)
        ):
            continue
        kept.append(s)
    vowels = [k for k, s in enumerate(kept) if s.kind == "V"]
    # A furtive pataḥ: a right after another vowel, before the word's last consonant.
    furtive = {
        k
        for k in vowels
        if kept[k].spelling == "a"
        and k > 0
        and kept[k - 1].kind == "V"
        and k + 2 == len(kept)
        and kept[k + 1].kind == "C"
    }
    marked = [k for k in vowels if kept[k].stressed]
    full = [k for k in vowels if kept[k].spelling not in REDUCED and k not in furtive]
    stress = None if proclitic else (marked[0] if marked else (full[-1] if full else None))
    out: list[Phone] = []
    for k, s in enumerate(kept):
        if s.kind == "C":
            ipa_, mnemonic = CONSONANTS[s.spelling]
            prev = kept[k - 1] if k > 0 else None
            if prev is not None and prev.kind == "C" and prev.spelling == s.spelling:
                out[-1] = replace(out[-1], doubled=True)  # a doubled letter: one long consonant
            else:
                out.append(Phone(ipa_, mnemonic))
            continue
        if s.spelling == "ə":
            quality = _shewa(kept[k + 1 :])
            out.append(Phone(quality + BREVE, ESPEAK_VOWELS[quality], vowel=True))
            continue
        quality = VOWELS[s.spelling]
        # Open syllable: the vowel is followed by at most one consonant and then a vowel.
        after = kept[k + 1 :]
        closed = bool(after) and after[0].kind == "C" and (len(after) == 1 or after[1].kind == "C")
        long_ = s.spelling not in REDUCED and k not in furtive and (k == stress or not closed)
        if s.spelling in REDUCED:
            out.append(Phone(quality + BREVE, ESPEAK_VOWELS[quality], vowel=True))
        else:
            out.append(
                Phone(
                    quality + ("ː" if long_ else ""),
                    ESPEAK_VOWELS[quality] + (":" if long_ else ""),
                    vowel=True,
                    stressed=k == stress,
                )
            )
    return out


def ipa(reading: str) -> str:
    """The word's IPA, the stress mark before its syllable: šāmáyim → ʃɔːˈmaːjim. A doubled
    letter is written twice (ʔatˈtɔː); reduced vowels (shewa, the ḥaṭefs) take a breve."""
    out: list[str] = []
    for p in phones(reading):
        if p.stressed:
            # Before the syllable's onset: the consonant right before the vowel, if there is one.
            onset = out.pop() if out and out[-1][-1] not in "aeiouɔɛːˈ" + BREVE else ""
            out.append("ˈ" + onset)
        if p.doubled:
            out.extend([p.ipa, p.ipa])
        else:
            out.append(p.ipa)
    return unicodedata.normalize("NFC", "".join(out))


def espeak(reading: str) -> str:
    """The word as eSpeak NG phoneme mnemonics for its ar table, in [[ ]]: stress before the
    stressed vowel, a long consonant for a doubled letter (as eSpeak spells a shadda)."""
    body = "".join(
        ("'" if p.stressed else "") + p.espeak + (":" if p.doubled else "") for p in phones(reading)
    )
    return f"[[{body}]]"
