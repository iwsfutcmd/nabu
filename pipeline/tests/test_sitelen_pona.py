"""sitelen pona as the UCSUR encodes it, and Toki Pona's words as eSpeak NG phonemes (ADR 0086)."""

from __future__ import annotations

import pytest
from hypothesis import given
from hypothesis import strategies as st

from nabu import sitelen_pona as sp
from nabu.audio import toki_pona
from nabu.compiler import text as tx

SONJA = "sona olin nasin jan a"


def test_the_ucsur_block_holds_pu_then_ku_suli_in_order() -> None:
    assert len(sp.PU) == 120 and len(sp.KU_SULI) == 17
    assert sp.WORDS["a"] == "\U000f1900"
    assert sp.WORDS["wile"] == "\U000f1977"
    assert sp.WORDS["namako"] == "\U000f1978"
    assert sp.WORDS["ku"] == "\U000f1988"
    assert sp.WORDS["toki"] == "\U000f196c" and sp.WORDS["pona"] == "\U000f1954"
    # ali is written with ale's logograph; the logograph reads back as ale.
    assert sp.WORDS["ali"] == sp.WORDS["ale"] and sp.WORD_OF[sp.WORDS["ale"]] == "ale"


def test_words_run_together_and_sentences_are_an_ideographic_space_apart() -> None:
    assert sp.to_sitelen_pona("mi moku.") == sp.WORDS["mi"] + sp.WORDS["moku"]
    two = sp.to_sitelen_pona("toki! mi pona.")
    assert two == sp.WORDS["toki"] + "　" + sp.WORDS["mi"] + sp.WORDS["pona"]
    # Commas and the ! ? that o, a and seme carry go; the colon after ni stays.
    assert sp.to_sitelen_pona("sina pona ala pona?") == "".join(
        sp.WORDS[w] for w in ["sina", "pona", "ala", "pona"]
    )
    assert sp.to_sitelen_pona("ona li toki e ni: mi pona.") == "".join(
        sp.WORDS[w] for w in ["ona", "li", "toki", "e", "ni"]
    ) + ":" + "".join(sp.WORDS[w] for w in ["mi", "pona"])


def test_a_name_is_a_cartouche_of_its_letters() -> None:
    sonja = sp.cartouche(SONJA)
    assert sonja[0] == sp.CARTOUCHE_OPEN and sonja[-1] == sp.CARTOUCHE_CLOSE
    assert sp.spelled(sonja) == "sonja"
    assert sp.to_sitelen_pona("jan Sonja li pona.", {"Sonja": SONJA}) == (
        sp.WORDS["jan"] + sonja + sp.WORDS["li"] + sp.WORDS["pona"]
    )
    # The pinned cartouche itself may be given, as the compiler does.
    assert sp.to_sitelen_pona("jan Sonja.", {"Sonja": sonja}) == sp.WORDS["jan"] + sonja
    assert sp.spelled(sp.WORDS["jan"]) is None


@pytest.mark.parametrize(
    ("text", "names"),
    [("jan Sonja.", {}), ("mi moko.", {}), ("mi 2.", {}), ("jan Sonja.", {"Sonja": "sona ilo"})],
)
def test_what_has_no_sitelen_pona_is_an_error(text: str, names: dict[str, str]) -> None:
    with pytest.raises(sp.SitelenPonaError):
        sp.to_sitelen_pona(text, names)


def test_sitelen_pona_reads_back_as_sitelen_lasina() -> None:
    text = sp.to_sitelen_pona("toki! mi jan Sonja.", {"Sonja": SONJA})
    assert sp.to_sitelen_lasina(text) == "toki. mi jan Sonja."
    # Glyph variants read as their words.
    assert sp.to_sitelen_lasina(sp.WORDS["mi"] + "\U000f198a") == "mi ni."


@given(st.lists(st.sampled_from(sorted(sp.PU)), min_size=1, max_size=8))
def test_every_word_survives_the_round_trip(words: list[str]) -> None:
    sentence = " ".join(words) + "."
    assert sp.to_sitelen_lasina(sp.to_sitelen_pona(sentence)) == sentence


def test_a_word_is_one_logograph_or_one_cartouche() -> None:
    sonja = sp.cartouche(SONJA)
    tokens = tx.auto_tokens(sp.WORDS["jan"] + sonja + sp.WORDS["li"] + sp.WORDS["pona"])
    assert [t["surface"] for t in tokens] == [
        sp.WORDS["jan"],
        sonja,
        sp.WORDS["li"],
        sp.WORDS["pona"],
    ]
    assert all(t["kind"] == "word" for t in tokens)
    # A logograph carries its word as ruby; a cartouche (a name) does not.
    assert tx.ruby_bearing(sp.WORDS["toki"]) and not tx.ruby_bearing(sonja)


@pytest.mark.parametrize(
    ("word", "syllables", "phonemes"),
    [
        ("toki", ["to", "ki"], "[[t'oki]]"),
        ("akesi", ["a", "ke", "si"], "[['akesi]]"),
        ("linja", ["lin", "ja"], "[[l'inja]]"),
        ("kepeken", ["ke", "pe", "ken"], "[[k'epeken]]"),
        ("mun", ["mun"], "[[m'un]]"),
        ("n", ["n"], "[['n]]"),
        ("Sonja", ["son", "ja"], "[[s'onja]]"),
    ],
)
def test_toki_pona_words_are_said_as_phonemes_stressed_on_the_first_syllable(
    word: str, syllables: list[str], phonemes: str
) -> None:
    assert toki_pona.syllables(word) == syllables
    assert toki_pona.espeak(word) == phonemes


@pytest.mark.parametrize("word", ["kk", "toky", "", "pona!"])
def test_what_is_no_toki_pona_word_has_no_phonemes(word: str) -> None:
    with pytest.raises(toki_pona.TokiPonaPhonemeError):
        toki_pona.syllables(word)
