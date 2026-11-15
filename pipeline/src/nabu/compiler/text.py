"""Text handling for the compiler: tokens from authored forms, ruby, and the hygiene audits of
§7.5 stage 2. Python indexes by code point; grapheme clusters come from `regex`'s \\X.

What a script is comes from Unicode (its Script_Extensions, through `regex`), so text in any
script Unicode encodes needs nothing here. One it does not encode (a private-use subtag:
sitelen pona's Qaap, ADR 0086) is what its orthography profile says it is (`Script`)."""

from __future__ import annotations

import unicodedata
from dataclasses import dataclass
from functools import cache
from typing import Any

import regex

GRAPHEME = regex.compile(r"\X")
# A word may hold an apostrophe between letters: English I'm and name's are one word, one tile.
_LETTERS = r"[\p{L}\p{M}\p{N}\u200c\u200d]+(?:['\u2019][\p{L}\p{M}\p{N}]+)*"
WORD = regex.compile(_LETTERS)
WORDCHAR = regex.compile(r"[\p{L}\p{M}\p{N}]")
HAN = regex.compile(r"\p{Han}")

#: ISO 15924 codes for a variant or a mix of scripts: Unicode's Script property has only the
#: scripts themselves (Hant is Han; Jpan is Han, Hiragana and Katakana).
SCRIPT_VARIANTS: dict[str, tuple[str, ...]] = {
    "Aran": ("Arab",),
    "Cyrs": ("Cyrl",),
    "Geok": ("Geor",),
    "Hanb": ("Hani", "Bopo"),
    "Hans": ("Hani",),
    "Hant": ("Hani",),
    "Hrkt": ("Hira", "Kana"),
    "Jamo": ("Hang",),
    "Jpan": ("Hani", "Hira", "Kana"),
    "Kore": ("Hang", "Hani"),
    "Latf": ("Latn",),
    "Latg": ("Latn",),
    "Syre": ("Syrc",),
    "Syrj": ("Syrc",),
    "Syrn": ("Syrc",),
}


def unicode_scripts(code: str) -> tuple[str, ...] | None:
    """The Unicode scripts an ISO 15924 subtag stands for (Ethi; Jpan: Hani, Hira and Kana), or
    None for one Unicode does not encode: a private-use code (Qaaa..Qabx), such as sitelen
    pona's Qaap."""
    if code in SCRIPT_VARIANTS:
        return SCRIPT_VARIANTS[code]
    if regex.fullmatch(r"[A-Z][a-z]{3}", code) is None:
        return None
    try:
        regex.compile(rf"\p{{Script={code}}}")
    except regex.error:
        return None
    return (code,)


@dataclass(frozen=True)
class Script:
    """An orthography's script, as text handling needs it: its ISO 15924 subtag (`code`) and the
    Unicode scripts its letters belong to (`unicode`). A script Unicode does not encode has none:
    its characters are `own`, its profile's exemplars, of which `logographs` are each a word, and
    the logographs between a `cartouche`'s marks are a name, one word too (sitelen pona)."""

    code: str
    unicode: tuple[str, ...] | None
    own: frozenset[str] = frozenset()
    logographs: frozenset[str] = frozenset()
    cartouche: tuple[str, str] | None = None
    #: The reading scheme this orthography writes its words in: the one whose `answer` it is
    #: (Jyutping for yue-Latn/jyutping, ADR 0126). Its words are that scheme's syllables, and
    #: carry their characters as ruby, one above each syllable.
    syllables: str | None = None


def syllable_bases(surface: str, script: Script | None) -> list[str] | None:
    """A word written in its script's reading scheme, as ruby bases: each syllable with what
    stands after it before the next (a space), so the bases make up the word. None if the script
    writes no scheme, or the word is not all that scheme's syllables."""
    if script is None or script.syllables is None or not surface:
        return None
    shape = _syllable_shape(script.syllables)
    if shape is None:
        return None
    syllable, between = shape
    found = list(syllable.finditer(surface))
    if not found or found[0].start() != 0:
        return None
    bases: list[str] = []
    for i, m in enumerate(found):
        end = found[i + 1].start() if i + 1 < len(found) else len(surface)
        if between.fullmatch(surface[m.end() : end]) is None:
            return None
        bases.append(surface[m.start() : end])
    return bases


@cache
def _syllable_shape(name: str) -> tuple[regex.Pattern[str], regex.Pattern[str]] | None:
    """A scheme's typed syllable, and what may stand between two (its data, ADR 0109)."""
    from nabu.schemes import scheme

    typed = scheme(name).typed
    if typed is None:
        return None
    return regex.compile(typed.syllable), regex.compile(f"(?:{typed.between})*")


@cache
def _logograph_words(
    logographs: frozenset[str], cartouche: tuple[str, str] | None
) -> regex.Pattern[str]:
    one = "[" + "".join(regex.escape(c) for c in sorted(logographs)) + "]"
    if cartouche is None:
        return regex.compile(f"{one}|{_LETTERS}")
    name = f"{regex.escape(cartouche[0])}{one}*{regex.escape(cartouche[1])}"
    return regex.compile(f"{name}|{one}|{_LETTERS}")


def words_of(script: Script | None) -> regex.Pattern[str]:
    """A word of text in this script: a run of letters, marks and numbers, with any apostrophe
    between letters; where the script writes words as logographs, run together (sitelen pona),
    each logograph, and a whole cartouche, a name."""
    if script is None or not script.logographs:
        return WORD
    return _logograph_words(script.logographs, script.cartouche)


