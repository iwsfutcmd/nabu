"""Stories (gameplan Phase 6): compile, package, and gloss with the runtime matcher.

Acceptance:
- the fixture stories compile with zero lint errors;
- a vocalized apc-Arab story glosses correctly against unvocalized glossary keys.
"""

from __future__ import annotations

import copy
from collections.abc import Callable
from pathlib import Path
from typing import Any

import pytest
import yaml

from nabu import yamlio
from nabu.compiler import compile_course
from nabu.items import unit_json

from .conftest import ROOT, CoreCli
from .fixtures.make_lint_fixtures import (
    CLEAN,
    ES,
    ES_ORTH,
    TALABAMAN,
    add_lexeme,
    entry,
    es_noun,
    es_sentence,
    language,
    with_copula,
    with_story,
)

COURSES = ("fa", "yue", "uz", "apc", "lzh", "hbo", "tok")
# Harakat (fathatan … sukun) and the superscript alef.
HARAKAT = {chr(c) for c in range(0x064B, 0x0653)} | {chr(0x0670)}
UZ = "uz-Latn/standard"


@pytest.fixture(scope="module")
def courses(core_cli: CoreCli) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for course in COURSES:
        diags, compiled = compile_course(ROOT / "courses" / course, core_cli)
        assert compiled is not None, [d.format() for d in diags.items]
        assert [d for d in diags.items if d.severity == "error"] == []
        out[course] = compiled
    return out


def _compile(core_cli: CoreCli, tmp_path: Path, course: dict[str, Any]) -> tuple[Any, Any]:
    path = tmp_path / "story.yaml"
    path.write_text(yamlio.dump(course), encoding="utf-8")
    return compile_course(path, core_cli)


def _compile_story(
    core_cli: CoreCli, tmp_path: Path, edit: Callable[[dict[str, Any]], None]
) -> tuple[Any, Any]:
    course = copy.deepcopy(CLEAN)
    with_story(course)
    edit(course)
    return _compile(core_cli, tmp_path, course)


def _question(compiled: Any) -> dict[str, Any]:
    """The clean story's `complete` line, as the bundle has it."""
    return unit_json(compiled.units[0])["stories"][0]["steps"][1]["line"]


def _shown(line: dict[str, Any], orth: str = UZ) -> list[str]:
    return [o[orth]["tokens"][0]["surface"] for o in line["options"]]


def test_a_clean_story_compiles_without_diagnostics(core_cli: CoreCli, tmp_path: Path) -> None:
    course = copy.deepcopy(CLEAN)
    with_story(course)
    diags, compiled = _compile(core_cli, tmp_path, course)
    assert compiled is not None
    assert [d.format() for d in diags.items] == []
    [story] = unit_json(compiled.units[0])["stories"]
    assert story["node"] == "basics.story" and story["parts"] == [
        "lexeme:salom",
        "lexeme:men",
        "lexeme:talaba",
    ]
    line = story["steps"][1]["line"]
    assert line["ask"] == "complete" and line["gap"] == "lexeme:talaba"
    assert line["forms"][UZ]["tokens"][0] == {
        "surface": "Men",
        "kind": "lexical",
        "tileGroup": 0,
        "lexemes": [{"lexeme": "lexeme:men"}],
    }
    assert story["steps"][2]["choose"]["answer"] == 0
    assert story["characters"][0]["name"][UZ]["tokens"][0]["surface"] == "Aziz"


def test_a_lexeme_question_shows_each_distractor_in_the_gaps_form(
    core_cli: CoreCli, tmp_path: Path
) -> None:
    """ADR 0132: the distractor is a word the course writes, in the gap's form (bare talabaman
    here, so bare kitob), taken from a sentence of the unit: its lexemes come with it. The
    distractors themselves are not shipped: the options are resolved."""

    def unchanged(_: dict[str, Any]) -> None:
        return None

    diags, compiled = _compile_story(core_cli, tmp_path, unchanged)
    assert compiled is not None, [d.format() for d in diags.items]
    line = _question(compiled)
    assert line["asks"] == "lexeme"
    assert "distractors" not in line
    [option] = line["options"]
    assert option[UZ]["tokens"] == [
        {"surface": "kitob", "kind": "lexical", "lexemes": [{"lexeme": "lexeme:kitob"}]}
    ]


