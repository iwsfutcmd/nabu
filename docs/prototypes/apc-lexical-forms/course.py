"""What courses/apc pins, read as the compiler reads it (ADR 0053): every word of the course in
Arabic script and in Arabizi, with its vowel marks and its analysis.
A word is one Arabic-script token. Arabizi writes clitics apart (bel matbakh for بالمطبخ), so a
word's Arabizi is the tokens that write the same lexemes, in order.

The lexemes are lexicons/apc/lexemes.yaml (flat, sorted by id) and the language's labels and rules
lexicons/apc/language.yaml; the units point at them (a node's `introduces`), and a lexeme is taken
in the order nodes introduce it (the core's lexemesInOrder), with the unit that first does.
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
LEXICON = ROOT / "lexicons" / "apc"
ARAB = "apc-Arab/standard"
LATN = "apc-Latn/arabizi"

# The marks apc-Arab/standard lets a text go without (profiles/apc-Arab.standard.yaml, match.marks.set).
MARKS = re.compile("[ً-ْٰ]")


def nfc(text: str) -> str:
    return unicodedata.normalize("NFC", text)


def unmark(text: str) -> str:
    return MARKS.sub("", text)


def clusters(text: str) -> list[str]:
    """A letter with the marks that follow it (the marks of the profile's set)."""
    return re.findall("[^ً-ْٰ][ً-ْٰ]*", text)


Feats = tuple[tuple[str, str], ...]


def feats_of(raw: dict[str, Any] | None) -> Feats:
    return tuple(sorted((str(k), str(v)) for k, v in (raw or {}).items()))


def feats_text(feats: Feats) -> str:
    """Feature values as a form key writes them (Aspect=Perf;Number=Sing)."""
    return ";".join(f"{k}={v}" for k, v in feats)


@dataclass(frozen=True)
class Word:
    """One Arabic-script word of a sentence or story line, as the course pins it."""

    item: str  # the sentence or line it is in
    arabic: str  # as written in the source
    marked: str | None  # with the vowel marks the compiler gives it; None where the course has none
    arabizi: str  # the Arabizi tokens that say it, joined by spaces
    lexeme: str | None  # the lexeme it writes, or its base among several (`base: true`)
    feats: Feats  # the feature values the token chooses on that lexeme
    lexemes: tuple[tuple[str, str], ...]  # (lexeme, Arabic surface), where the token lists several
    latin_lexemes: tuple[tuple[str, str], ...]  # (lexeme, Arabizi surface)
    own_marks: bool  # the token pins `vocalized` itself


@dataclass
class Course:
    lexicon: dict[str, dict[str, Any]] = field(default_factory=dict)
    labels: list[dict[str, Any]] = field(default_factory=list)
    bare: dict[str, Feats] = field(default_factory=dict)  # by part of speech: what a token with no form is
    rules: dict[str, dict[str, Any]] = field(default_factory=dict)
    order: list[str] = field(default_factory=list)  # what the nodes introduce, in order, each once
    unit_of: dict[str, str] = field(default_factory=dict)
    nodes: list[str] = field(default_factory=list)  # every node, in course order
    introduced_by: dict[str, str] = field(default_factory=dict)  # the node that first introduces a part
    node_of: dict[str, str] = field(default_factory=dict)  # the node of a sentence or story line
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


def lexeme_id(name: str) -> str:
    return name if name.startswith("lexeme:") else f"lexeme:{name}"


def _lexemes_of(token: dict[str, Any]) -> list[tuple[str, str]]:
    """The lexemes a token writes, in order, each with its surface: its `lexemes`, or its own."""
    listed = token.get("lexemes")
    if listed:
        return [(lexeme_id(str(m.get("lexeme", ""))), str(m.get("surface", ""))) for m in listed]
    lexeme = token.get("lexeme")
    return [(lexeme_id(str(lexeme)) if lexeme else "", str(token["surface"]))]


def _base_of(token: dict[str, Any]) -> tuple[str | None, Feats]:
    """The lexeme the token is about, and the feature values it chooses there."""
    listed = token.get("lexemes")
    if listed:
        for m in listed:
            if m.get("base"):
                return lexeme_id(str(m["lexeme"])), feats_of(m.get("feats"))
        return None, ()
    lexeme = token.get("lexeme")
    return (lexeme_id(str(lexeme)) if lexeme else None), feats_of(token.get("feats"))


def _is_word(token: dict[str, Any]) -> bool:
    return token.get("kind", "word") == "word"


def _pair(item: str, forms: dict[str, Any], course: Course) -> None:
    arab = [t for t in forms[ARAB].get("tokens", []) if _is_word(t)]
    latn = [t for t in forms[LATN].get("tokens", []) if _is_word(t)]
    j = 0
    paired: list[Word] = []
    for t in arab:
        want = [lx for lx, _ in _lexemes_of(t)]
        got: list[tuple[str, str]] = []
        surfaces: list[str] = []
        start = j
        # Arabizi tokens until they write the lexemes this word writes (a clitic group is several tokens).
        while j < len(latn) and len(got) < len(want):
            got.extend(_lexemes_of(latn[j]))
            surfaces.append(str(latn[j]["surface"]))
            j += 1
        if [lx for lx, _ in got] != want:
            # Not lexeme for lexeme: fall back on one token for one, where the counts allow it.
            j = start
            if len(arab) == len(latn) and all(_base_of(a)[0] == _base_of(b)[0] for a, b in zip(arab, latn, strict=True)):
                k = arab.index(t)
                got, surfaces, j = _lexemes_of(latn[k]), [str(latn[k]["surface"])], k + 1
            else:
                course.unpaired.append((item, [str(x["surface"]) for x in arab], [str(x["surface"]) for x in latn]))
                return
        own = t.get("vocalized")
        surface = nfc(str(t["surface"]))
        lexeme, feats = _base_of(t)
        paired.append(
            Word(
                item=item,
                arabic=surface,
                marked=course.marks_of(surface, own),
                arabizi=" ".join(surfaces),
                lexeme=lexeme,
                feats=feats,
                lexemes=tuple(_lexemes_of(t)) if t.get("lexemes") else (),
                latin_lexemes=tuple(got) if t.get("lexemes") else (),
                own_marks=own is not None,
            )
        )
    course.words.extend(paired)


def load() -> Course:
    course = Course()
    lexicon = yaml.safe_load((LEXICON / "lexemes.yaml").read_text(encoding="utf-8"))
    course.lexicon = {e["id"]: e for e in lexicon["lexemes"]}
    language = yaml.safe_load((LEXICON / "language.yaml").read_text(encoding="utf-8"))
    course.labels = list(language.get("labels") or [])
    course.rules = {r["id"]: r for r in language.get("rules") or []}
    course.bare = {pos: feats_of(cell) for pos, cell in (language.get("bare") or {}).items()}
    voc = yaml.safe_load((COURSE / "vocalization.yaml").read_text(encoding="utf-8"))
    course.vocalization = {nfc(k): nfc(v) for k, v in voc["words"].items()}
    course.ambiguous = voc.get("ambiguous") or {}
    course.uncertain = list(voc.get("uncertain") or [])
    paths = sorted(glob.glob(str(COURSE / "units" / "*.yaml")), key=lambda p: (not p.endswith("intro.yaml"), p))
    for path in paths:
        unit = yaml.safe_load(Path(path).read_text(encoding="utf-8"))
        for node in unit.get("nodes", []) or []:
            course.nodes.append(node["id"])
            for part in node.get("introduces", []) or []:
                if part not in course.unit_of:
                    course.unit_of[part] = unit["id"]
                    course.introduced_by[part] = node["id"]
                    course.order.append(part)
        for s in unit.get("sentences", []):
            course.node_of[f"{unit['id']}:{s['id']}"] = s.get("node", "")
            _pair(f"{unit['id']}:{s['id']}", s["forms"], course)
        for story in unit.get("stories", []) or []:
            for n, step in enumerate(story.get("steps", []) or []):
                line = step.get("line", step)
                if isinstance(line, dict) and "forms" in line and ARAB in line["forms"]:
                    course.node_of[f"{unit['id']}:{story['id']}#{n}"] = story.get("node", "")
                    _pair(f"{unit['id']}:{story['id']}#{n}", line["forms"], course)
    return course


if __name__ == "__main__":
    c = load()
    distinct = {(w.arabic, w.marked, w.arabizi) for w in c.words}
    print(f"{len(c.lexicon)} lexemes; {len(c.words)} words, {len(distinct)} distinct; {len(c.unpaired)} items not paired")
    print("without marks:", sum(1 for a, m, _ in distinct if m is None), "of", len(distinct))
    for item, a, l in c.unpaired[:8]:
        print("  unpaired", item, a, l)
