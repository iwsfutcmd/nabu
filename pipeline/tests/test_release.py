"""Release builds (ADR 0073): only what a reviewer signed off, with the nodes, units and clips that
still have content; the full build is unchanged."""

from __future__ import annotations

import json
import shutil
from dataclasses import replace
from pathlib import Path
from typing import Any, cast

import pytest
import yaml
from typer.testing import CliRunner

from nabu import yamlio
from nabu.cli import app
from nabu.compiler import compile_course, load_profiles
from nabu.compiler.release import release
from nabu.corecli import CoreCli
from nabu.review import shown_of
from nabu.schema.models import BundleScenario, BundleUnit, Provenance

from .test_courses import build

ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture
def course(tmp_path: Path) -> Path:
    out = tmp_path / "courses" / "apc"
    shutil.copytree(ROOT / "courses" / "apc", out)
    shutil.copytree(ROOT / "courses" / "images", tmp_path / "courses" / "images")
    return out


def _build(
    course: Path, out: Path, *flags: str
) -> tuple[int, str, dict[str, Any], list[dict[str, Any]]]:
    result = CliRunner().invoke(app, ["build", str(course), "--out", str(out), *flags])
    bundle = out / course.name
    manifest_file = bundle / "manifest.json"
    if not manifest_file.exists():
        return result.exit_code, result.output, {}, []
    manifest = cast(dict[str, Any], json.loads(manifest_file.read_text(encoding="utf-8")))
    units = [
        cast(dict[str, Any], json.loads((bundle / f["path"]).read_text(encoding="utf-8")))
        for f in manifest["files"]
        if f["role"] == "unit"
    ]
    return result.exit_code, result.output, manifest, units


def test_a_release_holds_only_what_was_signed_off(course: Path, tmp_path: Path) -> None:
    code, output, _m, _u = _build(course, tmp_path / "none", "--release")
    assert code == 1 and "nothing reviewed yet" in output

    with CoreCli() as cli:
        _diags, compiled = compile_course(course, cli, load_profiles(), {})
    assert compiled is not None
    shown = shown_of(compiled.units)
    first = compiled.units[0]
    story = (first.stories or [])[0]
    signoffs = {
        "course": "apc",
        "signoffs": [
            {
                "item": "s.1",
                "kind": "sentence",
                "shown": shown[("sentence", "s.1")],
                "at": "2026-11-06T10:00:00Z",
            },
            {
                "item": "s.2",
                "kind": "sentence",
                "shown": shown[("sentence", "s.2")],
                "at": "2026-11-06T10:00:00Z",
            },
            {
                "item": story.id,
                "kind": "story",
                "shown": shown[("story", story.id)],
                "at": "2026-11-06T10:00:00Z",
            },
        ],
    }
    file = tmp_path / "signoffs.json"
    file.write_text(json.dumps(signoffs), encoding="utf-8")
    result = CliRunner().invoke(
        app, ["review", "apply", str(course), str(file), "--reviewer", "human:ben"]
    )
    assert result.exit_code == 0, result.output

    code, output, manifest, units = _build(course, tmp_path / "release", "--release")
    assert code == 0, output
    assert manifest["release"] is True
    assert [u["id"] for u in units] == [first.id]
    [unit] = units
    assert [s["id"] for s in unit["sentences"]] == ["s.1", "s.2"]
    assert [s["id"] for s in unit["stories"]] == [story.id]
    lessons = [n for n in unit["nodes"] if n["kind"] == "lesson"]
    assert [n["sentences"] for n in lessons] == [["s.1", "s.2"]]
    assert [n["id"] for n in unit["nodes"] if n["kind"] == "story"] == [story.node]
    assert unit.get("scenarios", []) == []
    # Only the clips of what is kept travel with it.
    index = next((f for f in manifest["files"] if f["role"] == "audio-index"), None)
    assert index is not None
    items = json.loads((tmp_path / "release" / "apc" / index["path"]).read_text(encoding="utf-8"))[
        "items"
    ]
    kcs = {k["id"] for k in unit["kcs"]}
    lines = {f"{story.id}#{i}" for i, _ in enumerate(story.steps)}
    assert set(items) <= {"s.1", "s.2"} | kcs | lines
    clips = {f["path"] for f in manifest["files"] if f["role"] == "audio"}
    assert clips == {c["path"] for item in items.values() for c in item.values()}
    images = {f["path"] for f in manifest["files"] if f["role"] == "image"}
    assert images == {k["image"] for k in unit["kcs"] if k.get("image")}
    # The summary counts what ships: the two sentences, each clip, each image.
    shipped = 2 + sum(len(item) for item in items.values()) + len(images)
    assert sum(manifest["licenses"].values()) == shipped
    statuses = {k: v for k, v in manifest["provenance"].items() if k.startswith("status.")}
    assert sum(statuses.values()) == shipped and statuses["status.reviewed"] >= 2

    # The full build still has everything, and says nothing of a release.
    code, output, full, full_units = _build(course, tmp_path / "full")
    assert code == 0, output
    assert "release" not in full
    assert len(full_units) == len(compiled.units)
    # Signing off two sentences moved two counts from draft to reviewed, and nothing else.
    committed = json.loads(
        (ROOT / "apps" / "web" / "public" / "bundles" / "apc" / "manifest.json").read_text(
            encoding="utf-8"
        )
    )
    before = cast(dict[str, int], committed["provenance"])
    assert full["licenses"] == committed["licenses"]
    assert full["provenance"] == {
        **before,
        "status.draft": before["status.draft"] - 2,
        "status.reviewed": before.get("status.reviewed", 0) + 2,
    }


