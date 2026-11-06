"""`nabu review apply` (ADR 0072): sign-offs into the course source, only where the source still
compiles to what the reviewer saw. The fingerprint text is pinned here and in
packages/core/test/signoff.test.ts: both sides must build the same text."""

from __future__ import annotations

import glob
import json
import shutil
from pathlib import Path
from typing import Any, cast

import pytest
import yaml
from typer.testing import CliRunner

from nabu.cli import app
from nabu.compiler import compile_course, load_profiles
from nabu.corecli import CoreCli
from nabu.review import fingerprint, provenance_text, sentence_text, shown_of, story_text

ROOT = Path(__file__).resolve().parents[2]
BUNDLES = ROOT / "apps" / "web" / "public" / "bundles"

#: apc's s.1 as the app shows it (vowel-marked Arabic, Arabizi, English): pinned on both sides.
APC_S1 = (
    "sentence@Ts.1@N"
    "form@Tapc-Arab/standard@Tمَرْحَبا!@N"
    "form@Tapc-Latn/arabizi@Tmar7aba!@N"
    "translation@Ten@THello!"
)


def _bundle_units(course: str) -> list[dict[str, Any]]:
    return [
        json.loads(Path(f).read_text(encoding="utf-8"))
        for f in sorted(glob.glob(str(BUNDLES / course / "units" / "*.json")))
    ]


def test_the_fingerprint_text_is_pinned() -> None:
    [s1] = [s for u in _bundle_units("apc") for s in u["sentences"] if s["id"] == "s.1"]
    assert sentence_text(s1) == APC_S1.replace("@T", "\t").replace("@N", "\n")
    story = _bundle_units("apc")[0]["stories"][0]
    text = story_text(story)
    assert text.startswith(f"story\t{story['id']}\nline\t0\nform\t")
    assert "\nchoose" not in text


@pytest.fixture(scope="module")
def apc_compiled() -> list[dict[str, Any]]:
    with CoreCli() as cli:
        diags, compiled = compile_course(ROOT / "courses" / "apc", cli, load_profiles(), {})
    assert compiled is not None, [d.format() for d in diags.items]
    return compiled.units


def test_the_compile_and_the_bundles_fingerprint_alike(apc_compiled: list[dict[str, Any]]) -> None:
    # The app hashes the bundle; the CLI hashes its own compile: they must agree, item by item.
    assert shown_of(apc_compiled) == shown_of(_bundle_units("apc"))


def test_a_reviewed_provenance_is_one_flow_line() -> None:
    text = provenance_text("llm:claude@ec206a97f12b", "human:ben", "2026-11-06")
    assert text == (
        "{author: 'llm:claude@ec206a97f12b', status: reviewed, "
        "reviewedBy: 'human:ben', reviewedAt: '2026-11-06'}"
    )
    assert yaml.safe_load(f"p: {text}")["p"]["reviewedAt"] == "2026-11-06"


@pytest.fixture
def course(tmp_path: Path) -> Path:
    out = tmp_path / "courses" / "apc"
    shutil.copytree(ROOT / "courses" / "apc", out, ignore=shutil.ignore_patterns("audio"))
    shutil.copytree(ROOT / "courses" / "images", tmp_path / "courses" / "images")
    return out


