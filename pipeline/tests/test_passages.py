"""Words met in passages (ADR 0144): a story node introduces the words its passage is the first
to use, most used first; a drill node after it lists those it drills; names are glossed only."""

from __future__ import annotations

import copy
from pathlib import Path
from typing import Any

from nabu import yamlio
from nabu.compiler import compile_course
from nabu.compiler.passages import DRILL_SUFFIX
from nabu.items import unit_json

from .conftest import CoreCli
from .fixtures.make_lint_fixtures import CLEAN, with_story


def _word(id_: str, en: str, form: str, **extra: Any) -> dict[str, Any]:
    return {
        "id": f"sense:{id_}",
        "gloss": {"en": en},
        "forms": {"uz-Latn/standard": [form]},
    } | extra


def _line(words: list[tuple[str, str]], text: str, en: str) -> dict[str, Any]:
    return {
        "line": {
            "forms": {
                "uz-Latn/standard": {
                    "text": text,
                    "tokens": [{"surface": surface, "sense": sense} for surface, sense in words],
                }
            },
            "translations": {"en": en},
        }
    }


def _course() -> dict[str, Any]:
    """The clean course, its story reading words no lesson teaches (kitob twice) and a name."""
    course = copy.deepcopy(CLEAN)
    with_story(course)
    unit = course["units"][0]
    unit["kcs"] += [
        _word("kitob", "book", "kitob"),
        _word("non", "bread", "non"),
        _word("toshkent", "Tashkent", "Toshkent", pos="PROPN"),
        _word("uy", "house", "uy", pos="PROPN", drill=True),
    ]
    steps = unit["stories"][0]["steps"]
    steps.insert(1, _line([("Non", "non"), ("kitob", "kitob")], "Non, kitob.", "Bread, a book."))
    steps.insert(
        2,
        _line(
            [("Kitob", "kitob"), ("Toshkent", "toshkent")], "Kitob, Toshkent.", "A book, Tashkent."
        ),
    )
    steps.insert(3, _line([("Uy", "uy")], "Uy.", "A house."))
    return course


def _compile(core_cli: CoreCli, tmp_path: Path, course: dict[str, Any]) -> tuple[list[str], Any]:
    path = tmp_path / "course.yaml"
    path.write_text(yamlio.dump(course), encoding="utf-8")
    diags, compiled = compile_course(path, core_cli)
    return [d.format() for d in diags.items], compiled


def test_a_passage_introduces_its_new_words_most_used_first(
    core_cli: CoreCli, tmp_path: Path
) -> None:
    diags, compiled = _compile(core_cli, tmp_path, _course())
    assert compiled is not None, diags
    assert [d for d in diags if " error " in d] == []
    [unit] = [unit_json(u) for u in compiled.units]
    nodes = {n["id"]: n for n in unit["nodes"]}
    # kitob is on two lines, the rest on one: it comes first; then the order the passage uses them.
    assert nodes["basics.story"]["introduces"] == [
        "sense:kitob",
        "sense:non",
        "sense:toshkent",
        "sense:uy",
    ]
    # The drill node follows the story node and drills all but the name; a name marked drill: true
    # is drilled.
    ids = [n["id"] for n in unit["nodes"]]
    assert ids[ids.index("basics.story") + 1] == f"basics.story{DRILL_SUFFIX}"
    drill = nodes[f"basics.story{DRILL_SUFFIX}"]
    assert drill["kind"] == "drill"
    assert drill["drill"] == {
        "story": "basics.story",
        "words": ["sense:kitob", "sense:non", "sense:uy"],
    }
    assert drill["introduces"] == [] and drill["sentences"] == []
    kcs = {k["id"]: k for k in unit["kcs"]}
    assert kcs["sense:toshkent"]["drill"] is False
    assert "drill" not in kcs["sense:uy"] and "drill" not in kcs["sense:kitob"]
    # A line practises its words but the name.
    [story] = unit["stories"]
    lines = [s["line"] for s in story["steps"] if "line" in s]
    assert lines[2]["kcs"] == ["sense:kitob"]
    assert "sense:toshkent" not in story["kcs"]


def test_a_lesson_after_the_passage_may_use_its_words(core_cli: CoreCli, tmp_path: Path) -> None:
    course = _course()
    unit = course["units"][0]
    unit["nodes"].append({"id": "basics.2", "kind": "lesson", "introduces": []})
    unit["sentences"].append(
        {
            "id": "s.5",
            "node": "basics.2",
            "forms": {
                "uz-Latn/standard": {
                    "text": "Salom, kitob!",
                    "tokens": [
                        {"surface": "Salom", "sense": "salom"},
                        {"surface": "kitob", "sense": "kitob"},
                    ],
                    "reverse": "Salom, kitob",
                }
            },
            "translations": {"en": "Hello, book!"},
        }
    )
    diags, compiled = _compile(core_cli, tmp_path, course)
    assert compiled is not None, diags
    assert not any("curriculum." in d for d in diags), diags


def test_names_are_left_out_of_what_a_sentence_practises(core_cli: CoreCli, tmp_path: Path) -> None:
    course = copy.deepcopy(CLEAN)
    unit = course["units"][0]
    unit["kcs"].append(_word("aziz", "Aziz", "Aziz", pos="PROPN"))
    unit["nodes"][0]["introduces"].append("sense:aziz")
    unit["sentences"].append(
        {
            "id": "s.5",
            "node": "basics.1",
            "forms": {
                "uz-Latn/standard": {
                    "text": "Salom, Aziz!",
                    "tokens": [
                        {"surface": "Salom", "sense": "salom"},
                        {"surface": "Aziz", "sense": "aziz"},
                    ],
                    "reverse": "Salom, Aziz",
                }
            },
            "translations": {"en": "Hello, Aziz!"},
        }
    )
    diags, compiled = _compile(core_cli, tmp_path, course)
    assert compiled is not None, diags
    [bundled] = [unit_json(u) for u in compiled.units]
    s5 = next(s for s in bundled["sentences"] if s["id"] == "s.5")
    assert s5["kcs"] == ["sense:salom"]
    # Still glossed: the token keeps its sense.
    words = [t for t in s5["forms"]["uz-Latn/standard"]["text"]["tokens"] if t["kind"] == "word"]
    assert [t.get("sense") for t in words] == ["salom", "aziz"]