def _forms_of_talaba(c: dict[str, Any]) -> None:
    """talaba bare (s.3), with the copula -man (s.4) and plural (a new s.6); the story asks the
    -man form."""
    with_copula(c)
    language(c)["features"]["Number"] = ["Plur", "Sing"]
    # Once talabaman is written as two lexemes, its entry is spelled as its lemma alone
    # (lexeme.inflected-form).
    entry(c, "lexeme:talaba")["spelled"] = {UZ: ["talaba"]}
    unit = c["units"][0]
    s4 = next(s for s in unit["sentences"] if s["id"] == "s.4")
    s4["forms"][UZ]["tokens"][1] = {"surface": "talabaman", "lexemes": copy.deepcopy(TALABAMAN)}
    unit["sentences"].append(
        {
            "id": "s.6",
            "node": "basics.1",
            "forms": {
                UZ: {
                    "text": "Salom, talabalar!",
                    "tokens": [
                        {"surface": "Salom", "lexeme": "salom"},
                        {"surface": "talabalar", "lexeme": "talaba", "feats": {"Number": "Plur"}},
                    ],
                    "reverse": "Salom, talabalar",
                }
            },
            "translations": {"en": "Hello, students!"},
        }
    )
    line = unit["stories"][0]["steps"][1]["line"]
    line["asks"] = "form"
    del line["distractors"]
    line["forms"][UZ]["tokens"][1] = {"surface": "talabaman", "lexemes": copy.deepcopy(TALABAMAN)}


def test_a_form_question_offers_the_gaps_lexeme_in_other_attested_forms(
    core_cli: CoreCli, tmp_path: Path
) -> None:
    """ADR 0132: asks form, distractors left out: the compiler takes two other forms of the gap's
    lexeme that the course writes, never the gap's own form again."""
    diags, compiled = _compile_story(core_cli, tmp_path, _forms_of_talaba)
    assert compiled is not None, [d.format() for d in diags.items]
    assert [d.format() for d in diags.items if d.lint.startswith("story.")] == []
    line = _question(compiled)
    assert line["asks"] == "form" and "distractors" not in line
    assert sorted(_shown(line)) == ["talaba", "talabalar"]


def test_a_form_question_needs_two_other_forms(core_cli: CoreCli, tmp_path: Path) -> None:
    def one_other(c: dict[str, Any]) -> None:
        _forms_of_talaba(c)
        c["units"][0]["sentences"].pop()

    diags, compiled = _compile_story(core_cli, tmp_path, one_other)
    assert compiled is None, "story.distractor-form is an error"
    assert [d.lint for d in diags.items if d.lint.startswith("story.")] == ["story.distractor-form"]


def test_a_form_question_takes_a_distractor_given_as_feature_values(
    core_cli: CoreCli, tmp_path: Path
) -> None:
    """asks form, a distractor named by its feature values: the gap's lexeme in the attested form
    that has them (talabalar for Number=Plur)."""

    def plural(c: dict[str, Any]) -> None:
        _forms_of_talaba(c)
        c["units"][0]["stories"][0]["steps"][1]["line"]["distractors"] = [{"Number": "Plur"}]

    diags, compiled = _compile_story(core_cli, tmp_path, plural)
    assert compiled is not None, [d.format() for d in diags.items]
    assert _shown(_question(compiled)) == ["talabalar"]


def test_a_form_question_takes_a_distractor_given_as_a_lexeme_written_with_the_gaps(
    core_cli: CoreCli, tmp_path: Path
) -> None:
    """asks form, a distractor named as a lexeme: the gap's lexeme in an attested form written
    with it (talabaman, the noun with the copula on it), the gap here the plural."""

    def with_the_copula(c: dict[str, Any]) -> None:
        _forms_of_talaba(c)
        line = c["units"][0]["stories"][0]["steps"][1]["line"]
        line["forms"][UZ] = {
            "text": "Salom, talabalar!",
            "tokens": [
                {"surface": "Salom", "lexeme": "salom"},
                {"surface": "talabalar", "lexeme": "talaba", "feats": {"Number": "Plur"}},
            ],
        }
        line["translations"] = {"en": "Hello, students!"}
        line["distractors"] = ["lexeme:cop-1sg"]

    diags, compiled = _compile_story(core_cli, tmp_path, with_the_copula)
    assert compiled is not None, [d.format() for d in diags.items]
    assert _shown(_question(compiled)) == ["talabaman"]


