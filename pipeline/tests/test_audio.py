"""Audio (gameplan §10, Phase 5).

- Synthesis reads pinned readings: the polyphone fixture 行 in 銀行 (hong4) and 行路 (haang4)
  is spoken as pinned, which the synthesizer's own phoneme trace confirms.
- Clips are reproducible, carry a license and provenance, and their timings point at tokens.
- Human recordings are ingested with their license and never touched by regeneration.
- With the speech models (NABU_SPEECH=1): forced alignment recovers token onsets, and the
  round-trip check (Whisper) rejects audio a recognizer cannot understand.
"""

from __future__ import annotations

import os
import re
import shutil
import wave
from pathlib import Path

import pytest

from nabu.audio import espeak, jyutping
from nabu.audio.course import (
    Item,
    audio_dir,
    encode_mp3,
    plan,
    read_index,
    synthesize_course,
    timings,
)
from nabu.audio.ingest import Recording, ingest
from nabu.audio.providers import EspeakProvider, Request
from nabu.compiler import compile_course
from nabu.schema.models import AudioVoice

from .conftest import REQUIRE_TOOLS, ROOT, CoreCli

SPEECH = os.environ.get("NABU_SPEECH") == "1"
YUE_VOICE = AudioVoice(
    id="narrator",
    provider="espeak-ng",
    voice="yue-Latn-jyutping",
    orthography="yue-Hant-HK/standard",
    reading="jyutping",
    license="CC0-1.0",
)

needs_espeak = pytest.mark.skipif(
    not (espeak.available() and shutil.which("ffmpeg") is not None) and not REQUIRE_TOOLS,
    reason="needs espeak-ng and ffmpeg (apt install espeak-ng ffmpeg)",
)
needs_speech = pytest.mark.skipif(
    not SPEECH, reason="needs the speech models (uv sync --group speech; NABU_SPEECH=1)"
)


def test_jyutping_phones() -> None:
    assert jyutping.phones("ngan4 hong4") == ["ŋ", "ɐ", "n", "h", "ɔː", "ŋ"]
    assert jyutping.phones("haang4 lou6") == ["h", "aː", "ŋ", "l", "o", "u"]
    assert jyutping.phones("m4 goi1") == ["m", "k", "ɔː", "i"]
    assert jyutping.phones("ng5") == ["ŋ"]
    assert jyutping.phones("gwong2 zau1") == ["k", "w", "ɔː", "ŋ", "ts", "ɐ", "u"]
    with pytest.raises(ValueError):
        jyutping.phones("hong")  # no tone


@needs_espeak
def test_the_polyphone_is_spoken_as_pinned() -> None:
    """銀行 (ngan4 hong4) and 行路 (haang4 lou6): the same 行, read two ways."""
    bank, walk = EspeakProvider().synthesize(
        [Request("ngan4 hong4", "yue-Latn-jyutping"), Request("haang4 lou6", "yue-Latn-jyutping")]
    )
    assert bank.trace is not None and walk.trace is not None
    assert "hong4" in bank.trace.replace("ɡ", "g") and "haang" not in bank.trace
    assert "haang4" in walk.trace.replace("ɡ", "g") and "hong" not in walk.trace
    # Characters alone would leave 行 to the synthesizer's dictionary; pinned readings do not.
    assert bank.pcm != walk.pcm


@needs_espeak
def test_synthesis_is_reproducible_and_has_word_onsets() -> None:
    jobs = [espeak.Job("ngo5 dei6 hai6 hok6 saang1", "yue-Latn-jyutping")] * 2 + [
        espeak.Job("ngo5 dei6 hai6 hok6 saang1", "yue-Latn-jyutping", espeak.RATE_SLOW)
    ]
    a, b, slow = espeak.synthesize_all(jobs)
    assert a.pcm == b.pcm  # one process per clip: nothing carries over between clips
    assert [w.start for w in a.words if w.length] == [0, 5, 10, 15, 20]
    assert slow.duration_ms > a.duration_ms * 1.3
    mp3 = encode_mp3(a.pcm, a.sample_rate, "Synthetic speech: test")
    assert mp3 == encode_mp3(a.pcm, a.sample_rate, "Synthetic speech: test")


