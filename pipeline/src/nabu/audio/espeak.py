"""eSpeak NG through its C library (ctypes): synthesis with word timings, and phonemes.

The library rather than the command line, for two things the CLI does not expose:
- word events with their position in the audio, which give exact timings for synthesized clips
  and the ground truth the forced aligner is checked against;
- phonemes split one by one (`espeak_TextToPhonemes` with a separator), which the aligner and
  the round-trip check compare against.

eSpeak NG is a process-wide singleton, so this module is too. Same version, voice, rate and
input give the same samples: synthesis is deterministic.
"""

from __future__ import annotations

import ctypes
import ctypes.util
from dataclasses import dataclass
from functools import cache
from typing import Any

AUDIO_OUTPUT_SYNCHRONOUS = 2
INITIALIZE_DONT_EXIT = 0x8000
CHARS_UTF8 = 1
PHONEMES_FLAG = 0x100  # text inside [[ ]] is phoneme mnemonics
POS_CHARACTER = 1
EVENT_LIST_TERMINATED = 0
EVENT_WORD = 1
PARAM_RATE = 1
PHONEMES_IPA = 0x02

#: Default speaking rate (words per minute; for Jyutping input, syllables per minute).
RATE_NORMAL = 150
#: The slow variant (Duolingo's turtle): two thirds of normal.
RATE_SLOW = 100


class _EventId(ctypes.Union):
    _fields_ = [("number", ctypes.c_int), ("name", ctypes.c_char_p), ("string", ctypes.c_char * 8)]


class _Event(ctypes.Structure):
    _fields_ = [
        ("type", ctypes.c_int),
        ("unique_identifier", ctypes.c_uint),
        ("text_position", ctypes.c_int),
        ("length", ctypes.c_int),
        ("audio_position", ctypes.c_int),
        ("sample", ctypes.c_int),
        ("user_data", ctypes.c_void_p),
        ("id", _EventId),
    ]


_Callback = ctypes.CFUNCTYPE(
    ctypes.c_int, ctypes.POINTER(ctypes.c_short), ctypes.c_int, ctypes.POINTER(_Event)
)


class EspeakUnavailable(RuntimeError):
    """The eSpeak NG library is not installed (apt install espeak-ng)."""


@dataclass(frozen=True)
class WordEvent:
    """A word starting in the audio: its character span in the input (0-based) and onset."""

    start: int
    length: int
    ms: int


@dataclass(frozen=True)
class Synthesis:
    pcm: bytes  # signed 16-bit little-endian, mono
    sample_rate: int
    words: tuple[WordEvent, ...]

    @property
    def duration_ms(self) -> int:
        return len(self.pcm) // 2 * 1000 // self.sample_rate


class _Library:
    def __init__(self) -> None:
        name = ctypes.util.find_library("espeak-ng") or "libespeak-ng.so.1"
        try:
            self.lib = ctypes.CDLL(name)
        except OSError as e:
            raise EspeakUnavailable(
                f"eSpeak NG library not found ({name}): apt install espeak-ng"
            ) from e
        lib = self.lib
        lib.espeak_Initialize.restype = ctypes.c_int
        lib.espeak_Initialize.argtypes = [ctypes.c_int, ctypes.c_int, ctypes.c_char_p, ctypes.c_int]
        lib.espeak_SetVoiceByName.argtypes = [ctypes.c_char_p]
        lib.espeak_SetParameter.argtypes = [ctypes.c_int, ctypes.c_int, ctypes.c_int]
        lib.espeak_SetSynthCallback.argtypes = [_Callback]
        lib.espeak_Synth.argtypes = [
            ctypes.c_void_p,
            ctypes.c_size_t,
            ctypes.c_uint,
            ctypes.c_int,
            ctypes.c_uint,
            ctypes.c_uint,
            ctypes.POINTER(ctypes.c_uint),
            ctypes.c_void_p,
        ]
        lib.espeak_TextToPhonemes.restype = ctypes.c_char_p
        lib.espeak_TextToPhonemes.argtypes = [
            ctypes.POINTER(ctypes.c_void_p),
            ctypes.c_int,
            ctypes.c_int,
        ]
        lib.espeak_Info.restype = ctypes.c_char_p
        lib.espeak_Info.argtypes = [ctypes.c_void_p]
        self.sample_rate = lib.espeak_Initialize(
            AUDIO_OUTPUT_SYNCHRONOUS, 0, None, INITIALIZE_DONT_EXIT
        )
        if self.sample_rate <= 0:
            raise EspeakUnavailable("eSpeak NG failed to initialize")
        self.version = (lib.espeak_Info(None) or b"").decode()
        self.pcm_buffer = bytearray()
        self.word_events: list[tuple[int, int, int]] = []
        self._callback = _Callback(
            self._on_audio
        )  # keep a reference: ctypes callbacks must outlive use
        lib.espeak_SetSynthCallback(self._callback)

    def _on_audio(self, wav: Any, n: int, events: Any) -> int:
        if n > 0 and wav:
            self.pcm_buffer += ctypes.string_at(wav, n * 2)
        i = 0
        while events[i].type != EVENT_LIST_TERMINATED:
            e = events[i]
            if e.type == EVENT_WORD:
                self.word_events.append((e.text_position, e.length, e.audio_position))
            i += 1
        return 0

    def voice(self, name: str) -> None:
        if self.lib.espeak_SetVoiceByName(name.encode()) != 0:
            raise ValueError(f"eSpeak NG has no voice {name!r}")


