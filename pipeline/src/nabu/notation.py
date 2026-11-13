"""Accept-set notation (gameplan §7.4) as the pipeline writes it.

The notation is core's: packages/core/src/accept/notation.ts parses it, for grading and for the
compiler (through core-cli). Python only puts literal text into it (reports promoted to accept
sets, drafted courses, imports, corrections) and maps a line's canonical answer back onto the line
(corrections edit a translation in place). tests/test_notation.py checks both against core-cli's
parser on generated text and lines, so they cannot drift from it.
"""

from __future__ import annotations

import regex

#: What the notation reads as syntax anywhere in a line: groups, alternation, the escape and a
#: weight's @. A `#` is syntax only where it begins a line (a comment).
SPECIAL = frozenset("()[]|\\@")

#: A trailing weight, as core's parser finds it: white space, then @ and a number, at the end.
WEIGHT = regex.compile(r"\s@\d+(\.\d+)?\s*$")


def escape(text: str, at_start: bool = True) -> str:
    """`text` as literal notation, spaces kept: every special escaped, and a `#` escaped where it
    would begin the line (`at_start`: `text` is the start of a line)."""
    out = "".join(f"\\{c}" if c in SPECIAL else c for c in text)
    return f"\\{out}" if at_start and out.startswith("#") else out


def literal(answer: str) -> str:
    """An answer as one literal accept-set alternative: runs of white space as one space, the
    ends trimmed, then escaped."""
    return escape(" ".join(answer.split()))


def _graphemes(text: str) -> list[str]:
    return regex.findall(r"\X", text)


def canonical_map(line: str) -> tuple[str, list[tuple[int, int] | None]]:
    """The canonical answer of one accept-set line (every optional part, the first branch of
    every alternation, escapes resolved, no weight), as core's parser gives it (its
    `canonicalSource`, which is NFC: course text already is), and, per grapheme of it, the span it
    came from in `line` when that is plain text outside any group (None otherwise)."""
    match = WEIGHT.search(line.strip())
    lead = len(line) - len(line.lstrip())
    end = lead + (match.start() if match is not None else len(line.strip()))
    chars: list[tuple[str, int, int, bool]] = []  # char, start, end, plain
    depth = 0
    skipping: list[bool] = []  # per open group: are we past its first branch?
    i = lead
    while i < end:
        c = line[i]
        dead = any(skipping)
        if c == "\\" and i + 1 < end:
            if not dead:
                chars.append((line[i + 1], i, i + 2, False))
            i += 2
            continue
        if c in "([":
            depth += 1
            skipping.append(False)
        elif c in ")]":
            depth -= 1
            if skipping:
                skipping.pop()
        elif c == "|" and skipping:
            skipping[-1] = True
        elif not dead:
            chars.append((c, i, i + 1, depth == 0))
        i += 1
    text = "".join(c for c, _, _, _ in chars)
    spans: list[tuple[int, int] | None] = []
    at = 0
    for g in _graphemes(text):
        group = chars[at : at + len(g)]
        at += len(g)
        plain = all(p for _, _, _, p in group) and all(
            group[n][1] == group[n - 1][2] for n in range(1, len(group))
        )
        spans.append((group[0][1], group[-1][2]) if plain and group else None)
    return text, spans
