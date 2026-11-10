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
from collections.abc import Iterator
from pathlib import Path
from typing import ClassVar

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
from nabu.audio.providers import Clip, EspeakProvider, Request
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
def test_prune_lets_the_stale_clips_go_and_keeps_the_rest(
    core_cli: CoreCli, yue_copy: Path
) -> None:
    """generate keeps a stale clip until its new one is made; prune makes none and drops it, so the
    course builds clean at once."""
    _, compiled = _compiled(core_cli, yue_copy)
    synthesize_course(yue_copy, compiled.units, YUE_VOICE)
    before = read_index(audio_dir(yue_copy)).clips
    unit = yue_copy / "units" / "intro.yaml"
    unit.write_text(
        unit.read_text(encoding="utf-8").replace("zou2 san4", "zou2 san1"), encoding="utf-8"
    )
    diags, compiled = _compiled(core_cli, yue_copy)
    stale = [d for d in diags.items if d.lint == "audio.stale"]
    assert stale
    report = synthesize_course(yue_copy, compiled.units, YUE_VOICE, prune=True)
    assert report.dropped == len(stale) and report.synthesized == 0
    after = read_index(audio_dir(yue_copy)).clips
    assert len(after) == len(before) - len(stale)
    files = {p.name for p in (audio_dir(yue_copy) / "clips").glob("*.mp3")}
    assert files == {c.file.removeprefix("clips/") for c in after}
    diags, _ = compile_course(yue_copy, core_cli)
    assert not any(d.lint == "audio.stale" for d in diags.items)


def _voices(course: Path) -> dict[str, str]:
    """Each item's clip, by the voice that made it."""
    return {c.item: c.synthesis.voice for c in read_index(audio_dir(course)).clips if c.synthesis}


@needs_espeak
def test_a_cast_reads_at_random_and_by_grammar(core_cli: CoreCli, yue_copy: Path) -> None:
    """A man's and a woman's voice share the items at random; a sentence said by a woman goes to
    the woman, and a clip the other voice made before is stale until generated again; a run of
    one voice keeps the other's clips (ADR 0078)."""
    course = yue_copy / "course.yaml"
    text = course.read_text(encoding="utf-8")
    one = (
        "{id: narrator, provider: espeak-ng, voice: yue-Latn-jyutping, "
        "orthography: yue-Hant-HK/standard, reading: jyutping, license: CC0-1.0}"
    )
    assert text.count(one) == 1
    two = (
        "{id: narrator, provider: espeak-ng, voice: yue-Latn-jyutping, speaker: m, "
        "orthography: yue-Hant-HK/standard, reading: jyutping, license: CC0-1.0}\n"
        "  - {id: narrator-f, provider: espeak-ng, voice: yue-Latn-jyutping+f3, speaker: f, "
        "orthography: yue-Hant-HK/standard, reading: jyutping, license: CC0-1.0}"
    )
    course.write_text(text.replace(one, two), encoding="utf-8")
    man = YUE_VOICE.model_copy(update={"speaker": "m"})
    woman = YUE_VOICE.model_copy(
        update={"id": "narrator-f", "voice": "yue-Latn-jyutping+f3", "speaker": "f"}
    )
    _, compiled = _compiled(core_cli, yue_copy)
    report = synthesize_course(yue_copy, compiled.units, [man, woman])
    voices = _voices(yue_copy)
    assert sum(report.shares.values()) == len(voices)
    assert 0.3 < report.shares["narrator-f"] / len(voices) < 0.7, report.shares
    diags, _ = _compiled(core_cli, yue_copy)
    assert [d.format() for d in diags.items if d.lint == "audio.stale"] == []

    # The sentence the man reads now is said by a woman.
    said = next(i for i, v in sorted(voices.items()) if i.startswith("s.") and v == man.voice)
    unit = yue_copy / "units" / "intro.yaml"
    text = unit.read_text(encoding="utf-8")
    assert text.count(f"- id: {said}\n") == 1
    unit.write_text(
        text.replace(f"- id: {said}\n", f"- id: {said}\n  persons: {{speaker: f}}\n"), "utf-8"
    )
    diags, compiled = _compiled(core_cli, yue_copy)
    stale = [d.message for d in diags.items if d.lint == "audio.stale"]
    assert [m.split(":")[0] for m in stale] == [said], stale
    assert "narrator-f reads it now" in stale[0]

    # Running the man alone leaves the woman's clips, and the stale one, as they are.
    synthesize_course(yue_copy, compiled.units, [man, woman], only="narrator")
    after = _voices(yue_copy)
    assert after == voices
    synthesize_course(yue_copy, compiled.units, [man, woman])
    after = _voices(yue_copy)
    assert after == {**voices, said: woman.voice}


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


class _Whisper:
    """faster-whisper's WhisperModel as far as the round-trip check uses it."""

    made: ClassVar[list[tuple[str, str]]] = []
    broken: ClassVar[bool] = False

    def __init__(self, _model: str, device: str, compute_type: str) -> None:
        self.device = device
        _Whisper.made.append((device, compute_type))

    def transcribe(self, *_args: object, **_kwargs: object) -> tuple[Iterator[object], None]:
        def segments() -> Iterator[object]:
            if self.device == "cuda" and _Whisper.broken:
                raise RuntimeError("Library libcublas.so.12 is not found or cannot be loaded")
            yield from ()

        return segments(), None


