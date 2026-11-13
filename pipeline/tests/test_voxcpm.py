"""VoxCPM2 (ADR 0094): two designed anchors as the yue course's voices.

A stand-in engine, aligner and stretcher test the plumbing: what the model is asked (the reference
and its transcript, a seed per clip), the two routes (a word card through the carrier, cut where the
aligner puts the word; a sentence slowed toward the pace), and each route's place in the clip's
identity. Their samples are tones and silence, never presented as the model's speech. Real
synthesis needs the runtime (pipeline/runtimes/voxcpm) and runs on a GPU machine.
"""

from __future__ import annotations

import math
import shutil
from array import array
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import pytest

from nabu.audio.course import caster_of, identity, item_settings
from nabu.audio.phones import Timing
from nabu.audio.providers import (
    Caster,
    Reference,
    Request,
    VoxCPMProvider,
    provider,
    seed_of,
    speech_span,
)
from nabu.schema.models import AudioVoice

REVISION = "7936080b41163874f38610f46f438e2c0757f9fd"
RATE = 48_000


def voice(**extra: Any) -> AudioVoice:
    return AudioVoice.model_validate(
        {
            "id": "anchor-f",
            "provider": "voxcpm",
            "voice": "anchor-f",
            "speaker": "f",
            "model": f"openbmb/VoxCPM2@{REVISION}",
            "language": "yue",
            "orthography": "yue-Hant-HK/standard",
            "reading": "text",
            "license": "Apache-2.0",
            "carrier": {"text": "跟住我讀："},
            "pace": {"target": 4.3, "maxStretch": 1.6},
            **extra,
        }
    )


REF = Reference(Path("voices/anchor-f.wav"), "大家好，我係今日嘅主持。", "a" * 64)


def tone(seconds: float, silence_before: float = 0.0) -> bytes:
    """A 220 Hz tone after some silence: stands in for speech, so the speech span can be found."""
    lead = [0] * round(silence_before * RATE)
    body = [
        round(8000 * math.sin(2 * math.pi * 220 * i / RATE)) for i in range(round(seconds * RATE))
    ]
    return array("h", lead + body).tobytes()


@dataclass
class FakeEngine:
    """Returns `seconds` of tone a syllable for what it is asked, and records each request."""

    per_syllable: float = 0.15
    asked: list[tuple[str, str, str, int]] = field(default_factory=list[tuple[str, str, str, int]])
    sampling_rate: int = RATE

    def speak(self, text: str, prompt: Path, prompt_text: str, seed: int) -> bytes:
        self.asked.append((text, str(prompt), prompt_text, seed))
        return tone(self.per_syllable * len(text))

    def design(self, text: str, instruct: str, seed: int) -> bytes:
        return tone(1.0)