def test_apply_signs_off_what_was_seen_and_skips_the_rest(
    course: Path, tmp_path: Path, apc_compiled: list[dict[str, Any]]
) -> None:
    shown = shown_of(apc_compiled)
    story = next(
        str(s["id"])
        for u in apc_compiled
        for s in cast(list[dict[str, Any]], u.get("stories") or [])
    )
    signoffs = {
        "course": "apc",
        "signoffs": [
            {
                "item": "s.1",
                "kind": "sentence",
                "shown": shown[("sentence", "s.1")],
                "at": "2026-11-06T23:30:00-05:00",
            },
            {
                "item": story,
                "kind": "story",
                "shown": shown[("story", story)],
                "at": "2026-11-06T10:00:00Z",
            },
            {
                "item": "s.2",
                "kind": "sentence",
                "shown": fingerprint("not what s.2 says"),
                "at": "2026-11-06T10:00:00Z",
            },
            {"item": "s.nope", "kind": "sentence", "shown": "0" * 64, "at": "2026-11-06T10:00:00Z"},
        ],
    }
    file = tmp_path / "signoffs.json"
    file.write_text(json.dumps(signoffs), encoding="utf-8")
    intro = course / "units" / "intro.yaml"
    before = intro.read_text(encoding="utf-8")

    result = CliRunner().invoke(
        app, ["review", "apply", str(course), str(file), "--reviewer", "human:ben"]
    )
    assert result.exit_code == 0, result.output
    assert "signed off 2, already reviewed 0, skipped 2" in result.output
    assert "s.2: changed since it was signed off" in result.output
    assert "s.nope: no sentence with this id" in result.output

    after = intro.read_text(encoding="utf-8")
    # s.1 had no provenance: it gets one (the course's author) after its id, at its keys' column.
    assert (
        "- id: s.1\n  provenance: {author: 'llm:claude@6914f241714e', status: reviewed, "
        "reviewedBy: 'human:ben', reviewedAt: '2026-11-07'}\n  node: apc.greetings" in after
    )
    # Everything else is as it was, line for line (only additions and the story's provenance).
    removed = [line for line in before.splitlines() if line not in after.splitlines()]
    assert all("provenance:" in line for line in removed), removed

    with CoreCli() as cli:
        diags, compiled = compile_course(course, cli, load_profiles(), {})
    assert compiled is not None and not diags.errors
    items: list[dict[str, Any]] = [
        x
        for u in compiled.units
        for key in ("sentences", "stories")
        for x in cast(list[dict[str, Any]], u.get(key) or [])
    ]
    status = {str(x["id"]): cast(dict[str, Any], x["provenance"]) for x in items}
    assert status["s.1"]["status"] == "reviewed" and status["s.1"]["reviewedBy"] == "human:ben"
    assert status[story]["status"] == "reviewed" and status[story]["reviewedAt"] == "2026-11-06"
    assert status["s.2"]["status"] == "draft"

    # Again: nothing more to do.
    result = CliRunner().invoke(
        app, ["review", "apply", str(course), str(file), "--reviewer", "human:ben"]
    )
    assert "signed off 0, already reviewed 2" in result.output


def test_apply_wants_a_person(course: Path, tmp_path: Path) -> None:
    file = tmp_path / "signoffs.json"
    file.write_text(json.dumps({"course": "apc", "signoffs": []}), encoding="utf-8")
    result = CliRunner().invoke(
        app, ["review", "apply", str(course), str(file), "--reviewer", "ben"]
    )
    assert result.exit_code == 2


def test_the_file_can_say_who_signed_off(course: Path, tmp_path: Path) -> None:
    file = tmp_path / "signoffs.json"
    file.write_text(
        json.dumps({"course": "apc", "reviewer": "human:mei", "signoffs": []}), encoding="utf-8"
    )
    ok = CliRunner().invoke(app, ["review", "apply", str(course), str(file)])
    assert ok.exit_code == 0, ok.output
    assert "apc (human:mei)" in ok.output
    # Two different people for the same sign-offs is a mistake, not a choice.
    clash = CliRunner().invoke(
        app, ["review", "apply", str(course), str(file), "--reviewer", "human:ben"]
    )
    assert clash.exit_code == 2
    nobody = tmp_path / "nobody.json"
    nobody.write_text(json.dumps({"course": "apc", "signoffs": []}), encoding="utf-8")
    assert CliRunner().invoke(app, ["review", "apply", str(course), str(nobody)]).exit_code == 2


def test_the_admin_export_applies_each_reviewers_file(
    course: Path, tmp_path: Path, apc_compiled: list[dict[str, Any]]
) -> None:
    shown = shown_of(apc_compiled)
    one = {"item": "s.1", "kind": "sentence", "shown": shown[("sentence", "s.1")]}
    two = {"item": "s.2", "kind": "sentence", "shown": shown[("sentence", "s.2")]}
    export: dict[str, list[dict[str, Any]]] = {
        "files": [
            {
                "course": "apc",
                "reviewer": "human:mei",
                "signoffs": [{**one, "at": "2026-11-06T10:00:00Z"}],
            },
            {
                "course": "apc",
                "reviewer": "human:wing",
                "signoffs": [{**two, "at": "2026-11-05T10:00:00Z"}],
            },
            {"course": "fa", "reviewer": "human:mei", "signoffs": []},
        ]
    }
    file = tmp_path / "export.json"
    file.write_text(json.dumps(export), encoding="utf-8")
    result = CliRunner().invoke(app, ["review", "apply", str(course), str(file)])
    assert result.exit_code == 0, result.output
    assert "apc (human:mei): signed off 1" in result.output
    assert "apc (human:wing): signed off 1" in result.output
    intro = (course / "units" / "intro.yaml").read_text(encoding="utf-8")
    assert "reviewedBy: 'human:mei', reviewedAt: '2026-11-06'" in intro
    assert "reviewedBy: 'human:wing', reviewedAt: '2026-11-05'" in intro
