"""The Tiberian reading of Biblical Hebrew (ADR 0082, 0084) → eSpeak NG phonemes, and IPA.

A word's pinned reading in the `tiberian` scheme is an SBL academic transliteration:
- consonants ʾ b ḇ g ḡ d ḏ h w z ḥ ṭ y k ḵ l m n s ʿ p p̄ ṣ q r ś š t ṯ, a doubled letter for a
  dagesh forte;
- vowels a ā e ē i o (qamets qatan) ō u, matres ê î ô û â, vocal shewa ə, hatefs ă ĕ ŏ;
- an acute on the stressed vowel where the stress is not on the last syllable (ʾéreṣ,
  šāmáyim); a final hyphen on a word joined by maqaf to the next, which has no stress of its own
  (ʾeṯ- hāʾôr).

The sounds follow Geoffrey Khan, *The Tiberian Pronunciation Tradition of Biblical Hebrew*,
vol. I (2020), checked against it (ADR 0084; § and printed pages):
- qamets (gadol and qatan) [ɔ], pataḥ [a], segol [ɛ], ṣere [e], ḥireq [i], ḥolem [o],
  qibbuṣ and shureq [u] (§I.2.1);
- length follows stress and the syllable: a vowel is long when stressed or in an open syllable,
  short in an unstressed closed one; ā ē ō and the vowels with a mater (â ê î ô û) are long
  everywhere (p. 277); a long vowel in a closed syllable ends in a short echo of itself, [ˈjoːom]
  (§I.2.4, pp. 288–291); shewa and the ḥaṭefs are short (Khan writes them [a], [ɛ], [ɔ]; the
  breve here marks them as reduced);
- vocal shewa is [a], but the following vowel before a guttural (ʾ h ḥ ʿ) and [i] before y; it
  is silent after a long vowel, [ʃɔːɔmˈʀ̟uː] for šāmərû (§I.2.5.6, p. 347), unless the next
  letter is the same one, [sɔːvaˈvuː] (§I.2.5.7.3); and silent under the first of two like letters
  after a short vowel, [hinˈniː] (p. 352);
- conjunctive û- is a short [wu] and the shewa after it is silent, [wuvmoːˈʃaːav] (pp. 176–178,
  §I.2.5.8.4);
- the begadkefat letters without dagesh are spirants [v ɣ→ʁ ð χ f θ] (ḵ and ḡ are uvular,
  pp. 154–156, 204–207); with dagesh k p t are aspirated [kʰ pʰ tʰ] (pp. 204, 213, 237); vav is
  [v]; a doubled yod is the stop [ɟɟ] (§I.1.10, p. 201);
- resh is an uvular [ʀ̟], and a pharyngealized [rˁ] after an alveolar (d z ṣ t ṭ s ś l n, also
  across a shewa or as the coda of a syllable such a letter begins) or before l or n (§I.1.20,
  pp. 223–231);
- ḥet [ħ], ʿayin [ʕ], ʾalef [ʔ] only where a vowel follows it; ṭet and ṣade pharyngealized,
  qof [q]; a doubled letter is long, but not at the end of a word (ʾatt [ˈʔaːatʰ], p. 415);
- a furtive pataḥ (rûaḥ) is a short [a] before the final guttural, never stressed, with a glide
  from the vowel before it: [w] after u and o, [j] after i and e (pp. 298–299);
- a final h after e ē o ō is a silent mater (śāḏeh), and the y of -āyw is silent (-āw).

Readings stay in SBL's convention (šāmərû, ûḇəmôšaḇ, hinənî): these rules say how the Tiberian
readers said them. Not modelled: gaʿya and its effects (§I.2.5.8), the half-long vowels,
deḥiq and secondary stress (sentence-level), segol-yod [ɛː] (SBL writes it ê, like ṣere-yod),
the backed pataḥ [ɑ] Khan writes beside ṭ ṣ rˁ (inconsistently), and coda ʾalef [ʔ].

What eSpeak NG's phoneme tables cannot say is approximated. The voice is eSpeak's Arabic
table, the one with [ħ ʕ q], the emphatics, [ɟ], [χ] and the trill: it has no [ɛ] or [ɔ], so
segol is said [e] and qamets as the backed [ɑ] of its emphatic context; no uvular [ʀ] or [ʁ], so
resh is its trill [r] and ḡ its [ɣ]; and an echo vowel is said as one long vowel (Khan: it was
barely heard); and its aspiration modifier cuts a word short, so k p t are said unaspirated.
No Modern Hebrew voice is used.
"""

from __future__ import annotations

import unicodedata
from dataclasses import dataclass, replace

# NFD combining marks of the scheme.
MACRON, CIRCUMFLEX, BREVE, ACUTE, CARON = "̄", "̂", "̆", "́", "̌"
DOT_BELOW, LINE_BELOW = "̣", "̱"

