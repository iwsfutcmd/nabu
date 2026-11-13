"""Compiler text helpers."""

from __future__ import annotations

from typing import Any

import pytest

from nabu.compiler import text as tx
from nabu.compiler.build import Ctx, compile_form
from nabu.compiler.diagnostics import Diagnostics
from nabu.compiler.source import Doc
from nabu.schema.models import CourseSource, OrthographyProfile, SentenceForm

from .conftest import CoreCli


def test_word_internal_apostrophes_stay_in_the_word() -> None:
    """English contractions are one word, so one word-bank tile (I'm, name's, Let's)."""
    surfaces = [t["surface"] for t in tx.auto_tokens("I'm Aziz. My name’s Maryam. 'Hi'")]
    assert surfaces == [
        "I'm",
        " ",
        "Aziz",
        ".",
        " ",
        "My",
        " ",
        "name’s",
        " ",
        "Maryam",
        ".",
        " ",
        "'",
        "Hi",
        "'",
    ]


# --- Scripts come from Unicode ----------------------------------------------------------------


def compile_text(cli: CoreCli, lang: str, text: str) -> tuple[Diagnostics, dict[str, Any]]:
    """`text` as a sentence of a course in `lang`, through the compiler's stages 2 and 3 (tokens,
    ruby, the hygiene audits, the TaggedText invariants), with a profile no fixture course has."""
    orth = f"{lang}/standard"
    profile = OrthographyProfile.model_validate(
        {
            "id": orth,
            "lang": lang,
            "segmentation": {"content": "whitespace", "runtime": "grapheme"},
            "normalize": ["nfc"],
        }
    )
    course = CourseSource.model_validate(
        {
            "id": "scripts",
            "target": lang,
            "orthographies": [orth],
            "support": ["en-Latn/standard"],
            "units": ["units/never-read.yaml"],
        }
    )
    ctx = Ctx(Diagnostics(), cli, {orth: profile}, {}, {})
    tagged = compile_form(
        ctx, course, Doc("scripts.yaml", {}, {(): 1}), (), SentenceForm(text=text), orth
    )
    assert tagged is not None
    return ctx.diags, tagged


@pytest.mark.parametrize(
    ("lang", "text", "words"),
    [
        ("am-Ethi", "ሰላም ነው።", ["ሰላም", "ነው"]),
        ("ta-Taml", "வணக்கம்!", ["வணக்கம்"]),
        ("bn-Beng", "নমস্কার।", ["নমস্কার"]),
        ("syr-Syrc", "ܫܠܡܐ ܠܟ܂", ["ܫܠܡܐ", "ܠܟ"]),
    ],
)
def test_a_script_no_course_uses_compiles_clean(
    core_cli: CoreCli, lang: str, text: str, words: list[str]
) -> None:
    """Ethiopic, Tamil, Bengali and Syriac letters are their own scripts' (Unicode's Script
    Extensions), not foreign ones: nothing in the compiler lists the scripts it knows."""
    diags, tagged = compile_text(core_cli, lang, text)
    assert [d.format() for d in diags.items] == []
    assert [t["surface"] for t in tagged["tokens"] if t["kind"] == "word"] == words


@pytest.mark.parametrize(
    ("lang", "text", "foreign"),
    [
        # A Latin m closing an Ethiopic word.
        ("am-Ethi", "ሰላm ነው።", "m"),
        # A Cyrillic а in a Latin word.
        ("uz-Latn", "S" + chr(0x430) + "lom!", chr(0x430)),
        # An Arabic meem in a Syriac word.
        ("syr-Syrc", "ܫܠ" + chr(0x645) + "ܐ", chr(0x645)),
    ],
)
def test_a_letter_of_another_script_in_a_word_still_fires(
    core_cli: CoreCli, lang: str, text: str, foreign: str
) -> None:
    diags, _ = compile_text(core_cli, lang, text)
    hits = [d for d in diags.items if d.lint == "text.mixed-script"]
    assert len(hits) == 1 and f"mixes {foreign} into {lang.split('-')[1]} text" in hits[0].message


def test_script_subtags_name_unicode_scripts() -> None:
    assert tx.unicode_scripts("Ethi") == ("Ethi",)
    assert tx.unicode_scripts("Hant") == ("Hani",)
    assert tx.unicode_scripts("Jpan") == ("Hani", "Hira", "Kana")
    # A private-use script (sitelen pona) is what its profile says it is.
    assert tx.unicode_scripts("Qaap") is None


def test_presentation_forms_of_any_script_are_flagged(core_cli: CoreCli) -> None:
    """A ligature or a contextual form stands for other characters: content writes those. Not
    only Arabic's (lam-alef) but the Latin fi ligature too; the ornate parenthesis that
    Unicode lists among Arabic's presentation forms stands for nothing else."""
    fi, lam_alef, ornate = chr(0xFB01), chr(0xFEFB), chr(0xFD3E)
    diags, _ = compile_text(core_cli, "en-Latn", f"{fi}ne")
    assert [d.message for d in diags.items if d.lint == "text.non-canonical"] == [
        "uses presentation forms, not the characters they stand for: U+FB01"
    ]
    diags, _ = compile_text(core_cli, "ar-Arab", f"{lam_alef} {ornate}")
    assert [d.message for d in diags.items if d.lint == "text.non-canonical"] == [
        "uses presentation forms, not the characters they stand for: U+FEFB"
    ]
