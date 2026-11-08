"""A pointed Biblical Hebrew word → its reading in the `tiberian` scheme (ADR 0081).

The course pins a reading on every word (`readings: {tiberian: …}`). This is how the drafts
derived them, and how a maintainer derives one for a new or corrected word: copy the word with
its cantillation accents from the Westminster Leningrad Codex (the accent says where the stress
falls; meteg says where a shewa after qamets is vocal), then `nabu tiberian <word>`.

- The scheme is SBL academic transliteration: spirants ḇ ḡ ḏ ḵ p̄ ṯ, vocal shewa ə, ḥaṭefs
  ă ĕ ŏ, matres ê î ô û â, qamets qatan o, a doubled letter for dagesh forte; an acute marks a
  stressed vowel that is not the word's last; a final "-" marks a word joined by maqaf.
- Stress comes from the main accent; without one, from rules (segolates, -áyim, the suffixes
  -ḵā -nû -hû -hā -nî after a full vowel, the perfect's -tî and -tā). The rules are a draft's
  guess: an accented form is the evidence.
- Vocal shewa: at the start of a word, under dagesh forte, the second of two, under the first
  of two like letters, after a long vowel; silent after a short vowel, at the end, before a
  dagesh lene, and after a stressed syllable.
- Qamets before a shewa'd letter is qatan unless meteg marks it long, it is the qal perfect
  (qāṭəlâ, qāṭəlû), or a noun's -ḵā / -ḵem follows (ləḇāḇəḵā); qamets in an unstressed closed
  syllable is qatan.
- The divine name is read with its qere (ʾăḏōnāy, or ʾĕlōhîm where it is pointed so); the
  Pentateuch's הִוא is hîʾ.

The result is a draft for review, as every pinned reading is.
"""

from __future__ import annotations

import unicodedata
from dataclasses import dataclass, field

SHEWA, HSEGOL, HPATAH, HQAMATS = "ְ", "ֱ", "ֲ", "ֳ"
HIRIQ, TSERE, SEGOL, PATAH, QAMATS = "ִ", "ֵ", "ֶ", "ַ", "ָ"
HOLAM, HOLAM_VAV, QUBUTS, QQATAN = "ֹ", "ֺ", "ֻ", "ׇ"
DAGESH, METEG, RAFE, SIN_DOT = "ּ", "ֽ", "ֿ", "ׂ"
PASHTA = "֙"
VOWEL_POINTS = {
    SHEWA, HSEGOL, HPATAH, HQAMATS, HIRIQ, TSERE, SEGOL, PATAH, QAMATS, HOLAM, HOLAM_VAV, QUBUTS,
    QQATAN,
}  # fmt: skip
ACCENTS = {chr(c) for c in range(0x0591, 0x05B0)}
#: Accents written on a word's last letter (segolta, pashta, telisha qetana, zarqa) or first
#: (telisha gedola, yetiv, dehi), wherever its stress is.
POSTPOSITIVE = {"֒", "֙", "֩", "֮"}
PREPOSITIVE = {"֠", "֚", "֭"}
POSITIONAL = POSTPOSITIVE | PREPOSITIVE
DOTS = {"ׄ", "ׅ"}
BGDKPT = {
    "ב": ("b", "ḇ"), "ג": ("g", "ḡ"), "ד": ("d", "ḏ"), "כ": ("k", "ḵ"), "ך": ("k", "ḵ"),
    "פ": ("p", "p̄"), "ף": ("p", "p̄"), "ת": ("t", "ṯ"),
}  # fmt: skip
PLAIN = {
    "א": "ʾ", "ה": "h", "ו": "w", "ז": "z", "ח": "ḥ", "ט": "ṭ", "י": "y", "ל": "l", "מ": "m",
    "ם": "m", "נ": "n", "ן": "n", "ס": "s", "ע": "ʿ", "צ": "ṣ", "ץ": "ṣ", "ק": "q", "ר": "r",
}  # fmt: skip
VOWELS = {
    HSEGOL: "ĕ", HPATAH: "ă", HQAMATS: "ŏ", HIRIQ: "i", TSERE: "ē", SEGOL: "e", PATAH: "a",
    HOLAM: "ō", HOLAM_VAV: "ō", QUBUTS: "u", QQATAN: "o", QAMATS: "ā", SHEWA: "ə?",
}  # fmt: skip
MATER_Y = {"i": "î", "ē": "ê", "e": "ê"}
MATER_H = {"ā": "â", "e": "eh", "ē": "ēh", "ō": "ōh", "a": "ah", "i": "ih", "u": "uh"}
LONG = {"ā", "ē", "ō", "î", "ê", "û", "ô", "â"}
FULL = {"a", "ā", "e", "ē", "i", "o", "ō", "u", "î", "ê", "û", "ô", "â"}
REDUCED = {"ə", "ĕ", "ă", "ŏ"}


