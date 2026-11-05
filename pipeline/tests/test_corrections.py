"""`nabu corrections apply` (ADR 0051): learners' corrections into the course source, value by
value, only where the source still says what the learner saw."""

from __future__ import annotations

import json
import re
import shutil
from pathlib import Path
from typing import Any, cast

import pytest
import yaml
from typer.testing import CliRunner

from nabu.cli import app
from nabu.corecli import CoreCli
from nabu.corrections import (
    Outcome,
    apply,
    canonical_map,
    edit_notation,
    flow_scalar,
    retokenize,
    summary,
)
from nabu.schema.models import SentenceCorrection

ROOT = Path(__file__).resolve().parents[2]
ZWNJ = "‌"
FA = "fa-Arab/standard"
YUE = "yue-Hant-HK/standard"
UZ_CYRL = "uz-Cyrl/standard"


@pytest.fixture
def courses(tmp_path: Path) -> Path:
    """fa, yue and uz without audio, each compiling only its first unit (fast to check)."""
    out = tmp_path / "courses"
    for course in ("fa", "yue", "uz"):
        shutil.copytree(
            ROOT / "courses" / course, out / course, ignore=shutil.ignore_patterns("audio")
        )
        path = out / course / "course.yaml"
        text, n = re.subn(
            r"(?m)^units: \[.*\]$", "units: [units/intro.yaml]", path.read_text("utf-8")
        )
        assert n == 1
        path.write_text(text, encoding="utf-8")
    (out / "images").symlink_to(ROOT / "courses" / "images")
    return out


_ids = iter(range(1, 10_000))


def row(
    course: str, item: str, shown: dict[str, Any], correction: dict[str, Any], **extra: Any
) -> SentenceCorrection:
    return SentenceCorrection.model_validate(
        {
            "id": f"00000000-0000-7000-c000-{next(_ids):012x}",
            "course": course,
            "orthography": extra.pop("orthography", FA if course == "fa" else YUE),
            "support": "en",
            "item": item,
            "shown": shown,
            "correction": correction,
            "notes": extra.pop("notes", []),
            "status": extra.pop("status", "pending"),
            "reports": 1,
            "createdAt": "2026-06-03T10:00:00Z",
            **extra,
        }
    )


def unit(courses: Path, course: str) -> str:
    return (courses / course / "units" / "intro.yaml").read_text(encoding="utf-8")


def written(courses: Path, outcome: Outcome) -> None:
    for file, text in outcome.files.items():
        file.write_text(text, encoding="utf-8")


def first_word(text: str, orth: str) -> dict[str, Any]:
    """The unit's first KC with a form in `orth`."""
    kcs = cast(list[dict[str, Any]], yaml.safe_load(text)["kcs"])
    return next(k for k in kcs if cast(dict[str, Any], k.get("forms", {})).get(orth))


def changed_lines(before: str, after: str) -> list[tuple[str, str]]:
    return [(a, b) for a, b in zip(before.splitlines(), after.splitlines(), strict=True) if a != b]


# --------------------------------------------------------------------------- notation and tokens


@pytest.mark.parametrize(
    ("line", "new", "expected"),
    [
        ("(Hello|Hi), Maryam!", "Hello, Mariam!", "(Hello|Hi), Mariam!"),
        (
            "I went to [the] university yesterday.",
            "I went to the university today.",
            "I went to [the] university today.",
        ),
        ("Good morning! @0.5", "Good evening! @0.5".replace(" @0.5", ""), "Good evening! @0.5"),
        ("Thanks!", "Thanks a lot!", "Thanks a lot!"),
        ("Hello", "Hello (you)", "Hello \\(you\\)"),
        ("A \\(b\\) c", "A (b) d", "A \\(b\\) d"),
        # Inside a group, or touching an escape: no edit in place.
        ("(Hello|Hi), Maryam!", "Hey, Maryam!", None),
        ("A \\(b\\) c", "A [b] c", None),
    ],
)
def test_a_translation_is_edited_inside_its_notation_where_the_change_is_plain_text(
    core_cli: CoreCli, line: str, new: str, expected: str | None
) -> None:
    edited = edit_notation(line, new)
    assert edited == expected
    if edited is not None:
        assert (
            core_cli.result("accept", profile="en-Latn/standard", accept=edited)["canonicalSource"]
            == new
        )


