"""yue in Jyutping (ADR 0126): written from the characters' pinned readings, never by hand.

`nabu jyutping` writes the yue-Latn/jyutping form of every Hant form (text, tokens with their
characters as ruby, accept sets), every KC form and character name; the compiler checks each
sentence's agrees, and the course's are up to date."""

from __future__ import annotations

import shutil
from pathlib import Path
from typing import Any, cast

import pytest
import yaml

from nabu import jyutping
from nabu.compiler import compile_course

from .conftest import ROOT, CoreCli
from .test_courses import build, bundled, sentences

HANT = "yue-Hant-HK/standard"
LATN = "yue-Latn/jyutping"


def token(surface: str, reading: str, sense: str | None = None, **extra: Any) -> dict[str, Any]:
    t: dict[str, Any] = {"surface": surface, "readings": {"jyutping": reading}, **extra}
    if sense is not None:
        t["sense"] = sense
    return t


def test_a_form_is_its_words_readings_spaced_with_latin_punctuation() -> None:
    text, tokens = jyutping.latin_form(
        "係，我係學生。",
        [
            token("係", "hai6", "係"),
            token("我", "ngo5", "我"),
            token("係", "hai6", "係"),
            token("學生", "hok6 saang1", "學生"),
        ],
    )
    assert text == "hai6, ngo5 hai6 hok6 saang1."
    assert tokens[3] == {
        "surface": "hok6 saang1",
        "sense": "學生",
        "readings": {"characters": "學生"},
    }


def test_morphs_keep_their_share_of_the_syllables() -> None:
    morphs = [{"surface": "呢", "kc": "sense:呢"}, {"surface": "本", "kc": "sense:本"}]
    _, [t] = jyutping.latin_form("呢本", [token("呢本", "ni1 bun2", "呢", morphs=morphs)])
    # The morphs make up the word: the space goes with the first.
    assert [m["surface"] for m in t["morphs"]] == ["ni1 ", "bun2"]
    assert [m["kc"] for m in t["morphs"]] == ["sense:呢", "sense:本"]


def test_a_reading_that_does_not_line_up_is_refused() -> None:
    with pytest.raises(ValueError, match="does not line up"):
        jyutping.latin_form("學生", [token("學生", "hok6")])


def lexicon() -> jyutping.Lexicon:
    lex = jyutping.Lexicon()
    for t in [
        token("我哋", "ngo5 dei6", "我哋"),
        token("嘅", "ge3", "嘅"),
        token("名", "meng2", "名"),
        token("係", "hai6", "係"),
        token("後面", "hau6 min6", "後面"),
        token("後邊", "hau6 bin6", "後邊"),
        token("呀", "aa3", "呀"),
        token("呀", "aa4", "呀"),
    ]:
        lex.add(t)
    return lex


def test_an_accept_set_keeps_its_notation_and_collapses_spellings_said_alike() -> None:
    got = jyutping.latin_reverse("我(哋|地)嘅名", [token("名", "meng2")], lexicon())
    # 哋 and 地 are both dei6: one answer in Jyutping.
    assert got.text == "ngo5 dei6 ge3 meng2"


def test_typing_variants_read_as_the_word_they_stand_for() -> None:
    # 既 typed for 嘅 is ge3, not gei3; 係咪 is hai6 mai6.
    got = jyutping.latin_reverse("我(嘅|既)名\n係咪", [], lexicon())
    assert got.text == "ngo5 ge3 meng2\nhai6 mai6"


def test_a_particle_the_characters_cannot_tell_takes_both_readings_its_own_first() -> None:
    got = jyutping.latin_reverse("係[呀]", [token("呀", "aa4")], lexicon())
    assert got.text == "hai6 [(aa4|aa3)]"


def test_a_line_that_adds_no_answer_in_jyutping_is_left_out() -> None:
    got = jyutping.latin_reverse("後(面|邊)\n後便", [], lexicon())
    # 後便 is hau6 bin6, which the first line already gives.
    assert got.text == "hau6 (min6|bin6)"


def test_the_course_is_up_to_date() -> None:
    """`nabu jyutping ../courses/yue --check`: every unit as the characters write it."""
    units = sorted((ROOT / "courses" / "yue" / "units").glob("*.yaml"))
    lex = jyutping.lexicon_of(yaml.safe_load(u.read_text(encoding="utf-8")) for u in units)
    for unit in units:
        source = unit.read_text(encoding="utf-8")
        assert jyutping.rewrite_unit(source, lex)[0] == source, f"run `nabu jyutping`: {unit}"


def test_every_yue_sentence_and_word_is_in_both_orthographies(core_cli: CoreCli) -> None:
    _, compiled = build(core_cli, "yue")
    assert compiled.orthographies == [HANT, LATN]
    for s in sentences(compiled):
        assert sorted(s["forms"]) == [HANT, LATN], s["id"]
        assert "reverse" in s["forms"][LATN], s["id"]
        for t in s["forms"][LATN]["text"]["tokens"]:
            if t["kind"] != "word":
                continue
            # Each syllable carries its character: the ruby makes up the word above and below.
            segments = t["ruby"]["characters"]
            assert "".join(seg["base"] for seg in segments) == t["surface"], s["id"]
            assert "".join(seg["text"] for seg in segments) == t["readings"]["characters"]
    for unit in bundled(compiled):
        for kc in cast(list[dict[str, Any]], unit["kcs"]):
            if HANT in kc.get("forms", {}):
                assert LATN in kc["forms"], kc["id"]


def test_clip_timings_say_whose_tokens_they_time(core_cli: CoreCli) -> None:
    _, compiled = build(core_cli, "yue")
    timed = [c for item in compiled.audio_items.values() for c in item.values() if c.timings]
    assert timed and {c.orthography for c in timed} == {HANT}


@pytest.fixture
def intro(tmp_path: Path) -> Path:
    """The yue course's first unit, without audio."""
    course = tmp_path / "yue"
    shutil.copytree(ROOT / "courses" / "yue", course, ignore=shutil.ignore_patterns("audio"))
    path = course / "course.yaml"
    data = path.read_text(encoding="utf-8")
    lines = [ln for ln in data.split("\n") if not ln.startswith("units:")]
    head, _, _ = "\n".join(lines).partition("\naudio:")
    path.write_text(head + "\nunits: [units/intro.yaml]\n", encoding="utf-8")
    (tmp_path / "images").symlink_to(ROOT / "courses" / "images")
    return course


def test_a_jyutping_form_the_characters_do_not_give_is_reported(
    core_cli: CoreCli, intro: Path
) -> None:
    unit = intro / "units" / "intro.yaml"
    source = unit.read_text(encoding="utf-8")
    assert "      text: zou2 san4 aa3!\n" in source
    unit.write_text(
        source.replace("      text: zou2 san4 aa3!\n", "      text: zou2 san4 aa4!\n", 1),
        encoding="utf-8",
    )
    diags, _ = compile_course(intro, core_cli, audio=False)
    found = [d for d in diags.items if d.lint == "enrich.transliteration-mismatch"]
    assert found and "nabu jyutping" in found[0].message
