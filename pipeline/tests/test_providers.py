"""Hosted TTS providers (ADR 0042): what they are asked, and how their answers are read.

The responses here are shaped like the documented APIs' (ElevenLabs with-timestamps JSON,
Cartesia server-sent events) and carry a few bytes of silence: they test request building,
parsing and bookkeeping, not audio. Real synthesis needs the provider's key and runs only with
NABU_HOSTED=1 (`test_live_*`).
"""

from __future__ import annotations

import base64
import hashlib
import json
import os
import shutil
from pathlib import Path
from typing import Any

import pytest

from nabu.audio import jyutping, providers
from nabu.audio.course import (
    Item,
    audio_dir,
    identity,
    plan,
    read_index,
    synthesize_course,
    timings,
)
from nabu.audio.providers import (
    CartesiaProvider,
    ElevenLabsProvider,
    MissingKey,
    ProviderError,
    Request,
    onsets_of,
)
from nabu.compiler import compile_course
from nabu.schema.models import AudioVoice

from .conftest import ROOT, CoreCli

#: A slower rate: providers still take one (their own slow settings), though `generate` asks
#: only for normal speed now (ADR 0062).
SLOW = 0.67

SILENCE = b"\0\0" * 2205  # 100 ms at 22.05 kHz


def voice(provider: str, **extra: Any) -> AudioVoice:
    return AudioVoice.model_validate(
        {
            "id": "narrator",
            "provider": provider,
            "voice": "VoiceId/1",
            "orthography": "yue-Hant-HK/standard",
            "reading": "text",
            "license": "CC0-1.0",
            "model": "eleven_v4" if provider == "elevenlabs" else "sonic-3.6",
            "language": "yue",
            **extra,
        }
    )


class Recorder:
    """A transport that records requests and answers from `reply(url, body)`."""

    def __init__(self, reply: Any) -> None:
        self.reply = reply
        self.calls: list[tuple[str, dict[str, str], dict[str, Any]]] = []

    def __call__(self, url: str, headers: dict[str, str], body: bytes) -> bytes:
        payload = json.loads(body)
        self.calls.append((url, headers, payload))
        result: bytes = self.reply(url, payload)
        return result


def eleven_reply(_url: str, body: dict[str, Any]) -> bytes:
    text: str = body["text"]
    alignment = {
        "characters": list(text),
        "character_start_times_seconds": [0.05 * i for i in range(len(text))],
        "character_end_times_seconds": [0.05 * (i + 1) for i in range(len(text))],
    }
    return json.dumps(
        {"audio_base64": base64.b64encode(SILENCE).decode(), "alignment": alignment}
    ).encode()


def sse(*events: dict[str, Any]) -> bytes:
    return "".join(f"data: {json.dumps(e, ensure_ascii=False)}\n\n" for e in events).encode()


# --- Jyutping in IPA -------------------------------------------------------------------------


def test_jyutping_ipa_carries_tones() -> None:
    assert jyutping.ipa("ngan4 hong4") == "ŋɐn˨˩.hɔːŋ˨˩"
    assert jyutping.ipa("haang4 lou6") == "haːŋ˨˩.lou˨˨"
    assert jyutping.ipa("hok6 saang1") == "hɔːk˨.saːŋ˥˥"  # checked syllables are short
    assert jyutping.ipa("gwong2 zau1") == "kʷɔːŋ˧˥.tsɐu˥˥"
    assert jyutping.ipa("m4 goi1") == "m\u0329˨˩.kɔːi˥˥"
    assert jyutping.ipa("ng5") == "ŋ\u030d˨˧"
    with pytest.raises(ValueError):
        jyutping.ipa("hong")


def test_settled_means_the_spelling_alone_gives_the_pinned_reading() -> None:
    assert jyutping.settled("我", "ngo5")
    assert jyutping.settled("早晨", "zou2 san4")
    assert not jyutping.settled("銀行", "ngan4 hong4")  # 行: hang4, hang6, hong4
    assert not jyutping.settled("學生", "hok6 saang1")  # 生: sang1, saang1
    assert not jyutping.settled("呀", "aa3")  # the table has aa1 only
    assert not jyutping.settled("我", "ngo5 dei6")  # syllables and characters disagree


# --- What a text voice reads -----------------------------------------------------------------


@pytest.fixture(scope="module")
def yue_units() -> list[dict[str, Any]]:
    with CoreCli() as cli:
        _, compiled = compile_course(ROOT / "courses" / "yue", cli)
    assert compiled is not None
    return compiled.units


