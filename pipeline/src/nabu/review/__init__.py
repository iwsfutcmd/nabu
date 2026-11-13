"""`nabu review apply` (ADR 0072): a reviewer's sign-offs into the course source.

The web app's sentence list lets a reviewer sign off a sentence, a whole story or everything in a
unit, and downloads the sign-offs (schemas/signoffs.schema.json). Applying them sets each item's
provenance to reviewed, with the reviewer and the date, keeping its author:

- **Only what was seen.** A sign-off carries `shown`, the sha256 of `signoff_text` of the item as
  the reviewer saw it. The course is compiled here and the text built again; a sign-off whose item
  has changed since (or is gone) is skipped, with the reason, never applied to other text.
- **In place.** Each unit file is edited value by value, so comments and formatting stay: an item
  with a `provenance:` gets its value replaced; one without gets a line after its `id:`, with the
  author it inherited from the course.

`signoff_text` is the twin of @nabu/core/corrections `signoffText`: change both, with the test that
pins them (tests/test_review.py).
"""

from __future__ import annotations

import hashlib
import unicodedata
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, cast

import yaml

from nabu.corrections import Edit, flow_scalar
from nabu.provenance import signed_off
from nabu.schema.models import SignOffs


def _text(tagged: dict[str, Any]) -> str:
    tokens = cast(list[dict[str, Any]], tagged.get("tokens") or [])
    return unicodedata.normalize("NFC", "".join(str(t["surface"]) for t in tokens))


def _block(forms: dict[str, dict[str, Any]], translations: dict[str, dict[str, Any]]) -> list[str]:
    return [
        *(f"form\t{o}\t{_text(forms[o])}" for o in sorted(forms)),
        *(f"translation\t{k}\t{_text(translations[k])}" for k in sorted(translations)),
    ]


def sentence_text(sentence: dict[str, Any]) -> str:
    """What a reviewer saw of a compiled sentence (signoffText's sentence form)."""
    forms = {o: cast(dict[str, Any], f["text"]) for o, f in sentence["forms"].items()}
    translations = {k: cast(dict[str, Any], t["text"]) for k, t in sentence["translations"].items()}
    return "\n".join([f"sentence\t{sentence['id']}", *_block(forms, translations)])


def story_text(story: dict[str, Any]) -> str:
    """What a reviewer saw of a compiled story: its lines, in order."""
    out = [f"story\t{story['id']}"]
    for i, step in enumerate(cast(list[dict[str, Any]], story["steps"])):
        line = step.get("line")
        if line is None:
            continue
        out += [f"line\t{i}", *_block(line["forms"], line["translations"])]
    return "\n".join(out)


