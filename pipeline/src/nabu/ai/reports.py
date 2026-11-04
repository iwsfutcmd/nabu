"""`nabu reports promote` (gameplan §8.3, §13.2): approved reports become accept-set entries.

Reads the review queue's export (GET /admin/v1/reports.jsonl?status=approved), adds each approved
answer to its sentence's `reverse` accept set as a weighted alternative, edits only that value in
the unit file (comments and formatting stay), checks that core-cli now grades the answer correct
and that the course still compiles clean, and writes the pull request's description. Reports that
cannot be promoted are listed with the reason, never dropped silently.
"""

from __future__ import annotations

import html
import json
from collections.abc import Iterable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, cast

import yaml

from nabu.schema.models import AnswerReport
from nabu.yamlio import INVISIBLE

SPECIAL = set("()[]|\\@")


def escape_notation(answer: str) -> str:
    """An answer as one literal accept-set alternative (§7.4): specials escaped, no comment."""
    text = "".join(f"\\{c}" if c in SPECIAL else c for c in " ".join(answer.split()))
    return f"\\{text}" if text.startswith("#") else text


def _yaml_scalar(value: str, indent: int) -> str:
    """A multi-line value as YAML: a literal block, or double-quoted with \\u escapes if it holds
    an invisible."""
    if INVISIBLE.search(value):
        out = "".join(
            "\\\\"
            if c == "\\"
            else '\\"'
            if c == '"'
            else "\\n"
            if c == "\n"
            else f"\\u{ord(c):04X}"
            if INVISIBLE.match(c)
            else c
            for c in value
        )
        return f'"{out}"'
    pad = " " * indent
    return "|-\n" + "".join(f"{pad}{line}\n" for line in value.split("\n"))


def _get(node: yaml.Node, key: str) -> tuple[yaml.Node, yaml.Node] | None:
    if not isinstance(node, yaml.MappingNode):
        return None
    for k, v in node.value:
        if isinstance(k, yaml.ScalarNode) and k.value == key:
            return k, v
    return None


@dataclass
class Located:
    file: Path
    current: str
    start: int
    end: int
    block: bool
    indent: int


def locate(units: Iterable[Path], sentence: str, orthography: str) -> Located | None:
    """The `reverse` value of a sentence's form, by position in its unit file."""
    for file in units:
        text = file.read_text(encoding="utf-8")
        root = cast(yaml.Node | None, yaml.compose(text))  # pyright: ignore[reportUnknownMemberType]
        sentences = _get(root, "sentences") if root is not None else None
        if sentences is None or not isinstance(sentences[1], yaml.SequenceNode):
            continue
        for item in sentences[1].value:
            ident = _get(item, "id")
            if ident is None or ident[1].value != sentence:
                continue
            forms = _get(item, "forms")
            form = _get(forms[1], orthography) if forms is not None else None
            reverse = _get(form[1], "reverse") if form is not None else None
            if reverse is None:
                return None
            key, value = reverse
            block = cast(str | None, getattr(value, "style", None)) in ("|", ">")
            span = text[value.start_mark.index : value.end_mark.index]
            current = str(yaml.safe_load(span) if block else value.value)
            start, end = value.start_mark.index, value.end_mark.index
            return Located(file, current, start, end, block, key.start_mark.column + 2)
    return None


def add_alternative(loc: Located, alternative: str) -> str:
    """The unit file's text with `alternative` added as the reverse set's last line."""
    text = loc.file.read_text(encoding="utf-8")
    value = f"{loc.current.rstrip()}\n{alternative}"
    scalar = _yaml_scalar(value, loc.indent)
    if not loc.block and scalar.endswith("\n"):
        scalar = scalar[:-1]
    elif loc.block and not scalar.endswith("\n"):
        scalar += "\n"
    return text[: loc.start] + scalar + text[loc.end :]


