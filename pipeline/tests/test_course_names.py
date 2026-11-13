"""Course and orthography names are course data (ADR 0109): the UI catalogs carry none. A course
names itself in its support language; its names in other languages are translations, each saying
who wrote it (the draft UI catalogs' translations moved here as an LLM's drafts)."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

import pytest
import yaml

from nabu import yamlio
from nabu.compiler import compile_course

from .conftest import FIXTURES, ROOT, CoreCli

COURSES = sorted(p.parent.name for p in (ROOT / "courses").glob("*/course.yaml"))
CATALOGS = sorted((ROOT / "packages/i18n/messages").glob("*.json"))
NAMES = re.compile(r"^(course\.name|orthography|reading\.scheme)\.|^player\.tone\.(?!label$)")


def source_of(course: str) -> dict[str, Any]:
    return yaml.safe_load((ROOT / "courses" / course / "course.yaml").read_text(encoding="utf-8"))


@pytest.mark.parametrize("course", COURSES)
def test_every_course_names_itself_in_english(course: str) -> None:
    source = source_of(course)
    english = source["names"]["en"]
    assert english["course"] and english["blurb"]
    assert sorted(english.get("orthographies", {})) == sorted(source["orthographies"])


@pytest.mark.parametrize("course", COURSES)
def test_a_translation_names_every_orthography_and_says_who_wrote_it(course: str) -> None:
    source = source_of(course)
    support = {orthography.split("-")[0] for orthography in source["support"]}
    for tag, names in source["names"].items():
        if tag.split("-")[0] in support:
            continue
        assert names["course"], tag
        assert sorted(names.get("orthographies", {})) == sorted(source["orthographies"]), tag
        assert names.get("provenance", {}).get("author"), f"names.{tag} needs a provenance"


@pytest.mark.parametrize("catalog", CATALOGS, ids=[p.stem for p in CATALOGS])
def test_no_ui_catalog_names_a_course_a_script_or_a_reading(catalog: Path) -> None:
    messages = json.loads(catalog.read_text(encoding="utf-8"))["messages"]
    assert [key for key in messages if NAMES.match(key)] == []


def test_a_name_may_hold_what_its_own_language_writes_invisibly(
    core_cli: CoreCli, tmp_path: Path
) -> None:
    """text.invisible reads a name as text in its own language: a Persian name keeps its ZWNJ in a
    course in Latin letters, an English name may not hold one."""
    zwnj = "\u200c"
    source = yaml.safe_load((FIXTURES / "clean.yaml").read_text(encoding="utf-8"))
    draft = {"author": "llm:test@fixture", "status": "draft"}
    source["names"]["fa"] = {"course": f"ازبکی{zwnj}ها", "provenance": draft}
    path = tmp_path / "course.yaml"
    path.write_text(yamlio.dump(source), encoding="utf-8")
    diags, compiled = compile_course(path, core_cli, analyzers={})
    assert [d.format() for d in diags.items] == []
    assert compiled is not None
    source["names"]["en"]["course"] = f"Uz{zwnj}bek"
    path.write_text(yamlio.dump(source), encoding="utf-8")
    diags, compiled = compile_course(path, core_cli, analyzers={})
    assert [d.lint for d in diags.items] == ["text.invisible"]