def fingerprint(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def shown_of(units: list[dict[str, Any]]) -> dict[tuple[str, str], str]:
    """Every signable item of a compiled course: (kind, id) → fingerprint."""
    out: dict[tuple[str, str], str] = {}
    for unit in units:
        for s in cast(list[dict[str, Any]], unit["sentences"]):
            out[("sentence", str(s["id"]))] = fingerprint(sentence_text(s))
        for story in cast(list[dict[str, Any]], unit.get("stories") or []):
            out[("story", str(story["id"]))] = fingerprint(story_text(story))
    return out


# ------------------------------------------------------------------------------------- applying


@dataclass(frozen=True)
class Skipped:
    item: str
    reason: str


@dataclass
class Outcome:
    signed: list[str] = field(default_factory=lambda: [])
    already: list[str] = field(default_factory=lambda: [])
    skipped: list[Skipped] = field(default_factory=lambda: [])
    files: dict[Path, str] = field(default_factory=lambda: {})


def _get(node: yaml.Node | None, key: str) -> tuple[yaml.Node, yaml.Node] | None:
    if not isinstance(node, yaml.MappingNode):
        return None
    for k, v in node.value:
        if isinstance(k, yaml.ScalarNode) and k.value == key:
            return k, v
    return None


def _scalar(node: yaml.Node | None) -> str | None:
    return str(node.value) if isinstance(node, yaml.ScalarNode) else None


def _find(root: yaml.Node | None, kind: str, item: str) -> yaml.MappingNode | None:
    found = _get(root, "sentences" if kind == "sentence" else "stories")
    if found is None or not isinstance(found[1], yaml.SequenceNode):
        return None
    for node in found[1].value:
        pair = _get(node, "id")
        if isinstance(node, yaml.MappingNode) and pair is not None and _scalar(pair[1]) == item:
            return node
    return None


def provenance_text(author: str, reviewer: str, day: str) -> str:
    """A reviewed provenance as a one-line flow mapping."""
    fields = {"author": author, "status": "reviewed", "reviewedBy": reviewer, "reviewedAt": day}
    # reviewedAt is quoted: plain, YAML would read the date as a date, not a string.
    body = ", ".join(
        f"{k}: '{v}'" if k == "reviewedAt" else f"{k}: {flow_scalar(v)}" for k, v in fields.items()
    )
    return "{" + body + "}"


def _edit(source: str, node: yaml.MappingNode, author: str, reviewer: str, day: str) -> Edit | str:
    """The edit that signs one item off, or why it cannot be made."""
    if node.flow_style:
        return "written as a one-line mapping: sign it off by hand"
    text = provenance_text(author, reviewer, day)
    existing = _get(node, "provenance")
    if existing is not None:
        _key, value = existing
        span = source[value.start_mark.index : value.end_mark.index]
        trail = len(span) - len(span.rstrip("\n"))
        return Edit(value.start_mark.index, value.end_mark.index - trail, text)
    first = _get(node, "id")
    if first is None:
        return "has no id"
    key, value = first
    # A new line right after the id's, at the column of the mapping's keys.
    end = source.index("\n", value.end_mark.index)
    return Edit(end, end, "\n" + " " * key.start_mark.column + f"provenance: {text}")


def apply(
    signoffs: SignOffs,
    course_dir: Path,
    units: list[Path],
    compiled_units: list[dict[str, Any]],
    course_author: str,
    reviewer: str,
) -> Outcome:
    """Sign off every item whose source still compiles to what the reviewer saw."""
    shown = shown_of(compiled_units)
    reviewed = {
        (kind, str(x["id"]))
        for unit in compiled_units
        for kind, key in (("sentence", "sentences"), ("story", "stories"))
        for x in cast(list[dict[str, Any]], unit.get(key) or [])
        if signed_off(cast(dict[str, Any], x.get("provenance") or {}).get("status"))
    }
    texts = {f: f.read_text(encoding="utf-8") for f in units}
    roots = {f: cast(yaml.Node | None, yaml.compose(texts[f])) for f in units}  # pyright: ignore[reportUnknownMemberType]
    edits: dict[Path, list[Edit]] = {}
    out = Outcome()
    for s in signoffs.signoffs:
        key = (s.kind, s.item)
        if key not in shown:
            out.skipped.append(Skipped(s.item, f"no {s.kind} with this id in the course"))
            continue
        if shown[key] != s.shown:
            out.skipped.append(Skipped(s.item, "changed since it was signed off: read it again"))
            continue
        if key in reviewed:
            out.already.append(s.item)
            continue
        # The day it was signed off, in UTC (the schema's pattern requires an offset or Z).
        day = datetime.fromisoformat(s.at).astimezone(UTC).date().isoformat()
        for f in units:
            node = _find(roots[f], s.kind, s.item)
            if node is None:
                continue
            # The item keeps its own author; one without a provenance inherited the course's.
            existing = _get(node, "provenance")
            own = _get(existing[1], "author") if existing is not None else None
            author = (_scalar(own[1]) if own is not None else None) or course_author
            edit = _edit(texts[f], node, author, reviewer, day)
            if isinstance(edit, str):
                out.skipped.append(Skipped(s.item, edit))
            else:
                edits.setdefault(f, []).append(edit)
                out.signed.append(s.item)
            break
        else:
            out.skipped.append(Skipped(s.item, "not in the unit files (generated?)"))
    for f, es in edits.items():
        text = texts[f]
        for e in sorted(es, key=lambda e: e.start, reverse=True):
            text = text[: e.start] + e.text + text[e.end :]
        out.files[f] = text
    return out
