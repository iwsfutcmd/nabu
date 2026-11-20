"""A course's clips under the new names (docs/migration-design.md, "What must not change").

A word's clip is keyed by its KC id, and in a cast of several voices an item's voice is drawn
from a seed of its id (ADR 0078): a renamed id would draw again. The converter does not rewrite
the audio index, which the compiler still reads. It says what each clip's item is called now,
checks that no two clips would take one name, and writes the voice every renamed item has today
(courses/<id>/next/audio/assignment.yaml), which the switch reads before it draws.
"""

from __future__ import annotations

import collections
from typing import Any

import yaml

from nabu.migrate.convert import Converter, Finding
from nabu.migrate.source import obj, seq

Json = dict[str, Any]

KC_KINDS = ("sense", "form", "construction", "grapheme")


def renamed(conv: Converter, table: Json) -> dict[str, str]:
    """Each KC id that names one lexeme and nothing else, and that lexeme: the items whose clip
    keeps its place under the new name."""
    out: dict[str, str] = {}
    for kc, alias in obj(table.get("aliases")).items():
        kind, _, name = str(kc).partition(":")
        if kind == "sense" and (conv.plan.sense(name).parts or conv.plan.sense(name).form_of):
            continue
        part = obj(alias).get("part")
        if part is not None and "|" not in str(part):
            out[str(kc)] = str(part)
    return out


def build(conv: Converter, table: Json) -> tuple[Json | None, Json, list[Finding], list[str]]:
    """The voices to pin, counts for the report, findings and errors."""
    index_file = conv.course.dir / "audio" / "index.yaml"
    stats: collections.Counter[str] = collections.Counter()
    findings: list[Finding] = []
    errors: list[str] = []
    if not index_file.exists():
        return None, {}, findings, errors
    index = obj(yaml.safe_load(index_file.read_text(encoding="utf-8")))
    cast = [obj(v) for v in seq(obj(conv.course.data.get("audio")).get("voices"))]
    by_name = {str(v.get("voice")): str(v["id"]) for v in cast}
    by_name.update({str(v["id"]): str(v["id"]) for v in cast})
    names = renamed(conv, table)

    taken: dict[tuple[str, str, str], str] = {}
    pins: dict[str, str] = {}
    for clip in seq(index.get("clips")):
        item = str(clip["item"])
        stats["clips"] += 1
        reviewed = obj(clip.get("provenance")).get("status") in ("reviewed", "published")
        if reviewed:
            stats["clips a person checked"] += 1
        if item.partition(":")[0] not in KC_KINDS or ":" not in item:
            continue
        stats["clips keyed by a KC"] += 1
        voice = by_name.get(str(obj(clip.get("synthesis")).get("voice")))
        if item not in names:
            stats["clips whose item is no lexeme of its own now"] += 1
            findings.append(
                Finding(
                    "clip-orphan",
                    item,
                    "its clip says a word that is a form of another lexeme, or built of several, "
                    "now: no item of the new shape has that name"
                    + (" (a person checked this clip)" if reviewed else ""),
                )
            )
            continue
        new = names[item]
        key = (new, str(clip.get("speed")), voice or "")
        if key in taken:
            errors.append(f"audio: {item} and {taken[key]} would both be the clip of {new}")
        taken[key] = item
        stats["clips renamed with their item"] += 1
        if reviewed:
            stats["checked clips renamed with their item"] += 1
        if voice is None:
            errors.append(f"audio: the clip of {item} names no voice of the cast")
        elif len(cast) > 1 and new != item:
            if pins.get(new, voice) != voice:
                errors.append(f"audio: {new} has clips in two voices")
            pins[new] = voice
    assignment: Json | None = None
    if pins:
        assignment = {"version": 1, "voices": dict(sorted(pins.items()))}
        stats["voices pinned (a cast of several draws by the item's id)"] = len(pins)
    return assignment, dict(stats), findings, errors


def spoken(conv: Converter, table: Json, course: Json) -> None:
    """A voice's `spoken` overrides, under the new names of the items they are for."""
    names = renamed(conv, table)
    audio = obj(course.get("audio"))
    voices = [obj(v) for v in seq(audio.get("voices"))]
    if not any("spoken" in v for v in voices):
        return
    for v in voices:
        if "spoken" in v:
            v["spoken"] = {names.get(str(k), str(k)): text for k, text in obj(v["spoken"]).items()}
    course["audio"] = {**audio, "voices": voices}