#: Khan's advanced uvular resh [ʀ̟], and its pharyngealized alveolar variant [rˁ].
UVULAR_R, ALVEOLAR_R = "ʀ̟", "rˤ"

#: Consonants (NFD spelling) → (IPA, eSpeak mnemonic in the ar table).
CONSONANTS: dict[str, tuple[str, str]] = {
    "ʾ": ("ʔ", "?"),
    "b": ("b", "b"),
    "b" + LINE_BELOW: ("v", "v"),
    "g": ("ɡ", "g"),
    "g" + MACRON: ("ʁ", "Q"),
    "d": ("d", "d"),
    "d" + LINE_BELOW: ("ð", "D"),
    "h": ("h", "h"),
    "w": ("v", "v"),
    "z": ("z", "z"),
    "h" + DOT_BELOW: ("ħ", "H"),
    "t" + DOT_BELOW: ("tˤ", "t["),
    "y": ("j", "j"),
    "k": ("k", "k"),
    "k" + LINE_BELOW: ("χ", "X"),
    "l": ("l", "l"),
    "m": ("m", "m"),
    "n": ("n", "n"),
    "s": ("s", "s"),
    "ʿ": ("ʕ", "A"),
    "p": ("p", "p"),
    "p" + MACRON: ("f", "f"),
    "s" + DOT_BELOW: ("sˤ", "s["),
    "q": ("q", "q"),
    "r": (UVULAR_R, "R"),
    "s" + ACUTE: ("s", "s"),
    "s" + CARON: ("ʃ", "S"),
    "t": ("t", "t"),
    "t" + LINE_BELOW: ("θ", "T"),
}
GUTTURALS = {"ʾ", "h", "h" + DOT_BELOW, "ʿ"}
#: Letters beside which resh is the alveolar [rˁ] (§I.1.20).
ALVEOLARS = {
    "d", "d" + LINE_BELOW, "z", "s" + DOT_BELOW, "t", "t" + LINE_BELOW, "t" + DOT_BELOW, "s",
    "s" + ACUTE, "l", "n",
}  # fmt: skip
#: Stops aspirated with dagesh: the aspiration is written after the letter (a doubled one too:
#: [ttʰ]). IPA only: eSpeak's aspiration modifier (#) cuts the rest of the word off.
ASPIRATED = {"k", "p", "t"}

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
#: Vowels long whatever the syllable (Khan p. 277): qamets gadol, ṣere, ḥolem, and those
#: with a mater.
LONG = {
    "a" + MACRON, "a" + CIRCUMFLEX, "e" + MACRON, "e" + CIRCUMFLEX, "i" + CIRCUMFLEX, "o" + MACRON,
    "o" + CIRCUMFLEX, "u" + CIRCUMFLEX,
}  # fmt: skip
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
    #: Aspiration, after the consonant (and after both halves' first, if doubled: [ttʰ]).
    aspirated: bool = False


def _shewa(following: list[Segment]) -> str:
    """Vocal shewa's quality (Khan): [a], the next vowel's before a guttural, [i] before y."""
    if following and following[0].kind == "C":
        if following[0].spelling in GUTTURALS and len(following) > 1 and following[1].kind == "V":
            quality = VOWELS[following[1].spelling]
            return "a" if quality == "ə" else quality
        if following[0].spelling == "y":
            return "i"
    return "a"


def _conjunctive(segs: list[Segment]) -> bool:
    """Whether the word starts with the conjunction û- (written וּ): a vowel before a consonant."""
    return len(segs) > 1 and segs[0].kind == "V" and segs[0].spelling == "u" + CIRCUMFLEX


def _silent_shewas(segs: list[Segment]) -> list[Segment]:
    """The reading without the shewas the Tiberian readers did not say (Khan §I.2.5.6–7): after a
    long vowel or the conjunction û-, unless the next letter is the same one; and under the first
    of two like letters after a short vowel."""
    out: list[Segment] = []
    for k, s in enumerate(segs):
        if s.spelling == "ə" and k >= 2 and segs[k - 1].kind == "C" and segs[k - 2].kind == "V":
            vowel = segs[k - 2]
            like = k + 1 < len(segs) and segs[k + 1].spelling == segs[k - 1].spelling
            long_ = vowel.spelling in LONG or vowel.stressed
            conjunction = k == 2 and _conjunctive(segs)
            if (conjunction and not like) or (long_ and not like) or (like and not long_):
                continue
        out.append(s)
    return out


