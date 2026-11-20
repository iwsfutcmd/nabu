"""A course source in today's shape, read as plain data for the converter
(docs/migration-design.md).

The converter reads what the compiler reads and nothing else: course.yaml, its unit files and the
audio index. It needs no line numbers: a finding names a sentence, a KC or a token.
"""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

from nabu.yamlio import INVISIBLE

Json = dict[str, Any]


@dataclass(frozen=True)
class Item:
    """A sentence or a story line: what carries forms in each orthography."""

    id: str
    """A sentence's id, or a story's id and the step's index (story#3)."""
    unit: str
    data: Json
    story: str | None = None


@dataclass(frozen=True)
class Course:
    dir: Path
    data: Json
    """course.yaml as written."""
    units: list[tuple[str | None, Json]]
    """Each unit with the path course.yaml gives it (None: written inline)."""

    @property
    def id(self) -> str:
        return str(self.data["id"])

    @property
    def language(self) -> str:
        """The language a lexicon is kept for: the target's language subtag."""
        return str(self.data["target"]).split("-")[0]

    @property
    def orthographies(self) -> list[str]:
        return [o if isinstance(o, str) else str(o["id"]) for o in self.data["orthographies"]]

    def kcs(self) -> dict[str, Json]:
        """Every KC, in the order the units define them."""
        out: dict[str, Json] = {}
        for _, unit in self.units:
            for kc in seq(unit.get("kcs")):
                out.setdefault(str(kc["id"]), kc)
        return out

    def kc_units(self) -> dict[str, str]:
        out: dict[str, str] = {}
        for _, unit in self.units:
            for kc in seq(unit.get("kcs")):
                out.setdefault(str(kc["id"]), str(unit["id"]))
        return out

    def items(self) -> Iterator[Item]:
        """Sentences and story lines, in course order."""
        for _, unit in self.units:
            yield from items_of(unit)


def items_of(unit: Json) -> Iterator[Item]:
    uid = str(unit["id"])
    for s in seq(unit.get("sentences")):
        yield Item(str(s["id"]), uid, s)
    for story in seq(unit.get("stories")):
        for i, step in enumerate(seq(story.get("steps"))):
            line = obj(step.get("line"))
            if "forms" in line:
                yield Item(f"{story['id']}#{i}", uid, line, str(story["id"]))


def load(course_dir: Path) -> Course:
    data = yaml.safe_load((course_dir / "course.yaml").read_text(encoding="utf-8"))
    units: list[tuple[str | None, Json]] = []
    for u in seq(data.get("units")):
        if isinstance(u, str):
            units.append((u, yaml.safe_load((course_dir / u).read_text(encoding="utf-8"))))
        else:
            units.append((None, u))
    return Course(course_dir, data, units)


# What a script writes on its letters and may leave out: Arabic's vowel signs (never the shadda,
# which the courses write in plain text, nor the hamza and madda that make a letter: U+0653 to
# U+0655), Hebrew's points and accents.
_OPTIONAL_MARKS = re.compile(
    "["
    + "\u064b-\u0650\u0652\u0656-\u065f\u0670"
    + "\u0591-\u05bd\u05bf\u05c1\u05c2\u05c4\u05c5\u05c7"
    + "]"
)
_GRAVE, _ACUTE = "\u0300", "\u0301"
# The shadda is written in plain text (kell, baddi) and added where a vowel-marked line shows a
# sun letter doubled after the article: the same letters with it or without.
_SHADDA = "\u0651"


def seq(value: Any) -> list[Any]:
    """A list a YAML document may leave out."""
    return list(value) if value else []


def obj(value: Any) -> Json:
    """A mapping a YAML document may leave out."""
    return dict(value) if value else {}


def fold(text: str) -> str:
    """How the converter compares a token with an entry's spelling: the same letters, whatever
    the case, the optional marks (Arabic vowel signs and the shadda, Hebrew points), invisible
    characters and the space around them; a Greek grave is its acute (ADR 0087). It never
    grades: a difference only makes a finding."""
    decomposed = unicodedata.normalize("NFD", text).replace(_GRAVE, _ACUTE)
    bare = _OPTIONAL_MARKS.sub("", INVISIBLE.sub("", decomposed)).replace(_SHADDA, "")
    # A lexeme written before another keeps the space between them in its letters (yue ngo5 dei6).
    return unicodedata.normalize("NFC", bare).casefold().strip()


def show(text: str) -> str:
    """Invisible characters as their escapes, for reports (never literally)."""
    return INVISIBLE.sub(lambda m: f"\\u{ord(m.group()):04x}", text)
