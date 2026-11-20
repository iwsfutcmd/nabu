"""Draft a lexical form for every word courses/apc pins, project it back, and say what does not
come back. Run from pipeline/ (it needs PyYAML): uv run --frozen python ../docs/prototypes/apc-lexical-forms/check.py
"""

from __future__ import annotations

import collections
import sys

import lexform as lf
from course import ARAB, LATN, Course, Word, load, nfc, unmark
from derive import Draft, draft


# The words the course writes joined to the next in Arabic script, besides the article.
PROCLITICS = {"sense:w", "sense:b", "sense:3a"}


def shape_of(word: Word) -> tuple[frozenset[int], frozenset[int]]:
    """Where an article's alef stands among the word's letters, and where a clitic before the word
    ends (the conjunction, b-, 3a-: the morphs before the word's own that are words themselves),
    both from the course's morphs."""
    at = 0
    articles: set[int] = set()
    starts: set[int] = set()
    leading = True
    for kc, surface in word.morphs:
        letters = unmark(surface)
        if kc == "sense:el":
            articles.add(at)
        elif leading and kc == "sense:hal" and letters.endswith("\u0627\u0644"):
            # hal: the demonstrative's h, then the article.
            starts.add(at + len(letters) - 2)
            articles.add(at + len(letters) - 2)
        elif leading and kc in PROCLITICS:
            starts.add(at + len(letters))
        else:
            leading = False
        at += len(letters)
    return frozenset(articles), frozenset(s for s in starts if 0 < s < at)


def compare(form: str, arabic: str, marked: str | None, arabizi: str) -> list[str]:
    """What the projections of `form` do not give back of what the course pins."""
    out = []
    if lf.to_arabic(form.replace(" ", "")) != unmark(nfc(arabic)).replace(" ", ""):
        out.append(f"arabic: projected {lf.to_arabic(form)}")
    if marked is not None:
        got = " ".join(lf.to_marked(w) for w in form.split())
        if got != nfc(marked):
            out.append(f"marks: projected {got}, pinned {nfc(marked)}")
    spellings = [""]
    for w in form.split():
        spellings = [a + b for a in spellings for b in lf.to_arabizi(w)][:20000]
    want = arabizi.replace(" ", "").replace("-", "").lower()
    if want not in spellings:
        out.append(f"arabizi: {arabizi} is not among the projected spellings ({spellings[0]} first)")
    return out


def main() -> None:
    course = load()
    seen: dict[tuple[str, str | None, str, frozenset[int], frozenset[int]], Draft] = {}
    stats: collections.Counter[str] = collections.Counter()
    notes: collections.Counter[str] = collections.Counter()
    failures: list[str] = []
    mismatches: list[str] = []
    for w in course.words:
        articles, starts = shape_of(w)
        key = (w.arabic, w.marked, w.arabizi, articles, starts)
        if key in seen:
            continue
        d = draft(w.arabic, w.marked, w.arabizi, articles, starts)
        seen[key] = d
        if d.form is None:
            stats["no draft"] += 1
            failures.append(f"{w.item}: {d.why}")
            continue
        stats["drafted"] += 1
        for n in d.notes:
            notes[n.split(":")[0]] += 1
        back = compare(d.form, w.arabic, w.marked if w.marked else (w.arabic if unmark(w.arabic) != w.arabic else None), w.arabizi)
        if back:
            stats["not reproduced"] += 1
            mismatches.append(f"{w.item}: {w.arabic} / {w.arabizi}: {d.form}: " + "; ".join(back))
        else:
            stats["reproduced"] += 1
    print(dict(stats))
    print("notes:", notes.most_common())
    verbose = "-v" in sys.argv
    for line in failures[: 400 if verbose else 25]:
        print("  NO DRAFT", line)
    for line in mismatches[: 400 if verbose else 25]:
        print("  DIFFERS ", line)


if __name__ == "__main__":
    main()
