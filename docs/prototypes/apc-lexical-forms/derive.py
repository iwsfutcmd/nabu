"""A first draft of a word's lexical form from what the course pins: its Arabic spelling, its
vowel marks and its Arabizi, read together letter by letter.

The Arabic gives the letters, the marks give the short vowels and the doubled letters, and the
Arabizi gives what the marks leave open: whether ا is said a or e, whether ي is i, e or y, whether
و is u, o or w, and which letters are written and not said. Where the two disagree the draft keeps
a note, and the review list says so. The drafts in docs/lexical-forms/apc.yaml were made by this
and then checked by projecting them back (check.py).
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from functools import lru_cache

import lexform as lf
from course import clusters, nfc

LAM = "\u0644"
COURSE_VOWELS = {lf.FATHA: "a", lf.KASRA: "i", lf.DAMMA: "u"}
# What Arabizi may write for each consonant when a draft is read (more than a projection writes:
# capitals for the emphatics, as Kline has them, fold to these in lower case).
READ = {k: set(v) for k, v in lf.CONSONANTS.items()}
READ["\u0642"] |= {"q", "k"}
READ["\u062c"] |= {"g"}
READ["\u0643"] |= {"c", "g"}  # g: a loan's g written with kaf (englize); the draft writes it with gaf
READ["\u0633"] |= {"c"}  # a loan in its French spelling (merci)
READ["\u0641"] |= {"ph"}
GAF = "\u06af"
SHORT_OF = {"a": lf.FATHA, "e": lf.KASRA, "i": lf.KASRA, "o": lf.DAMMA, "u": lf.DAMMA}
CLASS_OF = {"a": "a", "e": "i", "i": "i", "o": "u", "u": "u"}


@dataclass(frozen=True)
class Draft:
    form: str | None
    cost: float = 0.0
    notes: tuple[str, ...] = ()
    why: str = ""  # why there is no form
    choices: tuple[str, ...] = ()  # how the Arabizi spelled what a correspondence leaves free


@dataclass(frozen=True)
class _Unit:
    letter: str
    geminate: bool
    sign: str  # a, i, u or ""
    sukun: bool
    tanwin: bool


def _units(text: str) -> list[_Unit]:
    out = []
    for c in clusters(text):
        marks = c[1:]
        sign = next((v for m, v in COURSE_VOWELS.items() if m in marks), "")
        out.append(_Unit(c[0], lf.SHADDA in marks, sign, lf.SUKUN in marks, lf.FATHATAN in marks))
    return out


def from_marks(arabic: str, marked: str | None) -> str | None:
    """A form from the marks alone, where the Arabizi cannot be read with them: every alef a back
    a, every bare ya and waw a long i and u. None where even that is not a form."""
    out: list[str] = []
    units = _units(nfc(marked or arabic).replace(" ", ""))
    for k, u in enumerate(units):
        nxt = units[k + 1] if k + 1 < len(units) else None
        if u.letter in lf.LENGTH_OF and k > 0 and not (u.sign or u.sukun or u.geminate or u.tanwin) and out and out[-1][-1] in (lf.FATHA, lf.KASRA, lf.DAMMA):
            out.append(u.letter)
            continue
        head = u.letter + (lf.SHADDA if u.geminate else "")
        if u.letter in (lf.TA_MARBUTA, lf.ALEF_MADDA):
            out.append(u.letter)
        elif u.tanwin or (nxt is not None and nxt.tanwin):
            out.append(head + lf.FATHATAN)
        elif u.sign:
            out.append(head + SHORT_OF[u.sign])
        elif nxt is not None and nxt.letter in lf.LENGTH_OF and not (nxt.sign or nxt.sukun or nxt.geminate):
            out.append(head + {lf.ALEF: lf.FATHA, lf.ALEF_MAQSURA: lf.FATHA, lf.YA: lf.KASRA, lf.WAW: lf.DAMMA}[nxt.letter])
        elif nxt is not None and nxt.letter == lf.TA_MARBUTA:
            out.append(head + lf.E_SIGN)
        else:
            out.append(head + ("" if k == len(units) - 1 else lf.SUKUN))
    form = nfc("".join(out))
    try:
        lf.parse(form)
    except lf.FormError:
        return None
    return form


def draft(arabic: str, marked: str | None, arabizi: str, articles: frozenset[int] = frozenset(), starts: frozenset[int] = frozenset()) -> Draft:
    """The cheapest reading of the three together. `articles`: where an article's alef stands
    (its index among the word's letters), and `starts`: where a clitic ends and the next part of
    the word begins; only the course's analysis knows either. Parts are joined by + in the form."""
    words_a = nfc(marked or arabic).split()
    words_l = arabizi.split()
    if len(words_a) > 1 and len(words_a) == len(words_l):
        parts = [draft(a, a, l, frozenset({0}) if a.startswith("\u0627\u0644") and len(a) > 4 else frozenset()) for a, l in zip(words_a, words_l, strict=True)]
        if any(p.form is None for p in parts):
            return Draft(None, why="; ".join(p.why for p in parts if p.form is None))
        return Draft(" ".join(p.form or "" for p in parts), sum(p.cost for p in parts), tuple(n for p in parts for n in p.notes), choices=tuple(n for p in parts for n in p.choices))
    units = _units("".join(words_a))
    latin = re.sub(r"[\s\-'’]", "", arabizi).lower()
    n, m = len(units), len(latin)

    def take(j: int, options: set[str] | tuple[str, ...]) -> list[tuple[int, str]]:
        return [(j + len(o), o) for o in sorted(options, key=len, reverse=True) if latin.startswith(o, j)]

    @lru_cache(maxsize=None)
    def best(i: int, j: int, doubled: bool) -> tuple[float, str, tuple[str, ...]] | None:
        """The cheapest way to read units[i:] as latin[j:]. `doubled`: the letter here is doubled
        by the article's lam before it."""
        if i == n:
            return (0.0, "", ()) if j == m and not doubled else None
        if i in starts and i > 0 and not doubled:
            # A new part of the word: read it as a word of its own.
            rest = part(i, j, False)
            return None if rest is None else (rest[0], "+" + rest[1], rest[2])
        return part(i, j, doubled)

    @lru_cache(maxsize=None)
    def part(i: int, j: int, doubled: bool) -> tuple[float, str, tuple[str, ...]] | None:
        u = units[i]
        last = i == n - 1 or i + 1 in starts
        nxt = units[i + 1] if i + 1 < n and not last else None
        found: list[tuple[float, str, tuple[str, ...]]] = []

        def keep(cost: float, text: str, notes: tuple[str, ...], rest: tuple[float, str, tuple[str, ...]] | None) -> None:
            if rest is not None:
                found.append((cost + rest[0], text + rest[1], notes + rest[2]))

        # The article: a silent alef, its helping vowel written or not; then its lam.
        if u.letter == lf.ALEF and i in articles and i + 1 < n and units[i + 1].letter == LAM and not doubled:
            for j2, _ in take(j, ("e", "i", "")):
                after = units[i + 2] if i + 2 < n else None
                if after is not None and after.geminate:  # the lam is lost in a doubled sun letter
                    for j3, _ in take(j2, ("l", "")):
                        keep(0.0, lf.ALEF + lf.SILENT + LAM + lf.SILENT, (), best(i + 2, j3, True))
                else:
                    for j3, _ in take(j2, ("l",)):
                        keep(0.0, lf.ALEF + lf.SILENT + LAM + lf.SUKUN, (), best(i + 2, j3, False))
                    # A sun letter the course did not mark as doubled, written doubled in Arabizi.
                    keep(0.4, lf.ALEF + lf.SILENT + LAM + lf.SILENT, ("article: the doubled letter is not marked",), best(i + 2, j2, True))
            return min(found, default=None)
        # Written, not said: the alef after a plural's waw, and the h of his, her, their.
        begins = i == 0 or i in starts or i - 2 in articles  # a word begins again after its article
        if u.letter == lf.TA_MARBUTA and last and not doubled:
            # The feminine letter said t before the word it belongs to (mit).
            for j2, _ in take(j, ("t",)):
                keep(0.0, lf.TA_MARBUTA + lf.SUKUN, (), best(i + 1, j2, False))
            return min(found, default=None)
        if u.letter == lf.ALEF and last and not begins and units[i - 1].letter == lf.WAW and not doubled:
            keep(0.0, lf.ALEF + lf.SILENT, (), best(i + 1, j, False))
        if u.letter == lf.HA and not begins and not u.geminate and not u.sign and not doubled and not latin.startswith("h", j):
            keep(0.3, lf.HA + lf.SILENT, (), best(i + 1, j, False))
        # Any other letter written and not said (3enna, written with its d): dear, and noted.
        if not begins and not last and u.letter in READ and u.letter not in (lf.WAW, lf.YA, lf.HA) and not u.geminate and not u.sign and not doubled:
            keep(1.6, u.letter + lf.SILENT, (f"written, not said: {u.letter}",), best(i + 1, j, False))
        # A vowel that begins the word, on a bare alef; or an alef that only begins a cluster (stanna).
        if u.letter == lf.ALEF and begins and not doubled:
            for j2, v in take(j, ("a", "e", "i", "o", "u")):
                clash = u.sign and u.sign != CLASS_OF[v]
                keep(1.5 if clash else 0.0, lf.ALEF + SHORT_OF[v], (f"vowel: marked {u.sign}, Arabizi {v}",) if clash else (), best(i + 1, j2, False))
            if not u.sign:
                keep(0.3, lf.ALEF + lf.SILENT, (), best(i + 1, j, False))
            return min(found, default=None)
        if u.letter == lf.ALEF_MADDA and not doubled:
            for j2, v in take(j, ("2a", "2e", "a", "e")):
                keep(0.0, lf.ALEF_MADDA + (lf.E_SIGN if v.endswith("e") else ""), (), best(i + 1, j2, False))
            return min(found, default=None)
        if u.letter not in READ:
            return min(found, default=None)

        # A consonant: its letter, single or doubled.
        first = begins
        cons: list[tuple[int, bool, float, tuple[str, ...]]] = []  # where Arabizi stands after it, doubled?, cost, notes
        spellings = set(READ[u.letter])
        if u.letter in lf.HAMZAS:
            spellings = {"", "2"} if first else {"2", ""}
        marked_double = u.geminate or doubled
        for j2, c in take(j, spellings | ({""} if u.letter == "\u0642" else set())):
            miss = 0.6 if c == "" and not first else 0.0
            notes = ("hamza: not written in Arabizi",) if c == "" and not first and u.letter in lf.HAMZAS else ()
            if c and latin.startswith(c, j2):
                # Written doubled.
                cons.append((j2 + len(c), True, miss + (0.0 if marked_double else 0.3), notes + (() if marked_double else ("doubled in Arabizi, no shadda in the course's marks",))))
            cons.append((j2, marked_double, miss, notes))
        for j2, gem, c_cost, c_notes in cons:
            said_g = u.letter == "\u0643" and latin.startswith("g", j) and not latin.startswith("k", j)
            head = (GAF if said_g else u.letter) + (lf.SHADDA if gem else "")
            # his, their: the vowel the marks write on a silent h is the consonant's (beton).
            if nxt is not None and nxt.letter == lf.HA and nxt.sign and not u.sign and not latin.startswith("h", j2):
                for j3, v in take(j2, ("a", "e", "i", "o", "u")):
                    if CLASS_OF[v] == nxt.sign:
                        keep(c_cost + 0.1, head + SHORT_OF[v] + lf.HA + lf.SILENT, c_notes, best(i + 2, j3, False))
            # ay and aw in the marks, a long e or o in Arabizi (7zeiran).
            if u.sign == "a" and nxt is not None and nxt.letter in (lf.YA, lf.WAW) and not nxt.sign and not nxt.geminate and i + 1 < n - 1:
                mid = ("ei", "ey", "e") if nxt.letter == lf.YA else ("o", "ou")
                for j3, v in take(j2, mid):
                    glide = "y" if nxt.letter == lf.YA else "w"
                    keep(c_cost + 0.8, head + (lf.E_SIGN if nxt.letter == lf.YA else lf.O_SIGN) + nxt.letter, c_notes + (f"diphthong: the marks write a{glide}, Arabizi {v}",), best(i + 2, j3, False))
            # (1) A long vowel: this consonant, then its length letter.
            if nxt is not None and nxt.letter in lf.LENGTH_OF and not nxt.geminate and not nxt.sign and not nxt.sukun and not nxt.tanwin:
                # The word's last sound: its last letter, or the last before a plural's silent alef.
                end = i + 1 == n - 1 or i + 2 in starts or (i + 2 == n - 1 and nxt.letter == lf.WAW and units[i + 2].letter == lf.ALEF and not units[i + 2].sign)
                table: dict[str, str]
                if nxt.letter in (lf.ALEF, lf.ALEF_MAQSURA):
                    table = {"aa": lf.FATHA, "a": lf.FATHA, "e": lf.E_SIGN}
                    ok = u.sign in ("", "a")
                elif nxt.letter == lf.YA:
                    table = {"ee": lf.KASRA, "ii": lf.KASRA, "i": lf.KASRA} | ({"e": lf.KASRA} if end else {"ei": lf.E_SIGN, "ey": lf.E_SIGN, "e": lf.E_SIGN})
                    ok = u.sign in ("", "i")
                else:
                    table = {"ou": lf.DAMMA, "oo": lf.DAMMA, "u": lf.DAMMA} | ({"o": lf.DAMMA} if end else {"o": lf.O_SIGN})
                    ok = u.sign in ("", "u")
                if ok:
                    for j3, v in take(j2, tuple(table)):
                        said = {lf.FATHA: "a", lf.KASRA: "i", lf.DAMMA: "u", lf.E_SIGN: "e", lf.O_SIGN: "o"}[table[v]]
                        where = "last, " if end else ""
                        keep(c_cost, head + table[v] + nxt.letter, c_notes + (f"choice:{where}long {said} written {nxt.letter}: {v}",), best(i + 2, j3, False))
                # her: a long a whose alef stands after a silent h (بدّها badda).
            if nxt is not None and nxt.letter == lf.HA and not nxt.sign and i + 2 == n - 1 and units[i + 2].letter == lf.ALEF and u.sign in ("", "a"):
                for j3, _ in take(j2, ("a",)):
                    keep(c_cost + 0.1, head + lf.FATHA + lf.HA + lf.SILENT + lf.ALEF, c_notes, best(i + 3, j3, False))
            # (2) The feminine ending.
            if nxt is not None and nxt.letter == lf.TA_MARBUTA and i + 1 == n - 1:
                for j3, v in take(j2, ("e", "a", "i")):
                    sign = lf.FATHA if v == "a" else lf.E_SIGN
                    clash = u.sign and u.sign != ("a" if v == "a" else "i")
                    keep(c_cost + (1.5 if clash else 0.0), head + sign + lf.TA_MARBUTA, c_notes + ((f"feminine ending: marked {u.sign}, Arabizi {v}",) if clash else ()), best(i + 2, j3, False))
            # (3) -an.
            if nxt is not None and nxt.letter == lf.ALEF and i + 1 == n - 1 and (u.tanwin or nxt.tanwin):
                for j3, _ in take(j2, ("an",)):
                    keep(c_cost, head + lf.FATHATAN + lf.ALEF, c_notes, best(i + 2, j3, False))
            # (4) A short vowel.
            for j3, v in take(j2, ("a", "e", "i", "o", "u")):
                if u.sign == CLASS_OF[v]:
                    cost, notes = 0.0, ()
                elif u.sign:
                    cost, notes = 1.5, (f"vowel: marked {u.sign}, Arabizi {v}",)
                elif u.sukun:
                    cost, notes = 1.0, (f"vowel: Arabizi {v} where the marks have a sukun",)
                else:
                    cost, notes = 0.2, ()
                if CLASS_OF[v] != "a":
                    notes += (f"choice:short {CLASS_OF[v]}: {v}",)
                keep(c_cost + cost, head + SHORT_OF[v], c_notes + notes, best(i + 1, j3, False))
            # (5) No vowel.
            if u.sign and i == n - 2 and nxt is not None and nxt.letter in READ and not nxt.sign and not nxt.geminate:
                # A helping vowel the marks write and Arabizi leaves out (شُغُل shoghl): not the word's own.
                keep(c_cost + 0.5, head + lf.SUKUN, c_notes + ("helping vowel: in the marks, not in Arabizi",), best(i + 1, j2, False))
            elif u.sign:
                cost, notes = 1.0, (f"vowel: marked {u.sign}, none in Arabizi",)
                # The marks' vowel is kept: Arabizi may leave a short vowel out.
                keep(c_cost + cost, head + SHORT_OF[u.sign], c_notes + notes, best(i + 1, j2, False))
            else:
                keep(c_cost, head + ("" if last else lf.SUKUN), c_notes, best(i + 1, j2, False))
        return min(found, default=None)

    result = best(0, 0, False)
    if not articles and not starts and n > 3 and units[0].letter == lf.ALEF and not units[0].sign and units[1].letter == LAM:
        # No analysis says so, but a bare alef and a lam begin most words as the article.
        with_article = draft(arabic, marked, arabizi, frozenset({0}), starts)
        if with_article.form is not None and (result is None or with_article.cost <= result[0] + 0.5):
            return with_article
    if result is None or result[0] > 3.0:
        shown = nfc(marked or arabic)
        why = f"{shown} cannot be read as {arabizi}" if result is None else f"{shown} and {arabizi} are too far apart to be one form"
        fallback = from_marks(arabic, marked)
        return Draft(fallback, 9.0, (f"Arabizi not read: {why}",), "" if fallback else why)
    cost, form, notes = result
    form = nfc(form)
    try:
        for piece in form.split("+"):
            lf.parse(piece)
    except lf.FormError as e:
        return Draft(None, why=f"drafted {form}, which is not a form: {e}")
    return Draft(form, cost, tuple(n for n in dict.fromkeys(notes) if not n.startswith("choice:")), choices=tuple(n[7:] for n in notes if n.startswith("choice:")))
