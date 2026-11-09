"""Attic Greek readings as phonemes (ADR 0087): nabu.audio.attic."""

from __future__ import annotations

import unicodedata

import pytest

from nabu.audio import attic


def nfc(s: str) -> str:
    return unicodedata.normalize("NFC", s)


@pytest.mark.parametrize(
    ("reading", "ipa", "espeak"),
    [
        # Aspirated stops, never fricatives; η and ω open and long.
        (nfc("φῐ́λος"), "pʰílos", "[[ph'ilos]]"),
        (nfc("θεός"), "tʰeós", "[[t#e'os]]"),
        (nfc("χώρᾱ"), "kʰɔ́ːraː", "[[kh'O:Ra:]]"),
        # The rough breathing is [h]; ει and ου are long monophthongs.
        (nfc("ὁδός"), "hodós", "[[hod'os]]"),
        (nfc("εἰμῐ́"), "eːmí", "[[e:m'i]]"),
        (nfc("οὐκ"), "oːk", "[[o:k]]"),
        # Diphthongs: the breathing and the accent stand on the second vowel, the sound is one.
        (nfc("οἰκῐ́ᾱ"), "oikíaː", "[[oIk'ia:]]"),
        (nfc("αὐτός"), "autós", "[[aUt'os]]"),
        (nfc("εὑρῐ́σκω"), "heurískɔː", "[[heUR'iskO:]]"),
        # The iota subscript: a long diphthong, the ι said as a glide.
        (nfc("τῷ"), "tɔ̂ːi", "[[t'O:j]]"),
        (nfc("ᾄδω"), "áːidɔː", "[['a:jdO:]]"),
        # ζ is [zd]; γ before a velar is [ŋ]; doubled letters are long.
        (nfc("ζῷον"), "zdɔ̂ːion", "[[zd'O:jon]]"),
        (nfc("ᾰ̓γγελος"), "aŋgelos", "[[aNgelos]]"),
        (nfc("θᾰ́λᾰττᾰ"), "tʰálatta", "[[t#'alat:a]]"),
        # A grave, and an enclitic's second acute, are a secondary stress.
        (nfc("τὸν"), "tòn", "[[t,on]]"),
        (nfc("ᾰ̓́νθρωπός"), "ántʰrɔːpós", "[['ant#RO:p,os]]"),
        # An elided word keeps its consonants; the mark is silent.
        (nfc("ᾰ̓λλ’"), "all", "[[al:]]"),
    ],
)
def test_phonemes(reading: str, ipa: str, espeak: str) -> None:
    assert attic.ipa(reading) == nfc(ipa)
    assert attic.espeak(reading) == espeak


def test_surface_strips_quantities() -> None:
    assert attic.surface(nfc("θᾰ́λᾰττᾰ")) == nfc("θάλαττα")
    assert attic.surface(nfc("Σωκρᾰ́της")) == nfc("Σωκράτης")
    assert attic.surface(nfc("χώρᾱ")) == nfc("χώρα")


@pytest.mark.parametrize("reading", ["φίλος", "πόλις", "ἀγαθός", "Δαρεῖος x"])
def test_unmarked_length_cannot_be_said(reading: str) -> None:
    assert attic.unmarked(nfc(reading)) != []
    with pytest.raises(attic.AtticReadingError):
        attic.espeak(nfc(reading))


def test_settled_by_circumflex_and_subscript() -> None:
    # A circumflex or an iota subscript makes α, ι, υ long: no macron needed.
    assert attic.unmarked(nfc("πρᾶγμᾰ")) == []
    assert attic.unmarked(nfc("χώρᾳ")) == []
    assert attic.unmarked(nfc("μῦθος")) == []
