"""The audio check's verdicts (ADR 0060): a listener's right and wrong, applied to the index.

A clip judged right is reviewed and ships even when the round trip failed it; one judged wrong is
rejected and its item stays out of the bundle; a verdict on a clip made again since is skipped.
"""

from __future__ import annotations

import json
import shutil
from pathlib import Path
from typing import Any

import pytest

from nabu.audio.course import apply_verdicts, audio_dir, read_index
from nabu.compiler import compile_course
from nabu.compiler.audio import ShippedClip, confirmed_by_person
from nabu.schema.models import AudioClip, AudioVerdicts

from .conftest import ROOT, CoreCli

AT = "2026-11-05T13:45:00.000Z"


@pytest.fixture
def fa(tmp_path: Path) -> Path:
    course = tmp_path / "fa"
    shutil.copytree(ROOT / "courses" / "fa", course)
    (tmp_path / "images").symlink_to(ROOT / "courses" / "images")
    return course


def verdicts(*items: dict[str, Any]) -> AudioVerdicts:
    """As the web app downloads them."""
    return AudioVerdicts.model_validate_json(json.dumps({"course": "fa", "verdicts": list(items)}))


def clips_of(course: Path, item: str) -> list[str]:
    return [c.sha256 for c in read_index(audio_dir(course)).clips if c.item == item]


def held(course: Path, core_cli: CoreCli) -> set[str]:
    _, compiled = compile_course(course, core_cli)
    assert compiled is not None
    return {item for item in read_items(course)} - set(compiled.audio_items)


def read_items(course: Path) -> set[str]:
    return {c.item for c in read_index(audio_dir(course)).clips}


def test_right_releases_a_failed_clip_and_wrong_holds_a_passing_one_back(
    fa: Path, core_cli: CoreCli
) -> None:
    index = read_index(audio_dir(fa))
    failed = next(c.item for c in index.clips if c.qa is not None and c.qa.status == "fail")
    passed = next(c.item for c in index.clips if c.qa is not None and c.qa.status == "pass")
    before = held(fa, core_cli)
    assert failed in before and passed not in before

    result = apply_verdicts(
        fa,
        verdicts(
            {"item": failed, "clips": clips_of(fa, failed), "verdict": "right", "at": AT},
            {
                "item": passed,
                "clips": clips_of(fa, passed),
                "verdict": "wrong",
                "note": "the stress falls on the wrong syllable",
                "at": AT,
            },
        ),
        "human:ben",
    )
    assert (result.right, result.wrong, result.skipped) == (1, 1, [])

    clips = {(c.item, c.speed): c for c in read_index(audio_dir(fa)).clips}
    for speed in sorted({s for i, s in clips if i == failed}):
        right, wrong = clips[(failed, speed)], clips[(passed, speed)]
        assert right.provenance.status == "reviewed"
        assert (right.provenance.reviewedBy, right.provenance.reviewedAt) == (
            "human:ben",
            "2026-11-05",
        )
        assert wrong.rejected is not None and wrong.rejected.by == "human:ben"
        assert wrong.rejected.note == "the stress falls on the wrong syllable"
    after = held(fa, core_cli)
    assert failed not in after and passed in after
    assert after == (before - {failed}) | {passed}

    # Changing one's mind: right again lifts the rejection.
    apply_verdicts(
        fa,
        verdicts({"item": passed, "clips": clips_of(fa, passed), "verdict": "right", "at": AT}),
        "human:ben",
    )
    assert all(c.rejected is None for c in read_index(audio_dir(fa)).clips if c.item == passed)


def test_a_verdict_on_a_clip_made_again_since_is_skipped(fa: Path) -> None:
    item = read_index(audio_dir(fa)).clips[0].item
    before = read_index(audio_dir(fa))
    result = apply_verdicts(
        fa, verdicts({"item": item, "clips": ["0" * 64], "verdict": "wrong", "at": AT}), "human:ben"
    )
    assert (result.wrong, result.skipped) == (0, [item])
    assert read_index(audio_dir(fa)) == before


def test_the_reviewer_is_a_human_id(fa: Path) -> None:
    with pytest.raises(ValueError, match="human:<id>"):
        apply_verdicts(fa, verdicts(), "ben")


def test_a_clip_a_listener_marked_right_is_confirmed_in_the_bundle(
    fa: Path, core_cli: CoreCli
) -> None:
    """ADR 0125: a synthetic clip is confirmed once a listener marks it right; the bundle says so
    only then, so a course with no confirmed clip builds the bundle it built before."""
    index = read_index(audio_dir(fa))
    item = next(
        c.item
        for c in index.clips
        if c.speed == "normal" and c.qa is not None and c.qa.status == "pass"
        if c.provenance.status == "draft"
    )

    def shipped() -> ShippedClip:
        _, compiled = compile_course(fa, core_cli)
        assert compiled is not None
        return compiled.audio_items[item]["normal"]

    def bundled(clip: ShippedClip) -> dict[str, Any]:
        return clip.bundled("0" * 8).model_dump(mode="json", exclude_none=True)

    before = shipped()
    assert not before.confirmed and "confirmed" not in bundled(before)
    apply_verdicts(
        fa,
        verdicts({"item": item, "clips": clips_of(fa, item), "verdict": "right", "at": AT}),
        "human:ben",
    )
    after = shipped()
    assert after.confirmed and bundled(after)["confirmed"] is True
    assert {k: v for k, v in bundled(after).items() if k != "confirmed"} == bundled(before)


def test_a_recording_is_confirmed_and_a_synthetic_clip_only_once_a_person_signed_it_off() -> None:
    def clip(synthetic: bool, **provenance: str) -> AudioClip:
        return AudioClip.model_validate(
            {
                "item": "s.1",
                "speed": "normal",
                "file": f"clips/{'a' * 16}.mp3",
                "sha256": "a" * 64,
                "durationMs": 420,
                "license": "CC0-1.0",
                "provenance": provenance,
                "synthetic": synthetic,
            }
        )

    generated = "generated:piper@voice"
    assert confirmed_by_person(clip(False, author="human:speaker", status="draft"))
    assert not confirmed_by_person(clip(True, author=generated, status="draft"))
    reviewed = {"author": generated, "status": "reviewed", "reviewedAt": "2026-11-05"}
    assert confirmed_by_person(clip(True, **reviewed, reviewedBy="human:ben"))
    assert confirmed_by_person(
        clip(True, **(reviewed | {"status": "published"}), reviewedBy="human:ben")
    )
    # Signed off by no one, or by a model: not a person's word on what it says.
    assert not confirmed_by_person(clip(True, **reviewed))
    assert not confirmed_by_person(clip(True, **reviewed, reviewedBy="llm:judge"))


def test_the_web_apps_file_validates() -> None:
    """The shape AudioCheck.tsx downloads (a note only on some verdicts)."""
    right: dict[str, Any] = {"item": "s.1", "clips": ["a" * 64, "b" * 64], "verdict": "right"}
    wrong: dict[str, Any] = {"item": "story.x#3", "clips": ["c" * 64], "verdict": "wrong"}
    data = {"course": "uz", "verdicts": [right | {"at": AT}, wrong | {"at": AT, "note": "x"}]}
    assert len(AudioVerdicts.model_validate(data).verdicts) == 2
    with pytest.raises(ValueError):
        AudioVerdicts.model_validate(
            {"course": "uz", "verdicts": [right | {"at": AT, "clips": []}]}
        )