def test_timings_map_word_onsets_to_tokens() -> None:
    from nabu.audio.course import Span
    from nabu.audio.providers import Clip

    item = Item("s.1", "zou2 san4 aa3", (Span(0, 0, 9), Span(2, 10, 13)), "早晨呀")
    clip = Clip(b"\0\0" * 22050, 22050, ((0, 0), (5, 230), (10, 470)), None)
    assert timings(item, clip, 1000) == [
        {"token": 0, "startMs": 0, "endMs": 470},
        {"token": 2, "startMs": 470, "endMs": 1000},
    ]


@pytest.fixture
def yue_copy(tmp_path: Path) -> Path:
    """The yue course's first unit, without audio: enough to synthesize, round-trip and
    recompile in seconds (the whole course is ten units)."""
    course = tmp_path / "yue"
    shutil.copytree(ROOT / "courses" / "yue", course, ignore=shutil.ignore_patterns("audio"))
    path = course / "course.yaml"  # edited as text: other tests rewrite its lines verbatim
    text, n = re.subn(r"(?m)^units: \[.*\]$", "units: [units/intro.yaml]", path.read_text("utf-8"))
    assert n == 1
    path.write_text(text, encoding="utf-8")
    (tmp_path / "images").symlink_to(ROOT / "courses" / "images")
    return course


def _compiled(cli: CoreCli, course: Path):
    diags, compiled = compile_course(course, cli)
    assert compiled is not None, [d.format() for d in diags.items]
    return diags, compiled


@needs_espeak
def test_course_audio_round_trip(core_cli: CoreCli, yue_copy: Path) -> None:
    _, compiled = _compiled(core_cli, yue_copy)
    items, skipped = plan(compiled.units, YUE_VOICE)
    assert skipped == []
    by_id = {i.item: i for i in items}
    assert by_id["sense:早晨"].input == "zou2 san4"  # a word KC, read from its pinned reading
    report = synthesize_course(yue_copy, compiled.units, YUE_VOICE)
    assert report.synthesized == len(items)  # one clip an item: the player slows it (ADR 0062)
    index = read_index(audio_dir(yue_copy))
    assert all(c.license == "CC0-1.0" and c.synthetic for c in index.clips)
    assert all(
        c.provenance.author == f"generated:espeak-ng@{espeak.version()}" for c in index.clips
    )
    # Unchanged inputs are kept; regenerating changes nothing.
    again = synthesize_course(yue_copy, compiled.units, YUE_VOICE)
    assert (again.synthesized, again.kept) == (0, len(items))
    # The compiler packages them: every sentence clip's timings point at word tokens.
    diags, recompiled = _compiled(core_cli, yue_copy)
    assert [d for d in diags.items if d.lint.startswith("audio.")] == []
    assert len(recompiled.audio_items) == len(items)
    sentence = recompiled.audio_items["s.1"]["normal"]
    assert sentence["synthetic"] and sentence["timings"][0]["startMs"] == 0


def test_a_word_met_only_inside_longer_words_reads_its_share_of_them() -> None:
    """禮拜 (week) appears only in 禮拜一 (Monday): its clip reads lai5 baai3, the first two of
    禮拜一's pinned syllables. A word whose characters do not each take a syllable is not split."""
    orth = "yue-Hant-HK/standard"
    token = {
        "surface": "禮拜一",
        "kind": "word",
        "readings": {"jyutping": "lai5 baai3 jat1"},
        "morphs": [{"surface": "禮拜"}, {"surface": "一"}],
    }
    loan = {
        "surface": "OK",
        "kind": "word",
        "readings": {"jyutping": "ou1 kei1"},
        "morphs": [{"surface": "O"}, {"surface": "K"}],
    }
    unit = {
        "sentences": [{"id": "s.1", "forms": {orth: {"text": {"tokens": [token, loan]}}}}],
        "kcs": [
            {"id": "sense:禮拜", "forms": {orth: ["禮拜"]}},
            {"id": "sense:O", "forms": {orth: ["O"]}},
        ],
    }
    items, skipped = plan([unit], YUE_VOICE)
    assert {i.item: i.input for i in items}["sense:禮拜"] == "lai5 baai3"
    assert skipped == ["sense:O"]


