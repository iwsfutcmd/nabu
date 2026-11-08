"""Pointed Biblical Hebrew → its Tiberian reading (ADR 0081), as the hbo course pins them."""

from __future__ import annotations

import unicodedata

import pytest
from typer.testing import CliRunner

from nabu.audio.pointing import reading, strip_accents
from nabu.cli import app

# Accents are written as escapes: merkha U+05A5, tipha U+0596, atnah U+0591, munah U+05A3,
# silluq-meteg U+05BD.
M, T, A, U, S = "֥", "֖", "֑", "֣", "ֽ"


def nfc(s: str) -> str:
    return unicodedata.normalize("NFC", s)


@pytest.mark.parametrize(
    ("word", "bound", "expected", "stress"),
    [
        # The accent decides the stress: wayyṓʾmer (merkha on yod), haššāmáyim (tipha on mem).
        (f"וַיֹּ{M}אמֶר", False, "wayyṓʾmer", "accent"),
        (f"הַשָּׁמַ{T}יִם", False, "haššāmáyim", "accent"),
        (f"בְּרֵאשִׁ{T}ית", False, "bərēʾšîṯ", "accent"),
        # Stress retraction kept from the text: qā́rāʾ before láylâ (Gen 1:5).
        (f"קָ{U}רָא", False, "qā́rāʾ", "accent"),
        # A pausal qamets with the accent is long, and the syllable it heads may close.
        (f"לָ{A}יְלָה", False, "lā́ylâ", "accent"),
        # Meteg makes the qamets long and the shewa vocal; without it, qamets qatan.
        (f"שָׁ{S}מְרוּ", False, "šāmərû", "rules"),
        ("חָכְמָה", False, "ḥoḵmâ", "rules"),
        # Before maqaf: no stress of its own, qamets qatan in kol-.
        ("כָּל", True, "kol-", "bound"),
        ("אֶת", True, "ʾeṯ-", "bound"),
        # Matres, furtive pataḥ, mappiq, dagesh forte.
        ("רוּחַ", False, "rûaḥ", "rules"),
        ("לָהּ", False, "lāh", "rules"),
        ("אִשָּׁה", False, "ʾiššâ", "rules"),
        # Read otherwise than written: the divine name and the Pentateuch's הִוא.
        ("יְהוָה", False, "ʾăḏōnāy", "special"),
        ("לַיהוָה", False, "laʾḏōnāy", "special"),
        ("הִוא", False, "hîʾ", "special"),
    ],
)
def test_reading(word: str, bound: bool, expected: str, stress: str) -> None:
    r = reading(nfc(word), bound=bound)
    assert r.text == nfc(expected)
    assert r.stress == stress


def test_accents_are_not_part_of_the_written_form() -> None:
    assert strip_accents(nfc(f"וַ{S}יֹּ{M}אמֶר")) == nfc("וַיֹּאמֶר")


def test_the_command_reads_words_joined_by_maqaf_as_one_unit() -> None:
    result = CliRunner().invoke(app, ["tiberian", nfc("אֶת־הָאוֹר")])
    assert result.exit_code == 0, result.output
    lines = [line.split("\t") for line in result.output.strip().split("\n")]
    assert [line[1] for line in lines] == ["ʾeṯ-", "hāʾôr"]
    assert lines[1][2] == "hɔːˈʔoːr"
