"""Reading schemes are data (ADR 0109): profiles/schemes, read here (nabu.schemes) and by core
(@nabu/schema/schemes, generated). The rules both apply to that data are pinned to the same
conformance vectors (conformance/pronounce.json: reading-syllables, reading-tone), which the
core-cli harnesses run against core."""

from __future__ import annotations

import json
from typing import Any

import pytest
import yaml

from nabu.compiler import load_profiles
from nabu.schema.models import CourseSource
from nabu.schemes import (
    Plugins,
    plugins,
    reader,
    scheme,
    schemes,
    syllables,
    tone,
    tone_letters,
    toneless,
)

from .conftest import ROOT

PRONOUNCE = ROOT / "conformance/pronounce.json"
VECTORS = [
    v
    for v in json.loads(PRONOUNCE.read_text(encoding="utf-8"))["vectors"]
    if v["op"] in ("reading-syllables", "reading-tone")
]
CATALOG = json.loads((ROOT / "packages/i18n/messages/en.json").read_text(encoding="utf-8"))


@pytest.mark.parametrize("vector", VECTORS, ids=[v["id"] for v in VECTORS])
def test_python_reads_a_scheme_as_core_does(vector: dict[str, Any]) -> None:
    args = vector["args"]

    def run() -> object:
        if vector["op"] == "reading-syllables":
            return syllables(args["scheme"], args["text"])
        return tone(args["scheme"], args["syllable"])

    if "error" in vector:
        with pytest.raises(ValueError, match=vector["error"]):
            run()
    else:
        assert run() == vector["expected"]


def test_core_gets_the_same_data() -> None:
    """The generated copy core imports is the YAML, validated (pnpm codegen)."""
    generated = json.loads(
        (ROOT / "packages/schema/src/generated/schemes.json").read_text(encoding="utf-8")
    )
    source = [
        yaml.safe_load(p.read_text(encoding="utf-8"))
        for p in sorted((ROOT / "profiles/schemes").glob("*.yaml"))
    ]
    assert generated == source
    assert sorted(schemes()) == [s["id"] for s in source]


def test_every_reading_named_anywhere_has_a_scheme() -> None:
    """A profile's reading layer and a course voice name schemes with data, and a voice that
    takes IPA (`pronounce`) one whose plug-ins give it."""
    for profile in load_profiles().values():
        for layer in profile.annotations or []:
            if layer.kind == "reading" and layer.scheme is not None:
                scheme(layer.scheme)
    for path in sorted((ROOT / "courses").glob("*/course.yaml")):
        course = CourseSource.model_validate(yaml.safe_load(path.read_text(encoding="utf-8")))
        for voice in course.audio.voices or [] if course.audio is not None else []:
            if voice.reading != "text":
                scheme(voice.reading)
            if voice.pronounce is not None:
                found = plugins(voice.pronounce)
                assert found.ipa is not None and found.settled is not None, path


def test_jyutping_tones_as_ipa_letters() -> None:
    """Chao's letters from the data, as voices that take IPA get them (55 ˥˥, checked 5 ˥)."""
    assert [tone_letters("jyutping", t) for t in "123456"] == ["˥˥", "˧˥", "˧˧", "˨˩", "˨˧", "˨˨"]
    assert [tone_letters("jyutping", t, checked=True) for t in "136"] == ["˥", "˧", "˨"]
    assert tone_letters("jyutping", "2", checked=True) == "˧˥"
    assert toneless("jyutping", "hou2") == "hou"
    assert toneless("pinyin", "hǎo") == "hǎo"


def test_what_the_pipeline_does_with_each_scheme() -> None:
    assert reader("yue") == "jyutping"
    assert reader("cmn") is None
    assert plugins("pinyin") == Plugins()
    assert plugins("attic").cite is not None and plugins("tiberian").espeak is not None
    with pytest.raises(ValueError, match="no reading scheme"):
        plugins("yale")


def test_the_catalogs_copies_of_scheme_and_tone_names_match_the_data() -> None:
    """The English catalog keeps these names only for the draft translations (ADR 0109)."""
    messages = CATALOG["messages"]
    for found in schemes().values():
        key = f"reading.scheme.{found.id}"
        if key in messages:
            assert messages[key]["message"] == found.name["en"]
        for value, t in (found.tones.values if found.tones is not None else {}).items():
            key = f"player.tone.{found.tones.system if found.tones else ''}.{value}"
            if key in messages and t.name is not None:
                assert messages[key]["message"] == f"{value} · {t.name['en']}"
