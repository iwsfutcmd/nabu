"""What courses/apc pins, read as the compiler reads it (ADR 0053): every word of the course in
Arabic script and in Arabizi, with its vowel marks and its analysis.
A word is one Arabic-script token. Arabizi writes clitics apart (bel matbakh for بالمطبخ), so a
word's Arabizi is the tokens that carry the same KCs, in order.
"""

from __future__ import annotations

import glob
import re
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

ROOT = Path(__file__).resolve().parents[3]
COURSE = ROOT / "courses" / "apc"
ARAB = "apc-Arab/standard"
LATN = "apc-Latn/arabizi"

# The marks apc-Arab/standard lets a text go without (profiles/apc-Arab.standard.yaml, match.marks.set).
MARKS = re.compile("[\u064b-\u0652\u0670]")


def nfc(text: str) -> str:
    return unicodedata.normalize("NFC", text)


def unmark(text: str) -> str:
    return MARKS.sub("", text)


def clusters(text: str) -> list[str]:
    """A letter with the marks that follow it (the marks of the profile's set)."""
    return re.findall("[^\u064b-\u0652\u0670][\u064b-\u0652\u0670]*", text)


@dataclass(frozen=True)
class Word:
    """One Arabic-script word of a sentence or story line, as the course pins it."""

    item: str  # the sentence or line it is in
    arabic: str  # as written in the source
    marked: str | None  # with the vowel marks the compiler gives it; None where the course has none
    arabizi: str  # the Arabizi tokens that say it, joined by spaces
    sense: str | None
    form: str | None
    morphs: tuple[tuple[str, str], ...]  # (kc, Arabic surface)
    latin_morphs: tuple[tuple[str, str], ...]  # (kc, Arabizi surface)
    own_marks: bool  # the token pins `vocalized` itself


@dataclass
class Course:
    kcs: dict[str, dict[str, Any]] = field(default_factory=dict)
    unit_of: dict[str, str] = field(default_factory=dict)
    words: list[Word] = field(default_factory=list)
    unpaired: list[tuple[str, list[str], list[str]]] = field(default_factory=list)
    vocalization: dict[str, str] = field(default_factory=dict)
    ambiguous: dict[str, Any] = field(default_factory=dict)
    uncertain: list[str] = field(default_factory=list)

    def marks_of(self, surface: str, own: str | None = None) -> str | None:
        """The word with its vowel marks, by the compiler's rule (compiler/build.py, mark_vowels)."""
        if own is not None:
            return nfc(own)
        letters = unmark(surface)
        exact = self.vocalization.get(surface)
        if exact is not None:
            return exact
        base = self.vocalization.get(letters)
        if base is None:
            return None
        if letters == surface:
            return base
        have, add = clusters(surface), clusters(base)
        if len(have) != len(add):
            return None
        out = []
        for a, b in zip(have, add, strict=True):
            if unmark(a) != unmark(b):
                return None
            own_marks, given = MARKS.findall(a), MARKS.findall(b)
            out.append(b if all(own_marks.count(m) <= given.count(m) for m in own_marks) else a)
        return "".join(out)


def _kcs_of(token: dict[str, Any]) -> list[tuple[str, str]]:
    """The KCs a token carries, in order, each with its surface: its morphs, or itself."""
    morphs = token.get("morphs")
    if morphs:
        return [(str(m.get("kc", "")), str(m.get("surface", ""))) for m in morphs]
    sense = token.get("sense")
    return [(f"sense:{sense}" if sense else "", str(token["surface"]))]


def _is_word(token: dict[str, Any]) -> bool:
    return token.get("kind", "word") == "word"


def _pair(item: str, forms: dict[str, Any], course: Course) -> None:
    arab = [t for t in forms[ARAB].get("tokens", []) if _is_word(t)]
    latn = [t for t in forms[LATN].get("tokens", []) if _is_word(t)]
    j = 0
    paired: list[Word] = []
    for t in arab:
        want = [kc for kc, _ in _kcs_of(t)]
        got: list[tuple[str, str]] = []
        surfaces: list[str] = []
        start = j
        # Arabizi tokens until they carry the KCs this word carries (a clitic group is several tokens).
        while j < len(latn) and len(got) < len(want):
            got.extend(_kcs_of(latn[j]))
            surfaces.append(str(latn[j]["surface"]))
            j += 1
        if [kc for kc, _ in got] != want:
            # Not morph for morph: fall back on one token for one, where the counts allow it.
            j = start
            if len(arab) == len(latn) and all(a.get("sense") == b.get("sense") for a, b in zip(arab, latn, strict=True)):
                k = arab.index(t)
                got, surfaces, j = _kcs_of(latn[k]), [str(latn[k]["surface"])], k + 1
            else:
                course.unpaired.append((item, [str(x["surface"]) for x in arab], [str(x["surface"]) for x in latn]))
                return
        own = t.get("vocalized")
        surface = nfc(str(t["surface"]))
        paired.append(
            Word(
                item=item,
                arabic=surface,
                marked=course.marks_of(surface, own),
                arabizi=" ".join(surfaces),
                sense=t.get("sense"),
                form=t.get("form"),
                morphs=tuple(_kcs_of(t)) if t.get("morphs") else (),
                latin_morphs=tuple(got) if t.get("morphs") else (),
                own_marks=own is not None,
            )
        )
    course.words.extend(paired)


def load() -> Course:
    course = Course()
    voc = yaml.safe_load((COURSE / "vocalization.yaml").read_text(encoding="utf-8"))
    course.vocalization = {nfc(k): nfc(v) for k, v in voc["words"].items()}
    course.ambiguous = voc.get("ambiguous") or {}
    course.uncertain = list(voc.get("uncertain") or [])
    paths = sorted(glob.glob(str(COURSE / "units" / "*.yaml")), key=lambda p: (not p.endswith("intro.yaml"), p))
    for path in paths:
        unit = yaml.safe_load(Path(path).read_text(encoding="utf-8"))
        for kc in unit.get("kcs", []):
            course.kcs[kc["id"]] = kc
            course.unit_of[kc["id"]] = unit["id"]
        for s in unit.get("sentences", []):
            _pair(f"{unit['id']}:{s['id']}", s["forms"], course)
        for story in unit.get("stories", []) or []:
            for n, step in enumerate(story.get("steps", []) or []):
                line = step.get("line", step)
                if isinstance(line, dict) and "forms" in line and ARAB in line["forms"]:
                    _pair(f"{unit['id']}:{story['id']}#{n}", line["forms"], course)
    return course


if __name__ == "__main__":
    c = load()
    distinct = {(w.arabic, w.marked, w.arabizi) for w in c.words}
    print(f"{len(c.kcs)} KCs; {len(c.words)} words, {len(distinct)} distinct; {len(c.unpaired)} items not paired")
    print("without marks:", sum(1 for a, m, _ in distinct if m is None), "of", len(distinct))
    for item, a, l in c.unpaired[:8]:
        print("  unpaired", item, a, l)
