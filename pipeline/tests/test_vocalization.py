"""Vowel marks from a course's vocalization (ADR 0053): words, morphs, overrides, audio."""

from __future__ import annotations

import copy
import unicodedata
from pathlib import Path
from typing import Any

from nabu import yamlio
from nabu.audio.course import plan
from nabu.compiler import compile_course
from nabu.corrections import apply
from nabu.items import unit_json
from nabu.schema.models import AudioVoice, SentenceCorrection

from .conftest import CoreCli
from .fixtures.make_lint_fixtures import FA, FA_VOCALIZED, FA_WORD

ORTH = "fa-Arab/standard"
KASRA = "\u0650"
FATHA = "\u064e"
DAMMA = "\u064f"
# hastam ("I am") = hast + -am; marked, a fatha on its first and third letters
HASTAM = "\u0647\u0633\u062a\u0645"
HASTAM_MARKED = f"\u0647{FATHA}\u0633\u062a{FATHA}\u0645"


def _compile(core_cli: CoreCli, tmp_path: Path, course: dict[str, Any]) -> Any:
    path = tmp_path / "course.yaml"
    path.write_text(yamlio.dump(course), encoding="utf-8")
    diags, compiled = compile_course(path, core_cli)
    return diags, compiled


def _tokens(compiled: Any, i: int = 0) -> list[dict[str, Any]]:
    """A sentence's tokens as the bundle holds them."""
    return unit_json(compiled.units[0])["sentences"][i]["forms"][ORTH]["text"]["tokens"]


def _with_sentence(course: dict[str, Any], text: str, tokens: list[dict[str, Any]]) -> None:
    unit = course["units"][0]
    unit["kcs"].append({"id": "sense:budan", "gloss": {"en": "to be"}})
    unit["nodes"][0]["introduces"].append("sense:budan")
    unit["sentences"].append(
        {
            "id": "s.2",
            "node": "basics.1",
            "forms": {ORTH: {"text": text, "tokens": tokens, "reverse": text}},
            "translations": {"en": "a book I am"},
        }
    )


def test_words_take_their_marks_from_the_vocalization(core_cli: CoreCli, tmp_path: Path) -> None:
    diags, compiled = _compile(core_cli, tmp_path, FA)
    assert [d.format() for d in diags.items] == []
    assert [t["surface"] for t in _tokens(compiled)] == [FA_VOCALIZED]
    # The voice reads the text as written.
    assert compiled.written == {("s.1", ORTH): [FA_WORD]}


def test_kc_forms_are_marked(core_cli: CoreCli, tmp_path: Path) -> None:
    course = copy.deepcopy(FA)
    course["units"][0]["kcs"][0]["forms"] = {ORTH: [FA_WORD]}
    diags, compiled = _compile(core_cli, tmp_path, course)
    assert not diags.errors
    kc = unit_json(compiled.units[0])["kcs"][0]
    assert [t["surface"] for t in kc["forms"][ORTH][0]["tokens"]] == [FA_VOCALIZED]
    assert compiled.written[(kc["id"], ORTH)] == [FA_WORD]


def test_morphs_are_cut_where_their_letters_are(core_cli: CoreCli, tmp_path: Path) -> None:
    course = copy.deepcopy(FA)
    course["vocalization"][0]["words"][HASTAM] = HASTAM_MARKED
    text = f"{FA_WORD} {HASTAM}"
    morphs = [
        {"surface": HASTAM[:3], "kc": "sense:budan"},
        {"surface": HASTAM[3:], "kc": "sense:budan"},
    ]
    _with_sentence(
        course,
        text,
        [
            {"surface": FA_WORD, "sense": FA_WORD},
            {"surface": HASTAM, "sense": "budan", "morphs": morphs},
        ],
    )
    diags, compiled = _compile(core_cli, tmp_path, course)
    assert not diags.errors, [d.format() for d in diags.items]
    word = _tokens(compiled, 1)[2]
    assert word["surface"] == HASTAM_MARKED
    # The fatha on ت stays with its letter, in the first morph.
    assert [m["surface"] for m in word["morphs"]] == [HASTAM_MARKED[:-1], HASTAM_MARKED[-1]]
    assert "".join(m["surface"] for m in word["morphs"]) == word["surface"]


def test_a_word_cut_into_morphs_keeps_marks_its_morphs_write(
    core_cli: CoreCli, tmp_path: Path
) -> None:
    # الحمّام: the source writes the shadda, in the morph حمّام, and the vocalization gives the
    # fatha. Morphs are compared by their letters, so the word is marked, and its morphs too.
    course = copy.deepcopy(FA)
    shadda = "ّ"
    course["vocalization"][0]["words"][HASTAM] = HASTAM_MARKED
    written = HASTAM[:3] + shadda + HASTAM[3:]
    morphs = [
        {"surface": written[:4], "kc": "sense:budan"},
        {"surface": written[4:], "kc": "sense:budan"},
    ]
    _with_sentence(
        course,
        f"{FA_WORD} {written}",
        [
            {"surface": FA_WORD, "sense": FA_WORD},
            {"surface": written, "sense": "budan", "morphs": morphs},
        ],
    )
    diags, compiled = _compile(core_cli, tmp_path, course)
    assert not diags.errors, [d.format() for d in diags.items]
    word = _tokens(compiled, 1)[2]
    # ه takes its fatha; ت keeps the shadda the source wrote (a fatha alone would not include it).
    assert word["surface"] == f"ه{FATHA}ست{shadda}م"
    assert "".join(m["surface"] for m in word["morphs"]) == word["surface"]


