"""Round-trip checks for synthesized audio (gameplan §10.1).

Synthesize, transcribe with an independent recognizer (Whisper large-v3-turbo through
faster-whisper), and compare with the text the clip should say: the character error rate over
grapheme clusters, ignoring punctuation and spacing. A clip passes at CER ≤ 0.15, goes to the
human review queue up to 0.5, and fails beyond. The recognizer is never told the expected
sentence (no prompt), so it cannot simply agree.

The recognizer runs on a GPU when CTranslate2 can use one (float16), else on the CPU (int8); the
two can differ on a borderline clip, never by much.
"""

from __future__ import annotations

import ctypes
import importlib
import importlib.util
import unicodedata
from functools import cache
from pathlib import Path
from typing import Any

import regex

from nabu.audio.phones import optional, to_16k
from nabu.audio.providers import Clip

ASR_MODEL = "large-v3-turbo"
PASS = 0.15
REVIEW = 0.5
_KEEP = regex.compile(r"[\p{L}\p{M}\p{N}]")


#: What CTranslate2 needs for a GPU besides the driver (its CUDA runtime is built in): cuBLAS 12,
#: which it loads by name when it first multiplies.
CUBLAS = ("libcublasLt.so.12", "libcublas.so.12")


def load_cublas() -> bool:
    """cuBLAS 12 loaded for the whole process: from the system's search path, or from the
    nvidia-cublas-cu12 wheel PyTorch's CUDA build brings (which CTranslate2 does not search)."""
    places: list[Path | None] = [None]
    try:
        spec = importlib.util.find_spec("nvidia.cublas")
    except ImportError:
        spec = None
    if spec is not None and spec.submodule_search_locations:
        places += [Path(p) / "lib" for p in spec.submodule_search_locations]
    for place in places:
        try:
            for name in CUBLAS:
                ctypes.CDLL(name if place is None else str(place / name), mode=ctypes.RTLD_GLOBAL)
        except OSError:
            continue
        return True
    return False


def cuda_ready() -> bool:
    """Whether CTranslate2 sees a GPU and cuBLAS loads."""
    try:
        if optional("ctranslate2").get_cuda_device_count() < 1:
            return False
    except Exception:  # no CTranslate2, or no driver: the CPU
        return False
    return load_cublas()


@cache
def recognizer() -> Any:
    """Whisper on a GPU that works (a second of silence goes through it first), else the CPU."""
    whisper = optional("faster_whisper").WhisperModel
    if cuda_ready():
        try:
            model = whisper(ASR_MODEL, device="cuda", compute_type="float16")
            segments, _info = model.transcribe(optional("numpy").zeros(16_000, dtype="float32"))
            list(segments)  # transcription is lazy: run it
            return model
        except (RuntimeError, ValueError):  # a library that will not load; no float16 on the GPU
            pass
    return whisper(ASR_MODEL, device="cpu", compute_type="int8")


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
    segments, _info = recognizer().transcribe(
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
