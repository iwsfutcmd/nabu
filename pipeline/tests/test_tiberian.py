"""The Tiberian reading of Biblical Hebrew as IPA, as eSpeak NG phonemes (ADR 0082, 0084) and
as the Arabic-bent IPA of the Piper voice (ADR 0089)."""

from __future__ import annotations

import pytest

from nabu.audio import espeak, tiberian


@pytest.mark.parametrize(
    ("reading", "ipa"),
    [
        # Khan's transcriptions (vol. I, ADR 0084), with a breve on the reduced vowels.
        # Vocal shewa is [a]; quiescent ʾalef is silent; resh is uvular; a long vowel in a closed
        # syllable ends in an echo of itself (Gen 1:1, p. 615).
        ("bərēʾšîṯ", "băʀ̟eːˈʃiːiθ"),
        # Non-final stress where the acute marks it; a doubled letter is long; doubled yod is [ɟɟ].
        ("haššāmáyim", "haʃʃɔːˈmaːjim"),
        ("wayyṓʾmer", "vaɟˈɟoːmɛʀ̟"),
        ("ʾéreṣ", "ˈʔɛːʀ̟ɛsˤ"),
        # Shewa takes the vowel after a guttural, and is [i] before y.
        ("yəhî", "jĭˈhiː"),
        ("bəyôm", "bĭˈjoːom"),
        # A furtive pataḥ is short and never stressed, with a glide from the vowel before it.
        ("rûaḥ", "ˈʀ̟uːwaħ"),
        ("rāqîaʿ", "ʀ̟ɔːˈqiːjaʕ"),
        # A final mater h is silent; so is the y of -āyw.
        ("śāḏeh", "sɔːˈðɛː"),
        ("sûsāyw", "suːˈsɔːɔv"),
        # Qamets qatan is [ɔ], short in its closed syllable; ḵ is uvular; a maqaf-bound word has no
        # stress, but its long vowels stay long; k p t with dagesh are aspirated.
        ("ḥoḵmâ", "ħɔχˈmɔː"),
        ("kol-", "kʰɔl"),
        ("bêṯ-", "beːeθ"),
        ("mittáḥaṯ", "mitˈtʰaːħaθ"),
        # The divine name is read as the Masoretes read it.
        ("ʾăḏōnāy", "ʔăðoːˈnɔːɔj"),
        # Shewa is silent after a long vowel (§I.2.5.6, p. 347), unless the same letter follows
        # (§I.2.5.7.3); and silent under the first of two like letters after a short vowel (p. 352).
        ("šāmərû", "ʃɔːɔmˈʀ̟uː"),
        ("yāḏəḵā", "jɔːɔðˈχɔː"),
        ("hāyəṯâ", "hɔːɔjˈθɔː"),
        ("sāḇəḇû", "sɔːvăˈvuː"),
        ("hinənî", "hinˈniː"),
        # Conjunctive û- is a short [wu], and the shewa after it is silent (pp. 176–178).
        ("ûḇên", "wuˈveːen"),
        ("ûḇəmôšaḇ", "wuvmoːˈʃaːav"),
        # Resh is [rˤ] after an alveolar, or before l or n (§I.1.20).
        ("yiśrāʾēl", "jisrˤɔːˈʔeːel"),
        ("mazrîaʿ", "mazˈrˤiːjaʕ"),
        # No doubling at the end of a word (p. 415).
        ("ʾatt", "ˈʔaːatʰ"),
    ],
)
def test_ipa(reading: str, ipa: str) -> None:
    assert tiberian.ipa(reading) == ipa


def test_espeak_phonemes_use_the_arabic_table() -> None:
    # Resh is the table's trill R (its r is an approximant); a doubled yod is J; ḵ is X.
    assert tiberian.espeak("wayyṓʾmer") == "[[vaJ:'o:meR]]"
    assert tiberian.espeak("ʾĕlōhîm") == "[[?elo:h'i:m]]"
    # ḥet, ʿayin, ṭet, ṣade and qof are the table's own.
    assert tiberian.espeak("ḥṓšeḵ") == "[[H'o:SeX]]"
    assert tiberian.espeak("ʿal-") == "[[Aal]]"
    assert tiberian.espeak("ṭôḇ") == "[[t['o:v]]"
    assert tiberian.espeak("hāʾā́reṣ") == "[[ha.:?'a.:Res[]]"
    assert tiberian.espeak("qôl") == "[[q'o:l]]"
    # Aspiration is IPA only: eSpeak's # modifier cuts the word short.
    assert tiberian.espeak("kol-") == "[[ka.l]]"
    assert tiberian.espeak("mittáḥaṯ") == "[[mit:'a:HaT]]"