@cache
def _library() -> _Library:
    return _Library()


def available() -> bool:
    try:
        _library()
    except EspeakUnavailable:
        return False
    return True


def version() -> str:
    return _library().version


def has_voice(name: str) -> bool:
    """Whether eSpeak NG has a voice by this name (a language code: fa, yue, ar)."""
    try:
        _library().voice(name)
    except ValueError:
        return False
    return True


def synthesize(text: str, voice: str, rate: int = RATE_NORMAL) -> Synthesis:
    """Speaks `text` (UTF-8; `[[...]]` spans are eSpeak phoneme mnemonics) with word onsets."""
    lib = _library()
    lib.voice(voice)
    lib.lib.espeak_SetParameter(PARAM_RATE, rate, 0)
    lib.pcm_buffer = bytearray()
    lib.word_events = []
    data = text.encode("utf-8") + b"\0"
    buffer = ctypes.create_string_buffer(data)
    error = lib.lib.espeak_Synth(
        buffer, len(data), 0, POS_CHARACTER, 0, CHARS_UTF8 | PHONEMES_FLAG, None, None
    )
    if error != 0:
        raise RuntimeError(f"espeak_Synth failed ({error})")
    lib.lib.espeak_Synchronize()
    # Text positions are 1-based character offsets.
    words = tuple(WordEvent(start=p - 1, length=n, ms=ms) for p, n, ms in lib.word_events)
    return Synthesis(pcm=bytes(lib.pcm_buffer), sample_rate=lib.sample_rate, words=words)


def phonemes(text: str, voice: str, separator: str = "_") -> list[list[str]]:
    """IPA phonemes of `text`, one list per word, split by eSpeak itself (stress marks dropped)."""
    lib = _library()
    lib.voice(voice)
    mode = PHONEMES_IPA | (ord(separator) << 8)
    data = ctypes.create_string_buffer(text.encode("utf-8") + b"\0")
    pointer = ctypes.c_void_p(ctypes.addressof(data))
    out: list[str] = []
    while pointer.value:
        chunk = lib.lib.espeak_TextToPhonemes(ctypes.byref(pointer), CHARS_UTF8, mode)
        if chunk:
            out.append(chunk.decode("utf-8"))
    words: list[list[str]] = []
    for word in " ".join(out).split():
        phones = [p.replace("ˈ", "").replace("ˌ", "") for p in word.split(separator)]
        phones = [p for p in phones if p]
        if phones:
            words.append(phones)
    return words


@dataclass(frozen=True)
class Job:
    text: str
    voice: str
    rate: int = RATE_NORMAL


def _run(job: Job) -> Synthesis:
    return synthesize(job.text, job.voice, job.rate)


def synthesize_all(jobs: list[Job], workers: int = 4) -> list[Synthesis]:
    """Synthesizes each job in a fresh process, in parallel.

    eSpeak NG carries state from one utterance to the next (its pitch flutter, for one), so the
    same input gives slightly different samples depending on what was spoken before it. Only
    the first utterance of a process is reproducible, and re-initializing the library in
    process deadlocks. One process per clip makes every clip independent of the others, so
    regenerating a course gives identical files.
    """
    import multiprocessing
    from concurrent.futures import ProcessPoolExecutor

    context = multiprocessing.get_context("spawn")
    with ProcessPoolExecutor(
        max_workers=workers, mp_context=context, max_tasks_per_child=1
    ) as pool:
        return list(pool.map(_run, jobs))
