"""Script tracks read letters and marks as the orthography's profile does (ADR 0124): no script's
letters, marks or final forms are written into the track's compiler."""

from __future__ import annotations

from nabu.compiler import load_profiles
from nabu.compiler.script import Reader, Spelled, grapheme

from .conftest import CoreCli

PROFILES = load_profiles()
ACUTE, BREVE = "́", "̆"
# Biblical Hebrew: dagesh, segol, shewa; מֶלֶךְ "king" (its kaf final), בַּיִת "house".
DAGESH, SEGOL, SHEWA = "ּ", "ֶ", "ְ"
MELEKH = f"מ{SEGOL}ל{SEGOL}ך{SHEWA}"
BAYIT = "בַּיִת"


def reader(cli: CoreCli, orth: str) -> Reader:
    return Reader.of(cli, orth, PROFILES[orth])


def test_greek_letters_are_folded_as_grading_folds_them(core_cli: CoreCli) -> None:
    """Σ and the final ς are σ (the profile's case fold); the accent is a mark of its set."""
    read = reader(core_cli, "grc-Grek/polytonic")
    spelled = read("Σωκράτης")
    assert spelled.letters == ("σ", "ω", "κ", "ρ", "α", "τ", "η", "σ")
    assert spelled.marks == {ACUTE}
    sigma = grapheme("grapheme:σ", ["σ", "ς", "Σ"], read)
    assert sigma is not None and sigma.spellings == {("σ",)}


def test_a_mark_its_profile_does_not_list_stays_part_of_the_letter(core_cli: CoreCli) -> None:
    """Cyrillic й and ў keep their breve (no Cyrillic profile counts it a mark); Spanish ñ keeps
    its tilde, while the acute of está is a mark of es-Latn/standard's set."""
    assert reader(core_cli, "uz-Cyrl/standard")("йўл").letters == ("й", "ў", "л")
    assert BREVE not in reader(core_cli, "uz-Cyrl/standard").marks
    spanish = reader(core_cli, "es-Latn/standard")
    assert spanish("niño").letters == ("n", "i", "ñ", "o")
    assert spanish("está") == Spelled(("e", "s", "t", "a"), frozenset({ACUTE}))


def test_a_profile_s_multigraphs_are_single_letters(core_cli: CoreCli) -> None:
    """Uzbek sh is one letter: a word with sh has no s (the profile's `letters`)."""
    read = reader(core_cli, "uz-Latn/standard")
    shahar = read("Shahar")
    assert shahar.letters == ("sh", "a", "h", "a", "r")
    sh, s = grapheme("grapheme:sh", ["sh", "Sh"], read), grapheme("grapheme:s", ["s", "S"], read)
    assert sh is not None and sh.occurs(shahar)
    assert s is not None and not s.occurs(shahar)


def test_a_letter_carrying_marks_of_the_set_is_the_mark(core_cli: CoreCli) -> None:
    """Hebrew's dagesh is a mark of hbo-Hebr/tiberian's set: a grapheme KC written בּ is the
    dagesh, in every word with one; its letter is ב."""
    read = reader(core_cli, "hbo-Hebr/tiberian")
    dagesh = grapheme("grapheme:dagesh", [f"ב{DAGESH}", f"כ{DAGESH}"], read)
    assert dagesh is not None and dagesh.marks == {DAGESH} and not dagesh.spellings
    assert dagesh.occurs(read(BAYIT)) and not dagesh.occurs(read(MELEKH))
    assert read(BAYIT).letters == ("ב", "י", "ת")


def test_a_final_form_listed_with_its_letter_spells_it(core_cli: CoreCli) -> None:
    """No fold makes Hebrew's final kaf ך a kaf: listed among the letter's forms, it spells it."""
    read = reader(core_cli, "hbo-Hebr/tiberian")
    king = read(MELEKH)
    assert king.letters == ("מ", "ל", "ך")
    assert king.marks == {SEGOL, SHEWA}
    kaf = grapheme("grapheme:kaf", ["כ", "ך"], read)
    assert kaf is not None and kaf.occurs(king)
    only_kaf = grapheme("grapheme:kaf", ["כ"], read)
    assert only_kaf is not None and not only_kaf.occurs(king)


def test_a_form_with_no_letter_is_no_grapheme(core_cli: CoreCli) -> None:
    """The rough breathing written as its spacing sign stands on no letter (script.no-letter)."""
    assert grapheme("grapheme:rough", ["῾"], reader(core_cli, "grc-Grek/polytonic")) is None
