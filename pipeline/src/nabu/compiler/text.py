"""Text handling for the compiler: tokens from authored forms, ruby, and the hygiene audits of
§7.5 stage 2. Python indexes by code point; grapheme clusters come from `regex`'s \\X."""

from __future__ import annotations

import unicodedata
from typing import Any

import regex

GRAPHEME = regex.compile(r"\X")
WORD = regex.compile(r"[\p{L}\p{M}\p{N}\u200c\u200d]+")
WORDCHAR = regex.compile(r"[\p{L}\p{M}\p{N}]")
HAN = regex.compile(r"\p{Han}")
SYLLABLE = regex.compile(r"[a-z]+[1-6]")

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


def auto_tokens(text: str, segment: Any = None) -> list[dict[str, Any]]:
    """Tokens for text without authored tokens: word runs, or an analyzer's segmentation of them."""
    words: list[dict[str, Any]] = []
    for m in WORD.finditer(text):
        pieces = segment(m.group(0)) if segment is not None else None
        words.extend({"surface": p} for p in (pieces or [m.group(0)]))
    toks, error = align(text, words)
    assert error is None, error
    for t in toks:
        t.setdefault("kind", token_kind(t["surface"]))
    return toks


def ruby_segments(surface: str, reading: str) -> list[dict[str, str]] | None:
    """One ruby segment per grapheme when the syllables line up, else None."""
    bases = graphemes(surface)
    syllables = reading.split()
    if len(syllables) != len(bases):
        return None
    return [{"base": b, "text": s} for b, s in zip(bases, syllables, strict=True)]


def invisible_chars(text: str, allowed: set[str]) -> list[str]:
    return sorted(
        {c for c in text if (c in ALWAYS_INVISIBLE or c in (ZWNJ, ZWJ)) and c not in allowed}
    )


def script_of(ch: str) -> str | None:
    """The Unicode Script of a letter (None for Common/Inherited), via `regex` properties."""
    m = regex.match(
        r"(\p{Script=Latin})|(\p{Script=Cyrillic})|(\p{Script=Arabic})|(\p{Script=Han})|(\p{Script=Greek})|(\p{Script=Hebrew})|(\p{Script=Hiragana})|(\p{Script=Katakana})|(\p{Script=Hangul})|(\p{Script=Devanagari})|(\p{Script=Thai})|(\p{Script=Armenian})|(\p{Script=Georgian})",
        ch,
    )
    names = (
        "Latn",
        "Cyrl",
        "Arab",
        "Hani",
        "Grek",
        "Hebr",
        "Hira",
        "Kana",
        "Hang",
        "Deva",
        "Thai",
        "Armn",
        "Geor",
    )
    if m is None:
        return None if regex.match(r"[\p{Script=Common}\p{Script=Inherited}]", ch) else "Zzzz"
    return names[m.lastindex - 1] if m.lastindex else None


SCRIPT_EQUIV = {
    "Hant": {"Hani"},
    "Hans": {"Hani"},
    "Jpan": {"Hani", "Hira", "Kana"},
    "Kore": {"Hang", "Hani"},
}


def foreign_letters(word: str, script: str) -> list[str]:
    """Letters in `word` from a script other than the orthography's (mixed-script confusables)."""
    allowed = SCRIPT_EQUIV.get(script, {script})
    return sorted(
        {
            c
            for c in word
            if unicodedata.category(c)[0] == "L"
            and (s := script_of(c)) is not None
            and s not in allowed
        }
    )
