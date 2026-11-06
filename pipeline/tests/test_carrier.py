"""Short items said inside a carrier sentence (ADR 0065): durations, the cut, the graph split."""

from __future__ import annotations

import os
from typing import Any

import pytest

from nabu.audio import carrier
from nabu.audio.carrier import Plan
from nabu.audio.providers import PiperProvider, Request
from nabu.schema.models import AudioVoice

# Piper's id layout: ^ _ (phoneme _)* $. Ids here are made up; symbols are what matter.
SYMS = {
    0: "_",
    1: "^",
    2: "$",
    3: " ",
    4: ",",
    5: ".",
    10: "b",
    11: "e",
    12: "ɡ",
    13: "u",
    14: "s",
    15: "a",
    16: "l",
    17: "ɑ",
    18: "m",
}


def ids(phonemes: str) -> list[int]:
    by = {s: i for i, s in SYMS.items()}
    out = [by["^"], by["_"]]
    for p in phonemes:
        out += [by[p], by["_"]]
    return [*out, by["$"]]


def syms(xs: list[int]) -> list[str]:
    return [SYMS[i] for i in xs]


CARRIER = ids("beɡu,")
WHOLE = ids("beɡu, salɑm.")


def test_the_item_starts_after_the_carrier_and_its_word_gap() -> None:
    first = carrier.item_start(WHOLE, CARRIER, space=3, pad=0)
    assert first is not None
    assert syms(WHOLE)[first : first + 3] == ["s", "_", "a"]


def test_a_carrier_said_alone_may_end_with_its_word_gap() -> None:
    # eSpeak ends "…، " said alone with a word gap; before the item it is the same gap.
    assert carrier.item_start(WHOLE, ids("beɡu, "), space=3, pad=0) == carrier.item_start(
        WHOLE, CARRIER, space=3, pad=0
    )


def test_a_carrier_read_differently_before_the_item_is_refused() -> None:
    assert carrier.item_start(ids("beɡa, salɑm."), CARRIER, space=3, pad=0) is None
    assert carrier.item_start(ids("beɡu,salɑm."), CARRIER, space=3, pad=0) is None  # no word gap


def test_the_floors_are_the_carriers_mean_frames() -> None:
    alone = ids("beɡu.")
    frames = [1.0] * len(alone)
    for k, s in enumerate(syms(alone)):
        if s in "beɡu":
            frames[k], frames[k + 1] = 3.0, 1.0  # each phoneme 3 frames, the pad after it 1
    phone, pad = carrier.floors(syms(alone), frames)
    assert (phone, pad) == (3.0, 1.0)


