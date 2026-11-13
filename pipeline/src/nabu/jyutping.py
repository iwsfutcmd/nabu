"""Cantonese in Jyutping, written from the characters' pinned readings (ADR 0126).

yue's second orthography, yue-Latn/jyutping, is never written by hand. Every sentence, story line,
word (KC) form and character name in it comes from the Hong Kong characters' form: each word
token's pinned Jyutping becomes the word, its characters the word's ruby (`characters`), and the
text joins the words with spaces and Latin punctuation. `nabu jyutping <course>` writes it into the
course's units; the compiler checks the two agree (`enrich.transliteration-mismatch`).

Accept sets (`reverse`) are converted too: each character of an alternative takes the reading the
sentence pins for it, else the one the course pins for that word everywhere, else PyCantonese's.
Characters the course reads more than one way, outside the sentence, and PyCantonese's guesses are
reported, for a person to check.
"""

from __future__ import annotations

import re
from collections import Counter
from collections.abc import Iterable, Iterator
from dataclasses import dataclass, field
from typing import Any, cast

import regex

HANT = "yue-Hant-HK/standard"
LATN = "yue-Latn/jyutping"
#: The ruby layer of the Jyutping orthography: each word's characters.
LAYER = "characters"
#: The Hant orthography's ruby layer: each word's Jyutping.
SCHEME = "jyutping"
PUNCTUATION = {"。": ".", "？": "?", "！": "!", "，": ","}
HAN = regex.compile(r"\p{Han}")
SYLLABLE = regex.compile(r"[a-z]+[1-6]")
#: Accept-set notation (packages/core/src/accept/notation.ts): what is not text.
SPECIALS = set("()[]|\\@#\n")


def syllables(reading: str) -> list[str]:
    return reading.split()


def _pieces(text: str, tokens: list[dict[str, Any]]) -> Iterator[tuple[str, Any]]:
    """The form as ("word", token) and ("punct", char) pieces, in order, as the compiler aligns
    tokens: each surface found after the last, the gaps punctuation."""
    at = 0
    for t in tokens:
        start = text.find(t["surface"], at)
        if start < 0:
            raise ValueError(f"{t['surface']!r} is not in {text!r} after {at}")
        for c in text[at:start]:
            yield ("punct", c)
        yield ("word", t)
        at = start + len(t["surface"])
    for c in text[at:]:
        yield ("punct", c)


def _split(surface: str, parts: list[str], reading: list[str]) -> list[str]:
    """The Jyutping of each part of a word (its morphs), a space after every part but the last."""
    out: list[str] = []
    at = 0
    for i, part in enumerate(parts):
        n = len(part)
        piece = " ".join(reading[at : at + n])
        out.append(piece + (" " if i < len(parts) - 1 else ""))
        at += n
    if at != len(surface):
        raise ValueError(f"morphs of {surface!r} do not cover it")
    return out


def latin_token(token: dict[str, Any]) -> dict[str, Any]:
    """A Hant word token in Jyutping: the pinned reading is the word, the characters its ruby."""
    reading = token.get("readings", {}).get(SCHEME)
    if reading is None:
        raise ValueError(f"{token['surface']!r} has no pinned {SCHEME}")
    syl = syllables(reading)
    if len(syl) != len(token["surface"]):
        raise ValueError(f"{token['surface']!r}: {reading!r} does not line up with its characters")
    out: dict[str, Any] = {"surface": " ".join(syl)}
    for key, value in token.items():
        if key in ("surface", "readings", "morphs"):
            continue
        out[key] = value
    morphs = token.get("morphs")
    if morphs:
        parts = _split(token["surface"], [m["surface"] for m in morphs], syl)
        out["morphs"] = [{**m, "surface": p} for m, p in zip(morphs, parts, strict=True)]
    out["readings"] = {LAYER: token["surface"]}
    return out


def latin_form(text: str, tokens: list[dict[str, Any]]) -> tuple[str, list[dict[str, Any]]]:
    """The Jyutping text and tokens of a Hant form: words spaced, Latin punctuation after them."""
    out = ""
    latin: list[dict[str, Any]] = []
    for kind, piece in _pieces(text, tokens):
        if kind == "word":
            lt = latin_token(piece)
            out += (" " if out else "") + lt["surface"]
            latin.append(lt)
        else:
            mapped = PUNCTUATION.get(piece)
            if mapped is None:
                raise ValueError(f"no Latin punctuation for {piece!r} in {text!r}")
            out += mapped
    return out, latin


