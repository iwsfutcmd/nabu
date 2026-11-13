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

from dataclasses import dataclass, field, replace

from nabu.compiler.build import Compiled
from nabu.compiler.counts import add_count
from nabu.items import iter_items
from nabu.provenance import signed_off
from nabu.schema.models import BundleNode, BundleUnit, Provenance


@dataclass
class ReleaseReport:
    kept: dict[str, int] = field(default_factory=lambda: {})
    dropped: dict[str, int] = field(default_factory=lambda: {})


def _reviewed(provenance: Provenance | None) -> bool:
    return signed_off(provenance.status if provenance is not None else None)


def _count(table: dict[str, int], key: str, by: int = 1) -> None:
    table[key] = table.get(key, 0) + by


def _nodes(unit: BundleUnit, sentences: set[str], stories: set[str]) -> list[BundleNode]:
    """The unit's nodes that keep content: lessons and script nodes with a kept sentence, story
    nodes with their story, and practice nodes while a lesson stays."""
    nodes: list[BundleNode] = []
    for node in unit.nodes:
        if node.kind in ("lesson", "script"):
            node = node.model_copy(
                update={"sentences": [s for s in node.sentences if s in sentences]}
            )
            if node.sentences:
                nodes.append(node)
        elif node.kind == "story":
            if node.id in stories:
                nodes.append(node)
        else:
            nodes.append(node)
    lessons = [n for n in nodes if n.kind in ("lesson", "script")]
    return [n for n in nodes if n.kind in ("lesson", "script", "story") or lessons]


def release(compiled: Compiled) -> tuple[Compiled, ReleaseReport]:
    """The compiled course with only reviewed content; the original is left as it was."""
    report = ReleaseReport()
    units: list[BundleUnit] = []
    for unit in compiled.units:
        kept = [s for s in unit.sentences if _reviewed(s.provenance)]
        stories = [s for s in unit.stories or [] if _reviewed(s.provenance)]
        nodes = _nodes(unit, {s.id for s in kept}, {s.node for s in stories})
        _count(report.kept, "sentences", len(kept))
        _count(report.dropped, "sentences", len(unit.sentences) - len(kept))
        _count(report.kept, "stories", len(stories))
        _count(report.dropped, "stories", len(unit.stories or []) - len(stories))
        if not nodes:
            _count(report.dropped, "units")
            _count(report.dropped, "scenarios", len(unit.scenarios or []))
            continue
        update: dict[str, object] = {"sentences": kept, "nodes": nodes}
        if unit.stories is not None:
            update["stories"] = stories
        units.append(unit.model_copy(update=update))
        _count(report.kept, "units")
    # A scenario follows a lesson or story node, of any unit: it stays while that node does.
    kept_nodes = {n.id for u in units for n in u.nodes}
    for i, unit in enumerate(units):
        if unit.scenarios is None:
            continue
        scenarios = [s for s in unit.scenarios if _reviewed(s.provenance) and s.after in kept_nodes]
        units[i] = unit.model_copy(update={"scenarios": scenarios})
        _count(report.kept, "scenarios", len(scenarios))
        _count(report.dropped, "scenarios", len(unit.scenarios) - len(scenarios))
    # What a kept unit has (its sentences, its stories' lines, its words) keeps its clips.
    items = {item.id for item in iter_items(units)}
    images = {k.image for u in units for k in u.kcs if k.image}
    audio_items = {k: v for k, v in compiled.audio_items.items() if k in items}
    used = {clip.path for item in audio_items.values() for clip in item.values()}
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