@pytest.mark.parametrize(
    ("reading", "said"),
    [
        # The Arabic-bent reading of the Piper voice (ADR 0089): Khan's vowels and stress (shewa
        # [a], a long vowel in a closed syllable without its echo), the stress mark before the
        # vowel as in the voice's training transcripts, resh an alveolar [r].
        ("bərēʾšîṯ", "[[bareːʃˈiːθ]]"),
        ("hāʾā́reṣ", "[[hɔːʔˈɔːrɛs̪]]"),
        # Vav is [w] (ḇ stays [v]); a doubled yod is [jj]; a doubled letter is written twice.
        ("wayyṓʾmer", "[[wajjˈoːmɛr]]"),
        ("ûḇên", "[[wuvˈeːn]]"),
        ("haššāmáyim", "[[haʃʃɔːmˈaːjim]]"),
        # ṭ and ṣ are the Arabic emphatics t̪ s̪ and colour the vowel after them ("."); qof is [q].
        ("ṭôḇ", "[[t̪ˈo.ːv]]"),
        ("yiṣḥāq", "[[jis̪ħˈɔːq]]"),
        ("qôl", "[[qˈoːl]]"),
        # All six spirants, ḡ as ghayn; stops unaspirated.
        ("ḡam", "[[ɣˈaːm]]"),
        ("ḥoḵmâ", "[[ħɔχmˈɔː]]"),
        ("mittáḥaṯ", "[[mittˈaːħaθ]]"),
        ("ʾăḏōnāy", "[[ʔaðoːnˈɔːj]]"),
        # A furtive pataḥ keeps its glide.
        ("rûaḥ", "[[rˈuːwaħ]]"),
    ],
)
def test_piper_phonemes_are_arabic_bent(reading: str, said: str) -> None:
    assert tiberian.piper(reading) == said


def test_piper_phonemes_split_for_the_aligner() -> None:
    """Forced alignment (nabu audio align) reads a Piper word's IPA itself, not through eSpeak."""
    from nabu.audio.course import ipa_phones

    assert ipa_phones(tiberian.piper("haššāmáyim")) == [
        "h",
        "a",
        "ʃ",
        "ɔː",
        "m",
        "aː",
        "j",
        "i",
        "m",
    ]
    assert ipa_phones(tiberian.piper("ṭôḇ")) == ["t̪", "o.ː", "v"]


def test_a_letter_outside_the_scheme_is_refused() -> None:
    with pytest.raises(ValueError, match="tiberian scheme"):
        tiberian.ipa("chalom")  # c, f, v: not letters of the scheme (ḵ, p̄, w)


@pytest.mark.skipif(not espeak.available(), reason="needs espeak-ng (apt install espeak-ng)")
def test_every_phoneme_is_one_the_voice_knows() -> None:
    """eSpeak NG drops an unknown mnemonic without a word: each one the scheme can produce must
    come out as sound, and a word gets a word event of its own."""
    readings = ["bərēʾšîṯ", "haššāmáyim", "wəhāʾā́reṣ", "ḥōšeḵ", "ṭôḇ", "ṣōʾn", "qôl", "ʿal-",
                "p̄ənê", "ḡam", "ʾăḏōnāy", "yiṣḥāq", "ʾĕlōhîm", "ḥoḵmâ", "ʾattâ", "wayyṓʾmer",
                "rûaḥ", "kol-", "ûḇên", "mittáḥaṯ", "pə", "yiśrāʾēl"]  # fmt: skip
    text = " ".join(tiberian.espeak(r) for r in readings)
    # Each in a fresh process, as the provider synthesizes: eSpeak carries state between utterances.
    jobs = [espeak.Job(text + ".", "ar"), *(espeak.Job(tiberian.espeak(r), "ar") for r in readings)]
    said, *ones = espeak.synthesize_all(jobs)
    assert len(said.words) == len(readings)
    for r, one in zip(readings, ones, strict=True):
        assert one.duration_ms > 150, r
