"""Release builds (ADR 0073): only what a reviewer signed off, with the nodes, units and clips that
still have content; the full build is unchanged."""

from __future__ import annotations

import copy
import json
import shutil
from dataclasses import replace
from pathlib import Path
from typing import Any, cast

import pytest
from typer.testing import CliRunner

from nabu.cli import app
from nabu.compiler import compile_course, load_profiles
from nabu.compiler.release import release
from nabu.corecli import CoreCli
from nabu.review import shown_of

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
    manifest_file = out / "apc" / "manifest.json"
    if not manifest_file.exists():
        return result.exit_code, result.output, {}, []
    manifest = cast(dict[str, Any], json.loads(manifest_file.read_text(encoding="utf-8")))
    units = [
        cast(dict[str, Any], json.loads((out / "apc" / f["path"]).read_text(encoding="utf-8")))
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
    story = cast(list[dict[str, Any]], first["stories"])[0]
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
                "item": story["id"],
                "kind": "story",
                "shown": shown[("story", story["id"])],
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
    assert [u["id"] for u in units] == [first["id"]]
    [unit] = units
    assert [s["id"] for s in unit["sentences"]] == ["s.1", "s.2"]
    assert [s["id"] for s in unit["stories"]] == [story["id"]]
    lessons = [n for n in unit["nodes"] if n["kind"] == "lesson"]
    assert [n["sentences"] for n in lessons] == [["s.1", "s.2"]]
    assert [n["id"] for n in unit["nodes"] if n["kind"] == "story"] == [story["node"]]
    assert unit.get("scenarios", []) == []
    # Only the clips of what is kept travel with it.
    index = next((f for f in manifest["files"] if f["role"] == "audio-index"), None)
    assert index is not None
    items = json.loads((tmp_path / "release" / "apc" / index["path"]).read_text(encoding="utf-8"))[
        "items"
    ]
    kcs = {k["id"] for k in unit["kcs"]}
    lines = {f"{story['id']}#{i}" for i, _ in enumerate(story["steps"])}
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
    units = copy.deepcopy(compiled.units)
    first, second = units[0], units[1]
    reviewed = {"author": "human:ben", "status": "reviewed"}
    first["sentences"][0]["provenance"] = reviewed
    second["sentences"][0]["provenance"] = reviewed
    story = cast(dict[str, Any], first["stories"][0])
    story["provenance"] = reviewed
    kept_lesson = str(second["sentences"][0]["node"])
    gone = next(
        n["id"]
        for n in first["nodes"]
        if n["kind"] == "lesson" and n["id"] != first["sentences"][0]["node"]
    )
    draft = {"author": "llm:x@y", "status": "draft"}
    second["scenarios"] = [
        {"id": "sc.story", "after": story["node"], "provenance": reviewed},
        {"id": "sc.lesson", "after": kept_lesson, "provenance": reviewed},
        {"id": "sc.draft", "after": kept_lesson, "provenance": draft},
        {"id": "sc.gone", "after": gone, "provenance": reviewed},
    ]
    out, report = release(replace(compiled, units=units))
    # A story node of another unit counts; a draft, or a node that went, does not.
    assert {s["id"] for u in out.units for s in u.get("scenarios", [])} == {"sc.story", "sc.lesson"}
    assert report.dropped["scenarios"] >= 2
    # What it was given is left as it was.
    assert len(units[1]["scenarios"]) == 4