def test_a_lexeme_question_refuses_a_distractor_given_as_feature_values(
    core_cli: CoreCli, tmp_path: Path
) -> None:
    """Feature values are another form of the gap's own lexeme: no answer to "which lexeme"."""

    def values(c: dict[str, Any]) -> None:
        c["units"][0]["stories"][0]["steps"][1]["line"]["distractors"] = [{"Number": "Plur"}]

    diags, compiled = _compile_story(core_cli, tmp_path, values)
    assert compiled is None
    [issue] = [d for d in diags.items if d.lint.startswith("story.")]
    assert issue.lint == "story.distractor-form" and "asks which lexeme" in issue.message


# ---- Spanish: a noun's gender of itself stands in the form a question asks about


def _es_story(
    gap: list[dict[str, Any]], text: str, asks: str = "lexeme", distractors: list[Any] | None = None
) -> dict[str, Any]:
    """The ES course with a story after its lessons, whose one line asks its noun."""
    c = copy.deepcopy(ES)
    unit = c["units"][0]
    unit["nodes"].append({"id": "basics.story", "kind": "story"})
    noun = next(t for t in gap if t.get("n") == 2)
    line: dict[str, Any] = {
        "ask": "complete",
        "gap": f"lexeme:{noun['lexeme']}",
        "asks": asks,
        "forms": {ES_ORTH: {"text": text, "tokens": gap}},
        "translations": {"en": text},
    }
    if distractors is not None:
        line["distractors"] = distractors
    unit["stories"] = [
        {
            "id": "basics.story",
            "node": "basics.story",
            "title": {"en": "At home"},
            "steps": [
                {"line": line},
                {
                    "choose": {
                        "prompt": {"en": "Where are we?"},
                        "options": [{"en": "at home"}, {"en": "at school"}],
                        "answer": 0,
                    }
                },
            ],
        }
    ]
    return c


def _es_question(compiled: Any) -> dict[str, Any]:
    return unit_json(compiled.units[0])["stories"][0]["steps"][0]["line"]


@pytest.mark.parametrize(
    ("distractor", "shown"), [("lexeme:hermano", "hermana"), ("lexeme:mano", "mano")]
)
def test_a_lexeme_question_counts_a_nouns_own_gender_with_a_chosen_one(
    core_cli: CoreCli, tmp_path: Path, distractor: str, shown: str
) -> None:
    """The gap casa is feminine of itself (by its default); hermana chooses it on its token and
    mano stores it. Each stands in the gap's form, feminine singular, however it is feminine."""
    course = _es_story(es_noun("La", "Fem", "casa", "casa"), "La casa.", distractors=[distractor])
    diags, compiled = _compile(core_cli, tmp_path, course)
    assert compiled is not None, [d.format() for d in diags.items]
    assert [d.format() for d in diags.items] == []
    assert _shown(_es_question(compiled), ES_ORTH) == [shown]


def test_a_lexeme_question_refuses_a_noun_of_another_gender(
    core_cli: CoreCli, tmp_path: Path
) -> None:
    """libro is masculine of itself: no token of it is in the feminine gap's form."""
    course = _es_story(
        es_noun("La", "Fem", "casa", "casa"), "La casa.", distractors=["lexeme:libro"]
    )
    diags, compiled = _compile(core_cli, tmp_path, course)
    assert compiled is None
    [issue] = [d for d in diags.items if d.lint.startswith("story.")]
    assert issue.lint == "story.distractor-form"
    assert "lexeme:libro" in issue.message and "Gender=Fem Number=Sing" in issue.message


