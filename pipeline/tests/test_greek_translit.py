"""Polytonic Greek in Latin letters (ADR 0088): nabu.greek_translit."""

from __future__ import annotations

import pytest

from nabu import greek_translit as g


@pytest.mark.parametrize(
    ("greek", "latin"),
    [
        ("ἄνθρωπος", "anthrōpos"),  # η ω with macrons; θ th; accents left out
        ("ψυχή", "psychē"),  # υ alone is y
        ("οὐκ", "ouk"),  # υ in a diphthong is u
        ("αὐτός", "autos"),
        ("ηὗρον", "hēuron"),
        ("οἱ", "hoi"),  # a diphthong's rough breathing comes first
        ("εὑρίσκω", "heuriskō"),
        ("υἱός", "huios"),
        ("ὑμεῖς", "hymeis"),
        ("ῥῆμα", "rhēma"),
        ("Ῥόδος", "Rhodos"),
        ("Αἱ", "Hai"),
        ("τῷ", "tōi"),  # the iota subscript is written out
        ("χώρᾳ", "chōrai"),
        ("ἄγγελος", "angelos"),  # γ before a velar is n
        ("Σωκράτης", "Sōkratēs"),
        ("ἀλλ’", "all’"),
        ("ἀΐω", "aiō"),  # a diaeresis: two vowels
    ],
)
def test_word(greek: str, latin: str) -> None:
    assert g.word(greek) == latin


def test_text_punctuation() -> None:
    assert g.text("ὦ Κρίτων; ἔτι νύξ· ναί.") == "ō Kritōn? eti nyx; nai."
