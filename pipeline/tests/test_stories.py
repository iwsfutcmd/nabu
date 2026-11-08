"""Stories (gameplan Phase 6): compile, package, and gloss with the runtime matcher.

Acceptance:
- the fixture stories compile with zero lint errors;
- a vocalized apc-Arab story glosses correctly against unvocalized glossary keys.
"""

from __future__ import annotations

import copy
from pathlib import Path
from typing import Any

import pytest
import yaml

from nabu import yamlio
from nabu.compiler import compile_course

from .conftest import ROOT, CoreCli
from .fixtures.make_lint_fixtures import CLEAN, with_story

COURSES = ("fa", "yue", "uz", "apc", "lzh", "hbo", "tok")
# Harakat (fathatan … sukun) and the superscript alef.
HARAKAT = {chr(c) for c in range(0x064B, 0x0653)} | {chr(0x0670)}


@pytest.fixture(scope="module")
def courses(core_cli: CoreCli) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for course in COURSES:
        diags, compiled = compile_course(ROOT / "courses" / course, core_cli)
        assert compiled is not None, [d.format() for d in diags.items]
        assert [d for d in diags.items if d.severity == "error"] == []
        out[course] = compiled
    return out


def test_a_clean_story_compiles_without_diagnostics(core_cli: CoreCli, tmp_path: Path) -> None:
    course = copy.deepcopy(CLEAN)
    with_story(course)
    path = tmp_path / "story.yaml"
    path.write_text(yamlio.dump(course), encoding="utf-8")
    diags, compiled = compile_course(path, core_cli)
    assert compiled is not None
    assert [d.format() for d in diags.items] == []
    [story] = compiled.units[0]["stories"]
    assert story["node"] == "basics.story" and story["kcs"] == [
        "sense:salom",
        "sense:men",
        "sense:talaba",
    ]
    line = story["steps"][1]["line"]
    assert line["ask"] == "complete" and line["gap"] == "sense:talaba"
    assert line["forms"]["uz-Latn/standard"]["tokens"][0] == {
        "surface": "Men",
        "sense": "men",
        "kind": "word",
        "tileGroup": 0,
    }
    assert story["steps"][2]["choose"]["answer"] == 0
    assert story["characters"][0]["name"]["uz-Latn/standard"]["tokens"][0]["surface"] == "Aziz"


def test_every_fixture_course_has_stories_in_every_orthography(courses: dict[str, Any]) -> None:
    """Every unit's story sits on a story node, asks questions, and has every line in every
    orthography; across the course, both kinds of line question are used."""
    for course, compiled in courses.items():
        stories = [s for u in compiled.units for s in u.get("stories", [])]
        assert len(stories) >= 1, course
        nodes = {n["id"]: n["kind"] for u in compiled.units for n in u["nodes"]}
        asks: set[str] = set()
        for story in stories:
            assert nodes[story["node"]] == "story", story["id"]
            lines = [s["line"] for s in story["steps"] if "line" in s]
            questions = [s for s in story["steps"] if "choose" in s or s.get("line", {}).get("ask")]
            assert len(lines) >= 5 and len(questions) >= 2, story["id"]
            asks |= {line["ask"] for line in lines if line.get("ask")}
            for line in lines:
                assert set(line["forms"]) == set(compiled.orthographies), story["id"]
                assert set(line["translations"]) == {"en"}, story["id"]
        assert {"complete", "arrange"} <= asks, course


def test_the_vocalized_apc_story_glosses_against_unvocalized_keys(
    core_cli: CoreCli, courses: dict[str, Any]
) -> None:
    compiled = courses["apc"]
    orth = "apc-Arab/standard"
    home = ROOT / "courses" / "apc"
    course = yaml.safe_load((home / "course.yaml").read_text(encoding="utf-8"))
    units = [yaml.safe_load((home / u).read_text(encoding="utf-8")) for u in course["units"]]
    # The whole course's glossary, as the app has it.
    entries = [
        {"kc": kc["id"], "text": form}
        for unit in units
        for kc in unit["kcs"]
        for form in kc.get("forms", {}).get(orth, [])
    ]
    # The glossary keys carry no vowel marks (a shadda at most, as in بدّي).
    assert entries and all(not (set(e["text"]) & (HARAKAT - {chr(0x0651)})) for e in entries)
    [story] = [
        s for u in compiled.units for s in u.get("stories", []) if s["id"] == "apc.story.cafe"
    ]
    vocalized = 0
    for step in story["steps"]:
        if "line" not in step:
            continue
        tokens = step["line"]["forms"][orth]["tokens"]
        matches = core_cli.result("gloss", profile=orth, entries=entries, tokens=tokens)
        for i, t in enumerate(tokens):
            if t["kind"] != "word":
                continue
            vocalized += bool(set(t["surface"]) & HARAKAT)
            covering = [m for m in matches if m["tokenStart"] <= i < m["tokenEnd"]]
            assert [m["kc"] for m in covering] == [f"sense:{t['sense']}"], (t["surface"], matches)
    assert vocalized >= 8  # most of the story's words carry harakat


def test_story_lines_keep_glossary_entries_alive(core_cli: CoreCli, tmp_path: Path) -> None:
    """An entry only a story uses is not dead."""
    course = copy.deepcopy(CLEAN)
    with_story(course)
    course["units"][0]["kcs"].append(
        {"id": "sense:aziz", "gloss": {"en": "Aziz"}, "forms": {"uz-Latn/standard": ["Aziz"]}}
    )
    course["units"][0]["nodes"][0]["introduces"].append("sense:aziz")
    line = course["units"][0]["stories"][0]["steps"][0]["line"]
    line["forms"]["uz-Latn/standard"] = {
        "text": "Salom, Aziz!",
        "tokens": [{"surface": "Salom", "sense": "salom"}, {"surface": "Aziz", "sense": "aziz"}],
    }
    path = tmp_path / "story-entry.yaml"
    path.write_text(yamlio.dump(course), encoding="utf-8")
    diags, _ = compile_course(path, core_cli)
    lints = [d.lint for d in diags.items]
    assert "glossary.dead-entry" not in lints
    assert "curriculum.unused-kc" in lints  # no sentence uses it; the story alone does