@dataclass
class Lexicon:
    """The course's pinned readings: each word's, counted; each character's, counted."""

    words: dict[str, Counter[str]] = field(default_factory=dict[str, Counter[str]])
    chars: dict[str, Counter[str]] = field(default_factory=dict[str, Counter[str]])
    #: Each KC's readings (by the tokens and morphs that name it).
    kcs: dict[str, Counter[str]] = field(default_factory=dict[str, Counter[str]])

    def add(self, token: dict[str, Any]) -> None:
        surface: str = token["surface"]
        reading = token.get("readings", {}).get(SCHEME)
        if reading is None:
            return
        syl = syllables(reading)
        if len(syl) != len(surface):
            return
        self.words.setdefault(surface, Counter())[reading] += 1
        for c, s in zip(surface, syl, strict=True):
            self.chars.setdefault(c, Counter())[s] += 1
        if token.get("sense") is not None:
            self.kcs.setdefault(f"sense:{token['sense']}", Counter())[reading] += 1
        morphs = cast(list[dict[str, str]], token.get("morphs") or [])
        if morphs:
            parts = _split(surface, [m["surface"] for m in morphs], syl)
            for m, p in zip(morphs, parts, strict=True):
                self.kcs.setdefault(m["kc"], Counter())[p.strip()] += 1


def forms_in(data: Any) -> Iterator[dict[str, Any]]:
    """Every orthography-keyed `forms` mapping in a unit (sentences, story lines)."""
    if isinstance(data, dict):
        mapping = cast(dict[str, Any], data)
        forms = mapping.get("forms")
        # Sentences and story lines map an orthography to a form; KC forms are lists of words.
        if isinstance(forms, dict) and isinstance(cast(dict[str, Any], forms).get(HANT), dict):
            yield cast(dict[str, Any], forms)
        for v in mapping.values():
            yield from forms_in(v)
    elif isinstance(data, list):
        for v in cast(list[Any], data):
            yield from forms_in(v)


def lexicon_of(units: Iterable[Any]) -> Lexicon:
    lex = Lexicon()
    for unit in units:
        for forms in forms_in(unit):
            hant = cast(dict[str, Any], forms[HANT])
            for t in cast(list[dict[str, Any]], hant.get("tokens") or []):
                lex.add(t)
    return lex


def _most(counter: Counter[str] | None) -> str | None:
    return None if not counter else counter.most_common(1)[0][0]


#: Spellings typed for another word (the course's typing variants): read as that word. REVIEW
VARIANT_SPELLINGS = {
    "既": "嘅",
    "無": "冇",
    "哂": "晒",
    "岩": "啱",
    "訓": "瞓",
    "野": "嘢",
    "黎": "嚟",
}
#: How the course uses these characters where neither the sentence nor the course pins them, and
#: PyCantonese reads another word (會 wui6 "meeting" for wui5 "will", 位 wai6 for the classifier
#: wai2, 吓 haa2 for the delimitative haa5, 頂 ding2 for the classifier deng2, 咁 gam3 "so" for
#: gam2 "then", 咪 mi1 for mai6 in 係咪, 阿 o1 for the prefix aa3). REVIEW
COURSE_READINGS = {
    "會": "wui5",
    "位": "wai2",
    "吓": "haa5",
    "頂": "deng2",
    "咁": "gam2",
    "咪": "mai6",
    "阿": "aa3",
}
#: Particles a typed alternative may say either way when the sentence does not pin them: the
#: characters cannot tell, so the Jyutping accepts both.
EITHER = {"呀": ("aa3", "aa4")}


@dataclass
class Converted:
    text: str
    #: Characters read by PyCantonese or chosen among the course's readings, with where.
    unsure: list[str] = field(default_factory=list[str])


def char_readings(text: str, lex: Lexicon, pinned: dict[str, str]) -> list[tuple[str, ...]]:
    """Each character's reading(s) in a run of Han characters: the sentence's pinned words, then
    the course's words (longest first, one reading), then the course's readings above, then
    PyCantonese on the whole run (words read in context)."""
    said = "".join(VARIANT_SPELLINGS.get(c, c) for c in text)
    out: list[tuple[str, ...] | None] = [None] * len(said)
    i = 0
    while i < len(said):
        for j in range(len(said), i, -1):
            w = said[i:j]
            reading = pinned.get(w)
            if reading is None:
                counts = lex.words.get(w)
                if counts and len(counts) == 1:
                    reading = _most(counts)
            if reading is not None and len(syllables(reading)) == j - i:
                for k, s in enumerate(syllables(reading)):
                    out[i + k] = (s,)
                i = j
                break
        else:
            c = said[i]
            if c in COURSE_READINGS:
                out[i] = (COURSE_READINGS[c],)
            i += 1
    if any(r is None for r in out):
        from nabu.analyzers import Cantonese

        guess = Cantonese().reading(SCHEME, said)
        guessed = syllables(guess) if guess is not None else []
        if len(guessed) != len(said):
            raise ValueError(f"no Jyutping for {text!r}")
        out = [r if r is not None else (g,) for r, g in zip(out, guessed, strict=True)]
    # 呀 either way, the reading found first.
    return [
        tuple(dict.fromkeys(r + EITHER.get(c, ()))) for c, r in zip(said, out, strict=True) if r
    ]


