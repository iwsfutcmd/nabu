"""Which voice of a course's cast reads each item (ADR 0078): at random, seeded by the item;
by grammar where a sentence or a story character says who speaks; a person's check keeps a
clip's voice, and so does a voice the course pins (audio/assignment.yaml)."""

from __future__ import annotations

from pathlib import Path

from nabu.audio.course import (
    ASSIGNMENT,
    assignment,
    kept_voices,
    pick_voice,
    pinned_voices,
)
from nabu.items import Content
from nabu.schema.models import AudioIndex, AudioVoice

from .units import content, lexeme, line, question, sentence, story, unit


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


def course(n: int = 200) -> Content:
    said = [line(speaker=who) for who in ["maya", "sami", None, "sami", "maya", "sami"]]
    return content(
        unit(
            sentences=[sentence(f"s.{i}") for i in range(n)]
            + [sentence("s.f", speaker="f"), sentence("s.m", speaker="m")],
            stories=[story("st", [*said, question()], {"maya": "f", "sami": None})],
        ),
        lexemes=[lexeme(f"w{i}") for i in range(n)],
    )


def test_one_voice_reads_everything_whoever_speaks() -> None:
    owner = assignment(course(), [MAN])
    assert set(owner.values()) == {"man"}
    assert owner["s.f"] == "man"  # a man's voice for a woman's words, while it is the only one


def test_grammar_first_then_chance() -> None:
    owner = assignment(course(), [MAN, WOMAN])
    assert (owner["s.f"], owner["s.m"]) == ("woman", "man")
    unmarked = [owner[f"s.{i}"] for i in range(200)] + [owner[f"lexeme:w{i}"] for i in range(200)]
    assert 0.4 < unmarked.count("woman") / len(unmarked) < 0.6
    assert assignment(course(), [WOMAN, MAN]) == owner  # the order of the cast does not matter


def test_a_story_character_keeps_one_voice() -> None:
    owner = assignment(course(), [MAN, WOMAN])
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
    plain = assignment(course(), [MAN, WOMAN])
    flipped = next(i for i in range(200) if plain[f"s.{i}"] == "woman")
    checked = {f"s.{flipped}": "man", "s.f": "man", "st#1": "woman"}
    owner = assignment(course(), [MAN, WOMAN], checked)
    assert owner[f"s.{flipped}"] == "man"
    assert owner["s.f"] == "woman"  # a woman says it, and the cast has a woman
    assert {owner[f"st#{i}"] for i in (1, 3, 5)} == {"woman"}  # Sami's lines move together


def _pin(adir: Path, voices: dict[str, str]) -> None:
    """A course's pinned voices, as audio/assignment.yaml holds them."""
    adir.mkdir(parents=True, exist_ok=True)
    lines = "".join(f"  {item}: {voice}\n" for item, voice in voices.items())
    (adir / ASSIGNMENT).write_text(f"version: 1\nvoices:\n{lines}", encoding="utf-8")


def _checked(item: str, by: AudioVoice, status: str = "reviewed") -> AudioIndex:
    """An audio index with one clip of `item` in the voice `by`, at the given status."""
    return AudioIndex.model_validate(
        {
            "version": 1,
            "clips": [
                {
                    "item": item,
                    "speed": "normal",
                    "file": f"clips/{'a' * 16}.mp3",
                    "sha256": "a" * 64,
                    "durationMs": 400,
                    "license": "CC0-1.0",
                    "provenance": {
                        "author": "generated:espeak-ng@1",
                        "status": status,
                        **(
                            {"reviewedBy": "human:ben", "reviewedAt": "2026-11-05"}
                            if status != "draft"
                            else {}
                        ),
                    },
                    "synthetic": True,
                    "synthesis": {
                        "provider": by.provider,
                        "version": "1",
                        "voice": by.voice,
                        "input": "x",
                        "rate": 1.0,
                        "inputHash": "b" * 64,
                    },
                }
            ],
        }
    )


EMPTY = AudioIndex(version=1, clips=[])


def test_a_course_with_no_pinned_voices_pins_none(tmp_path: Path) -> None:
    assert pinned_voices(tmp_path / "audio", [MAN, WOMAN]) == {}
    assert kept_voices(tmp_path / "audio", EMPTY, [MAN, WOMAN]) == {}


def test_a_pinned_voice_is_kept_whatever_the_item_draws(tmp_path: Path) -> None:
    """A word's item was renamed with its lexeme, and a voice is drawn from a seed of the id: the
    course pins the voice the item had (audio/assignment.yaml), and the cast reads it so."""
    adir = tmp_path / "audio"
    plain = assignment(course(), [MAN, WOMAN])
    drawn = next(i for i in range(200) if plain[f"lexeme:w{i}"] == "woman")
    _pin(adir, {f"lexeme:w{drawn}": "man"})
    kept = kept_voices(adir, EMPTY, [MAN, WOMAN])
    assert kept == {f"lexeme:w{drawn}": "man"}
    owner = assignment(course(), [MAN, WOMAN], kept)
    assert owner[f"lexeme:w{drawn}"] == "man"
    # Nothing else moves: every other item reads as it drew.
    assert {k: v for k, v in owner.items() if k != f"lexeme:w{drawn}"} == {
        k: v for k, v in plain.items() if k != f"lexeme:w{drawn}"
    }


def test_a_pinned_voice_gives_way_where_the_grammar_wants_the_other_gender(tmp_path: Path) -> None:
    adir = tmp_path / "audio"
    _pin(adir, {"s.f": "man", "s.m": "man"})
    owner = assignment(course(), [MAN, WOMAN], kept_voices(adir, EMPTY, [MAN, WOMAN]))
    assert owner["s.f"] == "woman"  # a woman says it, and the cast has a woman
    assert owner["s.m"] == "man"
    # With no woman in the cast, the pinned man reads her line, as he would unpinned.
    alone = assignment(course(), [MAN], kept_voices(adir, EMPTY, [MAN]))
    assert alone["s.f"] == "man"


def test_a_pinned_voice_the_cast_no_longer_has_is_ignored(tmp_path: Path) -> None:
    adir = tmp_path / "audio"
    plain = assignment(course(), [MAN, WOMAN])
    _pin(adir, {"lexeme:w0": "narrator", "lexeme:w1": "man"})
    assert pinned_voices(adir, [MAN, WOMAN]) == {"lexeme:w1": "man"}
    owner = assignment(course(), [MAN, WOMAN], kept_voices(adir, EMPTY, [MAN, WOMAN]))
    assert owner["lexeme:w0"] == plain["lexeme:w0"]
    assert owner["lexeme:w1"] == "man"


def test_a_checked_clips_voice_wins_over_a_pinned_one(tmp_path: Path) -> None:
    """A person listened to the clip in that voice: it keeps it, whatever the course pinned. A
    draft clip is no one's check, and the pin stands."""
    adir = tmp_path / "audio"
    _pin(adir, {"lexeme:w3": "man", "lexeme:w4": "man"})
    reviewed = kept_voices(adir, _checked("lexeme:w3", WOMAN), [MAN, WOMAN])
    assert reviewed == {"lexeme:w3": "woman", "lexeme:w4": "man"}
    assert assignment(course(), [MAN, WOMAN], reviewed)["lexeme:w3"] == "woman"
    draft = kept_voices(adir, _checked("lexeme:w3", WOMAN, "draft"), [MAN, WOMAN])
    assert draft == {"lexeme:w3": "man", "lexeme:w4": "man"}