@dataclass
class Outcome:
    promoted: list[tuple[AnswerReport, str, Path]] = field(default_factory=lambda: [])
    skipped: list[tuple[AnswerReport, str]] = field(default_factory=lambda: [])


def read_export(path: Path) -> list[AnswerReport]:
    return [
        AnswerReport.model_validate(json.loads(line))
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]


def promote(reports: list[AnswerReport], courses: Path, cli: Any, weight: float = 0.5) -> Outcome:
    """Edits the course sources in place; returns what was promoted and what was not, and why."""
    out = Outcome()
    for r in reports:
        if r.status != "approved":
            out.skipped.append((r, f"status {r.status}"))
            continue
        if r.template.startswith("story-"):
            out.skipped.append(
                (r, f"{r.template}: a story line has no accept set; change the story by hand")
            )
            continue
        if not r.template.endswith("l1-l2"):
            out.skipped.append(
                (r, f"{r.template}: only answers in the target language are promoted")
            )
            continue
        units = sorted((courses / r.course / "units").glob("*.yaml"))
        loc = locate(units, r.item, str(r.orthography))
        if loc is None:
            out.skipped.append((r, f"no reverse accept set for {r.item} in {r.orthography}"))
            continue
        graded = cli.result(
            "grade", profile=str(r.orthography), accept=loc.current, answer=r.answer
        )
        if str(graded["verdict"]).startswith("CORRECT"):
            out.skipped.append((r, f"already accepted ({graded['verdict']})"))
            continue
        alternative = escape_notation(r.answer) + ("" if weight == 1 else f" @{weight:g}")
        original = loc.file.read_text(encoding="utf-8")
        loc.file.write_text(add_alternative(loc, alternative), encoding="utf-8")
        after = locate([loc.file], r.item, str(r.orthography))
        regraded = cli.result(
            "grade",
            profile=str(r.orthography),
            accept=after.current if after else "",
            answer=r.answer,
        )
        if not str(regraded["verdict"]).startswith("CORRECT"):
            loc.file.write_text(original, encoding="utf-8")
            out.skipped.append((r, f"the edited accept set still grades it {regraded['verdict']}"))
            continue
        out.promoted.append((r, alternative, loc.file))
    return out


def pr_body(outcome: Outcome, root: Path) -> str:
    """The pull request's description: what changed and why, language data isolated with <bdi>."""

    def b(s: str) -> str:
        return f"<bdi>{html.escape(s)}</bdi>"

    lines = ["## Promote approved answers into accept sets", ""]
    lines += [
        "Answers learners reported or the judge accepted, approved in the review queue (§8.3).",
        "Each joins its sentence's `reverse` accept set, weighted below the authored answers.",
        "",
        "| Course | Orthography | Sentence | Answer | Learners | Judge | File |",
        "|---|---|---|---|---|---|---|",
    ]
    for r, _, file in outcome.promoted:
        judge = (
            "—"
            if r.judge is None
            else f"{r.judge.verdict} {r.judge.confidence:.2f} ({r.judge.provenance.model})"
        )
        lines.append(
            f"| {r.course} | `{r.orthography}` | `{r.item}` | {b(r.answer)} | {r.reports} "
            f"| {judge} | `{file.relative_to(root).as_posix()}` |"
        )
    notes = [(r, n) for r, _, _ in outcome.promoted for n in r.notes]
    if notes:
        lines += ["", "### What learners wrote", ""] + [f"- `{r.item}`: {b(n)}" for r, n in notes]
    if outcome.skipped:
        lines += ["", "### Not promoted", ""] + [
            f"- `{r.id!s}` ({r.course} `{r.item}` {b(r.answer)}): {why}"
            for r, why in outcome.skipped
        ]
    lines += [
        "",
        "Report ids, to mark promoted once merged:",
        "",
        "```",
        *[str(r.id) for r, _, _ in outcome.promoted],
        "```",
        "",
    ]
    return "\n".join(lines)
