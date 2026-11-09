"""Attic Greek as eSpeak NG phonemes (ADR 0087).

The grc course pins each word's `attic` reading: the word as written, polytonic, with every α, ι
and υ that is not part of a diphthong marked long (macron, ᾱ) or short (breve, ᾰ), unless a
circumflex or an iota subscript already makes it long. The spelling settles everything else, so a
reading stripped of its macrons and breves is its token's surface.

A voice with `reading: attic` says the reading through this conversion (`PHONEME_SCHEMES` in
nabu.audio.course), as the reconstructed pronunciation of classical Attic in the Cambridge Grammar
of Classical Greek (CGCG, van Emde Boas et al. 2019), §§1.14–33:

- vowels (1.15): α [a]/[aː], ε [e], η [ɛː], ι [i]/[iː], ο [o], υ [y]/[yː], ω [ɔː];
- short diphthongs (1.21): αι [ai], ει [eː], οι [oi], υι [yj], αυ [au], ευ [eu], ου [oː];
- long diphthongs (1.22): ᾳ [aːi], ῃ [ɛːi], ῳ [ɔːi], ηυ [ɛːu];
- consonants (1.24–33): the aspirated stops φ θ χ [pʰ tʰ kʰ], never fricatives; ζ [zd]; ξ [ks];
  ψ [ps]; γ [ŋ] before γ κ χ ξ; ρ a trill; the rough breathing [h]; doubled letters long.

eSpeak NG's grc table has these phonemes but for two: aspiration (its `t#` is [tʰ]; `p#` and `k#`
cut the word off, so φ and χ are said [p]+[h], [k]+[h]), and the ι of a long diphthong (after a
long vowel its `I` is dropped, so it is the glide `j`).

The accent was a pitch accent (CGCG 24.1–2): the acute marks the highest pitch, the circumflex a
high pitch falling on a long vowel, the grave a final syllable's lower one before another word.
eSpeak NG gives a stress: the first acute or circumflex is the primary stress, a grave or a second
acute (an enclitic's, ἄνθρωπός ἐστιν) a secondary one. The pitch contour is not modelled.
"""

from __future__ import annotations

import unicodedata
from dataclasses import dataclass

ACUTE = "\u0301"
GRAVE = "\u0300"
CIRCUMFLEX = "\u0342"
SMOOTH = "\u0313"
ROUGH = "\u0314"
SUBSCRIPT = "\u0345"
DIAERESIS = "\u0308"
MACRON = "\u0304"
BREVE = "\u0306"
QUANTITY = {MACRON, BREVE}
MARKS = {ACUTE, GRAVE, CIRCUMFLEX, SMOOTH, ROUGH, SUBSCRIPT, DIAERESIS, MACRON, BREVE}

VOWELS = "αεηιουω"
DICHRONA = "αιυ"
# Elision marks and joiners: not sounds.
SILENT = {"’", "ʼ", "᾽", "᾿", "'", "-"}

# Consonant letter → (eSpeak NG grc mnemonic, IPA).
CONSONANTS: dict[str, tuple[str, str]] = {
    "β": ("b", "b"),
    "γ": ("g", "g"),
    "δ": ("d", "d"),
    "ζ": ("zd", "zd"),
    "θ": ("t#", "tʰ"),
    "κ": ("k", "k"),
    "λ": ("l", "l"),
    "μ": ("m", "m"),
    "ν": ("n", "n"),
    "ξ": ("ks", "ks"),
    "π": ("p", "p"),
    "ρ": ("R", "r"),
    "σ": ("s", "s"),
    "τ": ("t", "t"),
    "φ": ("ph", "pʰ"),
    "χ": ("kh", "kʰ"),
    "ψ": ("ps", "ps"),
}
VELARS = "γκχξ"

