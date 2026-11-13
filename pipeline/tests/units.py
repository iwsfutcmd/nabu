"""Compiled units built by hand, as the compiler gives them (the bundle's models), for tests of
what reads them: the cast, the audio plan, pinned readings. What a test does not say gets a
neutral value: a sentence on node "n", a draft by human:test, no translations."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any, Literal

from nabu.schema.models import (
    BundleKc,
    BundleSentence,
    BundleStory,
    BundleStoryStep,
    BundleUnit,
    TaggedText,
    TokenModel,
)

Gender = Literal["m", "f"]
DRAFT = {"author": "human:test", "status": "draft"}


def token(surface: str, kind: str = "word", **fields: Any) -> TokenModel:
    """A token: `token("呢", sense="呢", readings={"jyutping": "ni1"})`."""
    return TokenModel.model_validate({"surface": surface, "kind": kind, **fields})


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
            "kcs": [],
            "production": True,
            "provenance": dict(provenance),
            "license": "CC0-1.0",
            **({} if speaker is None else {"persons": {"speaker": speaker}}),
        }
    )


def kc(id_: str, forms: Mapping[str, Sequence[Sequence[TokenModel]]] | None = None) -> BundleKc:
    """A KC with its forms by orthography, each a form's tokens (the first: its lemma)."""
    return BundleKc.model_validate(
        {
            "id": id_,
            "kind": id_.split(":", 1)[0],
            "prerequisites": [],
            **(
                {"forms": {o: [tagged(o, f) for f in fs] for o, fs in forms.items()}}
                if forms
                else {}
            ),
        }
    )


def line(
    forms: Mapping[str, Sequence[TokenModel]] | None = None, speaker: str | None = None
) -> BundleStoryStep:
    """A story line said by a character (None: the narrator)."""
    data: dict[str, Any] = {
        "forms": {o: tagged(o, t) for o, t in (forms or {}).items()},
        "translations": {},
        "kcs": [],
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
            "kcs": [],
            "provenance": dict(provenance),
            "license": "CC0-1.0",
        }
    )


def unit(
    sentences: Sequence[BundleSentence] = (),
    kcs: Sequence[BundleKc] = (),
    stories: Sequence[BundleStory] = (),
    id_: str = "u",
) -> BundleUnit:
    return BundleUnit(
        id=id_,
        kcs=list(kcs),
        nodes=[],
        sentences=list(sentences),
        stories=list(stories) if stories else None,
    )
