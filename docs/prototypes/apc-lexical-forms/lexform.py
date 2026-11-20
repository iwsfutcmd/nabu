"""apc's lexical form (docs/lexical-forms/apc.md): one word in Arabic script, every vowel written,
and its four projections: the course's Arabic spelling, the vowel-marked text the voices read,
Arabizi (every spelling the free correspondences give, the default first) and phonemes.

The notation, in short. Each consonant letter is followed by a shadda (doubled), then one of:
a vowel sign (fatha a, kasra i, damma u, U+065C e, U+065D o), a sukun (no vowel), a fathatan
(-an, on an alef seat), or nothing (the word's last consonant). A vowel sign followed by its bare
length letter is long: fatha or U+065C + alef, kasra or U+065C + ya, damma or U+065D + waw. A
letter written and not said carries U+06DF. ة is the feminine ending's letter: the vowel before it
is the ending.
"""

from __future__ import annotations

import itertools
import re
import unicodedata
from dataclasses import dataclass

FATHA, DAMMA, KASRA, SHADDA, SUKUN, FATHATAN = "\u064e", "\u064f", "\u0650", "\u0651", "\u0652", "\u064b"
E_SIGN, O_SIGN, SILENT = "\u065c", "\u065d", "\u06df"
VOWEL_SIGNS = {FATHA: "a", KASRA: "i", DAMMA: "u", E_SIGN: "e", O_SIGN: "o"}
SIGN_OF = {v: k for k, v in VOWEL_SIGNS.items()}
MARKS = FATHA + DAMMA + KASRA + SHADDA + SUKUN + FATHATAN + E_SIGN + O_SIGN + SILENT

ALEF, ALEF_MADDA, ALEF_MAQSURA, TA_MARBUTA, WAW, YA, HA = "\u0627", "\u0622", "\u0649", "\u0629", "\u0648", "\u064a", "\u0647"
HAMZAS = "\u0621\u0623\u0625\u0624\u0626"  # ء أ إ ؤ ئ
LENGTH_OF = {ALEF: "ae", ALEF_MAQSURA: "a", YA: "ie", WAW: "uo"}  # the vowels each length letter lengthens

UNIT = re.compile(f"([^{MARKS}\\s])([{MARKS}]*)")


class FormError(ValueError):
    """A string that is not a lexical form."""


@dataclass(frozen=True)
class Seg:
    """One consonant with what follows it, or a vowel that begins a word."""

    letter: str  # the consonant's letter; a bare alef for a vowel that begins the word
    geminate: bool = False
    vowel: str = ""  # "", a, i, u, e, o
    long: bool = False
    length_letter: str = ""  # the letter that writes the length
    tanwin: bool = False  # -an on an alef seat
    silent: bool = False  # written, not said (U+06DF)
    feminine: bool = False  # followed by ة: its vowel is the feminine ending
    final: bool = False  # the word's last sound


