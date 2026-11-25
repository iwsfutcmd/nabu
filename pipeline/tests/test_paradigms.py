"""The bundle's paradigms (docs/rules-design.md, stage 4): the lexicon's cells and each lexeme's
forms, as @nabu/core realises and spells them; the regularised form where a listed form blocks the
rules (ADR 0145), on a fixture (apc's own lexicon lists none the course could show)."""

from __future__ import annotations

import copy
import dataclasses
from pathlib import Path
from typing import Any

import yaml

from nabu import yamlio
from nabu.analyzers import analyzers_by_tool
from nabu.compiler import compile_course, load_profiles
from nabu.forms import Site
from nabu.lexicon import load_language
from nabu.paradigms import Refused, cell_key, cells_of, in_script

from .conftest import FIXTURES, ROOT, CoreCli

PROFILES = load_profiles()
ANALYZERS = analyzers_by_tool()
ORTH = "apc-Latn/arabizi"
PAST_1SG = {"Aspect": "Perf", "Number": "Sing", "Person": "1"}
#: The fixture pinning shereb's past 1sg as the rules give it (make_lint_fixtures `_apc_redundant`).
BASE: dict[str, Any] = yaml.safe_load(
    (FIXTURES / "lints" / "form.redundant.yaml").read_text(encoding="utf-8")
)


def _compile(cli: CoreCli, tmp_path: Path, course: dict[str, Any]) -> Any:
    path = tmp_path / "course.yaml"
    path.write_text(yamlio.dump(course), encoding="utf-8")
    diags, compiled = compile_course(path, cli, PROFILES, ANALYZERS, audio=False)
    assert compiled is not None, [d.format() for d in diags.items]
    return compiled


def _shereb(course: dict[str, Any]) -> dict[str, Any]:
    return next(lx for lx in course["own"]["lexicon"]["lexemes"] if lx["id"] == "lexeme:shereb")


def _lexeme(compiled: Any, ident: str) -> Any:
    return next(lx for lx in compiled.lexicon.lexemes if str(lx.id) == ident)


def test_cells_and_forms(core_cli: CoreCli, tmp_path: Path) -> None:
    compiled = _compile(core_cli, tmp_path, copy.deepcopy(BASE))
    lexicon = compiled.lexicon.model_dump(mode="json", by_alias=True, exclude_none=True)
    assert lexicon["cells"] == {"VERB": [cell_key(PAST_1SG)]}
    shereb = _lexeme(compiled, "lexeme:shereb")
    # A pinned form that pins spellings only is passed over: the rules give the cell.
    assert shereb.model_dump(mode="json")["paradigm"] == {ORTH: ["shrebt"]}
    assert shereb.regularised is None
    # A noun: no rule names a cell of it, so it has none.
    assert _lexeme(compiled, "lexeme:bet").paradigm is None
    assert "principalParts" not in lexicon


def test_listed_stem_and_its_regularised_form(core_cli: CoreCli, tmp_path: Path) -> None:
    """A listed stem gives the cell (blocking); with blocking off the rules give the regular form,
    which the bundle ships as `regularised` (ADR 0145, design section 6)."""
    course = copy.deepcopy(BASE)
    shereb = _shereb(course)
    shereb["forms"] = [
        {
            "feats": {"Aspect": "Perf"},
            "stem": "شْرُب",
            "status": "listed",
            "statement": {"author": "human:fixture", "status": "draft"},
        }
    ]
    course["units"][0]["sentences"][-1]["forms"][ORTH]["text"] = "shrobt"
    course["units"][0]["sentences"][-1]["forms"][ORTH]["tokens"][0]["surface"] = "shrobt"
    course["units"][0]["sentences"][-1]["forms"][ORTH]["reverse"] = "shrobt"
    compiled = _compile(core_cli, tmp_path, course)
    lexeme = _lexeme(compiled, "lexeme:shereb").model_dump(mode="json", exclude_none=True)
    assert lexeme["paradigm"] == {ORTH: ["shrobt"]}
    assert lexeme["regularised"] == {ORTH: {cell_key(PAST_1SG): "shrebt"}}


