"""yue in Jyutping (ADR 0126): written from the characters' pinned readings, never by hand.

`nabu jyutping` writes the yue-Latn/jyutping form of every Hant form (text, tokens with their
characters as ruby, accept sets), every spelling in the lexicon and every character name; the
compiler checks each sentence's agrees, and the course's are up to date."""

from __future__ import annotations

import re
import shutil
from pathlib import Path
from typing import Any

import pytest

from nabu import jyutping
from nabu.compiler import compile_course

from .conftest import ROOT, CoreCli
from .test_courses import build, sentences

HANT = "yue-Hant-HK/standard"
LATN = "yue-Latn/jyutping"


def token(surface: str, reading: str, lexeme: str | None = None, **extra: Any) -> dict[str, Any]:
    t: dict[str, Any] = {"surface": surface, "readings": {"jyutping": reading}, **extra}
    if lexeme is not None:
        t["lexeme"] = lexeme
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
        "lexeme": "學生",
        "readings": {"characters": "學生"},
    }


def test_the_lexemes_a_token_writes_keep_their_share_of_the_syllables() -> None:
    written = [{"lexeme": "我", "surface": "我", "base": True}, {"lexeme": "pl", "surface": "哋"}]
    _, [t] = jyutping.latin_form("我哋", [token("我哋", "ngo5 dei6", lexemes=written)])
    # The lexemes make up the token: the space goes with the first.
    assert t["lexemes"] == [
        {"lexeme": "我", "surface": "ngo5 ", "base": True},
        {"lexeme": "pl", "surface": "dei6"},
    ]
    assert t["readings"] == {"characters": "我哋"}


def test_a_lexeme_read_alone_and_in_a_token_of_several_is_counted_both_ways() -> None:
    lex = jyutping.Lexicon()
    lex.add(token("我", "ngo5", "我"))
    written = [{"lexeme": "我", "surface": "我", "base": True}, {"lexeme": "pl", "surface": "哋"}]
    lex.add(token("我哋", "ngo5 dei6", lexemes=written))
    assert lex.lexemes["lexeme:我"] == {"ngo5": 2, "ngo5 dei6": 1}
    assert lex.lexemes["lexeme:pl"] == {"dei6": 1}


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
    """`nabu jyutping ../courses/yue --check`: every unit and the lexicon as the characters
    write them."""
    files = jyutping.rewrite_course(ROOT / "courses" / "yue")
    assert ROOT / "lexicons" / "yue" / "lexemes.yaml" in [f.path for f in files]
    for f in files:
        assert f.new == f.old, f"run `nabu jyutping`: {f.path}"


LEXICON = """language: yue
lexemes:
- id: lexeme:我
  pos: PRON
  gloss: {en: I}
  spelled: {yue-Hant-HK/standard: [我]}
- id: lexeme:pl
  realises: {Number: Plur}
  allomorphs:
  - {spelled: {yue-Hant-HK/standard: [哋], yue-Latn/jyutping: [dei1]}}
- id: lexeme:學生
  pos: NOUN
  spelled:
    yue-Hant-HK/standard: [學生]
    yue-Latn/jyutping: [hok6 saang1]
"""


def test_a_lexicon_spelling_is_written_as_the_tokens_of_its_lexeme_read_it() -> None:
    lex = jyutping.Lexicon()
    written = [{"lexeme": "我", "surface": "我", "base": True}, {"lexeme": "pl", "surface": "哋"}]
    lex.add(token("我哋", "ngo5 dei6", lexemes=written))
    lex.add(token("學生", "hok6 saang1", "學生"))
    new, _ = jyutping.rewrite_lexicon(LEXICON, lex)
    # Added where missing, mended where wrong, and every other line as it was.
    assert new == LEXICON.replace(
        "spelled: {yue-Hant-HK/standard: [我]}",
        "spelled: {yue-Hant-HK/standard: [我], yue-Latn/jyutping: [ngo5]}",
    ).replace("yue-Latn/jyutping: [dei1]", "yue-Latn/jyutping: [dei6]")
    assert jyutping.rewrite_lexicon(new, lex)[0] == new


def test_a_lexical_form_is_written_beside_the_spelling_where_the_language_has_a_notation() -> None:
    """With `forms` (lexicons/yue/language.yaml declares a notation): each entry's and allomorph's
    form, each character followed by its syllable, from the reading of its Jyutping spelling;
    added before `spelled`, mended where it says otherwise, left where it is right. Without:
    none."""
    lex = jyutping.Lexicon()
    written = [{"lexeme": "我", "surface": "我", "base": True}, {"lexeme": "pl", "surface": "哋"}]
    lex.add(token("我哋", "ngo5 dei6", lexemes=written))
    lex.add(token("學生", "hok6 saang1", "學生"))
    hant = "  spelled:\n    yue-Hant-HK/standard: [學生]"
    source = LEXICON.replace(hant, f"  form: 學hok6生saang6\n{hant}")
    new, _ = jyutping.rewrite_lexicon(source, lex, forms=True)
    spelled = "spelled: {yue-Hant-HK/standard: [我], yue-Latn/jyutping: [ngo5]}"
    assert f"  gloss: {{en: I}}\n  form: 我ngo5\n  {spelled}" in new
    assert "  - {form: 哋dei6, spelled: {yue-Hant-HK/standard: [哋]" in new
    assert f"  form: 學hok6生saang1\n{hant}" in new
    assert jyutping.rewrite_lexicon(new, lex, forms=True)[0] == new
    assert jyutping.lexical_form("學生", "hok6 saang1") == "學hok6生saang1"
    assert jyutping.lexical_form("學生", "hok6") is None
    assert "form:" not in jyutping.rewrite_lexicon(LEXICON, lex)[0]


def test_every_yue_sentence_and_word_is_in_both_orthographies(core_cli: CoreCli) -> None:
    _, compiled = build(core_cli, "yue")
    assert compiled.orthographies == [HANT, LATN]
    for s in sentences(compiled):
        assert sorted(s["forms"]) == [HANT, LATN], s["id"]
        assert "reverse" in s["forms"][LATN], s["id"]
        for t in s["forms"][LATN]["text"]["tokens"]:
            if t["kind"] != "lexical":
                continue
            # Each syllable carries its character: the ruby makes up the word above and below.
            segments = t["ruby"]["characters"]
            assert "".join(seg["base"] for seg in segments) == t["surface"], s["id"]
            assert "".join(seg["text"] for seg in segments) == t["readings"]["characters"]
    for lexeme in compiled.lexicon.lexemes:
        if HANT in (lexeme.forms or {}):
            assert LATN in (lexeme.forms or {}), lexeme.id


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
    data, n = re.subn(r"(?m)^units:\n(- .*\n)+", "", data)
    assert n == 1
    head, _, _ = data.partition("\naudio:")
    path.write_text(head + "\nunits: [units/intro.yaml]\n", encoding="utf-8")
    (tmp_path / "images").symlink_to(ROOT / "courses" / "images")
    # The language's lexicon, read where the compiler looks for it: beside the course.
    (tmp_path / "lexicons").symlink_to(ROOT / "lexicons")
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
