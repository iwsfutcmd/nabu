"""Speech setup as course data (ADR 0116): each orthography's profile says what learners' speech
is scored on, who hears it and where its expected phones come from; a language a tool has no model
for is heard as its macrolanguage, from CLDR's data. No table names a course."""

from __future__ import annotations

from typing import Any

import pytest

from nabu.audio import cli as audio_cli
from nabu.audio import espeak
from nabu.speech.setup import (
    Recognizer,
    espeak_voice_of,
    fine_tunes,
    heard_as,
    language_of,
    macrolanguages,
    profiles,
    recognizer_from,
    recognizer_of,
)

CANTONESE = "alvanlii/whisper-small-cantonese@b03a4e5d482f06858ce10ebbabebabec9f447a0d"


def test_each_orthography_says_what_it_is_scored_on() -> None:
    """The tiers the API offered from its own table before (fa, yue, uz, apc), and Spanish's
    words, which nothing offered: Whisper writes Spanish."""
    tiers = {k: p.speech.tiers for k, p in profiles().items() if p.speech is not None}
    assert tiers == {
        "fa-Arab/standard": [1, 2],
        "yue-Hant-HK/standard": [1, 2],
        "uz-Latn/standard": [1, 2],
        "uz-Cyrl/standard": [],
        "apc-Arab/standard": [1],
        "apc-Latn/arabizi": [],
        "es-Latn/standard": [1],
    }


def test_the_macrolanguages_are_cldr_s() -> None:
    table = macrolanguages()
    assert table["apc"] == "ar" and table["arz"] == "ar"  # one-way language matches
    assert table["yue"] == "zh" and table["lzh"] == "zh"
    assert table["pes"] == "fa" and table["uzn"] == "uz"  # aliases for a reason of macrolanguage
    assert "ar" not in table and "fa" not in table and "hbo" not in table


def test_a_tool_hears_a_language_it_lacks_as_its_macrolanguage() -> None:
    whisper = {"ar", "fa", "uz", "yue", "zh", "es"}.__contains__
    assert heard_as("apc", whisper) == "ar"
    assert heard_as("yue", whisper) == "yue"  # its own, which Whisper has, not zh
    assert heard_as("hbo", whisper) == "hbo"  # none: the tool refuses it as it would
    assert heard_as("lzh", {"en"}.__contains__) == "lzh"  # a macrolanguage the tool lacks too
    assert language_of("apc-Arab-LB") == "apc"


def test_who_hears_each_orthography() -> None:
    by = {k: recognizer_of(p) for k, p in profiles().items()}
    assert by["yue-Hant-HK/standard"] == Recognizer("yue", CANTONESE, "zh")
    assert by["apc-Arab/standard"] == Recognizer("apc")  # Whisper hears it as ar
    assert by["fa-Arab/standard"] == Recognizer("fa")
    assert by["hbo-Hebr/tiberian"] == Recognizer("hbo")
    assert fine_tunes() == {CANTONESE}
    # As the API sends it, from the bundle: JSON.
    sent = {"fineTuned": {"model": CANTONESE, "token": "zh"}}
    assert recognizer_from("yue", sent) == by["yue-Hant-HK/standard"]
    assert recognizer_from("apc", {"language": "ar"}) == Recognizer("ar")
    with pytest.raises(ValueError):
        recognizer_from("yue", {"fineTuned": {"model": "not a model", "token": "zh"}})


def test_expected_phones_come_from_the_profile_or_the_language() -> None:
    has = {"ar", "fa", "yue", "es"}.__contains__
    ps = profiles()
    assert espeak_voice_of(ps["apc-Arab/standard"], has) == "ar"
    assert espeak_voice_of(ps["fa-Arab/standard"], has) == "fa"
    yue = ps["yue-Hant-HK/standard"]
    assert yue.speech is not None and yue.speech.phones is not None
    assert yue.speech.phones.reading == "jyutping"


def test_the_audio_commands_take_the_recognizer_and_phonemes_from_the_profile(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """`nabu audio generate --check` and `check` hear the clips with the recognizer of the
    orthography they say; `align` and `ingest --align` take its phonemes (ADR 0116)."""
    from types import SimpleNamespace

    from nabu.audio import qa
    from nabu.audio.course import Item
    from nabu.audio.providers import Clip

    heard: list[Recognizer] = []

    def round_trip(_clip: Clip, _expected: str, by: Recognizer) -> dict[str, Any]:
        heard.append(by)
        return {}

    monkeypatch.setattr(qa, "round_trip", round_trip)
    monkeypatch.setattr(espeak, "has_voice", {"ar", "fa", "yue"}.__contains__)
    clip = Clip(b"", 16_000, None, None)
    for orthography in ("yue-Hant-HK/standard", "apc-Arab/standard"):
        voice = SimpleNamespace(orthography=orthography)
        source = SimpleNamespace(audio=SimpleNamespace(voices=[voice]), orthographies=[])
        audio_cli.round_trip_of(source)(Item("s.1", "", (), ""), clip)
    assert heard == [Recognizer("yue", CANTONESE, "zh"), Recognizer("apc")]
    assert audio_cli.phonemes_of("apc-Arab/standard") == "ar"
    assert audio_cli.phonemes_of("fa-Arab/standard") == "fa"
