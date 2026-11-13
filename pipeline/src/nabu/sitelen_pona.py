"""Toki Pona in sitelen pona, as the UCSUR encodes it (ADR 0086).

sitelen pona writes each word with one logograph. It is not in Unicode yet (a proposal, L2/24-275,
is with the UTC); fonts and input methods use the Under-ConScript Unicode Registry's block,
U+F1900..U+F19FF in Plane 15's private use area, and so does the tok course. Text is written as
Common Sitelen Pona (2026) has it: logographs one after another with no spaces between the words
of a sentence (the proposal gives them the line-breaking class of ideographs), an ideographic
space (U+3000, a logograph wide) between sentences, no ! or ? (o and a, seme and "X ala X" carry
them), and a name as a cartouche whose logographs begin with the name's letters, in order
(jan [sona olin nasin jan a] is jan Sonja).

This converts the course's sitelen Lasina (Latin) sentences, so the pinned sitelen pona forms can
be checked against them (`transliterate: {via: sitelen-pona}`, `enrich.transliteration-mismatch`)
and new content drafted: `nabu sitelen-pona "mi moku"`.
"""

from __future__ import annotations

import re
from collections.abc import Mapping

# The UCSUR's sitelen pona block, in its order: the 120 words of pu (U+F1900..U+F1977), then the
# 17 nimi ku suli of ku (U+F1978..U+F1988). The code points are the UCSUR's; Linku (CC BY-SA 4.0)
# lists the same for every word.
_PU = """
a akesi ala alasa ale anpa ante anu awen e en esun ijo ike ilo insa jaki jan jelo jo kala kalama
kama kasi ken kepeken kili kiwen ko kon kule kulupu kute la lape laso lawa len lete li lili
linja lipu loje lon luka lukin lupa ma mama mani meli mi mije moku moli monsi mu mun musi mute
nanpa nasa nasin nena ni nimi noka o olin ona open pakala pali palisa pan pana pi pilin pimeja
pini pipi poka poki pona pu sama seli selo seme sewi sijelo sike sin sina sinpin sitelen sona
soweli suli suno supa suwi tan taso tawa telo tenpo toki tomo tu unpa uta utala walo wan waso
wawa weka wile
"""
PU = tuple(_PU.split())
_KU_SULI = """
namako kin oko kipisi leko monsuta tonsi jasima kijetesantakalu soko meso epiku kokosila lanpan
n misikeke ku
"""
KU_SULI = tuple(_KU_SULI.split())

WORDS: dict[str, str] = {w: chr(0xF1900 + i) for i, w in enumerate(PU + KU_SULI)}
# ali is another spelling of ale, written with its logograph.
WORDS["ali"] = WORDS["ale"]

CARTOUCHE_OPEN = "\U000f1990"
CARTOUCHE_CLOSE = "\U000f1991"
STACKING_JOINER = "\U000f1995"
SCALING_JOINER = "\U000f1996"
# Presentation controls a typed answer may carry and grading drops: the combined glyph joiners
# (and ZWJ, which fonts read the same way), the long glyph and long pi controls, the legacy
# cartouche extension.
PRESENTATION = (
    "\u200d",
    "\U000f1992",
    "\U000f1993",
    "\U000f1994",
    STACKING_JOINER,
    SCALING_JOINER,
    "\U000f1997",
    "\U000f1998",
    "\U000f1999",
    "\U000f199a",
    "\U000f199b",
)
MIDDLE_DOT = "\U000f199c"
COLON = "\U000f199d"
# Between sentences: the ideographic space, as Common Sitelen Pona writes it.
SENTENCE_SPACE = "\u3000"
# Glyph variants with code points of their own: the directional ni and the other sewi.
VARIANTS = {
    "\U000f1989": WORDS["ni"],
    "\U000f198a": WORDS["ni"],
    "\U000f198b": WORDS["ni"],
    "\U000f198c": WORDS["sewi"],
}

WORD_OF: dict[str, str] = {g: w for w, g in WORDS.items() if w != "ali"}