def parse(form: str) -> list[Seg]:
    """A lexical form as its segments; FormError where it breaks the notation."""
    form = unicodedata.normalize("NFC", form)
    units = UNIT.findall(form)
    if "".join(a + b for a, b in units) != form:
        raise FormError(f"{form!r}: a mark with no letter, or a space")
    segs: list[Seg] = []
    i = 0
    while i < len(units):
        letter, marks = units[i]
        rest = marks
        if SILENT in rest:
            if rest != SILENT:
                raise FormError(f"{form!r}: a silent {letter} carries other marks")
            segs.append(Seg(letter, silent=True))
            i += 1
            continue
        if letter == TA_MARBUTA:
            # The feminine letter said t, as before the word it belongs to (mit): it carries a sukun.
            if rest != SUKUN or i + 1 != len(units):
                raise FormError(f"{form!r}: \u0629 with no vowel before it")
            segs.append(Seg(TA_MARBUTA))
            i += 1
            continue
        if letter == ALEF_MADDA:
            # آ is a hamza with its long a; U+065C on it fronts the vowel (آكل ekol).
            if rest not in ("", E_SIGN):
                raise FormError(f"{form!r}: \u0622 takes no mark but U+065C")
            segs.append(Seg("\u0621", vowel="e" if rest else "a", long=True, length_letter=ALEF_MADDA))
            i += 1
            continue
        geminate = SHADDA in rest  # NFC puts a fatha before its shadda
        rest = rest.replace(SHADDA, "")
        if len(rest) > 1:
            raise FormError(f"{form!r}: {letter} carries {len(rest)} signs")
        j = i + 1
        skipped: list[Seg] = []
        if rest in VOWEL_SIGNS:
            # A length letter may stand after a letter that is written and not said (بدّها badda).
            while j < len(units) and units[j][1] == SILENT and j + 1 < len(units) and units[j + 1][1] == "":
                skipped.append(Seg(units[j][0], silent=True))
                j += 1
        nxt = units[j] if j < len(units) else None
        if skipped and not (nxt is not None and VOWEL_SIGNS[rest] in LENGTH_OF.get(nxt[0], "")):
            j, skipped, nxt = i + 1, [], units[i + 1]
        if rest == FATHATAN:
            if nxt is None or nxt != (ALEF, ""):
                raise FormError(f"{form!r}: a fathatan needs its alef seat")
            segs.append(Seg(letter, geminate, vowel="a", tanwin=True))
            i += 2
            continue
        if rest in VOWEL_SIGNS:
            vowel = VOWEL_SIGNS[rest]
            if nxt is not None and nxt[0] == TA_MARBUTA and nxt[1] == "":
                if vowel not in "ae":
                    raise FormError(f"{form!r}: the feminine ending is a or e")
                segs.append(Seg(letter, geminate, vowel=vowel, feminine=True))
                i += 2
                continue
            if nxt is not None and nxt[1] == "" and vowel in LENGTH_OF.get(nxt[0], ""):
                segs.append(Seg(letter, geminate, vowel=vowel, long=True, length_letter=nxt[0]))
                segs.extend(skipped)
                i = j + 1
                continue
            segs.append(Seg(letter, geminate, vowel=vowel))
        elif rest in ("", SUKUN):
            if rest == "" and i + 1 < len(units):
                raise FormError(f"{form!r}: {letter} has no vowel sign and no sukun, and is not the last letter")
            if rest == SUKUN and i + 1 == len(units):
                raise FormError(f"{form!r}: the last consonant takes no sukun")
            segs.append(Seg(letter, geminate))
        else:
            raise FormError(f"{form!r}: {letter} carries U+{ord(rest):04X}")
        i += 1
    if not segs:
        raise FormError("an empty form")
    last = max(k for k, s in enumerate(segs) if not s.silent)
    segs[last] = Seg(**{**segs[last].__dict__, "final": True})
    if segs[0].letter == ALEF and not segs[0].silent and (segs[0].vowel == "" or segs[0].geminate):
        raise FormError(f"{form!r}: a bare alef that begins a word carries its vowel")
    for s in segs[1:]:
        if s.letter == ALEF and not s.silent:
            raise FormError(f"{form!r}: an alef inside a word is a length letter, a seat, or silent")
    return segs


# --- to the course's Arabic spelling -------------------------------------------------------------


# Letters the course's Arabic does not use: the lexical form writes the sound, the spelling its letter.
SPELLED = {"\u06af": "\u0643", "\u067e": "\u0628", "\u06a4": "\u0641"}  # gaf as kaf, pe as ba, ve as fa


def to_arabic(form: str) -> str:
    """The word as apc-Arab/standard spells it: the letters, no marks (a shadda is the writer's
    choice). A clitic group (its parts joined by +) is one written word."""
    letters = re.sub(f"[{MARKS}+]", "", unicodedata.normalize("NFC", form))
    return "".join(SPELLED.get(c, c) for c in letters)


# --- to the vowel-marked text the voices read ----------------------------------------------------

# A consonant with no vowel before another: the clusters the course's vocalization writes a helping
# vowel into at the end of a word are the stated set below (REVIEW).
SONORANTS = "\u0631\u0644\u0645\u0646"  # ر ل م ن
NO_HELPER_AFTER = "\u062a\u062f\u0637\u0636"  # ت د ط ض: a cluster that ends in a stop takes none


def helper_at(segs: list[Seg]) -> int | None:
    """Where a helping vowel is said: between the last two consonants of a word that ends in two
    different ones (خبز khebez), unless the last is a t or d (bent, sabt) or the two are alike."""
    said = [k for k, s in enumerate(segs) if not s.silent]
    if len(said) < 3:
        return None
    a, b = segs[said[-2]], segs[said[-1]]
    if a.vowel or b.vowel or b.geminate or a.geminate or a.feminine or b.letter in NO_HELPER_AFTER or a.letter == b.letter:
        return None
    if a.letter in (WAW, YA):  # a glide closes a diphthong: bayt, law
        return None
    if a.letter in SONORANTS and b.letter not in SONORANTS:  # falling: bent, 3end, kalb
        return None
    prev = segs[said[-3]]
    if prev.long or not prev.vowel:
        return None
    return said[-2]