def test_principal_parts(core_cli: CoreCli, tmp_path: Path) -> None:
    """The language's principal parts are listed among the cells, whatever the tokens choose."""
    course = copy.deepcopy(BASE)
    present = {"Aspect": "Perf", "Number": "Sing", "Person": "3"}
    course["own"]["language"]["principalParts"] = {"VERB": [present]}
    course["own"]["language"]["features"]["Person"] = ["1", "3"]
    compiled = _compile(core_cli, tmp_path, course)
    lexicon = compiled.lexicon.model_dump(mode="json", by_alias=True, exclude_none=True)
    assert lexicon["cells"] == {"VERB": [cell_key(PAST_1SG), cell_key(present)]}
    assert lexicon["principalParts"] == {"VERB": [cell_key(present)]}
    assert _lexeme(compiled, "lexeme:shereb").model_dump(mode="json")["paradigm"] == {
        ORTH: ["shrebt", "shereb"]
    }


def test_a_language_without_rules_has_no_paradigms(core_cli: CoreCli, tmp_path: Path) -> None:
    compiled = _compile(
        core_cli, tmp_path, yaml.safe_load((FIXTURES / "clean.yaml").read_text(encoding="utf-8"))
    )
    lexicon = compiled.lexicon.model_dump(mode="json", by_alias=True, exclude_none=True)
    assert "cells" not in lexicon
    assert all("paradigm" not in lx for lx in lexicon["lexemes"])


def test_a_spelling_outside_the_script_is_not_shipped(core_cli: CoreCli, tmp_path: Path) -> None:
    """A form whose Arabizi spelling keeps an Arabic letter (no `spell` rule for it) is null in
    the paradigm and reported (`form.spelling-script`), never shipped."""
    course = yaml.safe_load(
        (FIXTURES / "lints" / "form.spelling-script.yaml").read_text(encoding="utf-8")
    )
    path = tmp_path / "course.yaml"
    path.write_text(yamlio.dump(course), encoding="utf-8")
    diags, compiled = compile_course(path, core_cli, PROFILES, ANALYZERS, audio=False)
    assert compiled is not None, [d.format() for d in diags.items]
    hits = [d for d in diags.items if d.lint == "form.spelling-script"]
    assert hits and all("lexeme:shreq" in d.message for d in hits)
    shreq = _lexeme(compiled, "lexeme:shreq").model_dump(mode="json", exclude_none=True)
    assert ORTH not in shreq.get("paradigm", {})
    assert _lexeme(compiled, "lexeme:shereb").model_dump(mode="json")["paradigm"] == {
        ORTH: ["shrebt"]
    }


def test_a_spelling_that_begins_with_a_carrier_is_not_shipped() -> None:
    """A joining carrier (the tatweel) is the notation's, never a word's first letter: a form
    spelled with one first is refused even though the letter is in the script (wesel's command)."""
    refused: list[Refused] = []
    tatweel = chr(0x640)
    ok = in_script(
        [tatweel + "وصل", tatweel + "وْصَل"],
        "apc-Arab/standard",
        "lexeme:wesel",
        "Mood=Imp",
        "paradigm",
        lambda _o, _t, _m: [],
        refused,
    )
    assert not ok and refused[0].outside == [tatweel]
    assert in_script(
        ["وصل", "وِصِل"],
        "apc-Arab/standard",
        "lexeme:wesel",
        "",
        "paradigm",
        lambda _o, _t, _m: [],
        refused,
    )


def test_an_unmarked_value_is_taught() -> None:
    """A cell is listed only where each of its values is taught. A language's `unmarked` values (es
    Mood Ind), used from the start and never introduced as a part, count as taught: without them
    a course that introduces only the marked moods (Sub, Imp) lists no indicative cell."""
    apc, _ = load_language(ROOT / "lexicons", "apc")
    assert apc is not None
    present = {"Aspect": "Imp", "Mood": "Ind", "Person": "1", "Number": "Sing"}
    site = Site(
        "s.1", ORTH, "f.yaml", 1, "bishrab", None, [{"lexeme": "lexeme:shereb", "feats": present}]
    )
    taught = {"Aspect=Imp", "Mood=Sub", "Person=1", "Number=Sing"}
    pos_of = {"lexeme:shereb": "VERB"}
    assert cells_of(apc, [site], taught, pos_of).get("VERB", []) == []
    marked = dataclasses.replace(
        apc, declared=apc.declared.model_copy(update={"unmarked": {"Mood": ["Ind"]}})
    )
    # The indicative 1sg, and apc's principal part (the he-present), indicative too.
    assert present in cells_of(marked, [site], taught, pos_of)["VERB"]
