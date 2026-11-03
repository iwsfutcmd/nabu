"""Round-trip checks for synthesized audio (gameplan §10.1).

Synthesize, transcribe with an independent recognizer (Whisper large-v3-turbo through
faster-whisper), and compare with the text the clip should say: the character error rate over
grapheme clusters, ignoring punctuation and spacing. A clip passes at CER ≤ 0.15, goes to the
human review queue up to 0.5, and fails beyond. The recognizer is never told the expected
sentence (no prompt), so it cannot simply agree.
"""

from __future__ import annotations

import unicodedata
from functools import cache
from typing import Any

import regex

from nabu.audio.phones import optional, to_16k
from nabu.audio.providers import Clip

ASR_MODEL = "large-v3-turbo"
PASS = 0.15
REVIEW = 0.5
_KEEP = regex.compile(r"[\p{L}\p{M}\p{N}]")


@cache
def _whisper() -> Any:
    return optional("faster_whisper").WhisperModel(ASR_MODEL, device="cpu", compute_type="int8")


def graphemes(text: str) -> list[str]:
    """Letters and digits only, as grapheme clusters, NFC (punctuation and spaces dropped)."""
    clusters: list[str] = regex.findall(r"\X", unicodedata.normalize("NFC", text))
    return [g for g in clusters if _KEEP.match(g)]


def cer(heard: str, expected: str) -> float:
    a, b = graphemes(heard), graphemes(expected)
    row = list(range(len(b) + 1))
    for i, x in enumerate(a, start=1):
        prev, row[0] = row[0], i
        for j, y in enumerate(b, start=1):
            prev, row[j] = row[j], min(row[j] + 1, row[j - 1] + 1, prev + (x != y))
    return row[len(b)] / max(1, len(b))


def status(rate: float) -> str:
    return "pass" if rate <= PASS else "review" if rate <= REVIEW else "fail"


def transcribe(clip: Clip, language: str) -> str:
    segments, _info = _whisper().transcribe(
        to_16k(clip.pcm, clip.sample_rate),
        language=language,
        beam_size=5,
        condition_on_previous_text=False,
    )
    return "".join(str(s.text) for s in segments).strip()


def round_trip(clip: Clip, expected: str, language: str) -> dict[str, Any]:
    heard = transcribe(clip, language)
    rate = round(cer(heard, expected), 3)
    return {
        "asrModel": f"whisper-{ASR_MODEL}",
        "asrText": heard,
        "cer": rate,
        "status": status(rate),
    }
