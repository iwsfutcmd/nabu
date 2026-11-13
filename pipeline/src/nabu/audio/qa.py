"""Round-trip checks for synthesized audio (gameplan §10.1).

Synthesize, transcribe with an independent recognizer (Whisper large-v3-turbo through
faster-whisper), and compare with the text the clip should say: the character error rate over
grapheme clusters, ignoring punctuation and spacing. A clip passes at CER ≤ 0.15, goes to the
human review queue up to 0.5, and fails beyond. The recognizer is never told the expected
sentence (no prompt), so it cannot simply agree.

The recognizer runs on a GPU when CTranslate2 can use one (float16), else on the CPU (int8); the
two can differ on a borderline clip, never by much.

Cantonese (ADR 0094) is heard by a Whisper fine-tuned on it: Whisper's own writes Cantonese as
written Mandarin (佢係我媽媽 as 她是我妈妈). Its characters are compared by reading where they
differ, since a transcript cannot tell homophones and spellings apart (搭 and 答, 呀 and 啊, 喺 and
係): a character said alike is no error, one that differs only in its tone half an error, and any
other a whole one. So a lone word heard as a homophone of another tone goes to the review queue,
not out of the course; a listener decides it in the audio check. That holds for any language a
reading scheme reads the characters of (nabu.schemes `reader`: Jyutping's data says it writes
yue, and its plug-in reads characters).
"""

from __future__ import annotations

import ctypes
import importlib
import importlib.util
import unicodedata
from collections.abc import Callable
from functools import cache
from pathlib import Path
from typing import Any

import regex

from nabu.audio.phones import optional, to_16k
from nabu.audio.providers import Clip
from nabu.schemes import plugins, reader, toneless

ASR_MODEL = "large-v3-turbo"
PASS = 0.15
REVIEW = 0.5
_KEEP = regex.compile(r"[\p{L}\p{M}\p{N}]")

#: Recognizers for languages Whisper's own does not write: (Hugging Face repo, pinned revision,
#: the Whisper language token it was tuned with). Apache-2.0; used to check clips, never shipped.
FINE_TUNED: dict[str, tuple[str, str, str]] = {
    "yue": ("alvanlii/whisper-small-cantonese", "b03a4e5d482f06858ce10ebbabebabec9f447a0d", "zh"),
}


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


@cache
def fine_tuned(language: str) -> tuple[Any, Any, str]:
    """The language's fine-tuned Whisper (transformers): processor, model and device."""
    transformers, torch = optional("transformers"), optional("torch")
    repo, revision, _token = FINE_TUNED[language]
    processor = transformers.WhisperProcessor.from_pretrained(repo, revision=revision)
    model = transformers.WhisperForConditionalGeneration.from_pretrained(repo, revision=revision)
    device = "cuda" if torch.cuda.is_available() else "cpu"
    return processor, model.to(device).eval(), device


def model_name(language: str) -> str:
    """The recognizer a language's clips are checked with, as the index records it."""
    tuned = FINE_TUNED.get(language)
    return f"whisper-{ASR_MODEL}" if tuned is None else f"{tuned[0]}@{tuned[1][:12]}"


def graphemes(text: str) -> list[str]:
    """Letters and digits only, as grapheme clusters, NFC (punctuation and spaces dropped)."""
    clusters: list[str] = regex.findall(r"\X", unicodedata.normalize("NFC", text))
    return [g for g in clusters if _KEEP.match(g)]


def _distance(a: list[str], b: list[str], cost: Callable[[int, int], float]) -> float:
    """Edit distance, a substitution of a[i] for b[j] costing cost(i, j)."""
    row: list[float] = [float(j) for j in range(len(b) + 1)]
    for i in range(1, len(a) + 1):
        prev, row[0] = row[0], float(i)
        for j in range(1, len(b) + 1):
            prev, row[j] = row[j], min(row[j] + 1, row[j - 1] + 1, prev + cost(i - 1, j - 1))
    return row[len(b)]


def cer(heard: str, expected: str) -> float:
    a, b = graphemes(heard), graphemes(expected)
    return _distance(a, b, lambda i, j: float(a[i] != b[j])) / max(1, len(b))


def reading_error_rate(heard: str, expected: str, scheme: str) -> float:
    """The character error rate, a substituted character said alike no error and one said with
    another tone half an error, its readings in `scheme` (a scheme that reads written text:
    Jyutping for Cantonese; the module's docstring)."""
    a, b = graphemes(heard), graphemes(expected)
    read = plugins(scheme).read
    if read is None:
        raise ValueError(f"{scheme} does not read written text")
    ra, rb = read(a), read(b)

    def cost(i: int, j: int) -> float:
        x, y = ra[i], rb[j]
        if a[i] == b[j] or (x is not None and x == y):
            return 0.0
        apart = x is not None and y is not None and toneless(scheme, x) == toneless(scheme, y)
        return 0.5 if apart else 1.0

    return _distance(a, b, cost) / max(1, len(b))


def status(rate: float) -> str:
    return "pass" if rate <= PASS else "review" if rate <= REVIEW else "fail"


def transcribe(clip: Clip, language: str) -> str:
    if language in FINE_TUNED:
        processor, model, device = fine_tuned(language)
        features = processor(
            to_16k(clip.pcm, clip.sample_rate), sampling_rate=16_000, return_tensors="pt"
        ).input_features.to(device)
        with optional("torch").no_grad():
            ids = model.generate(
                features, language=FINE_TUNED[language][2], task="transcribe", max_new_tokens=128
            )
        return str(processor.batch_decode(ids, skip_special_tokens=True)[0]).strip()
    segments, _info = recognizer().transcribe(
        to_16k(clip.pcm, clip.sample_rate),
        language=language,
        beam_size=5,
        condition_on_previous_text=False,
    )
    return "".join(str(s.text) for s in segments).strip()


def round_trip(clip: Clip, expected: str, language: str) -> dict[str, Any]:
    heard = transcribe(clip, language)
    # Characters are compared by reading where a reading scheme of the language reads them.
    scheme = reader(language)
    rate = cer(heard, expected) if scheme is None else reading_error_rate(heard, expected, scheme)
    rate = round(rate, 3)
    return {
        "asrModel": model_name(language),
        "asrText": heard,
        "cer": rate,
        "status": status(rate),
    }
