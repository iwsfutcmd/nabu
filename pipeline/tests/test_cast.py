"""Which voice of a course's cast reads each item (ADR 0078): at random, seeded by the item;
by grammar where a sentence or a story character says who speaks; a person's check keeps a
clip's voice."""

from __future__ import annotations

from nabu.audio.course import assignment, pick_voice
from nabu.schema.models import AudioVoice, BundleUnit

from .units import kc, line, question, sentence, story, unit


def voice(id_: str, speaker: str | None) -> AudioVoice:
    return AudioVoice.model_validate(
        {
            "id": id_,
            "provider": "espeak-ng",
            "voice": f"v-{id_}",
            "orthography": "apc-Arab/standard",
            "reading": "text",
            "license": "CC0-1.0",
            **({} if speaker is None else {"speaker": speaker}),
        }
    )


MAN, WOMAN = voice("man", "m"), voice("woman", "f")


def units(n: int = 200) -> list[BundleUnit]:
    said = [line(speaker=who) for who in ["maya", "sami", None, "sami", "maya", "sami"]]
    return [
        unit(
            sentences=[sentence(f"s.{i}") for i in range(n)]
            + [sentence("s.f", speaker="f"), sentence("s.m", speaker="m")],
            kcs=[kc(f"sense:w{i}") for i in range(n)],
            stories=[story("st", [*said, question()], {"maya": "f", "sami": None})],
        )
    ]


def test_one_voice_reads_everything_whoever_speaks() -> None:
    owner = assignment(units(), [MAN])
    assert set(owner.values()) == {"man"}
    assert owner["s.f"] == "man"  # a man's voice for a woman's words, while it is the only one


def test_grammar_first_then_chance() -> None:
    owner = assignment(units(), [MAN, WOMAN])
    assert (owner["s.f"], owner["s.m"]) == ("woman", "man")
    unmarked = [owner[f"s.{i}"] for i in range(200)] + [owner[f"sense:w{i}"] for i in range(200)]
    assert 0.4 < unmarked.count("woman") / len(unmarked) < 0.6
    assert assignment(units(), [WOMAN, MAN]) == owner  # the order of the cast does not matter


def test_a_story_character_keeps_one_voice() -> None:
    owner = assignment(units(), [MAN, WOMAN])
    maya = {owner[f"st#{i}"] for i in (0, 4)}
    sami = {owner[f"st#{i}"] for i in (1, 3, 5)}
    assert maya == {"woman"} and len(sami) == 1
    assert "st#6" not in owner  # a question, not a line


def test_genders_are_drawn_before_voices() -> None:
    """One man and three women: still about half the items each."""
    cast = [MAN, WOMAN, voice("woman-2", "f"), voice("woman-3", "f")]
    picks = [pick_voice(f"s.{i}", None, cast).speaker for i in range(400)]
    assert 0.4 < picks.count("m") / len(picks) < 0.6


def test_a_checked_clip_keeps_its_voice_unless_grammar_wants_the_other() -> None:
    plain = assignment(units(), [MAN, WOMAN])
    flipped = next(i for i in range(200) if plain[f"s.{i}"] == "woman")
    checked = {f"s.{flipped}": "man", "s.f": "man", "st#1": "woman"}
    owner = assignment(units(), [MAN, WOMAN], checked)
    assert owner[f"s.{flipped}"] == "man"
    assert owner["s.f"] == "woman"  # a woman says it, and the cast has a woman
    assert {owner[f"st#{i}"] for i in (1, 3, 5)} == {"woman"}  # Sami's lines move together