def _expand(line: str) -> list[list[tuple[str, int]]]:
    """Every alternative of one accept-set line, as its characters and their places in the line."""

    def seq(at: int, stop: str) -> tuple[list[list[tuple[str, int]]], int]:
        alts: list[list[tuple[str, int]]] = [[]]
        while at < len(line) and line[at] not in stop:
            c = line[at]
            if c in "([":
                close = ")" if c == "(" else "]"
                branches: list[list[tuple[str, int]]] = []
                at += 1
                while True:
                    got, at = seq(at, "|" + close)
                    branches += got
                    if line[at] == close:
                        break
                    at += 1
                if c == "[":
                    branches.append([])
                alts = [a + b for a in alts for b in branches]
            else:
                alts = [[*a, (c, at)] for a in alts]
            at += 1
        return alts, at

    alts, _ = seq(0, "")
    return alts


def latin_reverse(pattern: str, tokens: list[dict[str, Any]], lex: Lexicon) -> Converted:
    """An accept set (notation) with each character in Jyutping, the operators kept. Each
    character takes the reading it has in every alternative it is in; where alternatives read it
    differently, all of them, as a group."""
    pinned = {
        t["surface"]: t["readings"][SCHEME] for t in tokens if SCHEME in t.get("readings", {})
    }
    out: list[str] = []
    unsure: list[str] = []
    seen: set[str] = set()
    for line in pattern.split("\n"):
        if line.startswith("#") or any(c in line for c in "\\@"):
            raise ValueError(f"accept-set notation in {line!r} is not converted")
        # In the order first met: the canonical alternative comes first, so its readings lead.
        readings: dict[int, dict[str, None]] = {}
        for alt in _expand(line):
            chars = "".join(c for c, _ in alt)
            for (c, at), rs in zip(alt, char_readings(chars, lex, pinned), strict=True):
                readings.setdefault(at, {}).update(dict.fromkeys(rs))
                if len(rs) == 1 and c not in pinned and c not in lex.chars:
                    unsure.append(f"{c} {rs[0]} ({line})")
        pieces: list[str] = []
        for at, c in enumerate(line):
            if c in "()[]|":
                pieces.append(c)
            else:
                rs = list(readings.get(at, {}))
                pieces.append(rs[0] if len(rs) == 1 else "(" + "|".join(rs) + ")")
        joined = ""
        for p in pieces:
            if joined and p not in (")", "]", "|") and joined[-1] not in ("(", "[", "|"):
                joined += " "
            joined += p
        joined = _dedupe_groups(joined)
        # A line every alternative of which an earlier line already gives adds nothing (後(面|邊)
        # and 後便 are both hau6 bin6).
        said = {" ".join("".join(c for c, _ in alt).split()) for alt in _expand(joined)}
        if not said <= seen:
            seen |= said
            out.append(joined)
    return Converted("\n".join(out), unsure)


def _dedupe_groups(text: str) -> str:
    """(dei6|dei6) → dei6; (a|a|b) → (a|b): spellings said alike are one answer in Jyutping."""
    pattern = re.compile(r"\(([^()\[\]]*)\)")

    def one(m: re.Match[str]) -> str:
        branches = list(dict.fromkeys(m.group(1).split("|")))
        return branches[0] if len(branches) == 1 and branches[0] else "(" + "|".join(branches) + ")"

    # A group that is a whole branch of another joins it: (maa3|(aa3|aa4)) → (maa3|aa3|aa4).
    inner = re.compile(r"(?<=[(|])\(([^()\[\]]*)\)(?=[|)])")
    while True:
        new = inner.sub(r"\1", pattern.sub(one, text))
        if new == text:
            return new
        text = new


# ------------------------------------------------------------------------- writing it into units


def _flow(value: Any) -> Any:
    from nabu import yamlio

    if isinstance(value, dict):
        return yamlio.Flow({k: _flow(v) for k, v in value.items()})  # pyright: ignore[reportUnknownVariableType]
    if isinstance(value, list):
        return yamlio.FlowList([_flow(v) for v in value])  # pyright: ignore[reportUnknownVariableType]
    return value