@needs_espeak
def test_a_changed_reading_makes_clips_stale(core_cli: CoreCli, yue_copy: Path) -> None:
    _, compiled = _compiled(core_cli, yue_copy)
    synthesize_course(yue_copy, compiled.units, YUE_VOICE)
    unit = yue_copy / "units" / "intro.yaml"
    unit.write_text(
        unit.read_text(encoding="utf-8").replace("zou2 san4", "zou2 san1"), encoding="utf-8"
    )
    diags, _ = compile_course(yue_copy, core_cli)
    assert any(d.lint == "audio.stale" for d in diags.items), [d.format() for d in diags.items]


@needs_espeak
def test_clips_of_a_voice_that_left_the_cast_are_stale(core_cli: CoreCli, yue_copy: Path) -> None:
    """Switching a course to another voice (a hosted one, say) drops the old clips."""
    _, compiled = _compiled(core_cli, yue_copy)
    synthesize_course(yue_copy, compiled.units, YUE_VOICE)
    course = yue_copy / "course.yaml"
    course.write_text(
        course.read_text(encoding="utf-8").replace(
            "{id: narrator, provider: espeak-ng, voice: yue-Latn-jyutping, "
            "orthography: yue-Hant-HK/standard, reading: jyutping, license: CC0-1.0}",
            "{id: narrator, provider: elevenlabs, voice: VoiceId, model: eleven_v4, language: yue, "
            "orthography: yue-Hant-HK/standard, reading: text, pronounce: jyutping, "
            "license: CC0-1.0}",
        ),
        encoding="utf-8",
    )
    diags, recompiled = _compiled(core_cli, yue_copy)
    stale = [d for d in diags.items if d.lint == "audio.stale"]
    assert stale and all("no longer in the course's cast" in d.message for d in stale)
    assert recompiled.audio_items == {}


@needs_espeak
def test_a_voice_never_says_words_someone_else_says(core_cli: CoreCli, yue_copy: Path) -> None:
    """A man's voice gives a sentence a woman says no clip; a clip it made before is stale, and
    the next generation drops it (ADR 0075)."""
    course = yue_copy / "course.yaml"
    text = course.read_text(encoding="utf-8")
    cast = "reading: jyutping, license: CC0-1.0}"
    assert text.count(cast) == 1
    course.write_text(
        text.replace(cast, "reading: jyutping, speaker: m, license: CC0-1.0}"), "utf-8"
    )
    man = YUE_VOICE.model_copy(update={"speaker": "m"})
    _, compiled = _compiled(core_cli, yue_copy)
    synthesize_course(yue_copy, compiled.units, man)
    assert "s.1" in {c.item for c in read_index(audio_dir(yue_copy)).clips}

    unit = yue_copy / "units" / "intro.yaml"
    text = unit.read_text(encoding="utf-8")
    assert text.count("- id: s.1\n") == 1
    unit.write_text(text.replace("- id: s.1\n", "- id: s.1\n  persons: {speaker: f}\n"), "utf-8")
    diags, compiled = _compiled(core_cli, yue_copy)
    stale = [d for d in diags.items if d.lint == "audio.stale"]
    assert [d.message.split(":")[0] for d in stale] == ["s.1"], [d.format() for d in diags.items]
    assert "s.1" not in compiled.audio_items

    items, skipped = plan(compiled.units, man)
    assert "s.1" not in {i.item for i in items} and skipped == []
    assert "s.1" in {i.item for i in plan(compiled.units, YUE_VOICE)[0]}  # no speaker: any
    woman = YUE_VOICE.model_copy(update={"speaker": "f"})
    assert "s.1" in {i.item for i in plan(compiled.units, woman)[0]}

    report = synthesize_course(yue_copy, compiled.units, man)
    assert report.other_speaker == ["s.1"]  # its file may live on: another item's clip alike
    assert "s.1" not in {c.item for c in read_index(audio_dir(yue_copy)).clips}