def test_a_form_question_passes_over_an_option_that_reads_like_another(
    core_cli: CoreCli, tmp_path: Path
) -> None:
    """Two forms of hermano that are written alike (one token names its gender, one does not)
    are two forms, but they read alike: the question offers one of them and a third form."""
    course = _es_story(
        es_noun("La", "Fem", "hermana", "hermano", Gender="Fem"), "La hermana.", asks="form"
    )
    unit = course["units"][0]
    unit["nodes"][1]["introduces"].append("feature:Number=Plur")
    unit["sentences"] += [
        es_sentence(
            "s.5",
            "basics.2",
            "El hermano.",
            es_noun("El", "Masc", "hermano", "hermano", Gender="Masc"),
            "The brother.",
        ),
        es_sentence(
            "s.6",
            "basics.2",
            "Mi hermano.",
            [
                {"surface": "Mi", "lexeme": "el", "feats": {"Number": "Sing"}},
                {"surface": "hermano", "lexeme": "hermano", "feats": {"Number": "Sing"}},
            ],
            "My brother.",
        ),
        es_sentence(
            "s.7",
            "basics.2",
            "Los hermanos.",
            [
                {"surface": "Los", "lexeme": "el", "feats": {"Gender": "Masc", "Number": "Plur"}},
                {
                    "surface": "hermanos",
                    "lexeme": "hermano",
                    "feats": {"Gender": "Masc", "Number": "Plur"},
                },
            ],
            "The brothers.",
        ),
    ]
    diags, compiled = _compile(core_cli, tmp_path, course)
    assert compiled is not None, [d.format() for d in diags.items]
    assert [d.format() for d in diags.items if d.lint.startswith("story.")] == []
    assert _shown(_es_question(compiled), ES_ORTH) == ["hermano", "hermanos"]


def test_every_fixture_course_has_stories_in_every_orthography(courses: dict[str, Any]) -> None:
    """Every unit's story sits on a story node, asks questions, and has every line in every
    orthography; across the course, both kinds of line question are used."""
    for course, compiled in courses.items():
        units = [unit_json(u) for u in compiled.units]
        stories = [s for u in units for s in u.get("stories", [])]
        assert len(stories) >= 1, course
        nodes = {n["id"]: n["kind"] for u in units for n in u["nodes"]}
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
    lexicon = yaml.safe_load((ROOT / "lexicons" / "apc" / "lexemes.yaml").read_text("utf-8"))
    # The language's whole glossary, as its lexicon spells it.
    entries = [
        {"id": lexeme["id"], "text": spelling}
        for lexeme in lexicon["lexemes"]
        for spelling in lexeme.get("spelled", {}).get(orth, [])
    ]
    # The glossary keys carry no vowel marks (a shadda at most, as in بدّي).
    assert entries and all(not (set(e["text"]) & (HARAKAT - {chr(0x0651)})) for e in entries)
    [story] = [
        s
        for u in compiled.units
        for s in unit_json(u).get("stories", [])
        if s["id"] == "apc.story.cafe"
    ]
    vocalized = 0
    for step in story["steps"]:
        if "line" not in step:
            continue
        tokens = step["line"]["forms"][orth]["tokens"]
        matches = core_cli.result("gloss", profile=orth, entries=entries, tokens=tokens)
        for i, t in enumerate(tokens):
            # A token of several lexemes (كيفك: kif and its ending) is no entry's spelling: a
            # tap reaches it through its lexemes (glossAt), not the matcher.
            if t["kind"] != "lexical" or len(t["lexemes"]) != 1:
                continue
            vocalized += bool(set(t["surface"]) & HARAKAT)
            covering = [m for m in matches if m["tokenStart"] <= i < m["tokenEnd"]]
            assert [m["id"] for m in covering] == [t["lexemes"][0]["lexeme"]], (
                t["surface"],
                matches,
            )
    assert vocalized >= 6  # most of the story's words of one lexeme carry harakat


def test_story_lines_keep_glossary_entries_alive(core_cli: CoreCli, tmp_path: Path) -> None:
    """An entry only a story uses is not dead."""
    course = copy.deepcopy(CLEAN)
    with_story(course)
    add_lexeme(
        course,
        {
            "id": "lexeme:aziz",
            "pos": "PROPN",
            "gloss": {"en": "Aziz"},
            "spelled": {UZ: ["Aziz"]},
        },
    )
    course["units"][0]["nodes"][0]["introduces"].append("lexeme:aziz")
    line = course["units"][0]["stories"][0]["steps"][0]["line"]
    line["forms"][UZ] = {
        "text": "Salom, Aziz!",
        "tokens": [{"surface": "Salom", "lexeme": "salom"}, {"surface": "Aziz", "lexeme": "aziz"}],
    }
    diags, _ = _compile(core_cli, tmp_path, course)
    lints = [d.lint for d in diags.items]
    assert "glossary.dead-entry" not in lints
    assert "curriculum.unused" in lints  # no sentence uses it; the story alone does
