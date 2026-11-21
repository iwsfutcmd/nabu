"""Every course's alias table (courses/<id>/aliases.yaml): what each KC id of the course became,
which `upgrade` reads to turn a log written before the lexical model into the new shape
(docs/migration-design.md, "Old events"). The converter that wrote the tables is gone; they are
kept by hand now. A table must fit its schema, and whatever it sends an old id to must be
something its course still has: a lexeme, rule or feature value that is renamed or removed takes
the table's right-hand sides with it, or an old log would be credited to nothing.
"""

from pathlib import Path
from typing import Any, cast

import pytest
import yaml

from nabu.lexicon import load_language
from nabu.paths import REPO
from nabu.schema.models import AliasTable

COURSES = sorted(p.parent.name for p in (REPO / "courses").glob("*/course.yaml"))


def _doc(path: Path) -> dict[str, Any]:
    return cast(dict[str, Any], yaml.safe_load(path.read_text(encoding="utf-8")))


def _targets(alias: dict[str, Any]) -> list[str]:
    by_item = cast(dict[str, list[str]], alias.get("byItem") or {})
    seeds = cast(list[str], alias.get("seeds") or [])
    return [
        *([str(alias["part"])] if "part" in alias else []),
        *(part for parts in by_item.values() for part in parts),
        *seeds,
    ]


def _lost(table: dict[str, Any], known: set[str]) -> list[str]:
    """Each old id sent to something `known` does not hold, as `old -> target`."""
    aliases = cast(dict[str, dict[str, Any]], table["aliases"])
    return sorted(
        {
            f"{old} -> {target}"
            for old, alias in aliases.items()
            for target in _targets(alias)
            if target not in known
        }
    )


def test_there_is_a_table_for_every_course() -> None:
    assert len(COURSES) == 10
    assert [c for c in COURSES if not (REPO / "courses" / c / "aliases.yaml").is_file()] == []


@pytest.mark.parametrize("course", COURSES)
def test_a_table_fits_its_schema_and_names_what_its_course_has(course: str) -> None:
    folder = REPO / "courses" / course
    table = _doc(folder / "aliases.yaml")
    AliasTable.model_validate(table)
    assert table["course"] == course
    code = str(_doc(folder / "course.yaml")["lexicon"])
    language, errors = load_language(REPO / "lexicons", code)
    assert language is not None and errors == []
    letters = {
        str(grapheme["id"])
        for unit in sorted((folder / "units").glob("*.yaml"))
        for grapheme in cast(list[dict[str, Any]], _doc(unit).get("graphemes") or [])
    }
    known = set(language.index) | set(language.rules()) | language.feature_values() | letters
    assert _lost(table, known) == []


def test_a_target_the_course_lacks_is_caught() -> None:
    table: dict[str, Any] = {
        "course": "x",
        "aliases": {
            "sense:a": {"part": "lexeme:a"},
            "form:past": {
                "byItem": {"s.1": ["feature:Tense=Past"]},
                "seeds": ["feature:Tense=Past"],
            },
            "construction:y": {"part": "rule:y"},
        },
    }
    assert _lost(table, {"lexeme:a", "feature:Tense=Past", "rule:y"}) == []
    assert _lost(table, {"lexeme:a", "rule:y"}) == ["form:past -> feature:Tense=Past"]
    assert _lost(table, {"feature:Tense=Past"}) == [
        "construction:y -> rule:y",
        "sense:a -> lexeme:a",
    ]