# Monophthongs: (letter, long) → (eSpeak, IPA).
MONOPHTHONGS: dict[tuple[str, bool], tuple[str, str]] = {
    ("α", False): ("a", "a"),
    ("α", True): ("a:", "aː"),
    ("ε", False): ("e", "e"),
    ("η", True): ("E:", "ɛː"),
    ("ι", False): ("i", "i"),
    ("ι", True): ("i:", "iː"),
    ("ο", False): ("o", "o"),
    ("υ", False): ("y", "y"),
    ("υ", True): ("y:", "yː"),
    ("ω", True): ("O:", "ɔː"),
}
DIPHTHONGS: dict[str, tuple[str, str]] = {
    "αι": ("aI", "ai"),
    "ει": ("e:", "eː"),
    "οι": ("oI", "oi"),
    "υι": ("yI", "yj"),
    "αυ": ("aU", "au"),
    "ευ": ("eU", "eu"),
    "ου": ("o:", "oː"),
    "ηυ": ("E:U", "ɛːu"),
}
# With an iota subscript: the long diphthongs.
LONG_DIPHTHONGS: dict[str, tuple[str, str]] = {
    "α": ("a:j", "aːi"),
    "η": ("E:j", "ɛːi"),
    "ω": ("O:j", "ɔːi"),
}


class AtticReadingError(ValueError):
    """A reading that cannot be said: an α, ι or υ whose length is unmarked, or a letter outside
    the Greek alphabet."""


@dataclass(frozen=True)
class Letter:
    base: str
    marks: frozenset[str]


@dataclass(frozen=True)
class Phone:
    espeak: str
    ipa: str
    vowel: bool = False
    accent: str | None = None  # ACUTE, CIRCUMFLEX or GRAVE on a vowel


def letters(reading: str) -> list[Letter]:
    """The reading as letters with their marks, lowercased (names are capitalized), ς as σ."""
    out: list[Letter] = []
    for ch in unicodedata.normalize("NFD", reading):
        if unicodedata.combining(ch):
            if not out:
                raise AtticReadingError(f"{reading!r} starts with a mark")
            if ch not in MARKS:
                raise AtticReadingError(f"{reading!r} has the mark U+{ord(ch):04X}")
            last = out[-1]
            out[-1] = Letter(last.base, last.marks | {ch})
            continue
        if ch in SILENT:
            continue
        base = ch.lower().replace("ς", "σ")
        if base not in VOWELS and base not in CONSONANTS:
            raise AtticReadingError(f"{reading!r} has {ch!r}, not a Greek letter")
        out.append(Letter(base, frozenset()))
    return out


def surface(reading: str) -> str:
    """The written word: the reading without its macrons and breves."""
    kept = "".join(c for c in unicodedata.normalize("NFD", reading) if c not in QUANTITY)
    return unicodedata.normalize("NFC", kept)


def cited(word: str) -> str:
    """The word as a dictionary or a word card gives it: a grave, which stands on a final syllable
    before another word (CGCG 24.2), is the acute it replaces (καὶ → καί)."""
    return unicodedata.normalize("NFC", unicodedata.normalize("NFD", word).replace(GRAVE, ACUTE))


def _accent(*ls: Letter) -> str | None:
    for letter in ls:
        for a in (ACUTE, CIRCUMFLEX, GRAVE):
            if a in letter.marks:
                return a
    return None


def _diphthong(first: Letter, second: Letter) -> bool:
    """Whether two vowel letters are one diphthong: the marks stand on the second (CGCG 1.8),
    which has no diaeresis."""
    if first.base + second.base not in DIPHTHONGS:
        return False
    if DIAERESIS in second.marks or SUBSCRIPT in first.marks:
        return False
    return not (first.marks & {ACUTE, GRAVE, CIRCUMFLEX, SMOOTH, ROUGH, MACRON, BREVE})