def test_a_scenario_stays_while_the_node_it_follows_does(course: Path) -> None:
    with CoreCli() as cli:
        _diags, compiled = compile_course(course, cli, load_profiles(), {})
    assert compiled is not None
    first, second, *rest = compiled.units
    reviewed = Provenance(author="human:ben", status="reviewed")
    draft = Provenance(author="llm:x@y", status="draft")

    def signed(unit: BundleUnit, **more: object) -> BundleUnit:
        """The unit with its first sentence reviewed."""
        s = unit.sentences[0].model_copy(update={"provenance": reviewed})
        return unit.model_copy(update={"sentences": [s, *unit.sentences[1:]], **more})

    def scenario(id_: str, after: str, provenance: Provenance) -> BundleScenario:
        texts: dict[str, object] = {"title": {}, "setting": {}, "character": {}, "goal": {}}
        return BundleScenario.model_validate(
            {"id": id_, "after": after, **texts, "provenance": provenance, "license": "CC0-1.0"}
        )

    story = (first.stories or [])[0].model_copy(update={"provenance": reviewed})
    kept_lesson = second.sentences[0].node
    gone = next(n.id for n in first.nodes if n.kind == "lesson" and n.id != first.sentences[0].node)
    scenarios = [
        scenario("sc.story", story.node, reviewed),
        scenario("sc.lesson", kept_lesson, reviewed),
        scenario("sc.draft", kept_lesson, draft),
        scenario("sc.gone", gone, reviewed),
    ]
    units = [
        signed(first, stories=[story, *(first.stories or [])[1:]]),
        signed(second, scenarios=scenarios),
        *rest,
    ]
    out, report = release(replace(compiled, units=units))
    # A story node of another unit counts; a draft, or a node that went, does not.
    assert {s.id for u in out.units for s in u.scenarios or []} == {"sc.story", "sc.lesson"}
    assert report.dropped["scenarios"] >= 2
    # What it was given is left as it was.
    assert len(units[1].scenarios or []) == 4


def _review_every_third(course: Path) -> None:
    """Signs off every third sentence of each unit file, keeping each sentence's author."""
    source = yaml.safe_load((course / "course.yaml").read_text(encoding="utf-8"))
    author = source["provenance"]["author"]
    for ref in source["units"]:
        path = course / ref
        unit = yaml.safe_load(path.read_text(encoding="utf-8"))
        for i, s in enumerate(unit.get("sentences") or []):
            if i % 3 == 0:
                own = cast(dict[str, Any], s.get("provenance") or {})
                s["provenance"] = {
                    "author": own.get("author", author),
                    "status": "reviewed",
                    "reviewedBy": "human:ben",
                    "reviewedAt": "2026-11-13",
                }
        path.write_text(yamlio.dump(unit), encoding="utf-8")


def _alphabets(units: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    """Each alphabet node's `alphabet` (letters and words), by node id, in course order."""
    return {n["id"]: n["alphabet"] for u in units for n in u["nodes"] if "alphabet" in n}


def test_a_release_keeps_the_script_track_and_the_words_reviewed_content_uses(
    tmp_path: Path,
) -> None:
    """D51: grc's release keeps every alphabet node with its letters, and of its words those
    whose KCs the release keeps and reviewed sentences or stories use (every third sentence)."""
    course = tmp_path / "courses" / "grc"
    shutil.copytree(ROOT / "courses" / "grc", course)
    shutil.copytree(ROOT / "courses" / "images", tmp_path / "courses" / "images")
    code, output, _m, full = _build(course, tmp_path / "full")
    assert code == 0, output
    _review_every_third(course)
    code, output, _m, units = _build(course, tmp_path / "release", "--release")
    assert code == 0, output
    tracks, kept = _alphabets(full), _alphabets(units)
    assert list(kept) == list(tracks) and len(kept) == 8
    defined = {k["id"] for u in units for k in u["kcs"]}
    used = {kc for u in units for x in [*u["sentences"], *u.get("stories", [])] for kc in x["kcs"]}
    for node, alphabet in tracks.items():
        assert kept[node]["letters"] == alphabet["letters"], node
        words = [w for w in alphabet["words"] if w["kc"] in defined and w["kc"] in used]
        assert kept[node]["words"] == words, node
    left_out = sum(len(a["words"]) for a in tracks.values())
    left_out -= sum(len(a["words"]) for a in kept.values())
    assert 0 < left_out < sum(len(a["words"]) for a in tracks.values())
    assert f"left out {left_out} alphabet words" in output


def test_a_script_track_alone_makes_no_release_and_may_teach_letters_alone(
    core_cli: CoreCli,
) -> None:
    """With nothing reviewed there is no release, script track or not ("nothing reviewed yet").
    Where reviewed content uses none of a node's words, the node still teaches its letters."""
    _, compiled = build(core_cli, "grc")
    out, _report = release(compiled)
    assert out.units == []
    first = next(u for u in compiled.units if u.sentences)
    signed = first.sentences[0].model_copy(
        update={"provenance": Provenance(author="human:ben", status="reviewed")}
    )
    one = first.model_copy(update={"sentences": [signed, *first.sentences[1:]]})
    out, _report = release(
        replace(compiled, units=[one if u is first else u for u in compiled.units])
    )
    nodes = [n.alphabet for u in out.units for n in u.nodes if n.alphabet is not None]
    assert len(nodes) == 8 and all(a.letters for a in nodes)
    assert any(a.words == [] for a in nodes)
