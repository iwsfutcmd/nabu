"""A voice's `spoken` text for items whose text does not settle their reading (ADR 0065)."""

from __future__ import annotations

from typing import Any

import pytest

from nabu.audio.course import plan
from nabu.compiler import compile_course
from nabu.schema.models import AudioVoice

from .conftest import ROOT, CoreCli

DAMMA = chr(0x064F)


def voice(**extra: Any) -> AudioVoice:
    return AudioVoice.model_validate(
        {
            "id": "tehran",
            "provider": "piper",
            "voice": "fa_IR-mana-medium",
            "orthography": "fa-Arab/standard",
            "reading": "text",
            "license": "MIT",
            "finalStop": True,
            **extra,
        }
    )


@pytest.fixture(scope="module")
def units(core_cli: CoreCli) -> list[dict[str, Any]]:
    _diags, compiled = compile_course(ROOT / "courses" / "fa", core_cli)
    assert compiled is not None
    return compiled.units


def test_a_homograph_is_read_as_spoken(units: list[dict[str, Any]]) -> None:
    nine = "ن" + DAMMA + "ه"
    plain = {i.item: i for i in plan(units, voice())[0]}
    said = {i.item: i for i in plan(units, voice(spoken={"drill.numbers.9": nine}))[0]}
    # Without it, "nine" and "no" are the same input, so the same clip: both said na.
    assert plain["drill.numbers.9"].input == plain["sense:na"].input == "نه."
    assert said["drill.numbers.9"].input == nine + "."  # the full stop after it, as for any item
    assert said["sense:na"].input == "نه."
    # The word span moves onto the spoken word; the listener still expects the written word.
    [span] = said["drill.numbers.9"].spans
    assert (span.start, span.end) == (0, len(nine))
    assert said["drill.numbers.9"].expected == plain["drill.numbers.9"].expected


def test_spoken_for_an_unknown_item_is_refused(units: list[dict[str, Any]]) -> None:
    with pytest.raises(ValueError, match=r"no item drill\.numbers\.99"):
        plan(units, voice(spoken={"drill.numbers.99": "نود و نه"}))


def test_spoken_with_other_words_than_the_item_is_refused(units: list[dict[str, Any]]) -> None:
    with pytest.raises(ValueError, match="1 words, its spoken text 2"):
        plan(units, voice(spoken={"drill.numbers.9": "نُه تا"}))