def test_the_canonical_answer_maps_back_to_the_notation(core_cli: CoreCli) -> None:
    for line in [
        "(Thanks|Thank you), I('m| am) (well|fine).",
        "It('s| is) Maryam.",
        "a [b (c|d)] e @2",
    ]:
        text, spans = canonical_map(line)
        assert (
            text
            == core_cli.result("accept", profile="en-Latn/standard", accept=line)["canonicalSource"]
        )
        plain = "".join(line[s[0] : s[1]] for s in spans if s is not None)
        assert all(c not in "()[]|" for c in plain)


def test_tokens_follow_a_punctuation_or_spelling_fix_and_nothing_else() -> None:
    assert retokenize("早晨呀！", "早晨呀。", ["早晨", "呀"]) == {}
    assert retokenize("Men talabaman.", "Men talabamen.", ["Men", "talabaman"]) == {1: "talabamen"}
    assert retokenize(f"می{ZWNJ}خوانم.", f"می{ZWNJ}خونم.", [f"می{ZWNJ}خوانم"]) == {
        0: f"می{ZWNJ}خونم"
    }
    # A new word, a removed word, a whole word swapped (a different sense): by hand.
    for old, new, surfaces in [
        ("Men talabaman.", "Men ham talabaman.", ["Men", "talabaman"]),
        ("Men talabaman.", "Talabaman.", ["Men", "talabaman"]),
        ("早晨呀！", "早晨啊！", ["早晨", "呀"]),
        ("ketab", "ketabha", ["ketab"]),
    ]:
        assert isinstance(retokenize(old, new, surfaces), str)


def test_scalars_are_written_safely_anywhere() -> None:
    for value in ["早晨", "a, b", "yes", "#x", f"می{ZWNJ}خوانم.", "it's"]:
        text = flow_scalar(value)
        assert yaml.safe_load("{k: " + text + "}")["k"] == value
        assert ZWNJ not in text


# ------------------------------------------------------------------------------------- applying


def test_a_reading_changes_one_value_and_nothing_else(courses: Path, core_cli: CoreCli) -> None:
    before = unit(courses, "yue")
    shown = {
        "forms": {
            YUE: {
                "text": "早晨呀！",
                "readings": [
                    {"token": 0, "surface": "早晨", "scheme": "jyutping", "reading": "zou2 san4"},
                    {"token": 1, "surface": "呀", "scheme": "jyutping", "reading": "aa3"},
                ],
            }
        },
        "translation": "Good morning!",
    }
    fix = {
        "forms": {
            YUE: {
                "readings": [{"token": 1, "surface": "呀", "scheme": "jyutping", "reading": "aa4"}]
            }
        }
    }
    outcome = apply([row("yue", "s.6", shown, fix)], courses, core_cli)
    assert [a.row.item for a in outcome.applied] == ["s.6"]
    assert outcome.applied[0].where == "courses/yue/units/intro.yaml:93"
    written(courses, outcome)
    after = unit(courses, "yue")
    token = "{surface: 呀, sense: 呀, readings: {jyutping: %s}}"
    [(was, now)] = changed_lines(before, after)
    assert was.endswith(token % "aa3" + "]")
    assert now == was.replace(token % "aa3", token % "aa4")


def test_a_translation_keeps_its_other_alternatives_and_its_notation(
    courses: Path, core_cli: CoreCli
) -> None:
    yue_before, fa_before = unit(courses, "yue"), unit(courses, "fa")
    rows = [
        row(
            "yue", "s.3", {"forms": {}, "translation": "Thanks!"}, {"translation": "Thanks a lot!"}
        ),
        row(
            "fa",
            "s.6",
            {"forms": {}, "translation": "Hello, Maryam!"},
            {"translation": "Hello, Mariam!"},
        ),
    ]
    outcome = apply(rows, courses, core_cli)
    assert len(outcome.applied) == 2
    written(courses, outcome)
    assert changed_lines(yue_before, unit(courses, "yue")) == [
        ("      Thanks!", "      Thanks a lot!")
    ]
    assert changed_lines(fa_before, unit(courses, "fa")) == [
        ("    en: (Hello|Hi), Maryam!", "    en: (Hello|Hi), Mariam!")
    ]


def test_a_translation_that_cannot_be_edited_in_place_is_replaced_and_flagged(
    courses: Path, core_cli: CoreCli
) -> None:
    outcome = apply(
        [
            row(
                "fa",
                "s.6",
                {"forms": {}, "translation": "Hello, Maryam!"},
                {"translation": "Hey there, Maryam!"},
            )
        ],
        courses,
        core_cli,
    )
    [applied] = outcome.applied
    assert any("variants it accepted are gone" in c for c in applied.checks)
    written(courses, outcome)
    assert "    en: Hey there, Maryam!" in unit(courses, "fa").splitlines()