_TOKEN = re.compile(r"[A-Za-z]+|[.!?]+|[,;]|:|\s+|.", re.S)


class SitelenPonaError(ValueError):
    """Text the converter cannot write: a word that is not Toki Pona, a name with no spelling."""


def cartouche(spelling: str) -> str:
    """A name written in a cartouche, from the words whose first letters spell it ("sona olin
    nasin jan a" for Sonja)."""
    glyphs: list[str] = []
    for word in spelling.split():
        if word not in WORDS:
            raise SitelenPonaError(f"{word!r} is not a word with a logograph")
        glyphs.append(WORDS[word])
    return CARTOUCHE_OPEN + "".join(glyphs) + CARTOUCHE_CLOSE


def spelled(name: str) -> str | None:
    """The letters a cartouche spells (sonja), or None if `name` is not one cartouche."""
    if not (name.startswith(CARTOUCHE_OPEN) and name.endswith(CARTOUCHE_CLOSE)):
        return None
    inside = name[len(CARTOUCHE_OPEN) : -len(CARTOUCHE_CLOSE)]
    if not inside or any(g not in WORD_OF for g in inside):
        return None
    return "".join(WORD_OF[g][0] for g in inside)


def to_sitelen_pona(text: str, names: Mapping[str, str] | None = None) -> str:
    """A sitelen Lasina sentence (or several) in sitelen pona. `names` gives each name its
    cartouche (the pinned spelling, or the words that spell it), which must spell the name; a
    capitalized word with none is an error, as is a word that is not Toki Pona. Words run together,
    sentences are an ideographic space apart, commas and the final ! ? . go, and a colon stays."""
    names = names or {}
    out: list[str] = []
    sentence_open = False
    for m in _TOKEN.finditer(text):
        piece = m.group(0)
        if piece.isspace() or piece in (",", ";"):
            continue
        if piece[0] in ".!?":
            sentence_open = False
            continue
        if piece == ":":
            out.append(":")
            continue
        if not piece.isalpha():
            raise SitelenPonaError(f"{piece!r} has no sitelen pona form")
        if not sentence_open and out:
            out.append(SENTENCE_SPACE)
        sentence_open = True
        if piece in names:
            name = names[piece]
            written = name if name.startswith(CARTOUCHE_OPEN) else cartouche(name)
            if spelled(written) != piece.lower():
                raise SitelenPonaError(
                    f"the cartouche given for {piece!r} spells {spelled(written)!r}"
                )
            out.append(written)
        elif piece[0].isupper() and piece.lower() not in WORDS:
            raise SitelenPonaError(f"{piece!r} is a name with no cartouche given")
        elif piece.lower() in WORDS:
            out.append(WORDS[piece.lower()])
        else:
            raise SitelenPonaError(f"{piece!r} is not a Toki Pona word")
    return "".join(out)


def to_sitelen_lasina(text: str) -> str:
    """Logographs back to sitelen Lasina, a word per logograph and names from their cartouches
    (lowercase, as a cartouche spells them): for reading drafts, never for content."""
    words: list[str] = []
    for chunk in re.split(r"(\s+)", text):
        if chunk.isspace() or not chunk:
            continue
        i = 0
        while i < len(chunk):
            ch = chunk[i]
            if ch == CARTOUCHE_OPEN:
                end = chunk.find(CARTOUCHE_CLOSE, i)
                if end < 0:
                    raise SitelenPonaError("a cartouche is not closed")
                name = spelled(chunk[i : end + 1])
                words.append((name or "?").capitalize())
                i = end + 1
                continue
            if ch in WORD_OF or ch in VARIANTS:
                words.append(WORD_OF[VARIANTS.get(ch, ch)])
            elif ch == ":":
                words[-1:] = [f"{words[-1]}:"] if words else [":"]
            elif ch not in PRESENTATION:
                words.append(ch)
            i += 1
        words[-1:] = [f"{words[-1]}."] if words else []
    return " ".join(words)