def test_the_item_gets_the_floors_and_its_last_syllable_more() -> None:
    first = carrier.item_start(WHOLE, CARRIER, space=3, pad=0)
    assert first is not None
    predicted = [1.0] * len(WHOLE)  # collapsed: one frame each
    p = carrier.plan(syms(WHOLE), predicted, first, phone_floor=2.4, pad_floor=1.5)
    s = syms(WHOLE)
    assert s[p.last] == "m"  # the last phoneme, not the full stop
    assert p.frames[:first] == predicted[:first]  # the carrier is untouched
    # Before the last vowel: the floors, rounded up to whole frames.
    assert [p.frames[k] for k in range(first, first + 4)] == [3.0, 2.0, 3.0, 2.0]
    # From the last vowel (ɑ) through the pad after the last phoneme: FINAL times the floors.
    last_vowel = s.index("ɑ")
    assert p.frames[last_vowel] == -(-2.4 * carrier.FINAL // 1)
    assert p.frames[p.last + 1] == -(-1.5 * carrier.FINAL // 1)
    # The full stop and the end marker keep the model's frames.
    assert p.frames[p.last + 2 :] == predicted[p.last + 2 :]


def test_the_cut_runs_from_a_frame_before_the_item_through_the_pad_after_it() -> None:
    p = Plan([2.0] * 10, first=4, last=6)
    begin, end = carrier.bounds(p, hop=256)
    assert begin == (8 - 1) * 256
    assert end == 16 * 256  # frames of ids 0..7: through the pad after id 6


def test_an_item_with_no_phonemes_is_refused() -> None:
    with pytest.raises(ValueError):
        carrier.plan(syms(ids(".")), [1.0] * 5, 2, 2.0, 2.0)


def test_a_carrier_voice_says_so_in_its_settings() -> None:
    v = AudioVoice.model_validate(
        {
            "id": "narrator",
            "provider": "piper",
            "voice": "fa_IR-mana-medium",
            "model": "MahtaFetrat/Mana-Persian-Piper@" + "a" * 40,
            "orthography": "fa-Arab/standard",
            "reading": "text",
            "license": "MIT",
            "carrier": {"text": "بگو، "},
        }
    )
    settings = PiperProvider(v).settings()
    assert settings["carrier"] == {"text": "بگو، ", "maxWords": 2, "method": carrier.METHOD}
    # A rhasspy voice without a carrier keeps the identity it had.
    assert PiperProvider().settings() == {}


def test_the_split_reads_and_takes_the_frames() -> None:
    onnx: Any = pytest.importorskip("onnx")
    ort: Any = pytest.importorskip("onnxruntime")
    np: Any = pytest.importorskip("numpy")
    h = onnx.helper
    # x → Ceil → "/Ceil_output_0" → ReduceSum → y: a stand-in for VITS's durations and length.
    graph = h.make_graph(
        [
            h.make_node("Ceil", ["x"], [carrier.DURATIONS], name="/Ceil"),
            h.make_node("ReduceSum", [carrier.DURATIONS], ["y"], keepdims=0, name="/ReduceSum"),
        ],
        "g",
        [h.make_tensor_value_info("x", onnx.TensorProto.FLOAT, [1, 1, 3])],
        [h.make_tensor_value_info("y", onnx.TensorProto.FLOAT, [])],
    )
    # IR 8: what onnxruntime reads (Piper's exports are older still).
    made = h.make_model(graph, opset_imports=[h.make_opsetid("", 13)], ir_version=8)
    model = made.SerializeToString()
    reading, given = carrier.split(model)
    x = np.array([[[0.2, 1.5, 2.1]]], dtype=np.float32)
    y, frames = ort.InferenceSession(reading).run(["y", carrier.DURATIONS], {"x": x})
    assert frames.tolist() == [[[1.0, 2.0, 3.0]]] and float(y) == 6.0
    mine = np.array([[[4.0, 4.0, 4.0]]], dtype=np.float32)
    [y2] = ort.InferenceSession(given).run(["y"], {"x": x, "durations": mine})
    assert float(y2) == 12.0  # the frames given, not the ones it predicts


# --- Live (NABU_SPEECH=1 and the speech group: downloads the Mana-Persian-Piper voice) -------

MANA = "MahtaFetrat/Mana-Persian-Piper@ad9dd8518bedf517bd7cbc9f63b8e5c844bf5bc0"


@pytest.mark.skipif(os.environ.get("NABU_SPEECH") != "1", reason="needs NABU_SPEECH=1")
def test_live_a_lone_word_is_said_at_a_speaking_length() -> None:
    v = AudioVoice.model_validate(
        {
            "id": "narrator",
            "provider": "piper",
            "voice": "fa_IR-mana-medium",
            "model": MANA,
            "orthography": "fa-Arab/standard",
            "reading": "text",
            "license": "MIT",
            "carrier": {"text": "حالا این کلمه را تکرار کن، "},
        }
    )
    tts = PiperProvider(v)
    word, sentence = tts.synthesize(
        [Request("سلام.", v.voice), Request("این کتاب من است.", v.voice)]
    )
    seconds = len(word.pcm) / 2 / word.sample_rate
    # Alone, the model says سلام in 0.21 s; in the carrier, with its durations, about 0.5 s.
    assert 0.35 < seconds < 1.0
    assert word.trace is not None and word.trace.startswith("s")
    assert len(sentence.pcm) / 2 / sentence.sample_rate > 1.0
    # Seeded: the same request gives the same clip.
    [again] = tts.synthesize([Request("سلام.", v.voice)])
    assert again.pcm == word.pcm
