"""A compiled course's units and the items in them: every sentence, word KC and story line, as
voices read them, clips are made and checked for them, and a release keeps them.

The compiler's units are the bundle's own models (`BundleUnit`, generated from schemas/), so a
mistyped key or a changed shape fails as the course compiles, never in a long audio run.
`iter_items` is the one walk over a course's items: nothing else goes through sentences, story
lines and KCs by hand to find what is said. This module needs nothing of the compiler, so the
audio code and the compiler can both use it.
"""

from __future__ import annotations

from collections.abc import Iterable, Iterator, Mapping, Sequence
from dataclasses import dataclass
from typing import Any, Literal

from nabu.schema.models import BundleUnit, TokenModel

#: Tokens that are words: what a voice says, and what a reading belongs to.
WORD_KINDS = ("word", "number")

type ItemKind = Literal["sentence", "kc", "line"]
#: A speaker's gender, where the grammar fixes it (ADR 0075, 0078).
type Gender = Literal["m", "f"]


def line_item(story: str, step: int) -> str:
    """A story line's id among a course's items (clips, corrections): "<story>#<step>"."""
    return f"{story}#{step}"


@dataclass(frozen=True)
class CourseItem:
    """A sentence, a word KC or a story line: something a voice says and a clip is of."""

    id: str
    kind: ItemKind
    #: What is said, by orthography: a sentence's or a line's tokens, a KC's first form's (its
    #: lemma, what a word card shows). A KC with no form in an orthography has no entry for it.
    forms: Mapping[str, Sequence[TokenModel]]
    #: The speaker's gender where the grammar says who speaks: a sentence's `persons.speaker`, a
    #: story character's `speaker` (ADR 0078).
    said_by: Gender | None = None
    #: A story line's story, and the character who says it (None: the narrator).
    story: str | None = None
    character: str | None = None


def iter_items(units: Iterable[BundleUnit]) -> Iterator[CourseItem]:
    """Every item of the units in the order voices read them: each sentence, then each KC, then
    each story line, in course order. A story's questions are no items."""
    units = list(units)
    for unit in units:
        for s in unit.sentences:
            forms = {orth: form.text.tokens for orth, form in s.forms.items()}
            said_by = s.persons.speaker if s.persons is not None else None
            yield CourseItem(s.id, "sentence", forms, said_by)
    for unit in units:
        for kc in unit.kcs:
            first = {orth: forms[0].tokens for orth, forms in (kc.forms or {}).items() if forms}
            yield CourseItem(kc.id, "kc", first)
    for unit in units:
        for story in unit.stories or []:
            genders: dict[str, Gender | None] = {c.id: c.speaker for c in story.characters}
            for step, s in enumerate(story.steps):
                if s.line is None:
                    continue
                who = s.line.speaker
                forms = {orth: text.tokens for orth, text in s.line.forms.items()}
                said_by = genders.get(who or "")
                yield CourseItem(line_item(story.id, step), "line", forms, said_by, story.id, who)


def unit_json(unit: BundleUnit) -> dict[str, Any]:
    """A unit as its bundle file holds it (JSON: no nulls, schema names such as `register`)."""
    return unit.model_dump(mode="json", by_alias=True, exclude_none=True)
