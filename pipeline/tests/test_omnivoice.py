"""OmniVoice (ADR 0058): the Lahgtna checkpoint as the apc course's voice.

A stand-in engine tests the plumbing: what the model is asked (dialect, steps, the reference to
clone, a seed per clip), the reference voice's bookkeeping, and stale clips. Its samples are
silence, never presented as the model's speech. Real synthesis needs the omnivoice group and the
checkpoint, and runs only with NABU_OMNIVOICE=1 (`test_live_*`).
"""

from __future__ import annotations

import hashlib
import os
import shutil
from pathlib import Path
from typing import Any

import pytest
import yaml

from nabu.audio import providers
from nabu.audio.course import (
    audio_dir,
    cast_reference,
    plan,
    read_index,
    reference_of,
    synthesize_course,
)
from nabu.audio.providers import OmniVoiceProvider, Reference, Request, checkpoint, seed_of
from nabu.compiler import compile_course
from nabu.schema.models import AudioVoice, Provenance

from .conftest import ROOT, CoreCli

REVISION = "55c38a613e316499829eef60b006edc6da9499e2"
ORTH = "apc-Arab/standard"
FATHA = "َ"


def voice(**extra: Any) -> AudioVoice:
    return AudioVoice.model_validate(
        {
            "id": "beirut",
            "provider": "omnivoice",
            "voice": "beirut-m",
            "model": f"oddadmix/lahgtna-omnivoice-v2@{REVISION}",
            "language": "lb",
            "orthography": ORTH,
            "reading": "text",
            "vowelMarks": True,
            "license": "CC-BY-NC-4.0",
            **extra,
        }
    )


class FakeEngine:
    """Records what it is asked; speaks silence (a designed voice: a level set by the seed)."""

    sampling_rate = 24000

    def __init__(self) -> None:
        self.prompts: list[tuple[Path, str]] = []
        self.calls: list[dict[str, Any]] = []

    def clone_prompt(self, audio: Path, text: str) -> Any:
        self.prompts.append((audio, text))
        return ("prompt", text)

    def speak(
        self,
        text: str,
        language: str,
        seed: int,
        num_step: int,
        guidance_scale: float,
        **extra: Any,
    ) -> Any:
        self.calls.append(
            {"text": text, "language": language, "seed": seed, "numStep": num_step}
            | {"guidance": guidance_scale}
            | extra
        )
        level = (seed % 7) / 100 if "instruct" in extra else 0.0
        return [level] * 2400


def fake(engine: FakeEngine, v: AudioVoice, ref: Reference | None) -> OmniVoiceProvider:
    return OmniVoiceProvider(v, ref, load=lambda _repo, _rev: engine, package=lambda: "0.2.1")


REF = Reference(Path("voices/beirut-m.wav"), "مَرْحَبا!", "a" * 64)


def test_a_checkpoint_is_pinned_to_a_commit() -> None:
    assert checkpoint(f"oddadmix/lahgtna-omnivoice-v2@{REVISION}") == (
        "oddadmix/lahgtna-omnivoice-v2",
        REVISION,
    )
    for bad in ("oddadmix/lahgtna-omnivoice-v2", "lahgtna@" + REVISION, "a/b@main"):
        with pytest.raises(ValueError, match="40-hex commit"):
            checkpoint(bad)


def test_a_voice_needs_its_reference() -> None:
    with pytest.raises(ValueError, match="nabu audio cast"):
        fake(FakeEngine(), voice(), None)


def test_every_clip_clones_the_reference_with_a_seed_of_its_own() -> None:
    engine = FakeEngine()
    tts = fake(engine, voice(), REF)
    requests = [Request("وين الحَمّام؟", "beirut-m", 1.0), Request("وين الحَمّام؟", "beirut-m", 0.67)]
    clips = tts.synthesize(requests)
    assert engine.prompts == [(REF.path, REF.text)]
    assert [c["seed"] for c in engine.calls] == [seed_of(r) for r in requests]
    assert {c["language"] for c in engine.calls} == {"lb"}
    assert {(c["numStep"], c["guidance"]) for c in engine.calls} == {(32, 2.0)}
    assert all(c["voice_clone_prompt"] == ("prompt", REF.text) for c in engine.calls)
    # Normal speed is the model's own; slow asks for it.
    assert "speed" not in engine.calls[0] and engine.calls[1]["speed"] == 0.67
    assert [(c.sample_rate, len(c.pcm), c.words) for c in clips] == [(24000, 4800, None)] * 2