def test_text_follows_its_tokens_and_keeps_zwnj_escaped(courses: Path, core_cli: CoreCli) -> None:
    source = unit(courses, "fa")
    zwnj_line = next(line for line in source.splitlines() if "text:" in line and "\\u200c" in line)
    current = yaml.safe_load("{" + zwnj_line.strip() + "}")["text"]
    sentence = re.search(
        r"(?ms)^- id: (s\.\d+)\n(?:(?!^- id:).)*?" + re.escape(zwnj_line.strip()), source
    )
    assert sentence is not None and ZWNJ in current
    fixed = current.rstrip(".!؟?") + "؟"
    outcome = apply(
        [
            row(
                "fa",
                sentence.group(1),
                {"forms": {FA: {"text": current}}},
                {"forms": {FA: {"text": fixed}}},
            )
        ],
        courses,
        core_cli,
    )
    assert len(outcome.applied) == 1, outcome.skipped
    written(courses, outcome)
    after = unit(courses, "fa")
    assert ZWNJ not in after
    assert yaml.safe_load(after) is not None
    [(_, new)] = changed_lines(source, after)
    assert yaml.safe_load("{" + new.strip() + "}")["text"] == fixed


def test_a_spelling_fix_moves_the_token_and_flags_nothing_it_cannot_see(
    courses: Path, core_cli: CoreCli
) -> None:
    before = unit(courses, "uz")
    shown = {"forms": {UZ_CYRL: {"text": "Раҳмат!"}}}
    outcome = apply(
        [row("uz", "s.2", shown, {"forms": {UZ_CYRL: {"text": "Рахмат!"}}}, orthography=UZ_CYRL)],
        courses,
        core_cli,
    )
    [applied] = outcome.applied
    assert "uz-Cyrl/standard token 0: Раҳмат → Рахмат" in applied.changes
    assert any("reverse" in c for c in applied.checks)
    written(courses, outcome)
    assert changed_lines(before, unit(courses, "uz")) == [
        ("      text: Раҳмат!", "      text: Рахмат!"),
        (
            "      tokens: [{surface: Раҳмат, sense: rahmat}]",
            "      tokens: [{surface: Рахмат, sense: rahmat}]",
        ),
    ]


def test_a_story_line_is_found_by_its_step(courses: Path, core_cli: CoreCli) -> None:
    story = yaml.safe_load(unit(courses, "yue"))["stories"][0]
    step = next(n for n, s in enumerate(story["steps"]) if "line" in s)
    line = story["steps"][step]["line"]
    text = line["forms"][YUE]["text"]
    fixed = text.rstrip("！!。") + "。"
    outcome = apply(
        [
            row(
                "yue",
                story["id"],
                {"forms": {YUE: {"text": text}}, "translation": line["translations"]["en"]},
                {"forms": {YUE: {"text": fixed}}, "translation": "Morning!"},
                step=step,
            ),
        ],
        courses,
        core_cli,
    )
    assert len(outcome.applied) == 1, outcome.skipped
    written(courses, outcome)
    after = yaml.safe_load(unit(courses, "yue"))["stories"][0]["steps"][step]["line"]
    assert after["forms"][YUE]["text"] == fixed
    assert after["translations"]["en"] == "Morning!"


def test_a_word_s_form_and_gloss_change_and_nothing_else(courses: Path, core_cli: CoreCli) -> None:
    """A word (ADR 0057): the KC's first form and its gloss, edited in place."""
    before = unit(courses, "fa")
    kc = first_word(before, FA)
    form, gloss = kc["forms"][FA][0], kc["gloss"]["en"]
    plural = form + "ها"
    outcome = apply(
        [
            row(
                "fa",
                kc["id"],
                {"forms": {FA: {"text": form}}, "translation": gloss},
                {"forms": {FA: {"text": plural}}, "translation": f"{gloss} (plural)"},
            )
        ],
        courses,
        core_cli,
    )
    assert len(outcome.applied) == 1, outcome.skipped
    assert any("may need the same change" in c for c in outcome.applied[0].checks)
    written(courses, outcome)
    after = unit(courses, "fa")
    word = next(
        k for k in cast(list[dict[str, Any]], yaml.safe_load(after)["kcs"]) if k["id"] == kc["id"]
    )
    assert word["forms"][FA][0] == plural
    assert word["gloss"]["en"] == f"{gloss} (plural)"
    assert len(changed_lines(before, after)) == 1


