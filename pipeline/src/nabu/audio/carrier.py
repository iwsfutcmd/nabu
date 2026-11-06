"""Short items said inside a carrier sentence, for Piper voices that garble a lone word (ADR 0065).

On a short input some Piper models fail in two ways at once. The duration predictor collapses (each
phoneme gets one frame: a whole word in 0.2 s) or runs away, and the encoder's reading of the
phonemes is off even when the durations are fixed. In a sentence both are fine. So an item of at
most a few words is said at the end of a carrier sentence ("…, X."), and:

1. Durations: the graph is split at its duration node (the frames per phoneme id, `/Ceil` in
   Piper's VITS export), so the frames can be read, changed and given back. The item's phonemes
   get at least the mean frames of the carrier's own phonemes (its pads, the mean of its pads),
   and its last syllable, from its last vowel, a little more (a word said on its own).
2. The cut: every frame's length is known, so the item is cut out exactly, from a frame before its
   first phoneme through the pad after its last one (not the closing full stop, which the model
   fills with an in-breath), with short fades.

Longer items are said as they are, except a sentence the model would collapse (`collapses`: its
sounds predicted well under the carrier's): "این مریم است." or the "خداحافظ!" closing a story line.
That sentence goes through the carrier on its own, and the item's sentences are joined as usual.

Everything here but `split` is pure: ids and frames in, frames and sample offsets out.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from typing import Any

#: The duration node of Piper's VITS export: frames per phoneme id, [batch, 1, ids].
DURATIONS = "/Ceil_output_0"
#: Piper's markers: sentence start and end, the pad after every phoneme, the word gap.
BOS, EOS, PAD, SPACE = "^", "$", "_", " "
#: IPA vowel letters eSpeak NG writes: where the last syllable starts.
VOWELS = frozenset("aeiouyæøœɑɒɐəɘɛɜɞɤɨɪɯʉʊʌɔ")
#: How much longer the item's last syllable is (a word said on its own, as a statement).
FINAL = 1.3
#: Fades at the cuts.
FADE_IN_MS = 10
FADE_OUT_MS = 40
#: Shapes the clips: part of their identity, so changing any of the above means a new method id.
METHOD = "carrier-1"
#: A sentence whose sounds the model predicts, on average, at under this share of the carrier's is
#: one it would collapse. Measured on fa: every sentence a listener heard as static or cut off was
#: under it, and none they passed.
COLLAPSE = 0.8
#: Where Piper (eSpeak) ends a sentence: its closing punctuation, then a space.
_SENTENCE_END = re.compile(r"(?<=[.!?\u061F\u06D4])\s+")


@dataclass(frozen=True)
class Plan:
    """Frames for every phoneme id of carrier + item, and where the item is."""

    frames: list[float]
    #: First and last phoneme id of the item (the last is a phoneme, not a pad or punctuation).
    first: int
    last: int


def _marker(sym: str) -> bool:
    """Not a sound: Piper's markers and punctuation."""
    return sym in (BOS, EOS, PAD, SPACE) or all(
        unicodedata.category(c).startswith("P") for c in sym
    )


def item_start(ids: list[int], carrier_ids: list[int], space: int, pad: int) -> int | None:
    """The first id of the item in carrier + item: the carrier said alone (without its end
    marker, and without a word gap it may end with: "…, ") must be a prefix, followed by a word
    gap and its pad. None if it is not."""
    head = carrier_ids[:-1]
    while head[-2:] == [space, pad]:
        head = head[:-2]
    if ids[: len(head)] != head or len(ids) < len(head) + 3 or ids[len(head)] != space:
        return None
    return len(head) + 2


def sentences(text: str) -> list[str]:
    """The text's sentences, split where Piper splits them (closing punctuation and a space)."""
    return [s for s in _SENTENCE_END.split(text.strip()) if s]


def collapses(syms: list[str], frames: list[float], phone_floor: float) -> bool:
    """Whether the model would collapse this sentence: its sounds' predicted frames average under
    COLLAPSE times the carrier's."""
    sounds = [f for s, f in zip(syms, frames, strict=True) if not _marker(s)]
    return bool(sounds) and sum(sounds) / len(sounds) < COLLAPSE * phone_floor


def floors(syms: list[str], frames: list[float]) -> tuple[float, float]:
    """Mean frames of the phonemes and of the pads after them, in a sentence the model says
    well (the carrier on its own)."""
    phones = [f for s, f in zip(syms, frames, strict=True) if not _marker(s)]
    pads = [
        f
        for k, (s, f) in enumerate(zip(syms, frames, strict=True))
        if s == PAD and k > 0 and not _marker(syms[k - 1])
    ]
    if not phones or not pads:
        raise ValueError("the carrier has no phonemes")
    return sum(phones) / len(phones), sum(pads) / len(pads)


def plan(
    syms: list[str], predicted: list[float], first: int, phone_floor: float, pad_floor: float
) -> Plan:
    """The item's phonemes (and the pads after them) get at least the floors; from its last
    vowel through the pad after its last phoneme, FINAL times that. Whole frames, at least one."""
    sounds = [k for k in range(first, len(syms)) if not _marker(syms[k])]
    if not sounds:
        raise ValueError("the item has no phonemes")
    last = sounds[-1]
    frames = [float(f) for f in predicted]
    for k in range(first, last + 2):
        floor = pad_floor if syms[k] == PAD else phone_floor if not _marker(syms[k]) else 0.0
        frames[k] = max(frames[k], floor)
    vowels = [k for k in sounds if syms[k][0] in VOWELS]
    if vowels:
        for k in range(vowels[-1], last + 2):
            frames[k] *= FINAL
    return Plan([float(max(1, -(-f // 1))) for f in frames], first, last)


def bounds(p: Plan, hop: int) -> tuple[int, int]:
    """Sample offsets of the item: a frame before its first phoneme, through the pad after its
    last one."""
    begin = max(0, int(sum(p.frames[: p.first]) - 1)) * hop
    end = int(sum(p.frames[: p.last + 2])) * hop
    return begin, end


def split(model: bytes) -> tuple[bytes, bytes]:
    """Two edits of a Piper (VITS) graph at its duration node: one that also returns the frames
    per phoneme id ("durations"), one that takes them as an input instead. The decoder is not
    touched. Needs the `onnx` package (speech group)."""
    from nabu.audio.phones import optional

    onnx: Any = optional("onnx")
    helper = onnx.helper
    shape = ["batch_size", 1, "phonemes"]
    reading = onnx.load_from_string(model)
    if not any(DURATIONS in n.output for n in reading.graph.node):
        raise ValueError(f"no duration node {DURATIONS} in this Piper model")
    reading.graph.output.append(
        helper.make_tensor_value_info(DURATIONS, onnx.TensorProto.FLOAT, shape)
    )
    given = onnx.load_from_string(model)
    for node in given.graph.node:
        for i, name in enumerate(node.input):
            if name == DURATIONS:
                node.input[i] = "durations"
    given.graph.input.append(
        helper.make_tensor_value_info("durations", onnx.TensorProto.FLOAT, shape)
    )
    return reading.SerializeToString(), given.SerializeToString()