def test_a_pronouncing_voice_reads_text_with_ipa_where_the_spelling_is_not_enough(
    yue_units: list[dict[str, Any]],
) -> None:
    items, skipped = plan(yue_units, voice("elevenlabs", pronounce="jyutping"))
    assert skipped == []
    by_id = {i.item: i for i in items}
    sentences = {
        s["id"]: s["forms"]["yue-Hant-HK/standard"]["text"]["tokens"]
        for u in yue_units
        for s in u["sentences"]
        if "yue-Hant-HK/standard" in s["forms"]
    }
    sid, tokens = next(
        (k, t) for k, t in sentences.items() if [x["surface"] for x in t][:2] == ["我", "係"]
    )
    item = by_id[sid]
    # 我 and 係 are settled, so they are spelled; punctuation stays, for the intonation.
    assert item.input.startswith("我係")
    punct = [t["surface"] for t in tokens if t["kind"] == "punct"]
    assert punct and item.input.endswith(punct[-1])
    # Every span covers its token: the spelling, or the pinned reading in IPA.
    for span in item.spans:
        token = tokens[span.token]
        piece = item.input[span.start : span.end]
        reading = token["readings"]["jyutping"]
        assert piece in (token["surface"], f"/{jyutping.ipa(reading)}/")
        assert (piece == token["surface"]) == jyutping.settled(token["surface"], reading)
    assert by_id["sense:學生"].input == f"/{jyutping.ipa('hok6 saang1')}/"


def test_an_unknown_pronounce_scheme_is_refused(yue_units: list[dict[str, Any]]) -> None:
    with pytest.raises(ValueError, match="no IPA conversion"):
        plan(yue_units, voice("elevenlabs", pronounce="yale"))


def test_identity_is_unchanged_for_providers_without_settings() -> None:
    old = hashlib.sha256(
        json.dumps(["espeak-ng", "1.52", "fa", "سلام", 1.0], ensure_ascii=False).encode()
    ).hexdigest()
    assert identity("espeak-ng", "1.52", "fa", "سلام", 1.0) == old
    assert identity("elevenlabs", "eleven_v4", "v", "سلام", 1.0, {"language": "fa"}) != old


# --- ElevenLabs ------------------------------------------------------------------------------