def test_a_word_s_reading_or_marks_alone_are_left_for_a_person(
    courses: Path, core_cli: CoreCli
) -> None:
    kc = first_word(unit(courses, "yue"), YUE)
    form = kc["forms"][YUE][0]
    reading = {"token": 0, "surface": form, "scheme": "jyutping", "reading": "x1"}
    fa_kc = first_word(unit(courses, "fa"), FA)
    fa_form = fa_kc["forms"][FA][0]
    outcome = apply(
        [
            row(
                "yue",
                kc["id"],
                {"forms": {YUE: {"text": form, "readings": [{**reading, "reading": "y2"}]}}},
                {"forms": {YUE: {"readings": [reading]}}},
            ),
            row(
                "fa",
                fa_kc["id"],
                {"forms": {FA: {"text": fa_form}}},
                {"forms": {FA: {"text": fa_form[0] + "َ" + fa_form[1:]}}},
            ),
        ],
        courses,
        core_cli,
    )
    assert outcome.applied == []
    reasons = [s.reason for s in outcome.skipped]
    assert "comes from the sentences that pin it" in reasons[0]
    assert "only vowel marks changed" in reasons[1]


def test_what_cannot_be_applied_is_listed_with_why_and_where(
    courses: Path, core_cli: CoreCli
) -> None:
    stale = {"forms": {FA: {"text": "سلام مریم؟"}}}
    s6 = {"forms": {FA: {"text": "سلام مریم!"}}}
    rows = [
        row("fa", "s.6", stale, {"forms": {FA: {"text": "سلام مریم."}}}),
        row("fa", "s.6", s6, {"forms": {FA: {"text": "سلام، مریم!"}}}),
        row("fa", "s.6", s6, {"forms": {FA: {"text": "سلام مریم!!"}}}),
        row("fa", "s.6", s6, {"forms": {FA: {"text": "سلام دوست مریم!"}}}),
        row("fa", "s.6", s6, {}, notes=["sounds too formal"]),
        row("fa", "s.9999", s6, {"forms": {FA: {"text": "x"}}}),
        row("fa", "s.6", s6, {"forms": {FA: {"text": "x"}}}, status="rejected"),
    ]
    outcome = apply(rows, courses, core_cli)
    # The comma applies; the next correction of s.6 then meets the changed text.
    assert [a.row.correction.forms[FA].text for a in outcome.applied if a.row.correction.forms] == [
        "سلام، مریم!"
    ]
    reasons = [s.reason for s in outcome.skipped]
    assert reasons[0].startswith("the source changed since")
    assert reasons[1].startswith("the source changed since")
    assert reasons[2].startswith("the source changed since")
    assert reasons[3] == "nothing to change: a note only (sounds too formal)"
    assert reasons[4] == "s.9999 is not in the course source"
    assert reasons[5] == "status rejected"
    assert all(s.where == "courses/fa/units/intro.yaml:94" for s in outcome.skipped[:4])
    text = summary(outcome)
    assert "<bdi>سلام، مریم!</bdi>" in text or "سلام، مریم!" in text
    assert "### Not applied" in text


def test_the_command_writes_checks_compiles_and_summarizes(courses: Path, tmp_path: Path) -> None:
    export = tmp_path / "corrections.jsonl"
    shown = {"forms": {"uz-Latn/standard": {"text": "Rahmat!"}}, "translation": "Thank you!"}
    fix = {"translation": "Thank you very much!"}
    export.write_text(
        json.dumps(
            row("uz", "s.2", shown, fix, orthography="uz-Latn/standard").model_dump(
                mode="json", exclude_none=True
            )
        )
        + "\n",
        encoding="utf-8",
    )
    out = tmp_path / "summary.md"
    before = unit(courses, "uz")
    dry = CliRunner().invoke(
        app, ["corrections", "apply", str(export), "--courses", str(courses), "--dry-run"]
    )
    assert dry.exit_code == 0, dry.output
    assert "1 would apply, 0 not" in dry.output
    assert unit(courses, "uz") == before
    result = CliRunner().invoke(
        app, ["corrections", "apply", str(export), "--courses", str(courses), "--summary", str(out)]
    )
    assert result.exit_code == 0, result.output
    assert "1 applied, 0 not" in result.output
    assert changed_lines(before, unit(courses, "uz")) == [
        ("      Thank you!", "      Thank you very much!")
    ]
    assert "Thank you very much!" in out.read_text(encoding="utf-8")
