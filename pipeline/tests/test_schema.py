# pyright: reportUnknownMemberType=false
"""The generated Pydantic models accept and reject exactly what the JSON Schema does."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
import yaml
from hypothesis import given
from hypothesis import strategies as st
from jsonschema import Draft202012Validator
from pydantic import BaseModel, TypeAdapter, ValidationError
from referencing import Registry, Resource

from nabu.schema import LangTag, MessageCatalog, OrthographyProfile, ScriptedLangTag, TaggedText
from nabu.schema.models import NfcStep

from .conftest import EXAMPLES, PROFILES, SCHEMAS

BASE = "https://nabu.invalid/schemas/v0/"
MODELS: dict[str, type[BaseModel]] = {
    "tagged-text": TaggedText,
    "orthography-profile": OrthographyProfile,
    "message-catalog": MessageCatalog,
}


def load(path: Path) -> Any:
    text = path.read_text(encoding="utf-8")
    return json.loads(text) if path.suffix == ".json" else yaml.safe_load(text)


def registry() -> Registry[Any]:
    resources = [
        (BASE + p.name, Resource.from_contents(json.loads(p.read_text(encoding="utf-8"))))
        for p in sorted(SCHEMAS.glob("*.schema.json"))
    ]
    return Registry[Any]().with_resources(resources)


def validator(kind: str) -> Draft202012Validator:
    schema = json.loads((SCHEMAS / f"{kind}.schema.json").read_text(encoding="utf-8"))
    return Draft202012Validator(schema, registry=registry())


def documents(kind: str, verdict: str) -> list[Path]:
    folder = EXAMPLES / kind / verdict
    return sorted(p for p in folder.iterdir() if p.suffix in {".json", ".yaml"})


def pydantic_accepts(model: type[BaseModel], data: Any) -> bool:
    try:
        model.model_validate(data)
    except ValidationError:
        return False
    return True


@pytest.mark.parametrize("path", sorted(PROFILES.glob("*.yaml")), ids=lambda p: p.name)
def test_profiles_validate(path: Path) -> None:
    data = load(path)
    validator("orthography-profile").validate(data)
    profile = OrthographyProfile.model_validate(data)
    assert profile.id.startswith(profile.lang + "/")


@pytest.mark.parametrize("kind", sorted(MODELS))
def test_examples_agree(kind: str) -> None:
    v = validator(kind)
    for verdict, expected in (("valid", True), ("invalid", False)):
        for path in documents(kind, verdict):
            data = load(path)
            assert v.is_valid(data) is expected, f"jsonschema disagrees on {path.name}"
            accepted = pydantic_accepts(MODELS[kind], data)
            assert accepted is expected, f"pydantic disagrees on {path.name}"


def test_models_are_frozen() -> None:
    text = TaggedText.model_validate(load(EXAMPLES / "tagged-text/valid/yue-ruby.json"))
    with pytest.raises(ValidationError):
        text.lang = "fa-Arab"  # pyright: ignore[reportAttributeAccessIssue]


def test_ruby_round_trips() -> None:
    data = load(EXAMPLES / "tagged-text/valid/yue-ruby.json")
    text = TaggedText.model_validate(data)
    assert text.model_dump(mode="json", exclude_none=True) == data


def test_nfc_step_is_literal() -> None:
    adapter = TypeAdapter[NfcStep](NfcStep)
    assert adapter.validate_python("nfc") == "nfc"
    with pytest.raises(ValidationError):
        adapter.validate_python("nfkc")


SCRIPTED = TypeAdapter[ScriptedLangTag](ScriptedLangTag)

# The LangTag regex runs under Rust's regex engine in Pydantic, Python's `re` in jsonschema and
# ECMA-262 in Ajv. Generate tags from the grammar and check the engines agree.
LANGUAGE = st.from_regex(r"[a-z]{2,3}", fullmatch=True)
SCRIPT = st.from_regex(r"[A-Z][a-z]{3}", fullmatch=True)
REGION = st.from_regex(r"[A-Z]{2}|[0-9]{3}", fullmatch=True)
VARIANT = st.from_regex(r"[a-z0-9]{5,8}|[0-9][a-z0-9]{3}", fullmatch=True)


@st.composite
def lang_tags(draw: st.DrawFn, with_script: bool) -> str:
    parts = [draw(LANGUAGE)]
    if with_script or draw(st.booleans()):
        parts.append(draw(SCRIPT))
    if draw(st.booleans()):
        parts.append(draw(REGION))
    parts.extend(draw(st.lists(VARIANT, max_size=2)))
    return "-".join(parts)


@given(lang_tags(with_script=True))
def test_scripted_tags_accepted_everywhere(tag: str) -> None:
    common = json.loads((SCHEMAS / "common.schema.json").read_text(encoding="utf-8"))
    assert Draft202012Validator(common["$defs"]["ScriptedLangTag"]).is_valid(tag)
    assert SCRIPTED.validate_python(tag) == tag
    assert TypeAdapter[LangTag](LangTag).validate_python(tag) == tag


def has_script(tag: str) -> bool:
    subtags = tag.split("-")
    return len(subtags) > 1 and subtags[1][:1].isupper()


@given(lang_tags(with_script=False).filter(lambda t: not has_script(t)))
def test_unscripted_tags_rejected_for_language_data(tag: str) -> None:
    with pytest.raises(ValidationError):
        SCRIPTED.validate_python(tag)