@pytest.fixture
def whisper(monkeypatch: pytest.MonkeyPatch) -> Iterator[type[_Whisper]]:
    import types

    from nabu.audio import qa

    def zeros(n: int, dtype: str) -> list[float]:
        return [0.0] * n

    fakes = {
        "faster_whisper": types.SimpleNamespace(WhisperModel=_Whisper),
        "numpy": types.SimpleNamespace(zeros=zeros),
    }

    def optional(name: str) -> object:
        return fakes[name]

    monkeypatch.setattr(qa, "optional", optional)
    _Whisper.made, _Whisper.broken = [], False
    qa.recognizer.cache_clear()
    yield _Whisper
    qa.recognizer.cache_clear()


@pytest.mark.parametrize(
    ("gpu", "broken", "made"),
    [
        (False, False, [("cpu", "int8")]),
        (True, False, [("cuda", "float16")]),
        (True, True, [("cuda", "float16"), ("cpu", "int8")]),
    ],
)
def test_the_round_trip_check_listens_on_a_gpu_only_when_one_works(
    whisper: type[_Whisper],
    monkeypatch: pytest.MonkeyPatch,
    gpu: bool,
    broken: bool,
    made: list[tuple[str, str]],
) -> None:
    from nabu.audio import qa

    monkeypatch.setattr(qa, "cuda_ready", lambda: gpu)
    whisper.broken = broken
    qa.recognizer()
    assert whisper.made == made


def test_without_ctranslate2_or_a_gpu_the_check_stays_on_the_cpu(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import types

    from nabu.audio import qa

    def missing(name: str) -> object:
        raise ImportError(name)

    monkeypatch.setattr(qa, "optional", missing)
    assert not qa.cuda_ready()

    def no_gpu(_name: str) -> object:
        return types.SimpleNamespace(get_cuda_device_count=lambda: 0)

    monkeypatch.setattr(qa, "optional", no_gpu)
    assert not qa.cuda_ready()


needs_ffmpeg = pytest.mark.skipif(
    shutil.which("ffmpeg") is None and not REQUIRE_TOOLS, reason="needs ffmpeg"
)


class _Voice:
    """A provider whose every take sounds a little different, as a sampling model's do."""

    name = "fake"
    seeded = True

    def __init__(self) -> None:
        self.said: list[str] = []

    def version(self) -> str:
        return "1"

    def settings(self) -> dict[str, object]:
        return {}

    def speed(self, rate: float) -> float:
        return rate

    def synthesize(self, requests: list[Request]) -> list[Clip]:
        out: list[Clip] = []
        for r in requests:
            self.said.append(r.input)
            tone = len(self.said) * 512
            pcm = b"".join((tone + k).to_bytes(2, "little", signed=True) for k in range(4000))
            out.append(Clip(pcm, 16_000, ((0, 0),), None))
        return out


@pytest.fixture
def voice(monkeypatch: pytest.MonkeyPatch) -> _Voice:
    from nabu.audio import course as course_audio

    fake = _Voice()

    def provider(_voice: AudioVoice, _reference: object) -> _Voice:
        return fake

    monkeypatch.setattr(course_audio, "provider", provider)
    return fake


def _twins_course(root: Path) -> list[dict[str, object]]:
    """A sentence and a word said alike: 早晨 (zou2 san4), so one identity and one file."""
    (root / "audio").mkdir(parents=True)
    (root / "course.yaml").write_text("id: twins\n", encoding="utf-8")
    orth = "yue-Hant-HK/standard"
    token = {"surface": "早晨", "kind": "word", "readings": {"jyutping": "zou2 san4"}}
    return [
        {
            "sentences": [{"id": "s.1", "forms": {orth: {"text": {"tokens": [token]}}}}],
            "kcs": [{"id": "sense:早晨", "forms": {orth: ["早晨"]}}],
        }
    ]


def _clips_match_files(course: Path) -> set[str]:
    import hashlib

    adir = audio_dir(course)
    clips = read_index(adir).clips
    assert all(hashlib.sha256((adir / c.file).read_bytes()).hexdigest() == c.sha256 for c in clips)
    return {c.file for c in clips}


@needs_ffmpeg
def test_items_said_alike_share_one_clip(tmp_path: Path, voice: _Voice) -> None:
    """Twins made in one run take one synthesis; neither writes over the other's file."""
    units = _twins_course(tmp_path)
    report = synthesize_course(tmp_path, units, YUE_VOICE)
    assert voice.said == ["zou2 san4"]
    assert report.synthesized == 2
    assert len(_clips_match_files(tmp_path)) == 1
    assert {c.item for c in read_index(audio_dir(tmp_path)).clips} == {"s.1", "sense:早晨"}


@needs_ffmpeg
def test_a_clip_written_over_by_its_twin_is_mended_from_it(tmp_path: Path, voice: _Voice) -> None:
    """Before twins shared clips, making one wrote over the other's file and left its entry
    naming bytes no longer there (es: s.u01.32 and es.story.u01#3). The next run shares the clip
    that is there and makes nothing."""
    units = _twins_course(tmp_path)
    synthesize_course(tmp_path, units, YUE_VOICE)
    index = audio_dir(tmp_path) / "index.yaml"
    entry = index.read_text(encoding="utf-8").split("- item: s.1", 1)[1]
    sha = entry.split("sha256: ", 1)[1].split("\n", 1)[0]
    index.write_text(index.read_text(encoding="utf-8").replace(sha, "a" * 64, 1), encoding="utf-8")
    with pytest.raises(AssertionError):
        _clips_match_files(tmp_path)
    voice.said.clear()
    report = synthesize_course(tmp_path, units, YUE_VOICE)
    assert voice.said == [] and report.kept == 2
    assert len(_clips_match_files(tmp_path)) == 1