def _flow_line(value: Any) -> str:
    from nabu import yamlio

    return yamlio.dump(_flow(value), width=10**9).strip()


def _form_block(form: dict[str, Any], indent: str, lex: Lexicon, report: list[str]) -> list[str]:
    """The yue-Latn/jyutping block written beside a Hant form block."""
    from nabu import yamlio

    text, tokens = latin_form(form["text"], form.get("tokens") or [])
    latin: dict[str, Any] = {"text": text, "tokens": _flow(tokens)}
    if "reverse" in form:
        got = latin_reverse(form["reverse"], form.get("tokens") or [], lex)
        report += got.unsure
        latin["reverse"] = got.text
    block = yamlio.dump({LATN: latin}, width=10**9).rstrip("\n").split("\n")
    return [f"{indent}{line}" for line in block]


_FORM_HEAD = re.compile(rf"^(\s*){re.escape(HANT)}:\s*$")
_LATN_HEAD = re.compile(rf"^(\s*){re.escape(LATN)}:\s*$")
_FLOW_ITEM = re.compile(r"^(\s*- )(\{.*\})\s*$")


def _indent(line: str) -> int:
    return len(line) - len(line.lstrip(" "))


def rewrite_unit(source: str, lex: Lexicon) -> tuple[str, list[str]]:
    """A unit's text with its Jyutping written in: a yue-Latn/jyutping block after every Hant form
    block (an old one replaced), and the Jyutping of every KC form and character name. Everything
    else is left as written."""
    import yaml

    lines = source.split("\n")
    out: list[str] = []
    report: list[str] = []
    i = 0
    while i < len(lines):
        line = lines[i]
        head = _FORM_HEAD.match(line)
        if head:
            base = _indent(line)
            j = i + 1
            while j < len(lines) and (not lines[j].strip() or _indent(lines[j]) > base):
                j += 1
            block = lines[i:j]
            form = yaml.safe_load("\n".join(x[base:] for x in block))[HANT]
            out += block
            # An old Jyutping block right after it is written again.
            if j < len(lines) and _LATN_HEAD.match(lines[j]) and _indent(lines[j]) == base:
                j += 1
                while j < len(lines) and (not lines[j].strip() or _indent(lines[j]) > base):
                    j += 1
            out += _form_block(form, " " * base, lex, report)
            i = j
            continue
        item = _FLOW_ITEM.match(line)
        if item:
            value = yaml.safe_load(item.group(2))
            changed = False
            if isinstance(value, dict):
                for key in ("forms", "name"):
                    spot = value.get(key)  # pyright: ignore[reportUnknownMemberType, reportUnknownVariableType]
                    if isinstance(spot, dict) and HANT in spot:
                        hant = spot[HANT]  # pyright: ignore[reportUnknownVariableType]
                        if key == "forms":
                            kc = str(value.get("id"))  # pyright: ignore[reportUnknownMemberType, reportUnknownArgumentType]
                            latin = [kc_reading(kc, str(f), lex, report) for f in hant]  # pyright: ignore[reportUnknownVariableType, reportUnknownArgumentType]
                        else:
                            latin = word_text(str(hant), lex, report)  # pyright: ignore[reportUnknownArgumentType]
                        new = {k: v for k, v in spot.items() if k != LATN}  # pyright: ignore[reportUnknownVariableType]
                        new[LATN] = latin
                        value[key] = new
                        changed = True
            if changed:
                out.append(item.group(1) + _flow_line(value))
                i += 1
                continue
        out.append(line)
        i += 1
    return "\n".join(out), report


def kc_reading(kc: str, form: str, lex: Lexicon, report: list[str]) -> str:
    """A KC form's Jyutping: what the course's tokens and morphs of that KC read it as."""
    counts = lex.kcs.get(kc)
    if counts:
        fits = [r for r, _ in counts.most_common() if len(syllables(r)) == len(form)]
        if fits:
            if len(fits) > 1:
                report.append(f"{form} ({kc}): {', '.join(fits)}; took {fits[0]}")
            return fits[0]
    return word_text(form, lex, report)


def word_text(surface: str, lex: Lexicon, report: list[str]) -> str:
    """A word or name not tied to one token: the course's reading, else PyCantonese's."""
    readings = char_readings(surface, lex, {})
    for c, rs in zip(surface, readings, strict=True):
        if c not in lex.chars:
            report.append(f"{c} {rs[0]} ({surface})")
    return " ".join(rs[0] for rs in readings)
