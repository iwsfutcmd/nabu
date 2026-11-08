"""The Tiberian reading of Biblical Hebrew as IPA and as eSpeak NG phonemes (ADR 0081)."""

from __future__ import annotations

import pytest

from nabu.audio import espeak, tiberian


@pytest.mark.parametrize(
    ("reading", "ipa"),
    [
        # Vocal shewa is [a] (bərēʾšîṯ), quiescent ʾalef is silent, spirants after vowels.
        ("bərēʾšîṯ", "băreːˈʃiːθ"),
        # Non-final stress where the acute marks it; a doubled letter is long.
        ("haššāmáyim", "haʃʃɔːˈmaːjim"),
        ("wayyṓʾmer", "vajˈjoːmɛr"),
        ("ʾéreṣ", "ˈʔɛːrɛsˤ"),
        # Shewa takes the vowel after a guttural, and is [i] before y.
        ("yəhî", "jĭˈhiː"),
        ("bəyôm", "bĭˈjoːm"),
        # A furtive pataḥ is a short glide, never stressed.
        ("rûaḥ", "ˈruːaħ"),
        # A final mater h is silent; so is the y of -āyw.
        ("śāḏeh", "sɔːˈðɛː"),
        ("sûsāyw", "suːˈsɔːv"),
        # Qamets qatan is [ɔ], short in its closed syllable; a maqaf-bound word has no stress.
        ("ḥoḵmâ", "ħɔxˈmɔː"),
        ("kol-", "kɔl"),
        # The divine name is read as the Masoretes read it.
        ("ʾăḏōnāy", "ʔăðoːˈnɔːj"),
    ],
)
def test_ipa(reading: str, ipa: str) -> None:
    assert tiberian.ipa(reading) == ipa


def test_espeak_phonemes_use_the_arabic_table() -> None:
    assert tiberian.espeak("wayyṓʾmer") == "[[vaj:'o:mer]]"
    assert tiberian.espeak("ʾĕlōhîm") == "[[?elo:h'i:m]]"
    # ḥet, ʿayin, ṭet, ṣade and qof are the table's own.
    assert tiberian.espeak("ḥṓšeḵ") == "[[H'o:Sex]]"
    assert tiberian.espeak("ʿal-") == "[[Aal]]"
    assert tiberian.espeak("ṭôḇ") == "[[t['o:v]]"
    assert tiberian.espeak("hāʾā́reṣ") == "[[ha.:?'a.:res[]]"
    assert tiberian.espeak("qôl") == "[[q'o:l]]"


def test_a_letter_outside_the_scheme_is_refused() -> None:
    with pytest.raises(ValueError, match="tiberian scheme"):
        tiberian.ipa("chalom")  # c, f, v: not letters of the scheme (ḵ, p̄, w)


@pytest.mark.skipif(not espeak.available(), reason="needs espeak-ng (apt install espeak-ng)")
def test_every_phoneme_is_one_the_voice_knows() -> None:
    """eSpeak NG drops an unknown mnemonic without a word: each one the scheme can produce must
    come out as sound, and a word gets a word event of its own."""
    readings = ["bərēʾšîṯ", "haššāmáyim", "wəhāʾā́reṣ", "ḥōšeḵ", "ṭôḇ", "ṣōʾn", "qôl", "ʿal-",
                "p̄ənê", "ḡam", "ʾăḏōnāy", "yiṣḥāq", "ʾĕlōhîm", "ḥoḵmâ", "ʾattâ"]  # fmt: skip
    text = " ".join(tiberian.espeak(r) for r in readings)
    said = espeak.synthesize(text + ".", "ar")
    assert len(said.words) == len(readings)
    for r in readings:
        one = espeak.synthesize(tiberian.espeak(r), "ar")
        assert one.duration_ms > 150, r