def test_version_and_settings_name_the_checkpoint_and_the_reference() -> None:
    tts = fake(FakeEngine(), voice(), REF)
    assert tts.version() == f"oddadmix/lahgtna-omnivoice-v2#{REVISION}+omnivoice-0.2.1"
    assert tts.settings() == {
        "language": "lb",
        "numStep": 32,
        "guidanceScale": 2.0,
        "dtype": "bfloat16",
        "reference": REF.sha256,
    }
    # The version names the clips' author, so it fits a provenance.
    Provenance.model_validate({"author": f"generated:omnivoice@{tts.version()}", "status": "draft"})


@pytest.fixture(scope="module")
def apc(core_cli: CoreCli) -> Any:
    diags, compiled = compile_course(ROOT / "courses" / "apc", core_cli)
    assert compiled is not None, [d.format() for d in diags.items]
    return compiled


def test_a_vowel_marks_voice_reads_the_marks_and_is_checked_against_the_letters(apc: Any) -> None:
    items = {i.item: i for i in plan(apc.units, voice(), apc.written)[0]}
    bathroom = items["s.home.15"]
    assert "الحَمّام" in bathroom.input
    assert FATHA not in bathroom.expected
    # A word card reads the lemma's marks too (ADR 0061: حمّام, not الحمّام).
    assert items["sense:7ammem"].input == "حَمّام"
    assert FATHA not in items["sense:7ammem"].expected
    # Without vowelMarks the voice reads the text as the source writes it.
    plain = {i.item: i for i in plan(apc.units, voice(vowelMarks=False), apc.written)[0]}
    assert FATHA not in plain["s.home.15"].input


@pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="needs ffmpeg")
def test_a_new_reference_makes_the_clips_cloned_from_the_old_one_stale(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, apc: Any, core_cli: CoreCli
) -> None:
    course = tmp_path / "apc"
    shutil.copytree(ROOT / "courses" / "apc", course, ignore=shutil.ignore_patterns("audio"))
    (tmp_path / "images").symlink_to(ROOT / "courses" / "images")
    engine = FakeEngine()
    monkeypatch.setitem(providers.PROVIDERS, "omnivoice", lambda v, r: fake(engine, v, r))
    v = voice()
    designer = fake(engine, v, REF)
    ref = cast_reference(course, v, "مَرْحَبا! أَنا سامي.", "male, young adult", 7, designer)
    adir = audio_dir(course)
    assert ref.sha256 == hashlib.sha256((adir / ref.file).read_bytes()).hexdigest()
    assert ref.design is not None and (ref.design.instruct, ref.design.seed) == (
        "male, young adult",
        7,
    )
    assert engine.calls[-1]["instruct"] == "male, young adult"
    assert reference_of(adir, read_index(adir), "beirut-m") is not None

    intro = [u for u in apc.units if u["id"] == "intro"]
    report = synthesize_course(course, intro, v, None, apc.written)
    index = read_index(adir)
    assert report.synthesized == len(index.clips) > 0
    assert index.references is not None and [r.id for r in index.references] == ["beirut-m"]
    assert all(c.license == "CC-BY-NC-4.0" for c in index.clips)
    diags, compiled = compile_course(course, core_cli)
    assert compiled is not None, [d.format() for d in diags.items if d.severity == "error"]
    assert not [d for d in diags.items if d.lint.startswith("audio.")]

    # Cast again with another seed: a different voice, so every clip is stale.
    cast_reference(course, v, "مَرْحَبا! أَنا سامي.", "male, young adult", 8, designer)
    diags, _ = compile_course(course, core_cli)
    stale = [d for d in diags.items if d.lint == "audio.stale"]
    assert len(stale) == len(index.clips)
    assert "earlier reference voice" in stale[0].message


LIVE = os.environ.get("NABU_OMNIVOICE") == "1"


@pytest.mark.skipif(not LIVE, reason="NABU_OMNIVOICE=1, the omnivoice group and the checkpoint")
def test_live_the_course_voice_speaks_lebanese() -> None:
    from nabu.audio.qa import cer, transcribe

    source = yaml.safe_load((ROOT / "courses" / "apc" / "course.yaml").read_text("utf-8"))
    v = AudioVoice.model_validate(source["audio"]["voices"][0])
    adir = audio_dir(ROOT / "courses" / "apc")
    tts = OmniVoiceProvider(v, reference_of(adir, read_index(adir), v.voice))
    [clip] = tts.synthesize([Request("أَنا مْنيح.", v.voice, 1.0)])
    assert 0.3 < len(clip.pcm) / 2 / clip.sample_rate < 5
    assert cer(transcribe(clip, "ar"), "أنا منيح") <= 0.15


