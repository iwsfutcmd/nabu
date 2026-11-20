"""The converter to the lexical model (docs/migration-design.md, deliverable 2): every course
comes through with its checks passing and matches what is committed, and each thing the
converter does is pinned on a course small enough to read."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest
import yaml

from nabu import migrate
from nabu.migrate import checks, plan
from nabu.migrate.lexicon import _ends, offsets, runs  # pyright: ignore[reportPrivateUsage]
from nabu.migrate.report import SECTIONS
from nabu.migrate.source import fold

from .conftest import ROOT

Json = dict[str, Any]

COURSES = sorted(p.parent.name for p in (ROOT / "courses").glob("*/course.yaml"))
PROVENANCE = {"author": "llm:claude@migrate-test-v1", "status": "draft"}


@pytest.fixture(scope="module")
def converted() -> dict[str, migrate.Migration]:
    return {c: migrate.migrate(ROOT / "courses" / c) for c in COURSES}


# Every course of the repo


def test_there_are_ten_courses() -> None:
    assert len(COURSES) == 10


@pytest.mark.parametrize("course", COURSES)
def test_a_course_comes_through(course: str, converted: dict[str, migrate.Migration]) -> None:
    m = converted[course]
    assert m.errors == []
    # Every finding is of a kind the report explains: none goes unsaid.
    assert {f.kind for f in m.findings} <= {kind for kind, _, _ in SECTIONS}


@pytest.mark.parametrize("course", COURSES)
def test_what_is_committed_is_what_it_writes(
    course: str, converted: dict[str, migrate.Migration]
) -> None:
    assert migrate.stale(converted[course]) == [], "run `nabu migrate ../courses`"


def test_the_summary_is_what_it_writes(converted: dict[str, migrate.Migration]) -> None:
    assert not migrate.summary_stale([converted[c] for c in COURSES])


@pytest.mark.parametrize("course", COURSES)
def test_every_kc_has_an_alias(course: str, converted: dict[str, migrate.Migration]) -> None:
    m = converted[course]
    assert set(m.aliases["aliases"]) == set(m.course.kcs())


def test_the_clips_keyed_by_a_kc_are_all_spoken_for(
    converted: dict[str, migrate.Migration],
) -> None:
    """2,193 clips are keyed by a KC id (the design note): each is renamed with its item, or
    listed as the clip of a word that is no lexeme of its own now."""
    keyed = renamed = orphaned = 0
    for m in converted.values():
        audio = m.stats["audio"]
        keyed += audio.get("clips keyed by a KC", 0)
        renamed += audio.get("clips renamed with their item", 0)
        orphaned += audio.get("clips whose item is no lexeme of its own now", 0)
    assert keyed == 2193
    assert renamed + orphaned == keyed
    # No clip a person checked is left without a name.
    for m in converted.values():
        assert not [f for f in m.findings if f.kind == "clip-orphan" and "checked" in f.what]


# A course small enough to read


def _write(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(yaml.safe_dump(data, allow_unicode=True, sort_keys=False), encoding="utf-8")


def _sentence(sid: str, text: str, tokens: list[Json], node: str = "mini.one") -> Json:
    return {
        "id": sid,
        "node": node,
        "forms": {"es-Latn/standard": {"text": text, "tokens": tokens, "reverse": text}},
        "translations": {"en": f"({sid})"},
    }


def _spanish(tmp: Path, plan_changes: Json | None = None) -> tuple[Path, Path]:
    """A Spanish course of one unit, and its plan."""

    def sense(name: str, pos: str, *forms: str, **more: Any) -> Json:
        return {
            "id": f"sense:{name}",
            "pos": pos,
            "gloss": {"en": name},
            "forms": {"es-Latn/standard": list(forms)},
            **more,
        }

    def form(name: str) -> Json:
        return {"id": f"form:{name}", "gloss": {"en": name}, "notes": {"en": f"about {name}"}}

    unit: Json = {
        "id": "u1",
        "kcs": [
            sense("casa", "NOUN", "casa"),
            sense("mano", "NOUN", "mano"),
            sense("tío", "NOUN", "tío"),
            sense("el", "DET", "el"),
            sense("blanco", "ADJ", "blanco"),
            sense("tener", "VERB", "tener"),
            sense("llamar", "VERB", "llamar"),
            sense("nos", "PRON", "nos", features={"PronType": "Prs"}),
            sense("buenos-días", "INTJ", "buenos días"),
            form("fem"),
            form("fem-pl"),
            form("pres-1s"),
            form("impf"),
        ],
        "nodes": [
            {
                "id": "mini.one",
                "kind": "lesson",
                "introduces": ["sense:casa", "sense:el", "form:fem", "form:pres-1s", "form:impf"],
            },
            {"id": "mini.story", "kind": "story"},
        ],
        "sentences": [
            _sentence(
                "s.1",
                "La casa blanca.",
                [
                    {"surface": "La", "sense": "el", "form": "form:fem"},
                    {"surface": "casa", "sense": "casa", "form": "form:fem"},
                    {"surface": "blanca", "sense": "blanco", "form": "form:fem"},
                ],
            ),
            _sentence(
                "s.2",
                "La mano, la tía.",
                [
                    {"surface": "La", "sense": "el", "form": "form:fem"},
                    {"surface": "mano", "sense": "mano", "form": "form:fem"},
                    {"surface": "la", "sense": "el", "form": "form:fem"},
                    {"surface": "tía", "sense": "tío", "form": "form:fem"},
                ],
            ),
            _sentence(
                "s.3",
                "Tengo casas.",
                [
                    {"surface": "Tengo", "sense": "tener", "form": "form:pres-1s"},
                    {"surface": "casas", "sense": "casa", "form": "form:fem-pl"},
                ],
            ),
            _sentence(
                "s.4",
                "¡Buenos días!",
                [
                    {"surface": "Buenos", "sense": "buenos-días"},
                    {"surface": "días", "sense": "buenos-días"},
                ],
            ),
            _sentence(
                "s.5",
                "Tenía; tenían.",
                [
                    {"surface": "Tenía", "sense": "tener", "form": "form:impf"},
                    {"surface": "tenían", "sense": "tener", "form": "form:impf"},
                ],
            ),
            _sentence(
                "s.6",
                "El casa.",
                [
                    {"surface": "El", "sense": "el"},
                    {"surface": "casa", "sense": "casa", "form": "form:fem"},
                ],
            ),
            _sentence("s.7", "Llamarnos.", [{"surface": "Llamarnos", "sense": "llamar"}]),
            _sentence(
                "s.8",
                "La blanca, casa.",
                [
                    {"surface": "La", "sense": "el", "form": "form:fem"},
                    {"surface": "blanca", "sense": "blanco", "form": "form:fem"},
                    {"surface": "casa", "sense": "casa", "form": "form:fem"},
                ],
            ),
        ],
        "stories": [
            {
                "id": "mini.story.one",
                "node": "mini.story",
                "title": {"en": "A house"},
                "steps": [
                    {
                        "choose": {
                            "prompt": {"en": "What is it?"},
                            "options": [{"en": "this"}, {"en": "that"}],
                            "answer": 0,
                        }
                    },
                    {
                        "line": {
                            "ask": "complete",
                            "gap": "sense:casa",
                            "distractors": ["sense:mano"],
                            "forms": {
                                "es-Latn/standard": {
                                    "text": "La casa.",
                                    "tokens": [
                                        {"surface": "La", "sense": "el", "form": "form:fem"},
                                        {"surface": "casa", "sense": "casa", "form": "form:fem"},
                                    ],
                                }
                            },
                            "translations": {"en": "The house."},
                        }
                    },
                ],
            }
        ],
    }
    course: Json = {
        "id": "mini",
        "target": "es-Latn-CU",
        "orthographies": ["es-Latn/standard"],
        "support": ["en-Latn/standard"],
        "license": "CC-BY-SA-4.0",
        "provenance": PROVENANCE,
        "audio": {
            "voices": [
                {
                    "id": "one",
                    "provider": "espeak-ng",
                    "voice": "v1",
                    "orthography": "es-Latn/standard",
                    "reading": "text",
                    "license": "CC0-1.0",
                },
                {
                    "id": "two",
                    "provider": "espeak-ng",
                    "voice": "v2",
                    "orthography": "es-Latn/standard",
                    "reading": "text",
                    "license": "CC0-1.0",
                },
            ]
        },
        "units": ["units/u1.yaml"],
    }
    directory = tmp / "mini"
    _write(directory / "course.yaml", course)
    _write(directory / "units" / "u1.yaml", unit)
    _write(
        directory / "audio" / "index.yaml",
        {
            "version": 1,
            "clips": [
                {"item": "s.1", "speed": "normal", "synthesis": {"voice": "v1"}},
                {"item": "sense:casa", "speed": "normal", "synthesis": {"voice": "v2"}},
            ],
        },
    )
    statements: Json = {
        "language": "es",
        "course": {"variety": "es-CU"},
        "dimensions": {"VERB": ["Mood", "Tense", "Person", "Number"], "NOUN": ["Number"]},
        "lexical": {"NOUN": ["Gender"]},
        "citation": {
            "NOUN": {"Gender": "Masc", "Number": "Sing"},
            "ADJ": {"Gender": "Masc", "Number": "Sing"},
            "DET": {"Gender": "Masc", "Number": "Sing"},
            "VERB": {"VerbForm": "Inf"},
        },
        "bare": {
            "NOUN": {"Gender": "Masc", "Number": "Sing"},
            "ADJ": {"Gender": "Masc", "Number": "Sing"},
            "DET": {"Gender": "Masc", "Number": "Sing"},
            "VERB": {"VerbForm": "Inf"},
        },
        "forms": {
            "form:fem": {
                "feats": {"Gender": "Fem", "Number": "Sing"},
                "introduces": ["Gender=Fem"],
            },
            "form:fem-pl": {"feats": {"Gender": "Fem", "Number": "Plur"}},
            "form:pres-1s": {
                "feats": {"Mood": "Ind", "Tense": "Pres", "Person": 1, "Number": "Sing"},
                "introduces": ["Tense=Pres"],
            },
            "form:impf": {
                "feats": {"Mood": "Ind", "Tense": "Imp"},
                "refine": [
                    {"ends": "n", "feats": {"Person": 3, "Number": "Plur"}},
                    {"ends": "", "feats": {"Number": "Sing"}},
                ],
                "introduces": ["Tense=Imp"],
            },
        },
        "relations": [
            {
                "rel": "det",
                "from": ["DET"],
                "to": ["NOUN"],
                "side": "right",
                "agree": ["Gender", "Number"],
                "skip": ["ADJ"],
                "reach": 1,
            },
            {
                "rel": "amod",
                "from": ["ADJ"],
                "to": ["NOUN"],
                "side": "either",
                "agree": ["Gender", "Number"],
            },
        ],
        "defaults": [
            {"id": "gender-a", "when": {"pos": "NOUN", "ends": "a"}, "gives": {"Gender": "Fem"}},
            {"id": "gender-o", "when": {"pos": "NOUN", "ends": "o"}, "gives": {"Gender": "Masc"}},
        ],
        "tokens": {
            "llamar": {"llamarnos": {"parts": ["llamar", "nos"], "feats": [{}, {"Number": "Plur"}]}}
        },
    }
    for key, value in (plan_changes or {}).items():
        if isinstance(value, dict) and isinstance(statements.get(key), dict):
            statements[key] = {**statements[key], **value}
        else:
            statements[key] = value
    plan_file = tmp / "mini.plan.yaml"
    _write(plan_file, statements)
    return directory, plan_file


@pytest.fixture()
def spanish(tmp_path: Path) -> migrate.Migration:
    directory, plan_file = _spanish(tmp_path)
    return migrate.migrate(directory, plan_file)


def _tokens(m: migrate.Migration, item: str) -> list[Json]:
    for _, unit in m.next_units:
        for s in unit["sentences"]:
            if s["id"] == item:
                return [dict(t) for t in s["forms"]["es-Latn/standard"]["tokens"]]
    raise KeyError(item)


def _entry(m: migrate.Migration, name: str) -> Json:
    return next(e for e in m.built.lexicon["lexemes"] if e["id"] == f"lexeme:{name}")


def test_the_small_course_comes_through(spanish: migrate.Migration) -> None:
    assert spanish.errors == []


def test_a_form_kc_becomes_feature_values(spanish: migrate.Migration) -> None:
    tengo, casas = _tokens(spanish, "s.3")
    assert tengo["lexeme"] == "tener"
    assert tengo["feats"] == {"Mood": "Ind", "Number": "Sing", "Person": "1", "Tense": "Pres"}
    # A noun's gender is its lexeme's, not the token's (the design note, "A token").
    assert casas["feats"] == {"Number": "Plur"}


def test_a_gender_its_ending_gives_is_no_part_of_the_entry(spanish: migrate.Migration) -> None:
    assert "feats" not in _entry(spanish, "casa")
    # The -o default would give masculine: mano stores its gender, a part to learn (ADR 0146).
    assert _entry(spanish, "mano")["feats"] == {"Gender": "Fem"}
    assert [f.where for f in spanish.findings if f.kind == "lexical-exception"] == ["lexeme:mano"]


def test_an_entry_written_in_the_other_gender_keeps_it_on_the_tokens(
    spanish: migrate.Migration,
) -> None:
    """The course writes tía under tío and never tío: the entry is the masculine, so the
    feminine is no feature of the lexeme. It stays on the token, and the entry says so."""
    tia = _tokens(spanish, "s.2")[3]
    assert tia["feats"] == {"Gender": "Fem", "Number": "Sing"}
    entry = _entry(spanish, "tío")
    assert entry["chooses"] == ["Gender"]
    assert entry["forms"] == [
        {
            "feats": {"Gender": "Fem", "Number": "Sing"},
            "spelled": {"es-Latn/standard": ["tía"]},
            "status": "pinned",
        }
    ]


def test_every_form_no_rule_gives_is_pinned(spanish: migrate.Migration) -> None:
    forms = _entry(spanish, "tener")["forms"]
    assert {f["status"] for f in forms} == {"pinned"}
    spelled = {f["spelled"]["es-Latn/standard"][0]: f["feats"] for f in forms}
    # A sentence's capital is not the form's: the entry is written in lower case.
    assert spelled["tengo"] == {"Mood": "Ind", "Number": "Sing", "Person": "1", "Tense": "Pres"}
    # The ending says what the KC left out (the plan's `refine`).
    assert spelled["tenían"] == {"Mood": "Ind", "Number": "Plur", "Person": "3", "Tense": "Imp"}
    assert spelled["tenía"] == {"Mood": "Ind", "Number": "Sing", "Tense": "Imp"}


def test_an_entry_of_several_tokens_is_written_as_itself(spanish: migrate.Migration) -> None:
    entry = _entry(spanish, "buenos-días")
    assert entry["spelled"] == {"es-Latn/standard": ["buenos días"]}
    assert "forms" not in entry and "allomorphs" not in entry


def test_a_word_the_plan_cuts_writes_its_lexemes(spanish: migrate.Migration) -> None:
    (token,) = _tokens(spanish, "s.7")
    assert token["lexemes"] == [
        {"lexeme": "llamar", "surface": "Llamar", "base": True, "feats": {"VerbForm": "Inf"}},
        {"lexeme": "nos", "surface": "nos", "feats": {"Number": "Plur"}},
    ]


def test_a_determiner_and_an_adjective_point_at_their_noun(spanish: migrate.Migration) -> None:
    la, casa, blanca = _tokens(spanish, "s.1")
    assert (la["n"], la["head"], la["rel"]) == (1, 2, "det")
    assert casa["n"] == 2 and "head" not in casa
    assert (blanca["n"], blanca["head"], blanca["rel"]) == (3, 2, "amod")


def test_a_relation_does_not_cross_a_comma(spanish: migrate.Migration) -> None:
    la, blanca, casa = _tokens(spanish, "s.8")
    # La skips the adjective to its noun; the adjective's own noun is past a comma.
    assert "head" not in blanca
    assert "head" not in la and "n" not in casa


def test_a_determiner_that_does_not_agree_is_a_finding(spanish: migrate.Migration) -> None:
    el, _ = _tokens(spanish, "s.6")
    assert "head" not in el
    found = [f for f in spanish.findings if f.kind == "agreement"]
    assert len(found) == 1 and found[0].where.startswith("s.6")


def test_a_node_introduces_lexemes_and_feature_values(spanish: migrate.Migration) -> None:
    node = spanish.next_units[0][1]["nodes"][0]
    assert list(node["introduces"]) == [
        "lexeme:casa",
        "lexeme:el",
        "feature:Gender=Fem",
        "feature:Tense=Pres",
        "feature:Tense=Imp",
    ]


def test_a_form_kcs_gloss_and_notes_become_a_label(spanish: migrate.Migration) -> None:
    labels = {label["was"]: label for label in spanish.built.language["labels"]}
    assert labels["form:fem"]["feats"] == {"Gender": "Fem", "Number": "Sing"}
    assert labels["form:fem"]["notes"] == {"en": "about fem"}


def test_a_story_question_names_lexemes(spanish: migrate.Migration) -> None:
    line = spanish.next_units[0][1]["stories"][0]["steps"][1]["line"]
    assert line["gap"] == "lexeme:casa"
    assert list(line["distractors"]) == ["lexeme:mano"]


def test_the_alias_table(spanish: migrate.Migration) -> None:
    aliases = spanish.aliases["aliases"]
    assert dict(aliases["sense:casa"]) == {"part": "lexeme:casa"}
    # Feature values on tokens: nothing a learner has (ADR 0146).
    assert dict(aliases["form:fem"]) == {}


def test_a_renamed_clip_keeps_its_voice(spanish: migrate.Migration) -> None:
    assert spanish.assignment == {"version": 1, "voices": {"lexeme:casa": "two"}}
    assert spanish.stats["audio"]["clips renamed with their item"] == 1


def test_the_text_is_unchanged_and_a_change_is_caught(spanish: migrate.Migration) -> None:
    units = [unit for _, unit in spanish.next_units]
    assert checks.text_unchanged(spanish.conv, units) == []
    units[0]["sentences"][0]["forms"]["es-Latn/standard"]["text"] = "La casa blanca!"
    assert checks.text_unchanged(spanish.conv, units)


def test_a_name_that_points_nowhere_is_caught(spanish: migrate.Migration) -> None:
    units = [unit for _, unit in spanish.next_units]
    units[0]["nodes"][0]["introduces"] = ["lexeme:nowhere"]
    errors = checks.references(
        spanish.built.lexicon, spanish.built.language, spanish.next_course, units, spanish.aliases
    )
    assert any("lexeme:nowhere" in e for e in errors)


# What a plan may not do


def test_two_form_kcs_with_one_set_of_values_are_caught(tmp_path: Path) -> None:
    """Whatever the course told apart, the converted course must still: a plan that gives two
    form KCs the same values merges two annotations."""
    directory, plan_file = _spanish(
        tmp_path,
        {"forms": {"form:fem-pl": {"feats": {"Gender": "Fem", "Number": "Sing"}}}},
    )
    directory2 = directory
    unit_file = directory2 / "units" / "u1.yaml"
    unit = yaml.safe_load(unit_file.read_text(encoding="utf-8"))
    unit["sentences"].append(
        _sentence("s.9", "Casa.", [{"surface": "Casa", "sense": "casa", "form": "form:fem-pl"}])
    )
    _write(unit_file, unit)
    m = migrate.migrate(directory, plan_file)
    assert any("all became" in e for e in m.errors)


def test_a_pinned_form_kc_needs_its_values(tmp_path: Path) -> None:
    directory, plan_file = _spanish(tmp_path)
    statements = yaml.safe_load(plan_file.read_text(encoding="utf-8"))
    del statements["forms"]["form:fem"]
    _write(plan_file, statements)
    with pytest.raises(migrate.PlanError, match="form:fem"):
        migrate.migrate(directory, plan_file)


def test_a_plan_may_not_name_what_the_course_has_not(tmp_path: Path) -> None:
    directory, plan_file = _spanish(tmp_path, {"senses": {"nadie": {"formOf": "casa"}}})
    with pytest.raises(migrate.PlanError, match="nadie"):
        migrate.migrate(directory, plan_file)


def test_a_bare_yes_is_refused(tmp_path: Path) -> None:
    """YAML 1.1 reads Poss: Yes as true; a plan must quote it."""
    file = tmp_path / "p.yaml"
    file.write_text("language: es\nforms:\n  form:x: {feats: {Poss: Yes}}\n", encoding="utf-8")
    with pytest.raises(plan.PlanError, match="quote"):
        plan.load("es", file)


# Endings and senses built of several lexemes


def _uzbek(tmp: Path) -> tuple[Path, Path]:
    """Two orthographies, endings written as morphs, and a sense that is a built word."""
    latin, cyrillic = "uz-Latn/standard", "uz-Cyrl/standard"

    def sense(name: str, pos: str, lat: str, cyr: str) -> Json:
        return {
            "id": f"sense:{name}",
            "pos": pos,
            "gloss": {"en": name},
            "forms": {latin: [lat], cyrillic: [cyr]},
        }

    def both(sid: str, lat: tuple[str, list[Json]], cyr: tuple[str, list[Json]]) -> Json:
        return {
            "id": sid,
            "node": "uz.one",
            "forms": {
                latin: {"text": lat[0], "tokens": lat[1]},
                cyrillic: {"text": cyr[0], "tokens": cyr[1]},
            },
            "translations": {"en": f"({sid})"},
        }

    def joined(surface: str, base: str, *morphs: tuple[str, str]) -> Json:
        return {
            "surface": surface,
            "sense": base,
            "morphs": [{"surface": s, "kc": kc} for s, kc in morphs],
        }

    unit: Json = {
        "id": "u1",
        "kcs": [
            sense("uy", "NOUN", "uy", "уй"),
            sense("park", "NOUN", "park", "парк"),
            sense("uyim", "NOUN", "uyim", "уйим"),
            sense("ichmoq", "VERB", "ichmoq", "ичмоқ"),
            {"id": "form:dat-ga", "gloss": {"en": "to"}},
            {"id": "form:poss-1sg-im", "gloss": {"en": "my"}},
            {"id": "form:pres-a", "gloss": {"en": "present"}},
        ],
        "nodes": [
            {"id": "uz.one", "kind": "lesson", "introduces": ["sense:uyim", "form:dat-ga"]},
            {"id": "uz.two", "kind": "lesson", "introduces": ["sense:uy", "form:poss-1sg-im"]},
            {"id": "uz.story", "kind": "story"},
        ],
        "sentences": [
            both(
                "s.1",
                ("Uyga.", [joined("Uyga", "uy", ("Uy", "sense:uy"), ("ga", "form:dat-ga"))]),
                ("Уйга.", [joined("Уйга", "uy", ("Уй", "sense:uy"), ("га", "form:dat-ga"))]),
            ),
            both(
                "s.2",
                (
                    "Parkka.",
                    [joined("Parkka", "park", ("Park", "sense:park"), ("ka", "form:dat-ga"))],
                ),
                (
                    "Паркка.",
                    [joined("Паркка", "park", ("Парк", "sense:park"), ("ка", "form:dat-ga"))],
                ),
            ),
            both(
                "s.3",
                ("Uyim.", [{"surface": "Uyim", "sense": "uyim"}]),
                ("Уйим.", [{"surface": "Уйим", "sense": "uyim"}]),
            ),
            both(
                "s.4",
                ("Uyim.", [joined("Uyim", "uy", ("Uy", "sense:uy"), ("im", "form:poss-1sg-im"))]),
                ("Уйим.", [joined("Уйим", "uy", ("Уй", "sense:uy"), ("им", "form:poss-1sg-im"))]),
            ),
            both(
                "s.5",
                (
                    "Icha.",
                    [joined("Icha", "ichmoq", ("Ich", "sense:ichmoq"), ("a", "form:pres-a"))],
                ),
                ("Ича.", [joined("Ича", "ichmoq", ("Ич", "sense:ichmoq"), ("а", "form:pres-a"))]),
            ),
        ],
        "stories": [
            {
                "id": "uz.story.one",
                "node": "uz.story",
                "title": {"en": "Home"},
                "steps": [
                    {
                        "choose": {
                            "prompt": {"en": "What is it?"},
                            "options": [{"en": "this"}, {"en": "that"}],
                            "answer": 0,
                        }
                    },
                    {
                        "line": {
                            "ask": "complete",
                            "gap": "sense:park",
                            "distractors": ["sense:uyim"],
                            "forms": {
                                latin: {
                                    "text": "Park.",
                                    "tokens": [{"surface": "Park", "sense": "park"}],
                                },
                                cyrillic: {
                                    "text": "Парк.",
                                    "tokens": [{"surface": "Парк", "sense": "park"}],
                                },
                            },
                            "translations": {"en": "A park."},
                        }
                    },
                ],
            }
        ],
    }
    course: Json = {
        "id": "uzmini",
        "target": "uz-Latn-UZ",
        "orthographies": [latin, cyrillic],
        "support": ["en-Latn/standard"],
        "license": "CC-BY-SA-4.0",
        "provenance": PROVENANCE,
        "units": [unit],
    }
    directory = tmp / "uzmini"
    _write(directory / "course.yaml", course)
    statements: Json = {
        "language": "uz",
        "dimensions": {"NOUN": ["Number", "Case"]},
        "stems": [{"pos": "VERB", "strip": {latin: "moq", cyrillic: "моқ"}}],
        "forms": {
            "form:dat-ga": {"lexeme": "dat", "realises": {"Case": "Dat"}},
            "form:poss-1sg-im": {
                "lexeme": "poss-1sg",
                "realises": {"Person[psor]": 1, "Number[psor]": "Sing"},
            },
            "form:pres-a": {"lexeme": "pres", "realises": {"Tense": "Pres"}},
        },
        "senses": {"uyim": {"parts": ["uy", "poss-1sg"]}},
    }
    plan_file = tmp / "uzmini.plan.yaml"
    _write(plan_file, statements)
    return directory, plan_file


@pytest.fixture()
def uzbek(tmp_path: Path) -> migrate.Migration:
    directory, plan_file = _uzbek(tmp_path)
    return migrate.migrate(directory, plan_file)


def test_the_uzbek_course_comes_through(uzbek: migrate.Migration) -> None:
    assert uzbek.errors == []


def test_an_ending_is_a_lexeme_with_its_allomorphs_paired(uzbek: migrate.Migration) -> None:
    dat = _entry(uzbek, "dat")
    assert dat["realises"] == {"Case": "Dat"}
    # A sentence names the same lexemes in the same order in each orthography: that pairs them.
    assert dat["allomorphs"] == [
        {"spelled": {"uz-Latn/standard": ["ga"], "uz-Cyrl/standard": ["га"]}},
        {"spelled": {"uz-Latn/standard": ["ka"], "uz-Cyrl/standard": ["ка"]}},
    ]


def test_a_token_marks_its_base(uzbek: migrate.Migration) -> None:
    token = uzbek.next_units[0][1]["sentences"][0]["forms"]["uz-Latn/standard"]["tokens"][0]
    assert [dict(p) for p in token["lexemes"]] == [
        {"lexeme": "uy", "surface": "Uy", "base": True},
        {"lexeme": "dat", "surface": "ga"},
    ]


def test_a_built_word_is_its_lexemes(uzbek: migrate.Migration) -> None:
    """uyim was a sense of its own; the plan says it is uy and its ending."""
    assert "lexeme:uyim" not in {e["id"] for e in uzbek.built.lexicon["lexemes"]}
    token = uzbek.next_units[0][1]["sentences"][2]["forms"]["uz-Latn/standard"]["tokens"][0]
    assert [dict(p) for p in token["lexemes"]] == [
        {"lexeme": "uy", "surface": "Uy", "base": True},
        {"lexeme": "poss-1sg", "surface": "im"},
    ]
    alias = uzbek.aliases["aliases"]["sense:uyim"]
    assert alias["part"] == "lexeme:uy"
    assert list(alias["byItem"]["s.3"]) == ["lexeme:uy", "lexeme:poss-1sg"]
    # The node that taught the built word introduces what it is built of; the later node, which
    # introduced those, has nothing left to introduce.
    nodes = uzbek.next_units[0][1]["nodes"]
    assert list(nodes[0]["introduces"]) == ["lexeme:uy", "lexeme:poss-1sg", "lexeme:dat"]
    assert "introduces" not in nodes[1]
    assert [f.where for f in uzbek.findings if f.kind == "node-empty"] == ["uz.two"]
    # As a story's wrong option it is still the built word.
    line = uzbek.next_units[0][1]["stories"][0]["steps"][1]["line"]
    assert [list(d) for d in line["distractors"]] == [["lexeme:uy", "lexeme:poss-1sg"]]


def test_a_stem_the_plan_explains_is_no_finding(uzbek: migrate.Migration) -> None:
    ichmoq = _entry(uzbek, "ichmoq")
    assert ichmoq["allomorphs"] == [
        {"spelled": {"uz-Latn/standard": ["ich"], "uz-Cyrl/standard": ["ич"]}}
    ]
    assert not [f for f in uzbek.findings if f.where == "lexeme:ichmoq"]


def test_a_name_two_kcs_would_share_is_refused(tmp_path: Path) -> None:
    directory, plan_file = _uzbek(tmp_path)
    statements = yaml.safe_load(plan_file.read_text(encoding="utf-8"))
    statements["forms"]["form:dat-ga"]["lexeme"] = "uy"
    _write(plan_file, statements)
    with pytest.raises(migrate.PlanError, match="rename one"):
        migrate.migrate(directory, plan_file)


# The pieces


def test_fold_compares_letters() -> None:
    assert fold("Días") == fold("días")
    # Arabic vowel signs and the shadda are marks; a hamza makes a letter.
    assert fold("\u0628\u064e\u062f\u0651\u064a") == fold("\u0628\u062f\u064a")
    assert fold("\u0623\u0643\u0644") != fold("\u0622\u0643\u0644")
    # A Greek grave is its acute; a ZWNJ and the space around a word are nothing.
    assert fold("\u1f00\u03b4\u03b5\u03bb\u03c6\u1f78\u03bd") == fold(
        "\u1f00\u03b4\u03b5\u03bb\u03c6\u03cc\u03bd"
    )
    assert fold("ngo5 ") == fold("ngo5")
    assert fold("\u0634\u06cc\u0631\u06cc\u0646\u200c") == fold("\u0634\u06cc\u0631\u06cc\u0646")


def test_an_ending_with_marks_needs_them() -> None:
    qamats_he = "\u05b8\u05d4"
    assert _ends("\u05d0\u05b4\u05e9\u05bc\u05b8\u05c1\u05d4", qamats_he)
    assert not _ends("\u05e9\u05b8\u05c2\u05d3\u05b6\u05d4", qamats_he)
    assert (
        _ends("\u1f41\u03b4\u03cc\u03c2", "\u03bf\u03c2")
        and _ends("canción", "ción")
        and not _ends("a", "ma")
    )


def test_tokens_are_found_in_their_text_in_order() -> None:
    assert offsets("la la la", ["la", "la"]) == [(0, 2), (3, 5)]
    with pytest.raises(ValueError):
        offsets("la casa", ["casa", "la"])


def test_an_entry_of_several_tokens_is_one_run() -> None:
    found = runs(
        "b tishrin el tene",
        [
            ("b", [("b", {}, "b")], True, ()),
            ("tishrin", [("tishrin-tene", {}, "tishrin")], True, ()),
            ("el", [("tishrin-tene", {}, "el")], True, ()),
            ("tene", [("tishrin-tene", {}, "tene")], True, ()),
        ],
        lambda lexeme: lexeme == "tishrin-tene",
    )
    assert [(r.lexeme, r.surface) for r in found] == [
        ("b", "b"),
        ("tishrin-tene", "tishrin el tene"),
    ]