def make(engine: FakeEngine, **kw: Any) -> tuple[VoxCPMProvider, dict[str, Any]]:
    seen: dict[str, Any] = {"aligned": [], "stretched": []}

    def align(pcm: bytes, rate: int, words: list[list[str]]) -> list[Timing]:
        seen["aligned"].append(words)
        return [Timing(0, 900), Timing(1000, 1500)]

    def stretch(pcm: bytes, rate: int, by: float) -> bytes:
        seen["stretched"].append(by)
        return pcm + pcm[: round(len(pcm) * (by - 1)) // 2 * 2]

    tts = VoxCPMProvider(
        voice(**kw),
        REF,
        load=lambda _r, _v: engine,
        align=align,
        phonemes=lambda text, _v: [[c] for c in text if c.strip() and c not in "：。"],
        stretch=stretch,
    )
    return tts, seen


def test_every_clip_clones_the_reference_with_its_transcript_and_its_own_seed() -> None:
    engine = FakeEngine()
    tts, _ = make(engine)
    requests = [Request("你好！", "anchor-f"), Request("銀行", "anchor-f", kind="word")]
    tts.synthesize(requests)
    assert [(a[1], a[2]) for a in engine.asked] == [(str(REF.path), REF.text)] * 2
    assert [a[3] for a in engine.asked] == [seed_of(r) for r in requests]
    assert tts.version() == f"openbmb/VoxCPM2#{REVISION}+voxcpm-2.0.3"
    assert isinstance(provider(voice(), REF), VoxCPMProvider)


def test_a_word_card_is_said_after_the_carrier_and_cut_where_the_aligner_puts_it() -> None:
    engine = FakeEngine(per_syllable=0.25)  # 2 s for the carrier and the word
    tts, seen = make(engine)
    (clip,) = tts.synthesize([Request("銀行", "anchor-f", kind="word")])
    assert engine.asked[0][0] == "跟住我讀：銀行。"
    # The carrier and the word are aligned as two words, the word at 1000-1500 ms; the cut keeps
    # 40 ms before it and 150 ms after it: 960 to 1650 ms.
    assert seen["aligned"] == [[["跟", "住", "我", "讀"], ["銀", "行"]]]
    assert len(clip.pcm) // 2 == round(0.690 * RATE)
    assert seen["stretched"] == []  # a word card is not paced


def test_a_sentence_is_slowed_toward_the_pace_and_never_past_its_limit() -> None:
    fast = FakeEngine(per_syllable=0.15)  # 6.7 syllables a second (the punctuation adds a little)
    tts, seen = make(fast)
    tts.synthesize([Request("我係學生。", "anchor-f")])
    (by,) = seen["stretched"]
    assert 1.0 < by <= 1.6
    slow = FakeEngine(per_syllable=0.3)  # under 4.3 a second: left alone
    tts, seen = make(slow)
    tts.synthesize([Request("我係學生。", "anchor-f")])
    assert seen["stretched"] == []
    very_fast = FakeEngine(per_syllable=0.05)
    tts, seen = make(very_fast)
    tts.synthesize([Request("我係學生。", "anchor-f")])
    assert seen["stretched"] == [1.6]


def test_each_route_is_in_its_own_clips_identity() -> None:
    tts, _ = make(FakeEngine())
    word = item_settings(tts, Request("銀行", "anchor-f", kind="word"))
    sentence = item_settings(tts, Request("你好！", "anchor-f"))
    assert word == {"carrier": {"text": "跟住我讀：", "method": VoxCPMProvider.CARRIER_METHOD}}
    assert sentence == {
        "pace": {"target": 4.3, "maxStretch": 1.6, "method": VoxCPMProvider.PACE_METHOD}
    }
    # Changing the pace makes the sentences' clips stale, never the word cards'.
    slower, _ = make(FakeEngine(), pace={"target": 4.0, "maxStretch": 1.6})

    def ident(t: VoxCPMProvider, r: Request) -> str:
        settings = t.settings() | item_settings(t, r)
        return identity(t.name, t.version(), "anchor-f", r.input, 1.0, settings)

    word_card, said = Request("銀行", "anchor-f", kind="word"), Request("你好！", "anchor-f")
    assert ident(tts, word_card) == ident(slower, word_card)
    assert ident(tts, said) != ident(slower, said)


def test_the_speech_span_skips_the_silence_around_it() -> None:
    start, end = speech_span(tone(1.0, silence_before=0.5), RATE)
    assert abs(start / RATE - 0.5) < 0.03
    assert abs(end / RATE - 1.5) < 0.03


def test_it_needs_a_reference_voice() -> None:
    with pytest.raises(ValueError, match="no reference voice"):
        VoxCPMProvider(voice(), None)


def test_a_word_card_ends_with_the_full_stop_of_its_orthographys_script() -> None:
    """The stop after a carried word is the orthography's (punctuation.py), not chosen by the
    letters of the word: a yue word card in Latin letters still ends with 。, a Hindi one with
    the danda, and a Thai one with nothing."""
    engine = FakeEngine(per_syllable=0.25)
    tts, _ = make(engine)
    tts.synthesize([Request("OK", "anchor-f", kind="word")])
    hindi, _ = make(engine, orthography="hi-Deva/standard", language="hi", pace=None)
    hindi.synthesize([Request("नमस्ते", "anchor-f", kind="word")])
    thai, _ = make(engine, orthography="th-Thai/standard", language="th", pace=None)
    thai.synthesize([Request("สวัสดี", "anchor-f", kind="word")])
    assert [a[0] for a in engine.asked] == ["跟住我讀：OK。", "跟住我讀：नमस्ते।", "跟住我讀：สวัสดี"]


def test_the_pace_is_only_for_a_script_whose_syllables_it_counts() -> None:
    """`pace` counts Han characters as syllables: a voice of another script cannot be paced, and
    says so, rather than being left silently unpaced."""
    with pytest.raises(ValueError, match="counts syllables as Han characters"):
        make(FakeEngine(), orthography="es-Latn/standard", language="es")
    unpaced, seen = make(FakeEngine(), orthography="es-Latn/standard", language="es", pace=None)
    unpaced.synthesize([Request("¡Hola!", "anchor-f")])
    assert seen["stretched"] == []


def test_cast_goes_by_what_the_provider_declares() -> None:
    """`nabu audio cast` asks a provider how its reference is made (CASTS), never its name."""
    tts, _ = make(FakeEngine())
    assert isinstance(tts, Caster) and frozenset({"designed"}) == tts.CASTS
    assert isinstance(caster_of(voice()), VoxCPMProvider)
    espeak = AudioVoice.model_validate(
        {
            "id": "e",
            "provider": "espeak-ng",
            "voice": "yue",
            "orthography": "yue-Hant-HK/standard",
            "reading": "text",
            "license": "CC0-1.0",
        }
    )
    assert caster_of(espeak) is None


@pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="needs ffmpeg")
def test_a_designed_anchor_is_kept_at_its_own_rate_with_how_it_was_made(tmp_path: Path) -> None:
    import wave

    from nabu.audio.course import audio_dir, read_index, record_reference

    course = tmp_path / "yue"
    (course / "audio").mkdir(parents=True)
    take = tmp_path / "take.wav"
    with wave.open(str(take), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(tone(1.0))
    tts, _ = make(FakeEngine())
    design = tts.design_record("Cantonese, a deep-voiced middle-aged man, news anchor", 3)
    design["recast"] = {"text": "各位觀眾，晚安。", "seed": 2}
    ref = record_reference(
        course, voice(), take, REF.text, "Apache-2.0", "generated:voxcpm@x", None, design
    )
    assert ref.synthetic and ref.durationMs == 1000
    with wave.open(str(audio_dir(course) / ref.file), "rb") as r:
        assert r.getframerate() == RATE  # not resampled to the recorded references' 22.05 kHz
    kept = read_index(audio_dir(course)).references or []
    assert kept[0].design is not None and kept[0].design.recast is not None
    assert kept[0].design.recast.seed == 2
