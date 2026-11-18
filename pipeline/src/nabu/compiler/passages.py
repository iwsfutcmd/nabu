"""Words met in passages (ADR 0144): what a story node introduces, and the drill node after it.

A word comes in one of two ways. A lesson introduces it (`introduces`, as before), or a passage
does: a story node introduces every KC its lines use that no earlier node introduces. The source
does not list them; this module works them out, in the order the learner drills them: the words
the course's passages use most first, so a learner who drills only part of a passage's list has
the most useful part. A KC is introduced once (`curriculum.introduced-twice`).

The words a passage introduces that are drilled (sense KCs whose `drill` is not false: proper
names are glossed, never drilled) go to a drill node right after the story node; the app drills
them, a few words a session, once the passage is read.
"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from nabu.compiler.build import Unit
    from nabu.schema.models import CourseSource, KnowledgeComponentSource, SourceToken

#: A drill node's id: its story node's, with this after it.
DRILL_SUFFIX = ".words"

#: A word several passages use (at least this many) that no lesson teaches before the first of
#: them is the frequent core lessons should teach (`curriculum.core`, an info lint).
CORE_PASSAGES = 3


def drill_node_id(story_node: str) -> str:
    return f"{story_node}{DRILL_SUFFIX}"


def drilled(kc: KnowledgeComponentSource) -> bool:
    """Whether a KC is drilled (ADR 0144): as its `drill` says, else every KC but a proper name."""
    if kc.drill is not None:
        return kc.drill
    return kc.pos != "PROPN"


def source_token_kcs(token: SourceToken) -> list[str]:
    """The KCs a source token carries: its sense, its form, its morphs' KCs."""
    refs = [f"sense:{token.sense}"] if token.sense is not None else []
    refs += [token.form] if token.form is not None else []
    refs += [m.kc for m in token.morphs or []]
    return list(dict.fromkeys(refs))


@dataclass
class PassageUses:
    """The KCs each story node's passage uses, in the order its lines first use them, and how many
    lines of all the course's passages use each KC (each line counted once, whatever its
    orthographies) and how many passages."""

    by_node: dict[str, list[str]] = field(default_factory=lambda: {})
    lines: Counter[str] = field(default_factory=lambda: Counter[str]())
    passages: Counter[str] = field(default_factory=lambda: Counter[str]())


def passage_uses(course: CourseSource, units: list[Unit]) -> PassageUses:
    out = PassageUses()
    for unit in units:
        for story in unit.source.stories or []:
            used = out.by_node.setdefault(story.node, [])
            for step in story.steps:
                if step.line is None:
                    continue
                line: list[str] = []
                for orth in course.orthographies:
                    form = step.line.forms.get(orth)
                    for token in form.tokens or [] if form is not None else []:
                        line += [k for k in source_token_kcs(token) if k not in line]
                out.lines.update(line)
                used += [k for k in line if k not in used]
    for used in out.by_node.values():
        out.passages.update(used)
    return out


def by_frequency(kcs: list[str], uses: PassageUses) -> list[str]:
    """Most used first: by the lines of the course's passages that use each, then by passages; a
    tie keeps the order the passage first uses them."""
    order = {kc: i for i, kc in enumerate(kcs)}
    return sorted(kcs, key=lambda kc: (-uses.lines[kc], -uses.passages[kc], order[kc]))
