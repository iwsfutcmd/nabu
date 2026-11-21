"""A compiled course's content and the items in it: every sentence, lexeme and story line, as
voices read them, clips are made and checked for them, and a release keeps them.

The compiler's units and lexicon are the bundle's own models (generated from schemas/), so a
mistyped key or a changed shape fails as the course compiles, never in a long audio run.
`iter_items` is the one walk over a course's items: nothing else goes through sentences, story
lines and lexemes by hand to find what is said. This module needs nothing of the compiler, so the
audio code and the compiler can both use it.
"""

from __future__ import annotations

from collections.abc import Iterator, Mapping, Sequence
from dataclasses import dataclass, field
from typing import Any, Literal, cast

from nabu.schema.models import BundleLexicon, BundleSentence, BundleUnit, Persons, TokenModel

#: Tokens that are words: what a voice says, and what a reading belongs to.
WORD_KINDS = ("word", "number")

type ItemKind = Literal["sentence", "entry", "line"]
#: A speaker's gender, where the grammar fixes it (ADR 0075, 0078).
type Gender = Literal["m", "f"]


def line_item(story: str, step: int) -> str:
    """A story line's id among a course's items (clips, corrections): "<story>#<step>"."""
    return f"{story}#{step}"


def _no_lexicon() -> BundleLexicon:
    return BundleLexicon.model_validate({"language": "und", "lexemes": []})


@dataclass(frozen=True)
class Content:
    """What a course is made of once compiled: its units, and its lexicon (the course's lexemes,
    which no unit holds)."""

    units: Sequence[BundleUnit]
    lexicon: BundleLexicon = field(default_factory=_no_lexicon)


@dataclass(frozen=True)
class CourseItem:
    """A sentence, an entry (a lexeme, or a letter of a script track, said alone) or a story
    line: something a voice says and a clip is of."""

    id: str
    kind: ItemKind
    #: What is said, by orthography: a sentence's or a line's tokens, a lexeme's first spelling's
    #: (its lemma, what a word card shows). A lexeme with no spelling in an orthography has no
    #: entry for it.
    forms: Mapping[str, Sequence[TokenModel]]
    #: The speaker's gender where the grammar says who speaks: a sentence's `persons` tag, a
    #: story character's `speaker` (ADR 0078).
    said_by: Gender | None = None
    #: A story line's story, and the character who says it (None: the narrator).
    story: str | None = None
    character: str | None = None


def speaker_of(sentence: BundleSentence) -> Gender | None:
    """Who says a sentence, where a tag of it says (ADR 0147)."""
    for tag in sentence.tags or []:
        persons = getattr(tag, "persons", None)
        if persons is not None:
            return cast(Persons, persons).speaker
    return None


def iter_items(content: Content) -> Iterator[CourseItem]:
    """Every item of a course in the order voices read them: each sentence, then each lexeme
    and each letter of a script track, then each story line, in course order. A story's
    questions are no items."""
    units = list(content.units)
    for unit in units:
        for s in unit.sentences:
            forms = {orth: form.text.tokens for orth, form in s.forms.items()}
            yield CourseItem(s.id, "sentence", forms, speaker_of(s))
    for lexeme in content.lexicon.lexemes:
        first = {orth: forms[0].tokens for orth, forms in (lexeme.forms or {}).items() if forms}
        yield CourseItem(str(lexeme.id), "entry", first)
    for unit in units:
        for grapheme in unit.graphemes or []:
            first = {
                orth: forms[0].tokens for orth, forms in (grapheme.forms or {}).items() if forms
            }
            yield CourseItem(grapheme.id, "entry", first)
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


def lexicon_json(lexicon: BundleLexicon) -> dict[str, Any]:
    """A bundle's lexicon as its file holds it."""
    return lexicon.model_dump(mode="json", by_alias=True, exclude_none=True)
