"""The full stop a `finalStop` voice gets (ADR 0063)."""

from __future__ import annotations

import pytest
import regex
from hypothesis import given
from hypothesis import strategies as st

from nabu.audio.course import plan
from nabu.audio.punctuation import full_stop, with_final_stop
from nabu.compiler import compile_course
from nabu.schema.models import AudioVoice

from .conftest import ROOT, CoreCli


@pytest.mark.parametrize(
    ("tag", "stop"),
    [
        ("uz-Latn", "."),
        ("uz-Cyrl", "."),
        ("fa-Arab", "."),
        ("apc-Arab", "."),
        ("ur-Arab", "۔"),  # Urdu's own full stop, though its script is Arabic
        ("yue-Hant-HK", "。"),
        ("cmn-Hans-CN", "。"),
        ("hi-Deva", "।"),
        ("hy-Armn", "։"),
        ("am-Ethi", "።"),
        ("th-Thai", None),  # Thai ends sentences with no mark
        ("uz", None),  # no script subtag: nothing to go by
        ("xx-Zzzz", None),
    ],
)
def test_the_stop_follows_the_script(tag: str, stop: str | None) -> None:
    assert full_stop(tag) == stop


@pytest.mark.parametrize(
    ("text", "tag", "expected"),
    [
        ("salom", "uz-Latn", "salom."),
        ("Salom!", "uz-Latn", "Salom!"),
        ("Ismingiz nima?", "uz-Latn", "Ismingiz nima?"),
        ("學生", "yue-Hant-HK", "學生。"),
        ("拜拜！", "yue-Hant-HK", "拜拜！"),
        ("سلام", "fa-Arab", "سلام."),
        ("خوبی؟", "fa-Arab", "خوبی؟"),
        ("«salom»", "uz-Latn", "«salom»"),  # a closing quote ends it
        ("salom ", "uz-Latn", "salom. "),  # the stop goes before trailing spaces
        ("سلام\u200f", "fa-Arab", "سلام.\u200f"),  # and before trailing bidi marks
        ("12", "uz-Latn", "12"),  # "12." would be an ordinal
        ("สวัสดี", "th-Thai", "สวัสดี"),
        ("", "uz-Latn", ""),
        ("\u00ad", "uz-Latn", "\u00ad"),  # only a format character: nothing to end
        (" \u200c ", "fa-Arab", " \u200c "),
    ],
)
def test_text_without_final_punctuation_gets_its_scripts_stop(
    text: str, tag: str, expected: str
) -> None:
    assert with_final_stop(text, tag) == expected


@given(st.text(), st.sampled_from(["uz-Latn", "yue-Hant-HK", "fa-Arab", "hi-Deva", "th-Thai"]))
def test_a_stop_is_added_at_most_once(text: str, tag: str) -> None:
    once = with_final_stop(text, tag)
    assert with_final_stop(once, tag) == once
    # Otherwise unchanged: the stop goes before any trailing spaces and format characters.
    tail = regex.compile(r"[\s\p{Cf}]*$")
    body, after = tail.sub("", text), tail.sub("", once)
    assert once == text or (
        after == body + (full_stop(tag) or "") and once[len(after) :] == text[len(body) :]
    )


def test_a_final_stop_voice_reads_word_cards_as_sentences(core_cli: CoreCli) -> None:
    _diags, compiled = compile_course(ROOT / "courses" / "uz", core_cli)
    assert compiled is not None
    base = {
        "id": "toshkent",
        "provider": "navoiy",
        "voice": "toshkent-f",
        "orthography": "uz-Latn/standard",
        "reading": "text",
        "license": "Apache-2.0",
    }
    plain = {i.item: i for i in plan(compiled.units, AudioVoice.model_validate(base))[0]}
    stopped = {
        i.item: i
        for i in plan(compiled.units, AudioVoice.model_validate({**base, "finalStop": True}))[0]
    }
    assert plain.keys() == stopped.keys()
    assert (plain["sense:salom"].input, stopped["sense:salom"].input) == ("salom", "salom.")
    # A sentence keeps its own punctuation, and its token spans.
    assert stopped["s.1"].input == plain["s.1"].input == "Salom!"
    assert stopped["s.1"].spans == plain["s.1"].spans
    assert all(
        s.input == p.input or s.input == p.input + "."
        for p, s in zip(plain.values(), stopped.values(), strict=True)
    )
