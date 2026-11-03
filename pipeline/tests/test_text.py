"""Compiler text helpers."""

from __future__ import annotations

from nabu.compiler import text as tx


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