def test_elevenlabs_request_and_character_timestamps(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ELEVENLABS_API_KEY", "test-key")
    transport = Recorder(eleven_reply)
    tts = ElevenLabsProvider(voice("elevenlabs", language="fa"), transport)
    text = "سلام مریم!"
    normal, slow = tts.synthesize([Request(text, "VoiceId/1"), Request(text, "VoiceId/1", SLOW)])
    (url, headers, body), (_, _, slow_body) = transport.calls
    assert url == (
        "https://api.elevenlabs.io/v1/text-to-speech/VoiceId%2F1/with-timestamps"
        "?output_format=pcm_22050"
    )
    assert headers["xi-api-key"] == "test-key"
    assert body["text"] == text and body["model_id"] == "eleven_v4"
    assert body["language_code"] == "fa"
    assert body["voice_settings"]["speed"] == 1.0
    assert slow_body["voice_settings"]["speed"] == 0.7  # its slowest; SLOW is 0.67
    assert body["seed"] == ElevenLabsProvider.seed(Request(text, "VoiceId/1"))
    assert body["seed"] != slow_body["seed"]
    assert normal.pcm == SILENCE and normal.sample_rate == 22050
    # Character onsets, by code point offset; the space has none.
    assert normal.words is not None and (4, 200) not in normal.words
    assert normal.words[:2] == ((0, 0), (1, 50))
    item = Item("s.1", text, (_span(0, 0, 4), _span(2, 5, 9)), "سلام مریم")
    assert timings(item, normal, 500) == [
        {"token": 0, "startMs": 0, "endMs": 250},
        {"token": 2, "startMs": 250, "endMs": 500},
    ]
    assert slow.words is not None


def _span(token: int, start: int, end: int) -> Any:
    from nabu.audio.course import Span

    return Span(token, start, end)


def test_hosted_providers_need_their_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("ELEVENLABS_API_KEY", raising=False)
    monkeypatch.delenv("CARTESIA_API_KEY", raising=False)
    transport = Recorder(eleven_reply)
    for tts in (
        ElevenLabsProvider(voice("elevenlabs"), transport),
        CartesiaProvider(voice("cartesia"), transport),
    ):
        with pytest.raises(MissingKey, match=tts.KEY):
            tts.synthesize([Request("早晨", "VoiceId/1")])
    assert transport.calls == []


def test_hosted_providers_need_a_model_and_a_language() -> None:
    bare = voice("elevenlabs").model_copy(update={"model": None})
    with pytest.raises(ValueError, match="needs `model`"):
        ElevenLabsProvider(bare)
    with pytest.raises(ValueError, match="needs `language`"):
        CartesiaProvider(voice("cartesia").model_copy(update={"language": None}))


# --- Cartesia --------------------------------------------------------------------------------


def test_cartesia_request_and_word_timestamps(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CARTESIA_API_KEY", "test-key")
    text = "كيفك، شو أخبارك؟"
    half = len(SILENCE) // 2

    def reply(_url: str, _body: dict[str, Any]) -> bytes:
        return sse(
            {"type": "chunk", "data": base64.b64encode(SILENCE[:half]).decode(), "done": False},
            {
                "type": "timestamps",
                "done": False,
                "word_timestamps": {"words": ["كيفك،", "شو"], "start": [0.0, 0.42], "end": []},
            },
            {"type": "chunk", "data": base64.b64encode(SILENCE[half:]).decode(), "done": False},
            {
                "type": "timestamps",
                "done": False,
                "word_timestamps": {"words": ["أخبارك؟"], "start": [0.61], "end": [0.9]},
            },
            {"type": "done", "done": True, "status_code": 200},
        )

    transport = Recorder(reply)
    tts = CartesiaProvider(voice("cartesia", language="ar"), transport)
    [clip] = tts.synthesize([Request(text, "VoiceId/1", SLOW)])
    url, headers, body = transport.calls[0]
    assert url == "https://api.cartesia.ai/tts/sse"
    assert headers["Authorization"] == "Bearer test-key"
    assert headers["Cartesia-Version"] == "2026-08-14"
    assert body == {
        "model_id": "sonic-3.6",
        "transcript": text,
        "voice": {"id": "VoiceId/1"},
        "output_format": {"container": "raw", "encoding": "pcm_s16le", "sample_rate": 22050},
        "language": "ar",
        "add_timestamps": True,
        "generation_config": {"speed": SLOW},
    }
    assert clip.pcm == SILENCE
    assert clip.words == ((0, 0), (6, 420), (9, 610))


def test_cartesia_errors_surface(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CARTESIA_API_KEY", "test-key")
    error = {"type": "error", "done": True, "title": "Bad voice", "message": "no such voice"}
    tts = CartesiaProvider(voice("cartesia"), Recorder(lambda _u, _b: sse(error)))  # pyright: ignore[reportUnknownLambdaType]
    with pytest.raises(ProviderError, match="no such voice"):
        tts.synthesize([Request("早晨", "VoiceId/1")])


def test_onsets_skip_what_the_provider_normalized() -> None:
    assert onsets_of("I have 3 cats", ["I", "have", "three", "cats"], [0, 0.2, 0.4, 0.7]) == (
        (0, 0),
        (2, 200),
        (9, 700),
    )


# --- Bookkeeping: a failure midway keeps what was made ---------------------------------------


@pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="needs ffmpeg")
def test_a_provider_failing_midway_keeps_the_clips_already_made(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, yue_units: list[dict[str, Any]]
) -> None:
    monkeypatch.setenv("ELEVENLABS_API_KEY", "test-key")
    course = tmp_path / "yue"
    shutil.copytree(ROOT / "courses" / "yue", course, ignore=shutil.ignore_patterns("audio"))
    calls = {"n": 0}
    limit = {"n": 20}

    def flaky(url: str, headers: dict[str, str], body: bytes) -> bytes:
        calls["n"] += 1
        if calls["n"] > limit["n"]:
            raise ProviderError("HTTP 429: quota")
        return eleven_reply(url, json.loads(body))

    monkeypatch.setitem(
        providers.PROVIDERS, "elevenlabs", lambda v, _r: ElevenLabsProvider(v, transport=flaky)
    )
    pronouncing = voice("elevenlabs", pronounce="jyutping")
    total = len(plan(yue_units, pronouncing)[0])
    with pytest.raises(ProviderError):
        synthesize_course(course, yue_units, pronouncing)
    saved = read_index(audio_dir(course)).clips
    assert len(saved) == 16  # the first batch was saved; the second failed
    assert all(c.synthesis is not None and c.synthesis.settings for c in saved)
    limit["n"] = 10**6
    report = synthesize_course(course, yue_units, pronouncing)
    assert (report.kept, report.synthesized) == (16, total - 16)
    assert len(read_index(audio_dir(course)).clips) == total


# --- Live (NABU_HOSTED=1 and a key) ----------------------------------------------------------

HOSTED = os.environ.get("NABU_HOSTED") == "1"


@pytest.mark.skipif(
    not (
        HOSTED and os.environ.get("ELEVENLABS_API_KEY") and os.environ.get("NABU_ELEVENLABS_VOICE")
    ),
    reason="needs NABU_HOSTED=1, ELEVENLABS_API_KEY and NABU_ELEVENLABS_VOICE",
)
def test_live_elevenlabs_speaks_with_timestamps() -> None:
    v = os.environ["NABU_ELEVENLABS_VOICE"]
    [clip] = ElevenLabsProvider(voice("elevenlabs")).synthesize(
        [Request(f"我去/{jyutping.ipa('ngan4 hong4')}/。", v)]
    )
    assert len(clip.pcm) > 22050  # more than half a second
    assert clip.words is not None and clip.words[0][0] == 0


@pytest.mark.skipif(
    not (HOSTED and os.environ.get("CARTESIA_API_KEY") and os.environ.get("NABU_CARTESIA_VOICE")),
    reason="needs NABU_HOSTED=1, CARTESIA_API_KEY and NABU_CARTESIA_VOICE",
)
def test_live_cartesia_speaks_with_timestamps() -> None:
    v = os.environ["NABU_CARTESIA_VOICE"]
    [clip] = CartesiaProvider(voice("cartesia", language="ar")).synthesize(
        [Request("كيفك؟ شو أخبارك؟", v)]
    )
    assert len(clip.pcm) > 22050
    assert clip.words is not None and len(clip.words) >= 2