def to_marked(form: str) -> str:
    """The word with the vowel marks the course writes (vocalization.yaml's conventions): the
    Arabic block's fatha, kasra, damma, sukun, shadda and fathatan only. In a clitic group a
    clitic's last consonant takes its sukun, but the conjunction waw, which the course leaves bare."""
    if "+" in form:
        parts = form.split("+")
        out = []
        for k, piece in enumerate(parts):
            text = _marked(piece)
            segs = parse(piece)
            end = segs[-1]
            if k < len(parts) - 1 and not end.vowel and not end.silent and piece != WAW and not is_article_lam(segs, len(segs) - 1):
                text += SUKUN
            out.append(text)
        return unicodedata.normalize("NFC", "".join(out))
    return _marked(form)


def _marked(form: str) -> str:
    segs = parse(form)
    out: list[str] = []
    skip: set[int] = set()
    for k, s in enumerate(segs):
        if k in skip:
            continue
        if s.silent:
            out.append(s.letter)
            continue
        if s.length_letter == ALEF_MADDA:
            out.append(ALEF_MADDA)
            continue
        if s.letter == TA_MARBUTA:
            out.append(TA_MARBUTA)
            continue
        text = SPELLED.get(s.letter, s.letter) + (SHADDA if s.geminate else "")
        after = segs[k + 1] if k + 1 < len(segs) else None
        if s.vowel and not s.long and after is not None and after.silent and after.letter == HA and k + 2 < len(segs):
            # their: the course writes the vowel on the silent h.
            out.append(text + SUKUN)
            out.append(HA + (DAMMA if s.vowel in "uo" else KASRA if s.vowel in "ie" else FATHA))
            skip.add(k + 1)
            continue
        if s.tanwin:
            text += ALEF + FATHATAN  # the course writes the fathatan after its seat
        elif s.long:
            text += s.length_letter  # a consonant before its length letter carries no sign
        elif s.vowel:
            sign = {"e": KASRA, "o": DAMMA}.get(s.vowel) or SIGN_OF[s.vowel]
            text += sign + (TA_MARBUTA if s.feminine else "")
        elif not s.final and not is_article_lam(segs, k):
            text += SUKUN  # a helping vowel is not written (HELPER_IN_MARKS)
        out.append(text)
    # A long vowel's silent letter is written after its length letter's consonant, where the word has it.
    if skip:
        return unicodedata.normalize("NFC", "".join(out))
    return unicodedata.normalize("NFC", _reorder_silent(segs, out))


def is_article_lam(segs: list[Seg], k: int) -> bool:
    """The article's lam: a lam right after a silent alef, which the course leaves bare."""
    return segs[k].letter == "\u0644" and k > 0 and segs[k - 1].silent and segs[k - 1].letter == ALEF


def _reorder_silent(segs: list[Seg], out: list[str]) -> str:
    """parse() lists a silent letter after the long vowel it stands inside (د + ā, then ه); the
    spelling has it before the length letter (ـها)."""
    text: list[str] = []
    for k, s in enumerate(segs):
        nxt = segs[k + 1] if k + 1 < len(segs) else None
        if s.long and nxt is not None and nxt.silent and nxt.letter == HA and out[k].endswith(s.length_letter) and s.length_letter != ALEF_MADDA:
            text.append(out[k][: -len(s.length_letter)])
            text.append(out[k + 1] + s.length_letter)
            out[k + 1] = ""
        else:
            text.append(out[k])
    return "".join(text)


# --- to Arabizi ----------------------------------------------------------------------------------

# Each consonant's Arabizi, the default first (REVIEW: the defaults are the course's majority).
CONSONANTS: dict[str, tuple[str, ...]] = {
    "\u0628": ("b",), "\u062a": ("t",), "\u062b": ("s",), "\u062c": ("j",), "\u062d": ("7",),
    "\u062e": ("kh", "5"), "\u062f": ("d",), "\u0630": ("z",), "\u0631": ("r",), "\u0632": ("z",),
    "\u0633": ("s",), "\u0634": ("sh", "ch"), "\u0635": ("s",), "\u0636": ("d",), "\u0637": ("t",),
    "\u0638": ("z",), "\u0639": ("3",), "\u063a": ("gh", "8"), "\u0641": ("f",), "\u0642": ("2",),
    "\u0643": ("k",), "\u0644": ("l",), "\u0645": ("m",), "\u0646": ("n",), HA: ("h",), WAW: ("w",),
    YA: ("y",), "\u067e": ("p",), "\u06a4": ("v",), "\u06af": ("g",), TA_MARBUTA: ("t",),
    **{h: ("2",) for h in HAMZAS},
}
# The vowels, the default first: short, long, and long ones at the end of a word (said short).
SHORT = {"a": ("a",), "i": ("e", "i"), "u": ("o", "u"), "e": ("e",), "o": ("o",)}
LONG = {"a": ("a",), "i": ("i", "ee"), "u": ("u", "ou"), "e": ("e", "ei"), "o": ("o",)}
FINAL = {"a": ("a",), "i": ("i", "e"), "u": ("o", "u"), "e": ("e",), "o": ("o",)}


