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

Two hosted providers, for languages the local voices serve badly (ADR 0042):

- **elevenlabs** (Eleven v4): reads inline IPA between slashes, so pinned readings the
  spelling does not settle (Cantonese polyphones) are passed as IPA; reports per-character
  timestamps. Speed 0.7-1.2.
- **cartesia** (Sonic): word timestamps over server-sent events; speed 0.6-1.5; no seed.

One local model for dialects the others do not serve (ADR 0058):

- **omnivoice**: OmniVoice checkpoints from Hugging Face, run on this machine. The Lahgtna
  fine-tune reads Arabic dialects, Lebanese among them (language id "lb"), and reads vowel marks.
  Every clip clones the course's reference voice (`nabu audio cast`), so one course voice is one
  speaker; each clip's sampling is seeded from its identity. No timings.

Hosted providers read their key from the environment (ELEVENLABS_API_KEY, CARTESIA_API_KEY),
never from course files, and only when synthesizing. Their audio is not reproducible
bit-for-bit (the provider's model may change under the same id); clips are committed, so
builds stay deterministic, and the round-trip check reviews each new clip.
"""

from __future__ import annotations

import base64
import hashlib
import importlib
import json
import os
import sys
import time
import urllib.error
import urllib.request
from array import array
from collections.abc import Callable
from dataclasses import dataclass
from functools import cache
from pathlib import Path
from typing import Any, ClassVar, Protocol
from urllib.parse import quote

from nabu.audio import espeak
from nabu.audio.phones import optional
from nabu.schema.models import AudioVoice


@dataclass(frozen=True)
class Request:
    input: str
    voice: str
    #: Relative speed: 1 normal, below 1 slower.
    rate: float = 1.0


@dataclass(frozen=True)
class Reference:
    """A reference voice a cloning provider imitates: the recording and what it says."""

    path: Path
    text: str
    sha256: str


@dataclass(frozen=True)
class Clip:
    pcm: bytes  # s16le mono
    sample_rate: int
    #: Onsets the synthesizer reports, of words or characters: (code point offset in the input,
    #: ms); None if unknown.
    words: tuple[tuple[int, int], ...] | None
    #: What the synthesizer says it spoke (phonemes), for QA.
    trace: str | None


class Provider(Protocol):
    name: str

    def version(self) -> str: ...

    def settings(self) -> dict[str, Any]:
        """What shapes the audio besides voice, input and rate: part of each clip's identity."""
        ...

    def speed(self, rate: float) -> float:
        """The rate the provider will actually use for a requested one."""
        ...

    def synthesize(self, requests: list[Request]) -> list[Clip]: ...


class EspeakProvider:
    name = "espeak-ng"

    def version(self) -> str:
        return espeak.version()

    def settings(self) -> dict[str, Any]:
        return {}

    def speed(self, rate: float) -> float:
        return rate

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

    def settings(self) -> dict[str, Any]:
        return {}

    def speed(self, rate: float) -> float:
        return rate

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


class MissingKey(RuntimeError):
    """A hosted provider's API key is not in the environment."""

    def __init__(self, provider: str, variable: str) -> None:
        super().__init__(
            f"{provider} needs an API key in ${variable} (in a cloud session: the environment's "
            "settings, never a course file or the chat)"
        )
        self.variable = variable


class ProviderError(RuntimeError):
    """A hosted provider refused a request or could not be reached."""


#: POST (url, headers, body) → response body. Injected in tests; the default retries.
Transport = Callable[[str, dict[str, str], bytes], bytes]
RETRY_STATUS = {408, 429, 500, 502, 503, 504}
SAMPLE_RATE = 22050


def http_post(url: str, headers: dict[str, str], body: bytes) -> bytes:
    """POST with up to four retries (2, 4, 8, 16 s) on rate limits, server errors and network
    failures. Errors carry the URL and the server's message, never the request headers."""
    for attempt in range(5):
        request = urllib.request.Request(url, data=body, headers=headers, method="POST")
        try:
            with urllib.request.urlopen(request, timeout=180) as response:
                data: bytes = response.read()
                return data
        except urllib.error.HTTPError as error:
            detail = error.read()[:600].decode("utf-8", "replace")
            if error.code in RETRY_STATUS and attempt < 4:
                time.sleep(2 ** (attempt + 1))
                continue
            raise ProviderError(f"{url}: HTTP {error.code}: {detail}") from None
        except (urllib.error.URLError, TimeoutError) as error:
            if attempt < 4:
                time.sleep(2 ** (attempt + 1))
                continue
            raise ProviderError(f"{url}: {error}") from None
    raise AssertionError("unreachable")


def _key(provider: str, variable: str) -> str:
    key = os.environ.get(variable, "").strip()
    if not key:
        raise MissingKey(provider, variable)
    return key


def _required(voice: AudioVoice, field: str) -> str:
    value: str | None = getattr(voice, field)
    if not value:
        raise ValueError(f"voice {voice.id}: provider {voice.provider} needs `{field}`")
    return value


def _pcm(data: bytes) -> bytes:
    return data[: len(data) - len(data) % 2]


def onsets_of(text: str, pieces: list[str], starts: list[float]) -> tuple[tuple[int, int], ...]:
    """Map timed pieces (characters or words, in order) to code point offsets in `text`.

    Each piece is looked up from where the previous one ended; a piece the provider normalized
    (a digit spelled out, say) is not found and has no onset. Whitespace has none either.
    """
    out: list[tuple[int, int]] = []
    cursor = 0
    for piece, start in zip(pieces, starts, strict=True):
        if not piece.strip():
            continue
        at = text.find(piece, cursor)
        if at < 0:
            continue
        out.append((at, round(start * 1000)))
        cursor = at + len(piece)
    return tuple(out)


class ElevenLabsProvider:
    """Eleven v4 by voice_id, through the with-timestamps endpoint (PCM 22.05 kHz)."""

    name = "elevenlabs"
    API = "https://api.elevenlabs.io"
    KEY = "ELEVENLABS_API_KEY"
    MIN_SPEED, MAX_SPEED = 0.7, 1.2
    #: The documented defaults, pinned so a change of defaults cannot change new clips silently.
    VOICE_SETTINGS: ClassVar[dict[str, Any]] = {
        "stability": 0.5,
        "similarity_boost": 0.75,
        "style": 0.0,
        "use_speaker_boost": True,
    }

    def __init__(self, voice: AudioVoice, transport: Transport = http_post) -> None:
        self.model = _required(voice, "model")
        self.language = _required(voice, "language")
        self.transport = transport

    def version(self) -> str:
        return self.model

    def settings(self) -> dict[str, Any]:
        return {"language": self.language, "voiceSettings": self.VOICE_SETTINGS}

    def speed(self, rate: float) -> float:
        return min(max(rate, self.MIN_SPEED), self.MAX_SPEED)

    @staticmethod
    def seed(request: Request) -> int:
        """Best-effort determinism: the same input and rate ask for the same seed."""
        return seed_of(request)

    def body(self, request: Request) -> dict[str, Any]:
        return {
            "text": request.input,
            "model_id": self.model,
            "language_code": self.language,
            "voice_settings": {**self.VOICE_SETTINGS, "speed": self.speed(request.rate)},
            "seed": self.seed(request),
        }

    def synthesize(self, requests: list[Request]) -> list[Clip]:
        key = _key(self.name, self.KEY)
        out: list[Clip] = []
        for r in requests:
            url = (
                f"{self.API}/v1/text-to-speech/{quote(r.voice, safe='')}/with-timestamps"
                f"?output_format=pcm_{SAMPLE_RATE}"
            )
            headers = {
                "xi-api-key": key,
                "Content-Type": "application/json",
                "Accept": "application/json",
            }
            payload = json.dumps(self.body(r), ensure_ascii=False).encode("utf-8")
            response = json.loads(self.transport(url, headers, payload))
            pcm = _pcm(base64.b64decode(response["audio_base64"]))
            alignment = response.get("alignment")
            words = (
                onsets_of(
                    r.input,
                    list(alignment["characters"]),
                    list(alignment["character_start_times_seconds"]),
                )
                if alignment
                else None
            )
            out.append(Clip(pcm, SAMPLE_RATE, words or None, None))
        return out


class CartesiaProvider:
    """Sonic by voice id, through the server-sent-events endpoint with word timestamps."""

    name = "cartesia"
    API = "https://api.cartesia.ai"
    KEY = "CARTESIA_API_KEY"
    API_VERSION = "2026-08-14"
    MIN_SPEED, MAX_SPEED = 0.6, 1.5

    def __init__(self, voice: AudioVoice, transport: Transport = http_post) -> None:
        self.model = _required(voice, "model")
        self.language = _required(voice, "language")
        self.transport = transport

    def version(self) -> str:
        return self.model

    def settings(self) -> dict[str, Any]:
        return {"language": self.language}

    def speed(self, rate: float) -> float:
        return min(max(rate, self.MIN_SPEED), self.MAX_SPEED)

    def body(self, request: Request) -> dict[str, Any]:
        return {
            "model_id": self.model,
            "transcript": request.input,
            "voice": {"id": request.voice},
            "output_format": {
                "container": "raw",
                "encoding": "pcm_s16le",
                "sample_rate": SAMPLE_RATE,
            },
            "language": self.language,
            "add_timestamps": True,
            "generation_config": {"speed": self.speed(request.rate)},
        }

    @staticmethod
    def events(stream: bytes) -> list[dict[str, Any]]:
        """The JSON events of a text/event-stream body (`data:` lines; blank lines end one)."""
        out: list[dict[str, Any]] = []
        data: list[str] = []
        for line in [*stream.decode("utf-8").splitlines(), ""]:
            if line.startswith("data:"):
                data.append(line[5:].removeprefix(" "))
            elif not line and data:
                out.append(json.loads("\n".join(data)))
                data = []
        return out

    def synthesize(self, requests: list[Request]) -> list[Clip]:
        key = _key(self.name, self.KEY)
        out: list[Clip] = []
        for r in requests:
            headers = {
                "Authorization": f"Bearer {key}",
                "Cartesia-Version": self.API_VERSION,
                "Content-Type": "application/json",
                "Accept": "text/event-stream",
            }
            payload = json.dumps(self.body(r), ensure_ascii=False).encode("utf-8")
            chunks: list[bytes] = []
            words: list[str] = []
            starts: list[float] = []
            for event in self.events(self.transport(f"{self.API}/tts/sse", headers, payload)):
                kind = event.get("type")
                if kind == "error":
                    raise ProviderError(
                        f"cartesia: {event.get('title', '')}: {event.get('message', '')} "
                        f"(request {event.get('request_id', '?')})"
                    )
                if kind == "chunk" and event.get("data"):
                    chunks.append(base64.b64decode(event["data"]))
                elif kind == "timestamps" and event.get("word_timestamps"):
                    stamps = event["word_timestamps"]
                    words += stamps["words"]
                    starts += stamps["start"]
                elif kind == "done":
                    break
            pcm = _pcm(b"".join(chunks))
            if not pcm:
                raise ProviderError(f"cartesia: no audio for {r.input!r}")
            onsets = onsets_of(r.input, words, starts)
            out.append(Clip(pcm, SAMPLE_RATE, onsets or None, None))
        return out


def seed_of(request: Request) -> int:
    """Best-effort determinism: the same voice, input and rate ask for the same seed."""
    key = json.dumps([request.voice, request.input, request.rate], ensure_ascii=False)
    return int.from_bytes(hashlib.sha256(key.encode("utf-8")).digest()[:4], "big")


def checkpoint(model: str) -> tuple[str, str]:
    """A Hugging Face checkpoint pinned to a commit: "owner/name@<40 hex>"."""
    repo, _, revision = model.partition("@")
    if (
        not repo.count("/") == 1
        or len(revision) != 40
        or not all(c in "0123456789abcdef" for c in revision)
    ):
        raise ValueError(f"{model!r}: an OmniVoice model is owner/name@<the 40-hex commit>")
    return repo, revision


class OmniVoiceEngine(Protocol):
    """What the provider needs of an OmniVoice model (a fake one in tests)."""

    sampling_rate: int

    def clone_prompt(self, audio: Path, text: str) -> Any: ...

    def speak(
        self,
        text: str,
        language: str,
        seed: int,
        num_step: int,
        guidance_scale: float,
        **extra: Any,
    ) -> Any:
        """Float samples in [-1, 1]; `extra`: voice_clone_prompt, instruct, speed."""
        ...


class _OmniVoice:
    def __init__(self, model: Any) -> None:
        self.model = model
        self.sampling_rate = int(model.sampling_rate)

    def clone_prompt(self, audio: Path, text: str) -> Any:
        return self.model.create_voice_clone_prompt(ref_audio=str(audio), ref_text=text)

    def speak(
        self,
        text: str,
        language: str,
        seed: int,
        num_step: int,
        guidance_scale: float,
        **extra: Any,
    ) -> Any:
        torch = optional("torch")
        omnivoice = optional("omnivoice")
        torch.manual_seed(seed)
        config = omnivoice.OmniVoiceGenerationConfig(
            num_step=num_step, guidance_scale=guidance_scale
        )
        return self.model.generate(text=text, language=language, generation_config=config, **extra)[
            0
        ]


#: The weights' precision: bfloat16, as the checkpoint was trained. On a CPU with AMX it runs two
#: to three times faster than float32; GPUs from Ampere on run it natively.
OMNIVOICE_DTYPE = "bfloat16"


@cache
def load_omnivoice(repo: str, revision: str) -> OmniVoiceEngine:
    """The OmniVoice model at that commit (cached), on the GPU when there is one."""
    hub = optional("huggingface_hub")
    torch = optional("torch")
    omnivoice = optional("omnivoice")
    path = hub.snapshot_download(repo, revision=revision)
    cuda = bool(torch.cuda.is_available())
    model = omnivoice.OmniVoice.from_pretrained(
        path, device_map="cuda:0" if cuda else "cpu", dtype=getattr(torch, OMNIVOICE_DTYPE)
    )
    return _OmniVoice(model)


def omnivoice_version() -> str:
    from importlib.metadata import version

    return version("omnivoice")


def to_pcm(samples: Any) -> bytes:
    """Float samples in [-1, 1] as s16le: numpy's when it is there (the model's arrays), plain
    Python otherwise (without the speech groups)."""
    try:
        # By name: numpy comes with the speech groups, which CI and its type check leave out.
        np: Any = importlib.import_module("numpy")
    except ImportError:
        pcm = array("h", (round(max(-1.0, min(1.0, float(x))) * 32767.0) for x in samples))
        if sys.byteorder == "big":
            pcm.byteswap()
        return pcm.tobytes()
    data = np.clip(np.asarray(samples, dtype=np.float32), -1.0, 1.0)
    return bytes((data * 32767.0).round().astype("<i2").tobytes())


class OmniVoiceProvider:
    """An OmniVoice checkpoint (`model`: owner/name@commit) speaking `language` in the voice of a
    reference recording. Diffusion sampling is seeded per clip (`seed_of`), so the same input,
    rate and settings give the same clip on the same kind of machine and library versions."""

    name = "omnivoice"
    #: Decoding steps and guidance: OmniVoice's defaults, pinned so a change of defaults cannot
    #: change new clips silently.
    NUM_STEP = 32
    GUIDANCE_SCALE = 2.0

    def __init__(
        self,
        voice: AudioVoice,
        reference: Reference | None,
        load: Callable[[str, str], OmniVoiceEngine] = load_omnivoice,
        package: Callable[[], str] = omnivoice_version,
    ) -> None:
        self.repo, self.revision = checkpoint(_required(voice, "model"))
        self.language = _required(voice, "language")
        if reference is None:
            raise ValueError(
                f"voice {voice.id}: no reference voice {voice.voice!r} in the audio index "
                f"(`nabu audio cast <course> --voice {voice.id}`)"
            )
        self.reference = reference
        self.load = load
        self.package = package

    def version(self) -> str:
        # No spaces or "@": it also names the clips' author (generated:omnivoice@<version>).
        return f"{self.repo}#{self.revision}+omnivoice-{self.package()}"

    def settings(self) -> dict[str, Any]:
        return {
            "language": self.language,
            "numStep": self.NUM_STEP,
            "guidanceScale": self.GUIDANCE_SCALE,
            "dtype": OMNIVOICE_DTYPE,
            "reference": self.reference.sha256,
        }

    def speed(self, rate: float) -> float:
        return rate

    #: Tries per clip: the model can return (almost) nothing for a very short word, once its
    #: silence is trimmed; the next seeds, in order, try again.
    TRIES = 4

    def _speak(self, engine: OmniVoiceEngine, text: str, seed: int, **extra: Any) -> Clip:
        clip = Clip(b"", engine.sampling_rate, None, None)
        for attempt in range(self.TRIES):
            samples = engine.speak(
                text, self.language, seed + attempt, self.NUM_STEP, self.GUIDANCE_SCALE, **extra
            )
            clip = Clip(to_pcm(samples), engine.sampling_rate, None, None)
            if len(clip.pcm) // 2 >= engine.sampling_rate // 10:  # 100 ms
                break
        return clip

    def synthesize(self, requests: list[Request]) -> list[Clip]:
        engine = self.load(self.repo, self.revision)
        prompt = engine.clone_prompt(self.reference.path, self.reference.text)
        out: list[Clip] = []
        for r in requests:
            speed = {} if r.rate == 1.0 else {"speed": r.rate}
            out.append(self._speak(engine, r.input, seed_of(r), voice_clone_prompt=prompt, **speed))
        return out

    def design(self, text: str, instruct: str, seed: int) -> Clip:
        """A reference voice from speaker attributes (voice design), as `nabu audio cast` keeps."""
        return self._speak(self.load(self.repo, self.revision), text, seed, instruct=instruct)

    def design_record(self, instruct: str, seed: int) -> dict[str, Any]:
        """How `design` made a reference, as the audio index keeps it."""
        return {
            "provider": self.name,
            "version": self.version(),
            "language": self.language,
            "instruct": instruct,
            "seed": seed,
            "dtype": OMNIVOICE_DTYPE,
        }


#: Navoiy's runtime (ADR 0059): CosyVoice's source and the CosyVoice2 base model at the commits
#: the checkpoint's own demos were made with (its demo/manifest.json).
COSYVOICE_URL = "https://github.com/FunAudioLLM/CosyVoice"
COSYVOICE_REVISION = "074ca6dc9e80a2f424f1f74b48bdd7d3fea531cc"
COSYVOICE2_BASE = ("FunAudioLLM/CosyVoice2-0.5B", "eec1ae6c79877dbd9379285cf8789c9e0879293d")
#: The fine-tuned LLM of each known checkpoint repo: its file, sha256 and text normalizer.
NAVOIY_WEIGHTS = {
    "aisha-org/navoiy-tts": (
        "emotion_600h_joint.pt",
        "ced40fe65cf0a006a1708fd033cfee37b2c583747d3fd06279ba12d3dbe058af",
        "uztts.normalize",
    ),
}
#: The recording a Navoiy voice is first cloned from (`nabu audio cast`): the prompt of CosyVoice's
#: own examples, which the checkpoint's demos clone too. Path in the source, sha256, license.
NAVOIY_PROMPT = (
    "asset/zero_shot_prompt.wav",
    "c7b31d6dbe7cc6a716dded00550db5b50940bf209e424e4ad207b12e657c8ff6",
    "Apache-2.0",
)
#: The CosyVoice runtime's own environment (pipeline/runtimes/cosyvoice).
COSYVOICE_RUNTIME = Path(__file__).resolve().parents[3] / "runtimes" / "cosyvoice"


class CosyVoiceEngine(Protocol):
    """What the provider needs of a CosyVoice2 model (a fake one in tests)."""

    sampling_rate: int
    #: The CosyVoice source checkout the model runs from.
    source: Path

    def speak(self, text: str, instruct: str, prompt: Path, seed: int, speed: float) -> bytes:
        """s16le mono PCM of `text` in the prompt recording's voice."""
        ...


def runtime_command(runtime: Path = COSYVOICE_RUNTIME) -> list[str]:
    """worker.py in the runtime's environment, which uv makes on first use."""
    import shutil

    uv = shutil.which("uv")
    if uv is None:
        raise ProviderError("navoiy: uv is needed to run the CosyVoice runtime")
    return [uv, "run", "--project", str(runtime), "python", str(runtime / "worker.py")]


class CosyVoiceWorker:
    """The model in its own environment: worker.py of the runtime, spoken to in JSON lines."""

    def __init__(self, config: dict[str, Any], command: list[str] | None = None) -> None:
        import atexit
        import subprocess

        self.process = subprocess.Popen(
            command or runtime_command(),
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            text=True,
            encoding="utf-8",
        )
        atexit.register(self.close)
        ready = self._ask(config)
        if "ready" not in ready:
            raise ProviderError(f"navoiy: the runtime did not start: {ready.get('error', ready)}")
        self.sampling_rate = int(ready["ready"]["sampleRate"])
        self.source = Path(ready["ready"]["source"])

    def _ask(self, message: dict[str, Any]) -> dict[str, Any]:
        stdin, stdout = self.process.stdin, self.process.stdout
        assert stdin is not None and stdout is not None
        stdin.write(json.dumps(message, ensure_ascii=False) + "\n")
        stdin.flush()
        line = stdout.readline()
        if not line:
            raise ProviderError(f"navoiy: the runtime exited ({self.process.wait()})")
        answer: dict[str, Any] = json.loads(line)
        return answer

    def speak(self, text: str, instruct: str, prompt: Path, seed: int, speed: float) -> bytes:
        answer = self._ask(
            {
                "text": text,
                "instruct": instruct,
                "prompt": str(prompt),
                "seed": seed,
                "speed": speed,
            }
        )
        if "error" in answer:
            raise ProviderError(f"navoiy: {text!r}: {answer['error']}")
        return base64.b64decode(answer["pcm"])

    def close(self) -> None:
        if self.process.poll() is None:
            assert self.process.stdin is not None
            self.process.stdin.close()
            self.process.wait(timeout=60)


@cache
def load_navoiy(repo: str, revision: str) -> CosyVoiceEngine:
    """The Navoiy checkpoint at that commit over its CosyVoice2 base, in the runtime (cached)."""
    if repo not in NAVOIY_WEIGHTS:
        raise ValueError(f"{repo}: not a known Navoiy checkpoint ({', '.join(NAVOIY_WEIGHTS)})")
    file, sha256, normalizer = NAVOIY_WEIGHTS[repo]
    return CosyVoiceWorker(
        {
            "runtime": {"url": COSYVOICE_URL, "revision": COSYVOICE_REVISION},
            "base": {"repo": COSYVOICE2_BASE[0], "revision": COSYVOICE2_BASE[1]},
            "checkpoint": {"repo": repo, "revision": revision, "file": file, "sha256": sha256},
            "normalizer": normalizer,
        }
    )


class NavoiyProvider:
    """Navoiy (`model`: aisha-org/navoiy-tts@commit), a CosyVoice2 fine-tune that reads Uzbek in
    Latin script, in the voice of a reference recording. Its LLM samples speech tokens, seeded
    per clip (`seed_of`); the instruction asks for its calm style. No timings."""

    name = "navoiy"
    #: The checkpoint's "calm" (xotirjam) preset, word for word from its emotions_40h.json:
    #: an even, neutral voice for learners.
    STYLE = "calm"
    INSTRUCT = "Speak in a calm, steady, neutral voice with even pacing and relaxed intonation."
    #: float32 everywhere: the same clip on a CPU and a GPU (upstream uses float16 on GPUs).
    DTYPE = "float32"
    TRIES = OmniVoiceProvider.TRIES

    def __init__(
        self,
        voice: AudioVoice,
        reference: Reference | None,
        load: Callable[[str, str], CosyVoiceEngine] = load_navoiy,
    ) -> None:
        self.repo, self.revision = checkpoint(_required(voice, "model"))
        #: Navoiy reads one language; the voice may say which for the record.
        self.language = voice.language or "uz"
        if reference is None:
            raise ValueError(
                f"voice {voice.id}: no reference voice {voice.voice!r} in the audio index "
                f"(`nabu audio cast <course> --voice {voice.id}`)"
            )
        self.reference = reference
        self.load = load

    def version(self) -> str:
        # No spaces or "@": it also names the clips' author (generated:navoiy@<version>).
        return f"{self.repo}#{self.revision}+cosyvoice-{COSYVOICE_REVISION[:12]}"

    def settings(self) -> dict[str, Any]:
        return {
            "base": f"{COSYVOICE2_BASE[0]}#{COSYVOICE2_BASE[1]}",
            "style": self.STYLE,
            "dtype": self.DTYPE,
            "reference": self.reference.sha256,
        }

    def speed(self, rate: float) -> float:
        return rate

    def _speak(
        self, engine: CosyVoiceEngine, text: str, prompt: Path, seed: int, rate: float
    ) -> Clip:
        clip = Clip(b"", engine.sampling_rate, None, None)
        for attempt in range(self.TRIES):
            pcm = engine.speak(text, self.INSTRUCT, prompt, seed + attempt, rate)
            clip = Clip(pcm, engine.sampling_rate, None, None)
            if len(pcm) // 2 >= engine.sampling_rate // 10:  # 100 ms
                break
        return clip

    def synthesize(self, requests: list[Request]) -> list[Clip]:
        engine = self.load(self.repo, self.revision)
        return [
            self._speak(engine, r.input, self.reference.path, seed_of(r), r.rate) for r in requests
        ]

    def design(self, text: str, instruct: str, seed: int) -> Clip:
        """A reference voice, as `nabu audio cast` keeps: the model reads `text` in the voice of
        CosyVoice's prompt recording (NAVOIY_PROMPT). Navoiy cannot design a voice from
        attributes; `instruct` is the style instruction."""
        engine = self.load(self.repo, self.revision)
        path, sha256, _ = NAVOIY_PROMPT
        prompt = engine.source / path
        if hashlib.sha256(prompt.read_bytes()).hexdigest() != sha256:
            raise ProviderError(f"navoiy: {prompt} differs from the pinned prompt recording")
        clip = Clip(b"", engine.sampling_rate, None, None)
        for attempt in range(self.TRIES):
            clip = Clip(
                engine.speak(text, instruct, prompt, seed + attempt, 1.0),
                engine.sampling_rate,
                None,
                None,
            )
            if len(clip.pcm) // 2 >= engine.sampling_rate // 10:
                break
        return clip

    def design_record(self, instruct: str, seed: int) -> dict[str, Any]:
        path, sha256, license = NAVOIY_PROMPT
        return {
            "provider": self.name,
            "version": self.version(),
            "language": self.language,
            "instruct": instruct,
            "seed": seed,
            "dtype": self.DTYPE,
            "prompt": {
                "source": f"{COSYVOICE_URL}/blob/{COSYVOICE_REVISION}/{path}",
                "sha256": sha256,
                "license": license,
            },
        }


PROVIDERS: dict[str, Callable[[AudioVoice, Reference | None], Provider]] = {
    "espeak-ng": lambda _voice, _ref: EspeakProvider(),
    "piper": lambda _voice, _ref: PiperProvider(),
    "elevenlabs": lambda voice, _ref: ElevenLabsProvider(voice),
    "cartesia": lambda voice, _ref: CartesiaProvider(voice),
    "omnivoice": lambda voice, ref: OmniVoiceProvider(voice, ref),
    "navoiy": lambda voice, ref: NavoiyProvider(voice, ref),
}


def provider(voice: AudioVoice, reference: Reference | None = None) -> Provider:
    """The provider of a course voice, configured from it (model, language) and, for a cloning
    provider, its reference voice."""
    if voice.provider not in PROVIDERS:
        raise ValueError(f"unknown TTS provider {voice.provider!r}")
    return PROVIDERS[voice.provider](voice, reference)