def _resh(kept: list[Segment], k: int) -> str:
    """Resh's IPA (§I.1.20): [rˤ] after an alveolar (also across a vocal shewa, or as the coda of
    a syllable an alveolar begins) or before l or n (also across a shewa); else [ʀ̟]."""

    def at(i: int) -> Segment | None:
        return kept[i] if 0 <= i < len(kept) else None

    def alveolar(seg: Segment | None) -> bool:
        return seg is not None and seg.kind == "C" and seg.spelling in ALVEOLARS

    before, after = at(k - 1), at(k + 1)
    if alveolar(before):
        return ALVEOLAR_R
    if before is not None and before.spelling == "ə" and alveolar(at(k - 2)):
        return ALVEOLAR_R
    coda = after is None or after.kind == "C"
    if coda and before is not None and before.kind == "V" and alveolar(at(k - 2)):
        return ALVEOLAR_R
    following = at(k + 2) if after is not None and after.spelling == "ə" else after
    if following is not None and following.kind == "C" and following.spelling in {"l", "n"}:
        return ALVEOLAR_R
    return UVULAR_R


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
    kept = _silent_shewas(kept)
    conjunction = _conjunctive(kept)
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
    full = [
        k
        for k in vowels
        if kept[k].spelling not in REDUCED and k not in furtive and not (conjunction and k == 0)
    ]
    stress = None if proclitic else (marked[0] if marked else (full[-1] if full else None))
    out: list[Phone] = []
    for k, s in enumerate(kept):
        if s.kind == "C":
            ipa_, mnemonic = CONSONANTS[s.spelling]
            if s.spelling == "r":
                ipa_ = _resh(kept, k)
            prev = kept[k - 1] if k > 0 else None
            if prev is not None and prev.kind == "C" and prev.spelling == s.spelling:
                if k + 1 == len(kept):
                    continue  # no doubling at the end of a word: ʾatt [ˈʔaːatʰ]
                doubled = replace(out[-1], doubled=True)
                if s.spelling == "y":
                    doubled = replace(doubled, ipa="ɟ", espeak="J")  # [ɟɟ], §I.1.10
                out[-1] = doubled
            else:
                out.append(Phone(ipa_, mnemonic, aspirated=s.spelling in ASPIRATED))
            continue
        if conjunction and k == 0:
            out.extend([Phone("w", "w"), Phone("u", "u", vowel=True)])  # [wu], pp. 176–178
            continue
        if s.spelling == "ə":
            quality = _shewa(kept[k + 1 :])
            out.append(Phone(quality + BREVE, ESPEAK_VOWELS[quality], vowel=True))
            continue
        quality = VOWELS[s.spelling]
        if s.spelling in REDUCED:
            out.append(Phone(quality + BREVE, ESPEAK_VOWELS[quality], vowel=True))
            continue
        if k in furtive:
            before = VOWELS[kept[k - 1].spelling]
            glide = "w" if before in {"u", "o"} else "j" if before in {"i", "e", "ɛ"} else None
            if glide is not None:
                out.append(Phone(glide, glide))
            out.append(Phone(quality, ESPEAK_VOWELS[quality], vowel=True))
            continue
        # Closed: the vowel is followed by a consonant and then another consonant or the end.
        after = kept[k + 1 :]
        closed = bool(after) and after[0].kind == "C" and (len(after) == 1 or after[1].kind == "C")
        long_ = s.spelling in LONG or k == stress or not closed
        echo = quality if long_ and closed else ""  # a long vowel in a closed syllable, §I.2.4
        out.append(
            Phone(
                quality + ("ː" + echo if long_ else ""),
                ESPEAK_VOWELS[quality] + (":" if long_ else ""),
                vowel=True,
                stressed=k == stress,
            )
        )
    return out


def ipa(reading: str) -> str:
    """The word's IPA, the stress mark before its syllable: šāmáyim → ʃɔːˈmaːjim. A doubled
    letter is written twice (ʔatˈtʰɔː); reduced vowels (shewa, the ḥaṭefs) take a breve."""
    out: list[str] = []
    for p in phones(reading):
        if p.stressed:
            # Before the syllable's onset: the consonant right before the vowel, if there is one.
            onset = out.pop() if out and out[-1][-1] not in "aeiouɔɛːˈ" + BREVE else ""
            out.append("ˈ" + onset)
        release = "ʰ" if p.aspirated else ""
        if p.doubled:
            out.extend([p.ipa, p.ipa + release])
        else:
            out.append(p.ipa + release)
    return unicodedata.normalize("NFC", "".join(out))


def espeak(reading: str) -> str:
    """The word as eSpeak NG phoneme mnemonics for its ar table, in [[ ]]: stress before the
    stressed vowel, a long consonant for a doubled letter (as eSpeak spells a shadda). Stops are
    said unaspirated (see ASPIRATED)."""
    body = "".join(
        ("'" if p.stressed else "") + p.espeak + (":" if p.doubled else "") for p in phones(reading)
    )
    return f"[[{body}]]"