@needs_espeak
def test_human_recordings_keep_their_license(
    tmp_path: Path, core_cli: CoreCli, yue_copy: Path
) -> None:
    s = espeak.synthesize_all([espeak.Job("zou2 san4", "yue-Latn-jyutping")])[0]
    wav = tmp_path / "recording.wav"
    with wave.open(str(wav), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(s.sample_rate)
        w.writeframes(b"\0\0" * 2000 + s.pcm + b"\0\0" * 2000)
    entries = ingest(
        yue_copy,
        Recording("s.1", wav, "CC-BY-SA-4.0", "human:Fixture", "tests/test_audio.py"),
    )
    assert [e["speed"] for e in entries] == ["normal", "slow"]
    assert all(not e["synthetic"] and e["license"] == "CC-BY-SA-4.0" for e in entries)
    assert entries[1]["durationMs"] > entries[0]["durationMs"]
    # Leading and trailing silence trimmed.
    assert entries[0]["durationMs"] < s.duration_ms + 150
    # Regeneration leaves recordings alone.
    _, compiled = _compiled(core_cli, yue_copy)
    synthesize_course(yue_copy, compiled.units, YUE_VOICE)
    humans = [c for c in read_index(audio_dir(yue_copy)).clips if not c.synthetic]
    assert {c.speed for c in humans} == {"normal", "slow"}
    assert all(c.provenance.author == "human:Fixture" for c in humans)


def test_human_required_refuses_synthesis_at_compile(core_cli: CoreCli) -> None:
    from .conftest import FIXTURES

    diags, compiled = compile_course(FIXTURES / "lints" / "audio.human-required.yaml", core_cli)
    assert compiled is None
    assert [d.lint for d in diags.items] == ["audio.human-required"]


@needs_speech
def test_forced_alignment_finds_token_onsets_within_80_ms() -> None:
    """Against eSpeak NG's own word onsets (exact by construction)."""
    from nabu.audio.phones import align_words

    cases = [
        ("ngo5 dei6 hai6 hok6 saang1", "yue-Latn-jyutping"),
        ("ngan4 hong4 haang4 lou6", "yue-Latn-jyutping"),
        ("سلام مریم خانم", "fa"),
        ("Bu mening kitobim", "uz"),
    ]
    jobs = [espeak.Job(t, v) for t, v in cases]
    errors: list[float] = []
    for job, s in zip(jobs, espeak.synthesize_all(jobs), strict=True):
        if job.voice == "yue-Latn-jyutping":
            words = [jyutping.phones(syllable) for syllable in job.text.split()]
        else:
            words = espeak.phonemes(job.text, job.voice)
        truth = [w.ms for w in s.words if w.length]
        found = align_words(s.pcm, s.sample_rate, words)
        errors += [abs(f.start_ms - t) for f, t in zip(found[1:], truth[1:], strict=False)]
    assert sum(errors) / len(errors) < 40
    assert sum(e <= 80 for e in errors) / len(errors) >= 0.85


@needs_speech
def test_the_round_trip_check_rejects_what_a_recognizer_cannot_understand() -> None:
    """eSpeak NG's Cantonese: Whisper does not recognize it, so its clips stay out (§10.1)."""
    from nabu.audio.qa import round_trip

    [bank] = EspeakProvider().synthesize([Request("ngan4 hong4", "yue-Latn-jyutping")])
    result = round_trip(bank, "銀行", "yue")
    assert result["status"] == "fail", result