def test_a_token_s_own_vocalization_wins(core_cli: CoreCli, tmp_path: Path) -> None:
    course = copy.deepcopy(FA)
    own = f"\u06a9{DAMMA}\u062a\u0627\u0628"
    course["units"][0]["sentences"][0]["forms"][ORTH]["tokens"][0]["vocalized"] = own
    diags, compiled = _compile(core_cli, tmp_path, course)
    assert not diags.errors
    assert [t["surface"] for t in _tokens(compiled)] == [own]


def test_an_ambiguous_word_with_its_own_vocalization_is_quiet(
    core_cli: CoreCli, tmp_path: Path
) -> None:
    course = copy.deepcopy(FA)
    course["vocalization"][0].update(
        words={}, ambiguous={FA_WORD: [FA_VOCALIZED, f"\u06a9{DAMMA}\u062a\u0627\u0628"]}
    )
    course["units"][0]["sentences"][0]["forms"][ORTH]["tokens"][0]["vocalized"] = FA_VOCALIZED
    diags, compiled = _compile(core_cli, tmp_path, course)
    assert [d.format() for d in diags.items] == []
    assert [t["surface"] for t in _tokens(compiled)] == [FA_VOCALIZED]


def test_a_partly_marked_word_keeps_its_marks_and_takes_the_rest(
    core_cli: CoreCli, tmp_path: Path
) -> None:
    # kitab-e: the source writes the ezafe kasra; the word takes the rest of its marks
    course = copy.deepcopy(FA)
    ezafe = FA_WORD + KASRA
    form = course["units"][0]["sentences"][0]["forms"][ORTH]
    form.update(text=ezafe, tokens=[{"surface": ezafe, "sense": FA_WORD}], reverse=FA_WORD)
    diags, compiled = _compile(core_cli, tmp_path, course)
    assert not diags.errors, [d.format() for d in diags.items]
    assert [t["surface"] for t in _tokens(compiled)] == [FA_VOCALIZED + KASRA]
    assert compiled.written[("s.1", ORTH)] == [ezafe]


def test_a_letter_s_own_marks_give_way_to_more_of_the_same(
    core_cli: CoreCli, tmp_path: Path
) -> None:
    # A shadda written in the source, and a vocalization with a fatha and that shadda.
    course = copy.deepcopy(FA)
    shadda = "\u0651"
    full = unicodedata.normalize("NFC", f"\u06a9{KASRA}\u062a{FATHA}{shadda}\u0627\u0628")
    course["vocalization"][0]["words"] = {FA_WORD: full}
    written = f"\u06a9\u062a{shadda}\u0627\u0628"
    form = course["units"][0]["sentences"][0]["forms"][ORTH]
    form.update(text=written, tokens=[{"surface": written, "sense": FA_WORD}], reverse=FA_WORD)
    diags, compiled = _compile(core_cli, tmp_path, course)
    assert not diags.errors, [d.format() for d in diags.items]
    assert [t["surface"] for t in _tokens(compiled)] == [full]


def test_voices_read_the_text_as_written(core_cli: CoreCli, tmp_path: Path) -> None:
    course = copy.deepcopy(FA)
    course["units"][0]["kcs"][0]["forms"] = {ORTH: [FA_WORD]}
    _, compiled = _compile(core_cli, tmp_path, course)
    voice = AudioVoice.model_validate(
        {
            "id": "narrator",
            "provider": "espeak-ng",
            "voice": "fa",
            "orthography": ORTH,
            "reading": "text",
            "license": "CC0-1.0",
        }
    )
    items, _ = plan(compiled.units, voice, compiled.written)
    assert {i.item: i.input for i in items} == {"s.1": FA_WORD, f"sense:{FA_WORD}": FA_WORD}
    # Without what was written, the voice would read the marks.
    items, _ = plan(compiled.units, voice)
    assert {i.input for i in items} == {FA_VOCALIZED}


def _row(shown: str, corrected: str) -> SentenceCorrection:
    return SentenceCorrection.model_validate(
        {
            "id": "00000000-0000-4000-8000-000000000001",
            "course": "fa",
            "orthography": ORTH,
            "support": "en",
            "bundle": "0" * 64,
            "item": "s.1",
            "shown": {"forms": {ORTH: {"text": shown}}},
            "correction": {"forms": {ORTH: {"text": corrected}}},
            "notes": [],
            "status": "pending",
            "reports": 1,
            "createdAt": "2026-11-04T00:00:00Z",
        }
    )


def _course_dir(tmp_path: Path) -> Path:
    courses = tmp_path / "courses"
    units = courses / "fa" / "units"
    units.mkdir(parents=True)
    unit = copy.deepcopy(FA["units"][0])
    (units / "basics.yaml").write_text(yamlio.dump(unit), encoding="utf-8")
    return courses


def test_corrections_compare_letters_and_leave_marks_to_the_vocalization(
    tmp_path: Path,
) -> None:
    courses = _course_dir(tmp_path)
    # The learner saw kitab and wrote kebab: the source gets the letters alone.
    kebab = "\u06a9\u0628\u0627\u0628"
    out = apply([_row(FA_VOCALIZED, f"\u06a9{KASRA}\u0628\u0627\u0628")], courses, None)
    assert [s.reason for s in out.skipped] == []
    written = next(iter(out.files.values()))
    assert f"text: {kebab}" in written
    assert any("vowel marks" in c for a in out.applied for c in a.checks)


def test_a_correction_of_marks_alone_is_left_for_a_person(tmp_path: Path) -> None:
    courses = _course_dir(tmp_path)
    out = apply([_row(FA_VOCALIZED, f"\u06a9{DAMMA}\u062a\u0627\u0628")], courses, None)
    assert out.applied == []
    assert "only vowel marks" in out.skipped[0].reason
