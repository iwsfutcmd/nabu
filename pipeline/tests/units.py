"""Compiled content built by hand, as the compiler gives it (the bundle's models), for tests of
what reads it: the cast, the audio plan, pinned readings. What a test does not say gets a neutral
value: a sentence on node "n", a draft by human:test, no translations."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any, Literal

from nabu.compiler.tokens import ids_of
from nabu.items import Content, iter_items
from nabu.schema.models import (
    BundleGrapheme,
    BundleLexeme,
    BundleLexicon,
    BundleSentence,
    BundleStory,
    BundleStoryStep,
    BundleUnit,
    TaggedText,
    TokenModel,
)

Gender = Literal["m", "f"]
DRAFT = {"author": "human:test", "status": "draft"}


def token(surface: str, kind: str = "word", lexeme: str | None = None, **fields: Any) -> TokenModel:
    """A token: `token("呢", lexeme="呢", readings={"jyutping": "ni1"})`. `lexeme` names the one
    lexeme it writes (its name, without `lexeme:`); a token that writes several gives `lexemes`
    as a bundle has them: `lexemes=[{"lexeme": "lexeme:uy", "surface": "uy", "base": True}, …]`."""
    data: dict[str, Any] = {"surface": surface, "kind": kind, **fields}
    if lexeme is not None:
        data["lexemes"] = [{"lexeme": f"lexeme:{lexeme}"}]
    return TokenModel.model_validate(data)


def tagged(orth: str, tokens: Sequence[TokenModel]) -> TaggedText:
    return TaggedText(lang=orth.split("/")[0], orthography=orth, tokens=list(tokens))


def sentence(
    id_: str,
    forms: Mapping[str, Sequence[TokenModel]] | None = None,
    speaker: Gender | None = None,
    provenance: Mapping[str, str] = DRAFT,
) -> BundleSentence:
    return BundleSentence.model_validate(
        {
            "id": id_,
            "node": "n",
            "forms": {o: {"text": tagged(o, t)} for o, t in (forms or {}).items()},
            "translations": {},
            "parts": [],
            "production": True,
            "provenance": dict(provenance),
            "license": "CC0-1.0",
            **({} if speaker is None else {"tags": [{"persons": {"speaker": speaker}}]}),
        }
    )


def lexeme(
    name: str, forms: Mapping[str, Sequence[Sequence[TokenModel]]] | None = None
) -> BundleLexeme:
    """A lexeme with its spellings by orthography, each a spelling's tokens (the first: its
    lemma). `name` is its name in its lexicon, without `lexeme:`."""
    return BundleLexeme.model_validate(
        {
            "id": f"lexeme:{name}",
            **(
                {"forms": {o: [tagged(o, f) for f in fs] for o, fs in forms.items()}}
                if forms
                else {}
            ),
        }
    )


def grapheme(
    name: str, forms: Mapping[str, Sequence[Sequence[TokenModel]]] | None = None
) -> BundleGrapheme:
    """A letter of a script track with its forms by orthography, each a form's tokens. `name` is
    its name, without `grapheme:`. A unit lists the letters its script nodes teach."""
    return BundleGrapheme.model_validate(
        {
            "id": f"grapheme:{name}",
            **(
                {"forms": {o: [tagged(o, f) for f in fs] for o, fs in forms.items()}}
                if forms
                else {}
            ),
        }
    )


def lexicon(lexemes: Sequence[BundleLexeme] = (), language: str = "und") -> BundleLexicon:
    """A bundle's lexicon: its lexemes, sorted by id as a lexicon is."""
    ordered = sorted(lexemes, key=lambda entry: str(entry.id))
    return BundleLexicon(language=language, lexemes=ordered)


def line(
    forms: Mapping[str, Sequence[TokenModel]] | None = None, speaker: str | None = None
) -> BundleStoryStep:
    """A story line said by a character (None: the narrator)."""
    data: dict[str, Any] = {
        "forms": {o: tagged(o, t) for o, t in (forms or {}).items()},
        "translations": {},
        "parts": [],
    }
    if speaker is not None:
        data["speaker"] = speaker
    return BundleStoryStep.model_validate({"line": data})


def question() -> BundleStoryStep:
    """A comprehension question: a story's step that is no line."""
    return BundleStoryStep.model_validate({"choose": {"prompt": {}, "options": [], "answer": 0}})


def story(
    id_: str,
    steps: Sequence[BundleStoryStep],
    characters: Mapping[str, Gender | None] | None = None,
    provenance: Mapping[str, str] = DRAFT,
) -> BundleStory:
    """A story; `characters` gives each character's gender as a speaker, if the text fixes it."""
    return BundleStory.model_validate(
        {
            "id": id_,
            "node": f"{id_}.node",
            "title": {},
            "characters": [
                {"id": c, "name": {}, **({} if g is None else {"speaker": g})}
                for c, g in (characters or {}).items()
            ],
            "steps": list(steps),
            "parts": [],
            "provenance": dict(provenance),
            "license": "CC0-1.0",
        }
    )


def unit(
    sentences: Sequence[BundleSentence] = (),
    stories: Sequence[BundleStory] = (),
    id_: str = "u",
    graphemes: Sequence[BundleGrapheme] = (),
) -> BundleUnit:
    return BundleUnit(
        id=id_,
        nodes=[],
        sentences=list(sentences),
        stories=list(stories) if stories else None,
        graphemes=list(graphemes) if graphemes else None,
    )


def content(
    units: Sequence[BundleUnit] | BundleUnit = (), lexemes: Sequence[BundleLexeme] = ()
) -> Content:
    """A course's compiled content: its units, and its lexemes as its lexicon."""
    listed = [units] if isinstance(units, BundleUnit) else list(units)
    return Content(listed, lexicon(lexemes))


def part_of(whole: Content, unit_id: str, stories: bool = True) -> Content:
    """One unit of a compiled course (its stories or not) and the lexemes its text writes: enough
    of the course to synthesize in seconds, as a course of that unit alone would be."""
    units = [u for u in whole.units if u.id == unit_id]
    assert units, unit_id
    if not stories:
        units = [u.model_copy(update={"stories": []}) for u in units]
    written = {
        name
        for item in iter_items(Content(units))
        for tokens in item.forms.values()
        for t in tokens
        for name in ids_of(t.model_dump(mode="json", exclude_none=True))
    }
    lexemes = [x for x in whole.lexicon.lexemes if str(x.id) in written]
    assert lexemes, unit_id
    return Content(units, whole.lexicon.model_copy(update={"lexemes": lexemes}))