def test_story_lines_are_read_too(apc: Any) -> None:
    """Each story line is an audio item "<story>#<step>", read like a sentence."""
    items = {i.item: i for i in plan(apc.units, voice(), apc.written)[0]}
    lines = [
        (story["id"], step)
        for unit in apc.units
        for story in unit.get("stories", [])
        for step, s in enumerate(story["steps"])
        if s.get("line")
    ]
    assert lines
    assert all(f"{story}#{step}" in items for story, step in lines)
    story, step = lines[0]
    line = items[f"{story}#{step}"]
    assert line.input and len(line.spans) >= 1


class Hushed(FakeEngine):
    """Says nothing for the first `silent` tries of every clip."""

    def __init__(self, silent: int) -> None:
        super().__init__()
        self.silent = silent
        self.tries: dict[str, int] = {}

    def speak(
        self,
        text: str,
        language: str,
        seed: int,
        num_step: int,
        guidance_scale: float,
        **extra: Any,
    ) -> Any:
        super().speak(text, language, seed, num_step, guidance_scale, **extra)
        self.tries[text] = self.tries.get(text, 0) + 1
        return [] if self.tries[text] <= self.silent else [0.0] * 2400


def test_a_clip_the_model_says_nothing_for_is_tried_again_with_the_next_seeds() -> None:
    engine = Hushed(silent=2)
    request = Request("لَأ", "beirut-m", 1.0)
    [clip] = fake(engine, voice(), REF).synthesize([request])
    assert len(clip.pcm) == 4800
    assert [c["seed"] for c in engine.calls] == [seed_of(request) + k for k in range(3)]
    # Never anything: after its tries the clip is empty, and generation leaves it out.
    [nothing] = fake(Hushed(silent=99), voice(), REF).synthesize([request])
    assert nothing.pcm == b""


@pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="needs ffmpeg")
def test_an_item_the_voice_says_nothing_for_gets_no_clip(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, apc: Any
) -> None:
    course = tmp_path / "apc"
    shutil.copytree(ROOT / "courses" / "apc", course, ignore=shutil.ignore_patterns("audio"))
    engine = FakeEngine()
    v = voice()
    cast_reference(course, v, "مَرْحَبا!", "male", 7, fake(engine, v, REF))
    hushed = Hushed(silent=99)
    monkeypatch.setitem(providers.PROVIDERS, "omnivoice", lambda vv, r: fake(hushed, vv, r))
    intro: list[dict[str, Any]] = [{**u, "stories": []} for u in apc.units if u["id"] == "intro"]
    report = synthesize_course(course, intro, v, None, apc.written)
    assert report.synthesized == 0 and report.silent
    assert read_index(audio_dir(course)).clips == []


@pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="needs ffmpeg")
def test_a_rejected_clip_is_made_again_as_its_next_take(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, apc: Any
) -> None:
    """ADR 0060: a clip a listener judged wrong is sampled again with another seed; the others
    stay as they are."""
    from nabu.audio.course import apply_verdicts
    from nabu.schema.models import AudioVerdicts

    course = tmp_path / "apc"
    shutil.copytree(ROOT / "courses" / "apc", course, ignore=shutil.ignore_patterns("audio"))
    engine = FakeEngine()
    monkeypatch.setitem(providers.PROVIDERS, "omnivoice", lambda v, r: fake(engine, v, r))
    v = voice()
    cast_reference(course, v, "مَرْحَبا!", "male", 7, fake(engine, v, REF))
    intro: list[dict[str, Any]] = [{**u, "stories": []} for u in apc.units if u["id"] == "intro"]
    synthesize_course(course, intro, v, None, apc.written)
    adir = audio_dir(course)
    first = read_index(adir).clips
    target = first[0].item
    heard = [c.sha256 for c in first if c.item == target]
    verdicts = AudioVerdicts.model_validate(
        {
            "course": "apc",
            "verdicts": [
                {"item": target, "clips": heard, "verdict": "wrong", "at": "2026-11-05T18:00:00Z"}
            ],
        }
    )
    apply_verdicts(course, verdicts, "human:ben")

    engine.calls.clear()
    report = synthesize_course(course, intro, v, None, apc.written)
    assert report.synthesized == 1 and report.kept == len(first) - 1
    clips = {(c.item, c.speed): c for c in read_index(adir).clips}
    for speed, rate in (("normal", 1.0),):
        clip = clips[(target, speed)]
        assert clip.synthesis is not None and clip.synthesis.take == 1
        assert clip.rejected is None
        assert seed_of(Request(clip.synthesis.input, "beirut-m", rate, 1)) in {
            c["seed"] for c in engine.calls
        }
    # A first take keeps its seed; the new take keeps its place on the next run.
    assert seed_of(Request("x", "v", 1.0)) == seed_of(Request("x", "v", 1.0, 0))
    assert synthesize_course(course, intro, v, None, apc.written).synthesized == 0
