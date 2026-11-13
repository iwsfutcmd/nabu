"""A sentence's persons (who speaks, who is spoken to) reach the bundle as authored."""

from __future__ import annotations

import copy
from pathlib import Path
from typing import Any

from nabu import yamlio
from nabu.compiler import compile_course
from nabu.items import unit_json

from .conftest import CoreCli
from .fixtures.make_lint_fixtures import FA


def _compile(core_cli: CoreCli, tmp_path: Path, course: dict[str, Any]) -> Any:
    path = tmp_path / "course.yaml"
    path.write_text(yamlio.dump(course), encoding="utf-8")
    return compile_course(path, core_cli)


def _besides_coverage(diags: Any) -> list[str]:
    """Diagnostics other than curriculum.one-gender: these one-sentence courses tag one gender."""
    return [d.format() for d in diags.items if d.lint != "curriculum.one-gender"]


def test_persons_reach_the_bundle(core_cli: CoreCli, tmp_path: Path) -> None:
    course = copy.deepcopy(FA)
    course["units"][0]["sentences"][0]["persons"] = {"addressee": "f", "speaker": "m"}
    diags, compiled = _compile(core_cli, tmp_path, course)
    assert _besides_coverage(diags) == []
    assert unit_json(compiled.units[0])["sentences"][0]["persons"] == {
        "addressee": "f",
        "speaker": "m",
    }


def test_every_number_of_addressees_is_a_person(core_cli: CoreCli, tmp_path: Path) -> None:
    """One person where only number is marked (Cantonese 你), two where there is a dual."""
    for addressee in ("sg", "du", "pl"):
        course = copy.deepcopy(FA)
        course["units"][0]["sentences"][0]["persons"] = {"addressee": addressee, "speaker": "f"}
        diags, compiled = _compile(core_cli, tmp_path, course)
        assert _besides_coverage(diags) == []
        persons = unit_json(compiled.units[0])["sentences"][0]["persons"]
        assert persons == {"addressee": addressee, "speaker": "f"}


def test_one_gender_alone_is_a_warning(core_cli: CoreCli, tmp_path: Path) -> None:
    """Tagging a man speaking (or spoken to) and never a woman warns, once per role; tagging the
    other gender too clears it (ADR 0075)."""
    course = copy.deepcopy(FA)
    first = course["units"][0]["sentences"][0]
    first["persons"] = {"speaker": "m", "addressee": "m"}
    diags, _ = _compile(core_cli, tmp_path, course)
    warned = [d for d in diags.items if d.lint == "curriculum.one-gender"]
    assert [d.severity for d in warned] == ["warning", "warning"]
    assert ["speaker" in warned[0].message, "addressee" in warned[1].message] == [True, True]

    second = copy.deepcopy(first)
    second["id"] = "s.2"
    second["persons"] = {"speaker": "f", "addressee": "pl"}
    course["units"][0]["sentences"].append(second)
    diags, _ = _compile(core_cli, tmp_path, course)
    warned = [d.message for d in diags.items if d.lint == "curriculum.one-gender"]
    assert len(warned) == 1 and "spoken to" in warned[0], warned  # plural is not a gender

    second["persons"] = {"speaker": "f", "addressee": "f"}
    diags, _ = _compile(core_cli, tmp_path, course)
    assert [d.format() for d in diags.items] == []


def test_untagged_sentences_carry_none(core_cli: CoreCli, tmp_path: Path) -> None:
    _, compiled = _compile(core_cli, tmp_path, copy.deepcopy(FA))
    assert "persons" not in unit_json(compiled.units[0])["sentences"][0]


def test_an_unknown_person_is_a_schema_error(core_cli: CoreCli, tmp_path: Path) -> None:
    course = copy.deepcopy(FA)
    course["units"][0]["sentences"][0]["persons"] = {"addressee": "dual"}
    diags, compiled = _compile(core_cli, tmp_path, course)
    assert compiled is None
    assert [d.lint for d in diags.items] == ["parse.schema"]
