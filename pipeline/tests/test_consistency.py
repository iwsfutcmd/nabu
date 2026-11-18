"""Readings fixed by their words (ADR 0135): a form pinned once fills its other tokens."""

from __future__ import annotations

import copy
from pathlib import Path
from typing import Any

import yaml

from nabu import yamlio
from nabu.compiler import compile_course

from .conftest import FIXTURES, CoreCli

GRC = "grc-Grek/polytonic"


def _grc_course() -> dict[str, Any]:
    """The Greek lint fixture's course (one lesson sentence, ναί), read right."""
    course = yaml.safe_load((FIXTURES / "lints" / "reading.spelling.yaml").read_text("utf-8"))
    sentence = course["units"][0]["sentences"][0]
    sentence["forms"][GRC]["tokens"][0]["readings"] = {"attic": "ναί"}
    return course


def _compile(core_cli: CoreCli, tmp_path: Path, course: dict[str, Any]) -> Any:
    path = tmp_path / "course.yaml"
    path.write_text(yamlio.dump(course), encoding="utf-8")
    diags, compiled = compile_course(path, core_cli)
    assert compiled is not None, [d.format() for d in diags.items]
    return diags, compiled


def test_a_form_pinned_once_fills_its_other_tokens(core_cli: CoreCli, tmp_path: Path) -> None:
    course = _grc_course()
    sentences = course["units"][0]["sentences"]
    again = copy.deepcopy(sentences[0])
    again["id"] = "s.2"
    del again["forms"][GRC]["tokens"][0]["readings"]
    sentences.append(again)
    diags, compiled = _compile(core_cli, tmp_path, course)
    filled = compiled.units[0].sentences[1].forms[GRC].text.tokens[0]
    assert filled.readings == {"attic": "ναί"}
    assert not [d for d in diags.items if d.lint.startswith("reading.")]


def test_a_form_read_two_ways_is_never_filled(core_cli: CoreCli, tmp_path: Path) -> None:
    """Where the pinned tokens disagree, a token pinning none is left as it is (and the two are
    reported)."""
    course = _grc_course()
    sentences = course["units"][0]["sentences"]
    other, bare = copy.deepcopy(sentences[0]), copy.deepcopy(sentences[0])
    other["id"], bare["id"] = "s.2", "s.3"
    other["forms"][GRC]["tokens"][0]["readings"] = {"attic": "ναί"}
    other["forms"][GRC]["tokens"][0]["readingVariant"] = True
    del bare["forms"][GRC]["tokens"][0]["readings"]
    sentences.extend([other, bare])
    _, compiled = _compile(core_cli, tmp_path, course)
    # A free variant takes no part: the one pinned reading still fills the bare token.
    assert compiled.units[0].sentences[2].forms[GRC].text.tokens[0].readings == {"attic": "ναί"}
