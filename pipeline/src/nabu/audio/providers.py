"""TTS providers behind one interface (gameplan §10.1).

A provider turns requests (input string, voice, relative speed) into PCM. Every clip is then
identified by (provider, version, voice, input, rate), so regenerating a course re-synthesizes
only what changed. Two local providers:

- **espeak-ng**: rule-based, deterministic, small. Reads pinned readings exactly (its
  `yue-Latn-jyutping` voice takes Jyutping), and reports word onsets, so its clips carry exact
  timings. Robotic: the round-trip check usually sends its clips to review.
- **piper**: neural (VITS, ONNX). Natural-sounding where a voice exists; reads text or eSpeak
  phonemes in `[[ ]]`. Its voices carry their own licenses, which the course must declare
  (`AudioVoice.license`): several Piper voices derive from datasets with restrictive terms.

Hosted providers plug in the same way: implement `synthesize`.
"""

from __future__ import annotations

from dataclasses import dataclass
from functools import cache
from pathlib import Path
from typing import Any, Protocol

from nabu.audio import espeak
from nabu.audio.phones import optional


@dataclass(frozen=True)
class Request:
    input: str
    voice: str
    #: Relative speed: 1 normal, below 1 slower.
    rate: float = 1.0


@dataclass(frozen=True)
class Clip:
    pcm: bytes  # s16le mono
    sample_rate: int
    #: Word onsets the synthesizer reports: (character offset in the input, ms); None if unknown.
    words: tuple[tuple[int, int], ...] | None
    #: What the synthesizer says it spoke (phonemes), for QA.
    trace: str | None


class Provider(Protocol):
    name: str

    def version(self) -> str: ...

    def synthesize(self, requests: list[Request]) -> list[Clip]: ...


class EspeakProvider:
    name = "espeak-ng"

    def version(self) -> str:
        return espeak.version()

    def synthesize(self, requests: list[Request]) -> list[Clip]:
        jobs = [espeak.Job(r.input, r.voice, round(espeak.RATE_NORMAL * r.rate)) for r in requests]
        out: list[Clip] = []
        for request, s in zip(requests, espeak.synthesize_all(jobs), strict=True):
            trace = " ".join("".join(w) for w in espeak.phonemes(request.input, request.voice))
            words = tuple((w.start, w.ms) for w in s.words if w.length > 0)
            out.append(Clip(s.pcm, s.sample_rate, words, trace))
        return out


PIPER_REPO = "rhasspy/piper-voices"


class PiperProvider:
    """Piper voices by id ("fa_IR-amir-medium"), downloaded from the rhasspy/piper-voices repo."""

    name = "piper"

    def version(self) -> str:
        from importlib.metadata import version

        return version("piper-tts")

    @staticmethod
    @cache
    def _voice(voice: str) -> Any:
        hub = optional("huggingface_hub")
        piper = optional("piper")
        lang, name, quality = voice.split("-", 2)
        stem = f"{lang.split('_')[0]}/{lang}/{name}/{quality}/{voice}"
        model: str = hub.hf_hub_download(PIPER_REPO, f"{stem}.onnx")
        hub.hf_hub_download(PIPER_REPO, f"{stem}.onnx.json")
        return piper.PiperVoice.load(Path(model))

    def synthesize(self, requests: list[Request]) -> list[Clip]:
        piper = optional("piper")
        out: list[Clip] = []
        for r in requests:
            voice = self._voice(r.voice)
            config = piper.SynthesisConfig(length_scale=1 / r.rate)
            chunks: list[Any] = list(voice.synthesize(r.input, syn_config=config))
            pcm = b"".join(bytes(c.audio_int16_bytes) for c in chunks)
            rate = int(chunks[0].sample_rate) if chunks else 22050
            out.append(Clip(pcm, rate, None, None))
        return out


PROVIDERS: dict[str, type[EspeakProvider] | type[PiperProvider]] = {
    "espeak-ng": EspeakProvider,
    "piper": PiperProvider,
}


def provider(name: str) -> Provider:
    if name not in PROVIDERS:
        raise ValueError(f"unknown TTS provider {name!r}")
    return PROVIDERS[name]()