def _is_letter(c: str) -> bool:
    return "א" <= c <= "ת"


@dataclass
class _Unit:
    letter: str
    marks: str = ""
    role: str = "C"  # C consonant, V a vowel letter (shureq, holem vav), M a silent mater
    vowel: str | None = None
    cons: str = ""
    double: bool = False
    mater: str | None = None
    force_vocal: bool = False
    accents: list[str] = field(default_factory=lambda: [])

    @property
    def point(self) -> str | None:
        points = [m for m in self.marks if m in VOWEL_POINTS]
        return points[-1] if points else None

    @property
    def dagesh(self) -> bool:
        return DAGESH in self.marks

    @property
    def meteg(self) -> bool:
        return METEG in self.marks

    @property
    def main_accent(self) -> bool:
        return any(a not in POSITIONAL for a in self.accents)


def strip_accents(word: str) -> str:
    """The word as the course writes it: no accents, meteg, rafe or dots (NFC)."""
    text = unicodedata.normalize("NFD", word)
    text = "".join(c for c in text if c not in ACCENTS and c not in (METEG, RAFE) and c not in DOTS)
    return unicodedata.normalize("NFC", text)


def consonants(word: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", word) if _is_letter(c))


def _units(word: str) -> list[_Unit]:
    out: list[_Unit] = []
    for ch in unicodedata.normalize("NFC", word):
        if _is_letter(ch):
            out.append(_Unit(ch))
        elif ch in DOTS:
            continue
        elif out and unicodedata.combining(ch):
            out[-1].marks += ch
            if ch in ACCENTS:
                out[-1].accents.append(ch)
        else:
            raise ValueError(f"{word!r}: unexpected {ch!r} (U+{ord(ch):04X})")
    return out


@dataclass(frozen=True)
class Reading:
    text: str
    #: Where the stress came from: accent, given, rules, bound (maqaf), or special (qere).
    stress: str


def reading(
    word: str, bound: bool = False, stress: int | None = None, morph: str | None = None
) -> Reading:
    """The word's reading. `bound`: joined by maqaf to the next word. `stress`: syllables from
    the end, where the word has no accent. `morph`: the OSHB morphology code, if known."""
    special = _special(word)
    if special is not None:
        return Reading(special + ("-" if bound else ""), "special")
    us = _units(word)
    n = len(us)
    _vowel_letters(us)
    _consonant_values(us)
    for u in us:
        if u.role == "C" and u.point is not None:
            u.vowel = VOWELS[u.point]
            if u.mater == "y":
                u.vowel = MATER_Y[u.vowel]
            elif u.mater == "h":
                u.vowel = MATER_H.get(u.vowel, u.vowel + "h")
    _qamets_before_shewa(us, morph)
    _shewas(us)
    for u in us:
        if u.vowel == "o?":
            u.vowel = "o"
    nuclei = [i for i, u in enumerate(us) if u.vowel]
    last = us[-1]
    furtive = (
        last.role == "C"
        and last.point == PATAH
        and (last.letter in "חע" or (last.letter == "ה" and last.dagesh))
        and n >= 2
        and (us[-2].role in ("V", "M") or us[-2].vowel not in (None, ""))
    )
    full = [i for i in nuclei if us[i].vowel not in REDUCED and not (furtive and i == n - 1)]
    stressed, how = _stress(us, full, furtive, bound, stress)
    _qamets_qatan(us, nuclei, stressed, bound)
    out: list[str] = []
    final = stressed is None or (bool(full) and stressed == full[-1])
    for i, u in enumerate(us):
        if u.role == "M":
            continue
        if u.role == "V":
            out.append(_acute(u.vowel or "") if i == stressed and not final else u.vowel or "")
            continue
        if furtive and i == n - 1:
            out.append("a" + u.cons)
            continue
        out.append(u.cons * 2 if u.double else u.cons)
        v = u.vowel or ""
        out.append(_acute(v) if v and i == stressed and not final else v)
    text = unicodedata.normalize("NFC", "".join(out))
    return Reading(text + ("-" if bound else ""), how)


def _vowel_letters(us: list[_Unit]) -> None:
    """Shureq and holem vav as vowels; yod and final he as silent maters."""
    n = len(us)
    for i, u in enumerate(us):
        prev = us[i - 1] if i else None
        if u.letter == "ו":
            alone = i == 0 or (prev is not None and prev.point is None and prev.role == "C")
            if u.dagesh and u.point is None and alone:
                u.role, u.vowel = "V", "û"
                continue
            if (
                u.point == HOLAM
                and i > 0
                and prev is not None
                and prev.point is None
                and prev.role == "C"
            ):
                u.role, u.vowel = "V", "ô"
                continue
        if (
            u.letter == "י"
            and u.point is None
            and not u.dagesh
            and prev is not None
            and prev.point in (HIRIQ, TSERE, SEGOL)
            and prev.role == "C"
        ):
            u.role = "M"
            prev.mater = "y"
            continue
        if (
            u.letter == "ה"
            and i == n - 1
            and u.point is None
            and not u.dagesh
            and prev is not None
            and prev.point is not None
        ):
            u.role = "M"
            prev.mater = "h"


def _after_vowel(us: list[_Unit], i: int) -> bool:
    if i == 0:
        return False
    p = us[i - 1]
    if p.role in ("V", "M"):
        return True
    if p.letter == "א" and p.point is None:
        return True  # quiescent ʾalef
    return p.point is not None and p.point != SHEWA


def _consonant_values(us: list[_Unit]) -> None:
    """Stops and spirants, dagesh forte (doubling) and lene, shin and sin, mappiq."""
    n = len(us)
    for i, u in enumerate(us):
        if u.role != "C":
            continue
        if u.letter in BGDKPT:
            stop, spirant = BGDKPT[u.letter]
            u.cons = stop if u.dagesh else spirant
            u.double = u.dagesh and _after_vowel(us, i)
        elif u.letter == "ש":
            u.cons = "ś" if SIN_DOT in u.marks else "š"
            u.double = u.dagesh and _after_vowel(us, i)
        else:
            u.cons = PLAIN[u.letter]
            mappiq = u.letter == "ה" and i == n - 1
            u.double = u.dagesh and not mappiq and _after_vowel(us, i)


def _next_consonant(us: list[_Unit], i: int) -> int | None:
    for j in range(i + 1, len(us)):
        if us[j].role == "C" and not (us[j].letter == "א" and us[j].point is None):
            return j
        if us[j].role == "V":
            return None
    return None


def _qamets_before_shewa(us: list[_Unit], morph: str | None) -> None:
    n = len(us)
    perfect = bool(morph) and any(
        p.startswith(("Vqp3", "Vqq3")) and p[4:6] in ("fs", "cp")
        for p in (morph or "")[1:].split("/")
    )
    for i, u in enumerate(us):
        if u.vowel != "ā" or u.meteg or u.main_accent:
            continue
        j = _next_consonant(us, i)
        if j is None or j != i + 1:
            continue
        if us[j].point == SHEWA and j != n - 1:
            k = j + 1
            suffix = (
                k < n
                and us[k].letter in "ךכ"
                and (k == n - 1 or (k == n - 2 and us[-1].letter in "םן"))
            )
            if suffix or perfect:
                us[j].force_vocal = True
            else:
                u.vowel = "o?"
        elif us[j].point == HQAMATS:
            u.vowel = "o"


def _previous_vowel(us: list[_Unit], i: int) -> str | None:
    for k in range(i - 1, -1, -1):
        if us[k].role == "V":
            return us[k].vowel
        if us[k].role == "C" and us[k].vowel is not None:
            return us[k].vowel
        if us[k].role == "C" and us[k].vowel is None and us[k].letter != "א":
            return ""
    return None


def _shewas(us: list[_Unit]) -> None:
    """Vocal (ə) or silent ("") for each shewa."""
    n = len(us)
    for i, u in enumerate(us):
        if u.vowel != "ə?":
            continue
        rest_shewa = all(
            us[k].role == "C" and us[k].point in (SHEWA, None) for k in range(i, n)
        ) and all(us[k].point == SHEWA or us[k].role != "C" for k in range(i + 1, n))
        if i == n - 1 or (rest_shewa and i >= n - 2):
            u.vowel = ""
            continue
        prev = us[i - 1] if i else None
        first = i == 0 or (prev is not None and prev.role == "V" and i == 1)
        if u.force_vocal or first or u.double:
            u.vowel = "ə"
        elif prev is not None and prev.role == "C" and prev.vowel == "":
            u.vowel = "ə"  # the second of two shewas
        elif i + 1 < n and us[i + 1].letter == u.letter and not us[i + 1].dagesh:
            u.vowel = "ə"  # the first of two like letters (hinənî)
        elif us[i + 1].letter in BGDKPT and us[i + 1].dagesh and us[i + 1].role == "C":
            u.vowel = ""  # a dagesh lene after it
        else:
            pv = _previous_vowel(us, i)
            holder = next(
                (
                    us[k]
                    for k in range(i - 1, -1, -1)
                    if us[k].role in ("C", "V") and (us[k].vowel or us[k].role == "V")
                ),
                None,
            )
            if holder is not None and holder.main_accent:
                u.vowel = ""  # a stressed syllable may close (lā́ylâ)
            elif pv is None:
                u.vowel = "ə"
            elif pv == "o?":
                u.vowel = ""
            else:
                u.vowel = "ə" if pv in LONG else ""


def _stress(
    us: list[_Unit], full: list[int], furtive: bool, bound: bool, given: int | None
) -> tuple[int | None, str]:
    accented = [i for i, u in enumerate(us) if u.accents]
    main = [i for i in accented if not set(us[i].accents) <= POSITIONAL]
    pashtas = [i for i in accented if PASHTA in us[i].accents]
    if bound:
        return None, "bound"
    if main:
        a = main[-1]
        return next((k for k in full if k >= a), full[-1] if full else None), "accent"
    if len(pashtas) >= 2:
        return next((k for k in full if k >= pashtas[0]), None), "accent"
    if len(pashtas) == 1 and not given:
        return (full[-1] if full else None), "accent"
    if given is not None and full:
        return full[max(0, len(full) - 1 - given)], "given"
    if full:
        return full[max(0, len(full) - 1 - _rules(us, full, furtive))], "rules"
    return None, "rules"


def _qamets_qatan(us: list[_Unit], nuclei: list[int], stressed: int | None, bound: bool) -> None:
    """Qamets in an unstressed closed syllable is qatan (kol-, wayyā́qom)."""
    n = len(us)
    for i in nuclei:
        u = us[i]
        if u.vowel != "ā" or u.meteg or i == stressed:
            continue
        j = _next_consonant(us, i)
        if j is None:
            continue
        nothing_after = us[j].vowel is None and j >= n - 1
        closed = us[j].double or (us[j].vowel == "" and us[j].role == "C") or nothing_after
        unstressed = bound or (stressed is not None and i != stressed)
        if closed and unstressed and (us[j].double or us[j].vowel == "" or j == n - 1):
            u.vowel = "o"


def _acute(v: str) -> str:
    if not v:
        return v
    head = unicodedata.normalize("NFD", v[0])
    return unicodedata.normalize("NFC", head + "́" + v[1:])


def _rules(us: list[_Unit], full: list[int], furtive: bool) -> int:
    """Syllables from the end the stress falls on, for a word with no accent."""
    n = len(us)
    if len(full) < 2:
        return 0
    last = us[full[-1]]
    closed = full[-1] < n - 1 and all(us[k].role == "C" for k in range(full[-1] + 1, n))
    before = us[full[-2]].vowel
    if last.vowel == "e" and closed:
        return 1  # segolates, and the narrative past with segol (wayyṓʾmer)
    if last.vowel == "i" and closed and last.letter == "י" and before in ("a", "ā"):
        return 1  # báyiṯ, -áyim
    gutturals = "אהחע"
    if (
        last.vowel == "a"
        and closed
        and not furtive
        and before in ("a", "e")
        and (last.letter in gutturals or us[n - 1].letter in gutturals)
    ):
        return 1  # náʿar, zéraʿ
    if us[-1].letter == "ך" and us[-1].vowel == "ā" and us[-2].vowel in FULL:
        return 1  # -ḵā after a full vowel
    if (
        us[-1].role == "V"
        and us[-1].vowel == "û"
        and n >= 2
        and us[-2].role == "C"
        and (us[-2].letter == "נ" or (us[-2].letter == "ה" and not us[-2].vowel))
    ):
        return 1  # -nû, -hû
    if us[-1].letter == "ה" and us[-1].vowel == "ā" and us[-2].vowel in FULL | {"ê"}:
        return 1  # -hā
    if (
        n >= 3
        and us[-1].letter == "י"
        and us[-1].role == "M"
        and us[-2].letter == "נ"
        and us[-3].role == "C"
        and us[-3].vowel in ("a", "e", "ē", "ā")
    ):
        return 1  # -nî after a full vowel
    if (
        n >= 3
        and us[-2].letter == "ת"
        and us[-1].role == "M"
        and us[-2].vowel == "î"
        and (us[-3].vowel == "" or us[-3].role == "M")
    ):
        return 1  # the perfect's -tî
    if (
        us[-1].letter == "ת"
        and us[-1].vowel == "ā"
        and n >= 2
        and (us[-2].vowel == "" or us[-2].role == "M")
    ):
        return 1  # the perfect's -tā
    return 0


def _special(word: str) -> str | None:
    """Words read otherwise than written: the divine name's qere, הִוא, Jerusalem."""
    plain = strip_accents(word)
    cons = consonants(word)
    points = unicodedata.normalize("NFD", plain)
    if cons.endswith("יהוה") and len(cons) <= 5:
        prefix = cons[:-4]
        elohim = HSEGOL in points or (HIRIQ in points.split("ה")[-1] if "ה" in points else False)
        qere = "ʾĕlōhîm" if elohim and HIRIQ in points else "ʾăḏōnāy"
        if not prefix:
            return qere
        first = points[1:3]
        letter = {"ל": "l", "ב": "b", "כ": "k", "ו": "w", "מ": "m", "ה": "h", "ש": "š"}.get(
            prefix[0], ""
        )
        if TSERE in first:
            return letter + "ēʾăḏōnāy"
        if DAGESH in first and prefix[0] == "ו":
            return "ûʾăḏōnāy"
        return letter + ("aʾḏōnāy" if qere == "ʾăḏōnāy" else "ēʾlōhîm")
    if cons == "הוא" and HIRIQ in points:
        return "hîʾ"  # the Pentateuch's הִוא, read as הִיא
    if cons == "ירושלם":
        return "yərûšāláyim"
    return None