def phones(reading: str) -> list[Phone]:
    """The reading's sounds, in order."""
    ls = letters(reading)
    out: list[Phone] = []
    i = 0
    while i < len(ls):
        letter = ls[i]
        if letter.base in CONSONANTS:
            nxt = ls[i + 1] if i + 1 < len(ls) else None
            if letter.base == "γ" and nxt is not None and nxt.base in VELARS:
                out.append(Phone("N", "ŋ"))
            elif nxt is not None and nxt.base == letter.base and letter.base != "γ":
                es, ipa = CONSONANTS[letter.base]
                out.append(Phone(es + ":", ipa + ipa))
                i += 2
                continue
            else:
                out.append(Phone(*CONSONANTS[letter.base]))
            i += 1
            continue
        nxt = ls[i + 1] if i + 1 < len(ls) else None
        if nxt is not None and nxt.base in "ιυ" and _diphthong(letter, nxt):
            if ROUGH in nxt.marks:
                out.append(Phone("h", "h"))
            es, ipa = DIPHTHONGS[letter.base + nxt.base]
            out.append(Phone(es, ipa, vowel=True, accent=_accent(nxt)))
            i += 2
            continue
        if ROUGH in letter.marks:
            out.append(Phone("h", "h"))
        accent = _accent(letter)
        if SUBSCRIPT in letter.marks:
            if letter.base not in LONG_DIPHTHONGS:
                raise AtticReadingError(f"{reading!r}: an iota subscript under {letter.base}")
            out.append(Phone(*LONG_DIPHTHONGS[letter.base], vowel=True, accent=accent))
            i += 1
            continue
        if letter.base in DICHRONA:
            if MACRON in letter.marks or CIRCUMFLEX in letter.marks:
                long = True
            elif BREVE in letter.marks:
                long = False
            else:
                raise AtticReadingError(
                    f"{reading!r}: the length of {letter.base} is unmarked "
                    "(write a macron or a breve)"
                )
        else:
            long = letter.base in "ηω"
        out.append(Phone(*MONOPHTHONGS[(letter.base, long)], vowel=True, accent=accent))
        i += 1
    # An elided monosyllable (δ’, γ’, τ’) is its consonant alone, said with the next word.
    if not any(p.vowel for p in out) and not any(c in SILENT - {"-"} for c in reading):
        raise AtticReadingError(f"{reading!r} has no vowel")
    return out


def unmarked(reading: str) -> list[str]:
    """Why the reading cannot be said, if it cannot (an unmarked length, a stray letter)."""
    try:
        phones(reading)
    except AtticReadingError as e:
        return [str(e)]
    return []


def espeak(reading: str) -> str:
    """The word as eSpeak NG phoneme mnemonics for its grc table, in [[ ]]: the first acute or
    circumflex is the primary stress, a grave or another acute a secondary one."""
    body: list[str] = []
    primary = False
    for p in phones(reading):
        if p.accent in (ACUTE, CIRCUMFLEX) and not primary:
            body.append("'")
            primary = True
        elif p.accent is not None:
            body.append(",")
        body.append(p.espeak)
    return f"[[{''.join(body)}]]"


def ipa(reading: str) -> str:
    """The word in IPA as CGCG §1.15 writes it, the accent marked on its vowel."""
    out: list[str] = []
    for p in phones(reading):
        if p.accent is None:
            out.append(p.ipa)
        else:
            out.append(
                unicodedata.normalize(
                    "NFC",
                    p.ipa[0]
                    + {ACUTE: "\u0301", CIRCUMFLEX: "\u0302", GRAVE: "\u0300"}[p.accent]
                    + p.ipa[1:],
                )
            )
    return "".join(out)


def piper(reading: str) -> str:
    """The word as IPA phonemes for a Piper voice, in [[ ]] (ADR 0087): one symbol per code
    point (aspiration and length as their own marks, tʰ, aː), the stress marks before the vowel
    as `espeak` places them. Piper's voices share eSpeak NG's IPA symbol table, so a voice of
    another language says them without reading Greek text."""
    body: list[str] = []
    primary = False
    for p in phones(reading):
        if p.accent in (ACUTE, CIRCUMFLEX) and not primary:
            body.append("\u02c8")
            primary = True
        elif p.accent is not None:
            body.append("\u02cc")
        body.append(unicodedata.normalize("NFD", p.ipa))
    return f"[[{''.join(body)}]]"
