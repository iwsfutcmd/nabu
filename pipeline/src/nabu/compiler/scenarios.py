"""Roleplay scenario cards (gameplan §13.4, Phase 8): compile and check them.

A card says where a conversation happens, whom the model plays and what the learner tries to do,
in each support language; the model writes every line at run time inside the learner's known
vocabulary, so a card holds no target-language text. It opens once the learner completes its
`after` node.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from nabu.compiler.build import Ctx, Unit
    from nabu.schema.models import CourseSource

FIELDS = ("title", "setting", "character", "goal")


def compile_scenarios(
    ctx: Ctx, course: CourseSource, units: list[Unit]
) -> dict[int, list[dict[str, Any]]]:
    """Every unit's scenario cards, by unit index."""
    from nabu.compiler.build import support_key, support_text

    keys = {support_key(ctx, o): o for o in course.support}
    nodes = {n.id: n.kind for u in units for n in u.source.nodes}
    out: dict[int, list[dict[str, Any]]] = {}
    for ui, unit in enumerate(units):
        for si, card in enumerate(unit.source.scenarios or []):
            at = ("scenarios", si)
            kind = nodes.get(card.after)
            if kind not in ("lesson", "story"):
                what = "no such node" if kind is None else f"a {kind} node"
                ctx.diags.report(
                    "scenario.node",
                    f"{card.id}: after {card.after!r}, {what}",
                    unit.doc.loc(*at, "after"),
                )
                continue
            texts: dict[str, Any] = {}
            for name in FIELDS:
                given = dict(getattr(card, name))
                absent = [k for k in keys if k not in given]
                if absent:
                    ctx.diags.report(
                        "scenario.missing-text",
                        f"{card.id}: the {name} has no {', '.join(absent)} text",
                        unit.doc.loc(*at, name),
                    )
                texts[name] = {
                    k: support_text(ctx, keys.get(k, course.support[0]), t, course.target)
                    for k, t in given.items()
                }
            provenance = card.provenance or course.provenance
            bundle: dict[str, Any] = {
                "id": card.id,
                "after": card.after,
                **texts,
                "license": card.license or course.license,
            }
            if provenance is not None:
                bundle["provenance"] = provenance.model_dump(exclude_none=True)
            out.setdefault(ui, []).append(bundle)
    return out