def ruby_bearing(surface: str, script: Script | None = None) -> bool:
    """Whether a word token carries ruby readings: Han characters (a Han word carries its
    Jyutping), the script's logographs (sitelen pona's carry their sitelen Lasina word), or the
    syllables of the scheme the script writes (a Jyutping word carries its characters). A name
    in a cartouche carries none."""
    if HAN.search(surface):
        return True
    if syllable_bases(surface, script) is not None:
        return True
    return script is not None and surface != "" and all(c in script.logographs for c in surface)


# Never allowed in content (§7.5): bidi embeddings/overrides/isolates, BOM, ZWSP, word joiner.
# LRM/RLM/ALM are also flagged: content direction comes from the script, never from marks.
ALWAYS_INVISIBLE = set(
    map(
        chr,
        (
            0x200B,
            0x200E,
            0x200F,
            0x061C,
            0x2060,
            0xFEFF,
            *range(0x202A, 0x202F),
            *range(0x2066, 0x206A),
        ),
    )
)
ZWNJ, ZWJ = "\u200c", "\u200d"


def graphemes(text: str) -> list[str]:
    return GRAPHEME.findall(text)


def token_kind(surface: str) -> str:
    if surface.isspace():
        return "space"
    if all(unicodedata.category(c) == "Nd" for c in surface):
        return "number"
    cats = {unicodedata.category(c)[0] for c in surface}
    if cats <= {"P"}:
        return "punct"
    if cats <= {"S"}:
        return "symbol"
    return "word"


def gap_tokens(gap: str) -> list[dict[str, Any]]:
    """Whitespace runs become space tokens; anything else, one token per grapheme cluster."""
    out: list[dict[str, Any]] = []
    for m in regex.finditer(r"\s+|\X", gap):
        piece = m.group(0)
        out.append({"surface": piece, "kind": token_kind(piece)})
    return out


def align(text: str, tokens: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], str | None]:
    """Places authored tokens in `text` in order. Returns (tokens incl. gaps, error)."""
    out: list[dict[str, Any]] = []
    pos = 0
    for tok in tokens:
        surface = tok["surface"]
        at = text.find(surface, pos)
        if at < 0:
            return out, f"token {surface!r} not found after position {pos} in {text!r}"
        gap = text[pos:at]
        if WORDCHAR.search(gap):
            return out, f"untokenized text {gap!r} before {surface!r}"
        out.extend(gap_tokens(gap))
        out.append(dict(tok))
        pos = at + len(surface)
    tail = text[pos:]
    if WORDCHAR.search(tail):
        return out, f"untokenized text {tail!r} at the end"
    out.extend(gap_tokens(tail))
    return out, None


def auto_tokens(
    text: str, segment: Any = None, script: Script | None = None
) -> list[dict[str, Any]]:
    """Tokens for text without authored tokens: words (`words_of` the text's script), or an
    analyzer's segmentation of them."""
    if syllable_bases(text, script) is not None:
        # A text that is one word of the scheme's syllables (a KC form: hok6 saang1) is one word.
        return [{"surface": text, "kind": "word"}]
    words: list[dict[str, Any]] = []
    for m in words_of(script).finditer(text):
        pieces = segment(m.group(0)) if segment is not None else None
        words.extend({"surface": p} for p in (pieces or [m.group(0)]))
    toks, error = align(text, words)
    assert error is None, error
    for t in toks:
        t.setdefault("kind", token_kind(t["surface"]))
    return toks


def ruby_segments(
    surface: str, reading: str, script: Script | None = None
) -> list[dict[str, str]] | None:
    """One ruby segment per grapheme when the syllables line up, else None. A word in its
    script's reading scheme (Jyutping) takes one character over each syllable instead."""
    syllabic = syllable_bases(surface, script)
    bases = syllabic if syllabic is not None else graphemes(surface)
    texts = graphemes(reading) if syllabic is not None else reading.split()
    if len(texts) != len(bases):
        return None
    return [{"base": b, "text": s} for b, s in zip(bases, texts, strict=True)]


def invisible_chars(text: str, allowed: set[str]) -> list[str]:
    return sorted(
        {c for c in text if (c in ALWAYS_INVISIBLE or c in (ZWNJ, ZWJ)) and c not in allowed}
    )


# Letters of every script: Common (the Uzbek okina, the tatweel) and Inherited.
_COMMON = regex.compile(r"[\p{Script=Common}\p{Script=Inherited}]")


@cache
def _letters_of(scripts: tuple[str, ...]) -> regex.Pattern[str]:
    return regex.compile("[" + "".join(rf"\p{{Script_Extensions={s}}}" for s in scripts) + "]")


def foreign_letters(word: str, script: Script) -> list[str]:
    """Letters in `word` from a script other than the orthography's (mixed-script confusables).
    A letter is the orthography's when it is Common or Inherited, when its Script_Extensions has
    one of the orthography's scripts, or, in a script Unicode does not encode, when its profile
    lists it."""
    ours = None if script.unicode is None else _letters_of(script.unicode)
    return sorted(
        {
            c
            for c in word
            if unicodedata.category(c)[0] == "L"
            and _COMMON.match(c) is None
            and not (c in script.own if ours is None else ours.match(c) is not None)
        }
    )


# Unicode's presentation forms: letters in the shape a font gives them in context (Arabic's
# initial, medial, final and isolated forms) and ligatures (fi, lam-alef), kept for compatibility.
_PRESENTATION = regex.compile(
    r"[\p{Block=Alphabetic_Presentation_Forms}\p{Block=Arabic_Presentation_Forms_A}"
    r"\p{Block=Arabic_Presentation_Forms_B}]"
)


def presentation_forms(text: str) -> list[str]:
    """The presentation forms in `text` that stand for other characters (compatibility
    normalization turns them into those): content writes the characters themselves."""
    return [c for c in text if _PRESENTATION.match(c) and unicodedata.normalize("NFKC", c) != c]
