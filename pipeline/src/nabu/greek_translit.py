"""Polytonic Greek in Latin letters, for learners still learning the alphabet (ADR 0088).

The scheme is the familiar scholarly one (as ALA-LC and most textbooks romanize Ancient Greek), set
to the sounds of classical Attic (CGCG §§1.15-33):

- η ē, ω ō; υ y, but u as the second letter of a diphthong (au, eu, ou, ēu, ui);
- the aspirates θ th, φ ph, χ ch; ξ x, ψ ps, ζ z;
- γ is n before γ κ ξ χ (ἄγγελος angelos);
- the rough breathing is h (ὁ ho, ῥ rh, ὑ hy); the smooth breathing is nothing;
- the iota subscript is written out, as it was said (τῷ tōi, χώρᾳ chōrai);
- accents and the diaeresis are left out: the alphabet track teaches them as marks of their own;
- the elision mark stays (ἀλλ’ all’); a capital stays a capital (Σωκράτης Sōkratēs).
"""

from __future__ import annotations

import unicodedata

ROUGH = "\u0314"
SUBSCRIPT = "\u0345"
DIAERESIS = "\u0308"

LETTERS = {
    "α": "a", "β": "b", "γ": "g", "δ": "d", "ε": "e", "ζ": "z", "η": "ē", "θ": "th",
    "ι": "i", "κ": "k", "λ": "l", "μ": "m", "ν": "n", "ξ": "x", "ο": "o", "π": "p",
    "ρ": "r", "σ": "s", "ς": "s", "τ": "t", "υ": "y", "φ": "ph", "χ": "ch", "ψ": "ps", "ω": "ō",
}  # fmt: skip
VOWELS = set("αεηιουω")
VELARS = set("γκξχ")
# First letters of a diphthong whose second letter is υ: that υ is written u.
U_DIPHTHONG = set("αεηο")
APOSTROPHES = {"\u2019", "\u02bc", "\u1fbd", "\u1fbf", "'"}


def _letters(word: str) -> list[tuple[str, frozenset[str], bool]]:
    """(base letter lowercased, its marks, was a capital) for each letter; other characters as
    their own entries with no marks."""
    out: list[tuple[str, frozenset[str], bool]] = []
    for ch in unicodedata.normalize("NFD", word):
        if unicodedata.combining(ch) and out:
            base, marks, cap = out[-1]
            out[-1] = (base, marks | {ch}, cap)
        else:
            out.append((ch.lower(), frozenset(), ch != ch.lower()))
    return out


def _cap(s: str, capital: bool) -> str:
    return s[:1].upper() + s[1:] if capital and s else s


def word(text: str) -> str:
    """One word in Latin letters: ἄνθρωπος → anthrōpos, οὐκ → ouk, τῷ → tōi, Ῥόδος → Rhodos."""
    ls = _letters(text)
    out: list[str] = []
    for i, (base, marks, cap) in enumerate(ls):
        if base in APOSTROPHES:
            out.append("\u2019")
            continue
        if base not in LETTERS:
            out.append(base)
            continue
        prev = ls[i - 1] if i > 0 else None
        nxt = ls[i + 1] if i + 1 < len(ls) else None
        latin = LETTERS[base]
        if base == "γ" and nxt is not None and nxt[0] in VELARS:
            latin = "n"
        if (
            base == "υ"
            and prev is not None
            and prev[0] in U_DIPHTHONG
            and DIAERESIS not in marks
            and not (prev[1] & {"\u0301", "\u0300", "\u0342", "\u0313", ROUGH})
        ):
            latin = "u"
        if base == "υ" and nxt is not None and nxt[0] == "ι" and DIAERESIS not in nxt[1]:
            latin = "u"  # υἱός huios
        rough = ROUGH in marks
        # The breathing of a diphthong stands on its second letter; its h comes first.
        second_of_diphthong = (
            prev is not None
            and base in "ιυ"
            and prev[0] in VOWELS
            and DIAERESIS not in marks
            and not (prev[1] & {"\u0301", "\u0300", "\u0342", "\u0313", ROUGH})
            and len(out) > 0
        )
        if rough and base == "ρ":
            latin = "rh"
        elif rough and second_of_diphthong:
            # h before the whole diphthong: εὑρίσκω heuriskō, οἱ hoi, Αἱ Hai.
            j = len(out) - 1
            out[j] = _cap("h" + out[j].lower(), out[j][:1].isupper())
        elif rough:
            latin = "h" + latin
        if SUBSCRIPT in marks:
            latin += "i"
        out.append(_cap(latin, cap))
    # A capital on a diphthong's vowel or before a rough breathing: Ἡ → Hē, Αἱ → Hai.
    result = "".join(out)
    if ls and ls[0][2] and result[:1].islower():
        result = result[:1].upper() + result[1:]
    return result


def text(greek: str) -> str:
    """A text in Latin letters, word by word: the Greek question mark (;) becomes ?, the high dot
    a semicolon; other punctuation and spacing stay."""
    latin = " ".join(word(w) for w in greek.split(" "))
    return latin.replace(";", "?").replace("\u00b7", ";").replace("\u0387", ";")
