"""Release builds (ADR 0073): a course as learners outside the demo get it, with only what a
reviewer has signed off (ADR 0072).

`nabu build --release` keeps the sentences, stories and roleplay scenarios whose provenance is
reviewed or published (generated drills are reviewed by construction), and then:

- **Nodes:** a lesson or script node keeps its reviewed sentences, and goes when none is left; a
  story node goes with its story; a practice node stays while its unit keeps a lesson; a scenario
  stays while the node it follows does.
- **Units:** a unit with no node left goes.
- **Media:** only the clips of what is kept (sentences, story lines, the words of kept units), and
  the images of kept units' words.
- **The manifest** says `release: true`; its provenance and license counts are of what is kept.

The demo and the committed bundles stay full builds: drafts are what reviewers read.
"""

from __future__ import annotations

import copy
from dataclasses import dataclass, field, replace
from typing import Any, cast

from nabu.compiler.build import Compiled
from nabu.compiler.counts import add_count

KEPT = ("reviewed", "published")


@dataclass
class ReleaseReport:
    kept: dict[str, int] = field(default_factory=lambda: {})
    dropped: dict[str, int] = field(default_factory=lambda: {})


def _reviewed(item: dict[str, Any]) -> bool:
    return cast(dict[str, Any], item.get("provenance") or {}).get("status") in KEPT


def _count(table: dict[str, int], key: str, by: int = 1) -> None:
    table[key] = table.get(key, 0) + by


def release(compiled: Compiled) -> tuple[Compiled, ReleaseReport]:
    """The compiled course with only reviewed content; the original is left as it was."""
    report = ReleaseReport()
    units: list[dict[str, Any]] = []
    items: set[str] = set()
    images: set[str] = set()
    for source in compiled.units:
        unit = copy.deepcopy(source)
        sentences = cast(list[dict[str, Any]], unit["sentences"])
        kept = [s for s in sentences if _reviewed(s)]
        stories = [s for s in cast(list[dict[str, Any]], unit.get("stories") or []) if _reviewed(s)]
        ids = {str(s["id"]) for s in kept}
        nodes: list[dict[str, Any]] = []
        for node in cast(list[dict[str, Any]], unit["nodes"]):
            kind = node["kind"]
            if kind in ("lesson", "script"):
                node["sentences"] = [s for s in node["sentences"] if s in ids]
                if node["sentences"]:
                    nodes.append(node)
            elif kind == "story":
                if any(s["node"] == node["id"] for s in stories):
                    nodes.append(node)
            else:
                nodes.append(node)
        lessons = {n["id"] for n in nodes if n["kind"] in ("lesson", "script")}
        nodes = [n for n in nodes if n["kind"] in ("lesson", "script", "story") or lessons]
        for key, before, after in (
            ("sentences", sentences, kept),
            ("stories", unit.get("stories") or [], stories),
        ):
            _count(report.kept, key, len(after))
            _count(report.dropped, key, len(before) - len(after))
        if not nodes:
            _count(report.dropped, "units")
            _count(report.dropped, "scenarios", len(unit.get("scenarios") or []))
            continue
        unit["sentences"] = kept
        unit["nodes"] = nodes
        if "stories" in unit:
            unit["stories"] = stories
        units.append(unit)
        _count(report.kept, "units")
        items |= ids
        items |= {f"{s['id']}#{i}" for s in stories for i, _ in enumerate(s["steps"])}
        kcs = cast(list[dict[str, Any]], unit["kcs"])
        items |= {str(k["id"]) for k in kcs}
        images |= {str(k["image"]) for k in kcs if k.get("image")}
    # A scenario follows a lesson or story node, of any unit: it stays while that node does.
    kept_nodes = {str(n["id"]) for u in units for n in cast(list[dict[str, Any]], u["nodes"])}
    for unit in units:
        if "scenarios" not in unit:
            continue
        before = cast(list[dict[str, Any]], unit["scenarios"])
        unit["scenarios"] = [s for s in before if _reviewed(s) and s.get("after") in kept_nodes]
        _count(report.kept, "scenarios", len(unit["scenarios"]))
        _count(report.dropped, "scenarios", len(before) - len(unit["scenarios"]))
    audio_items = {k: v for k, v in compiled.audio_items.items() if k in items}
    used = {
        str(clip["path"])
        for item in audio_items.values()
        for clip in cast(dict[str, dict[str, Any]], item).values()
    }
    # The summary counts sentences and clips by item id, images by their bundle path.
    counted = [c for c in compiled.counted if c.item in items or c.item in images]
    licenses: dict[str, int] = {}
    provenance: dict[str, int] = {}
    for c in counted:
        add_count(licenses, provenance, c)
    out = replace(
        compiled,
        units=units,
        provenance=provenance,
        licenses=licenses,
        counted=counted,
        images={k: v for k, v in compiled.images.items() if k in images},
        audio_items=audio_items,
        audio_files={k: v for k, v in compiled.audio_files.items() if k in used},
    )
    return out, report