def _options(segs: list[Seg], k: int, helper: int | None) -> list[tuple[str, ...]]:
    """What a segment may be written as, a tuple of spellings for each of its parts."""
    s = segs[k]
    if s.silent:
        # The article: its alef is a helping vowel Arabizi may write (el bet, l bet), and its lam
        # is written or left to the doubled letter after it (el salame, essalame).
        if s.letter == ALEF and k + 1 < len(segs) and segs[k + 1].letter == "\u0644":
            return [("e", "", "i")]
        if s.letter == "\u0644" and k > 0 and segs[k - 1].silent and segs[k - 1].letter == ALEF:
            return [("", "l")]
        return []
    # First in the word, or in the word after its article (el akl: the hamza is not written).
    first = not any(not p.silent for p in segs[:k]) or (k >= 2 and is_article_lam(segs, k - 1) and not any(not p.silent for p in segs[: k - 1]))
    parts: list[tuple[str, ...]] = []
    if s.letter == ALEF:
        pass  # a vowel that begins the word: no consonant is written
    elif s.letter in HAMZAS:
        parts.append(("",) if first else ("2",))  # a hamza that begins a word is not written
    elif s.letter == "\u0642" and first:
        parts.append(("2", ""))  # ق beginning a word: 2arib, and ahwe
    else:
        cons = CONSONANTS[s.letter]
        # A doubled letter is written twice (mara is not marra); but one doubled by the article's
        # lam is also written once, with the lam (el salame, essalame).
        by_article = k > 0 and segs[k - 1].silent and segs[k - 1].letter == "\u0644"
        parts.append(tuple(c + c for c in cons) + (cons if by_article else ()) if s.geminate else cons)
    if s.tanwin:
        parts.append(("an",))
    elif s.long:
        spellings = (FINAL if s.final else LONG)[s.vowel]
        parts.append(("e",) if s.vowel == "e" and s.length_letter != YA else spellings)
    elif s.vowel:
        parts.append(SHORT[s.vowel])
    elif k == helper:
        parts.append(("", "o", "e") if any(p.vowel in "uo" for p in segs[:k][-1:]) else ("", "e"))
    return parts


def to_arabizi(form: str, limit: int = 4096) -> list[str]:
    """Every Arabizi spelling the correspondences give, the default first. A clitic group's parts
    are spelled one after another (Arabizi writes most clitics apart: bel matbakh)."""
    if "+" in form:
        out = [""]
        for piece in form.split("+"):
            out = [a + b for a in out for b in to_arabizi(piece, limit)][:limit]
        return list(dict.fromkeys(out))
    segs = parse(form)
    helper = helper_at(segs)
    parts = [p for k in range(len(segs)) for p in _options(segs, k, helper)]
    out: list[str] = []
    for combo in itertools.islice(itertools.product(*parts), limit):
        out.append("".join(combo))
    return list(dict.fromkeys(out))


# --- to phonemes ---------------------------------------------------------------------------------

PHONEMES = {
    "\u0628": "b", "\u062a": "t", "\u062b": "s", "\u062c": "\u0292", "\u062d": "\u0127", "\u062e": "x", "\u062f": "d",
    "\u0630": "z", "\u0631": "r", "\u0632": "z", "\u0633": "s", "\u0634": "\u0283", "\u0635": "s\u02e4", "\u0636": "d\u02e4",
    "\u0637": "t\u02e4", "\u0638": "z\u02e4", "\u0639": "\u0295", "\u063a": "\u0263", "\u0641": "f", "\u0642": "\u0294",
    "\u0643": "k", "\u0644": "l", "\u0645": "m", "\u0646": "n", HA: "h", WAW: "w", YA: "j", "\u067e": "p", "\u06a4": "v",
    "\u06af": "g", TA_MARBUTA: "t", **{h: "\u0294" for h in HAMZAS},
}
LENGTH = "\u02d0"


def to_phonemes(form: str) -> list[str]:
    """The word's phonemes (IPA), with the helping vowel where one is said. A long vowel that ends
    the word is said short."""
    if "+" in form:
        return [p for piece in form.split("+") for p in to_phonemes(piece)]
    segs = parse(form)
    helper = helper_at(segs)
    out: list[str] = []
    for k, s in enumerate(segs):
        if s.silent:
            continue
        if s.letter != ALEF:
            p = PHONEMES[s.letter]
            out.append(p + LENGTH if s.geminate else p)
        if s.tanwin:
            out += ["a", "n"]
        elif s.vowel:
            out.append(s.vowel + (LENGTH if s.long and not s.final else ""))
    del helper  # a helping vowel is said or not: it is no phoneme of the word
    return out
