"""A sentence's persons (who speaks, who is spoken to) reach the bundle as authored."""

from __future__ import annotations

import copy
from pathlib import Path
from typing import Any

from nabu import yamlio
from nabu.compiler import compile_course

from .conftest import CoreCli
from .fixtures.make_lint_fixtures import FA


def _compile(core_cli: CoreCli, tmp_path: Path, course: dict[str, Any]) -> Any:
    path = tmp_path / "course.yaml"
    path.write_text(yamlio.dump(course), encoding="utf-8")
    return compile_course(path, core_cli)


def test_persons_reach_the_bundle(core_cli: CoreCli, tmp_path: Path) -> None:
    course = copy.deepcopy(FA)
    course["units"][0]["sentences"][0]["persons"] = {"addressee": "f", "speaker": "m"}
    diags, compiled = _compile(core_cli, tmp_path, course)
    assert [d.format() for d in diags.items] == []
    assert compiled.units[0]["sentences"][0]["persons"] == {"addressee": "f", "speaker": "m"}


def test_untagged_sentences_carry_none(core_cli: CoreCli, tmp_path: Path) -> None:
    _, compiled = _compile(core_cli, tmp_path, copy.deepcopy(FA))
    assert "persons" not in compiled.units[0]["sentences"][0]


def test_an_unknown_person_is_a_schema_error(core_cli: CoreCli, tmp_path: Path) -> None:
    course = copy.deepcopy(FA)
    course["units"][0]["sentences"][0]["persons"] = {"addressee": "dual"}
    diags, compiled = _compile(core_cli, tmp_path, course)
    assert compiled is None
    assert [d.lint for d in diags.items] == ["parse.schema"]
