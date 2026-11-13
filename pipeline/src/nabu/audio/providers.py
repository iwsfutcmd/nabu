"""TTS providers behind one interface (gameplan §10.1).

A provider turns requests (input string, voice, relative speed) into PCM. Every clip is then
identified by (provider, version, voice, input, rate), so regenerating a course re-synthesizes
only what changed. Two local providers:

- **espeak-ng**: rule-based, deterministic, small. Reads pinned readings exactly (its
  `yue-Latn-jyutping` voice takes Jyutping), and reports word onsets, so its clips carry exact
  timings. Robotic: the round-trip check usually sends its clips to review.
- **piper**: neural (VITS, ONNX). Natural-sounding where a voice exists; reads text or eSpeak
  phonemes in `[[ ]]`. Its voices carry their own licenses, which the course must declare
  (`AudioVoice.license`): several Piper voices derive from datasets with restrictive terms. A
  voice can be pinned outside rhasspy/piper-voices (`model`), and can say short items inside a
  carrier sentence (`carrier`, ADR 0065). Seeded; no timings.

Two hosted providers, for languages the local voices serve badly (ADR 0042):

- **elevenlabs** (Eleven v4): reads inline IPA between slashes, so pinned readings the
  spelling does not settle (Cantonese polyphones) are passed as IPA; reports per-character
  timestamps. Speed 0.7-1.2.
- **cartesia** (Sonic): word timestamps over server-sent events; speed 0.6-1.5; no seed.

VoxCPM2 for Cantonese (ADR 0094), in its own runtime (pipeline/runtimes/voxcpm):

- **voxcpm**: every clip clones a reference with its transcript. A word card is said after a
  carrier and cut out by forced alignment; a sentence is slowed toward a pace with Rubber Band.

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
import math
import os
import sys
import time
import urllib.error
import urllib.request
from array import array
from collections.abc import Callable
from dataclasses import dataclass, replace
from functools import cache
from pathlib import Path
from typing import Any, ClassVar, Literal, Protocol, runtime_checkable
from urllib.parse import quote

import regex

from nabu.audio import espeak
from nabu.audio.phones import optional
from nabu.audio.punctuation import with_final_stop
from nabu.jsonlines import JsonLinesProcess
from nabu.schema.models import AudioVoice

#: What an item is, as the course's plan says (nabu.audio.course): a word card, said on its own
#: (no closing punctuation, ADR 0094), or a sentence.
Kind = Literal["word", "sentence"]


@dataclass(frozen=True)
class Request:
    input: str
    voice: str
    #: Relative speed: 1 normal, below 1 slower.
    rate: float = 1.0
    #: Which attempt (ADR 0060): a clip a listener rejected is made again with the next take,
    #: which a seeded provider samples with another seed.
    take: int = 0
    #: What the item is, and how many words it has (its word tokens, so a script written without
    #: spaces counts too), from the plan: what a carrier voice goes by, never its input's spaces
    #: or the script of its letters. They reach a clip's identity only through the route they
    #: choose (`item_settings`), and never its seed.
    kind: Kind = "sentence"
    words: int = 1


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
    #: Whether its audio depends on a seed (`seed_of`): only then does a new take sound different.
    seeded: bool

    def version(self) -> str: ...

    def settings(self) -> dict[str, Any]:
        """What shapes the audio besides voice, input and rate: part of each clip's identity."""
        ...

    def speed(self, rate: float) -> float:
        """The rate the provider will actually use for a requested one."""
        ...

    def synthesize(self, requests: list[Request]) -> list[Clip]: ...


#: How `nabu audio cast` makes a cloning voice's reference: "design", the model makes it here,
#: reading the text in a voice an instruction describes (speaker attributes, or a style);
#: "recording", a real speaker's recording is kept (ADR 0076); "designed", a voice the model
#: designed elsewhere is kept with how it was made (ADR 0094).
Cast = Literal["design", "recording", "designed"]


@runtime_checkable
class Caster(Protocol):
    """A provider whose every clip clones a reference voice, and the ways it is cast."""

    name: str
    CASTS: ClassVar[frozenset[Cast]]
    #: The instruction a "design" cast takes when none is given; None if one must be.
    DEFAULT_INSTRUCT: ClassVar[str | None]

    def version(self) -> str: ...

    def design(self, text: str, instruct: str, seed: int) -> Clip:
        """A reference reading `text`, in the voice `instruct` describes."""
        ...

    def design_record(self, instruct: str, seed: int) -> dict[str, Any]:
        """How a reference was designed, as the audio index keeps it."""
        ...


class EspeakProvider:
    name = "espeak-ng"
    seeded = False

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
            # Phoneme input ([[...]], ADR 0082) is what was said; eSpeak's text-to-phonemes call
            # would read the brackets' mnemonics as letters.
            trace = (
                request.input
                if "[[" in request.input
                else " ".join("".join(w) for w in espeak.phonemes(request.input, request.voice))
            )
            words = tuple((w.start, w.ms) for w in s.words if w.length > 0)
            out.append(Clip(s.pcm, s.sample_rate, words, trace))
        return out


PIPER_REPO = "rhasspy/piper-voices"


@cache
def _piper_files(voice: str, model: str | None) -> tuple[Path, Path]:
    """A Piper voice's .onnx and .onnx.json: from rhasspy/piper-voices by id
    ("fa_IR-amir-medium"), or, with `model` ("owner/name@<commit>"), the files named after the
    voice in that repo at that commit."""
    hub = optional("huggingface_hub")
    if model is None:
        lang, name, quality = voice.split("-", 2)
        repo, revision, stem = (
            PIPER_REPO,
            None,
            f"{lang.split('_')[0]}/{lang}/{name}/{quality}/{voice}",
        )
    else:
        (repo, revision), stem = checkpoint(model), voice
    onnx = hub.hf_hub_download(repo, f"{stem}.onnx", revision=revision)
    config = hub.hf_hub_download(repo, f"{stem}.onnx.json", revision=revision)
    return Path(onnx), Path(config)


#: Phoneme input for Piper: IPA words in [[ ]], space-separated, an optional final . or ?
PIPER_WORD = regex.compile(r"\[\[([^\]]*)\]\]")
PIPER_PHONEMES = regex.compile(r"(?:\[\[[^\]]*\]\] ?)+[.?]?")
#: What a voice that lacks an IPA symbol says instead: eSpeak NG's tables write g as IPA ɡ, and a
#: voice of a language without aspiration says it as a following h.
PIPER_FALLBACKS = {"g": "\u0261", "\u02b0": "h"}


class PiperProvider:
    """Piper voices (VITS, ONNX): from rhasspy/piper-voices by id, or a voice pinned elsewhere on
    Hugging Face (`model`: owner/name@commit, `voice`: the file stem). Sampling is seeded per clip
    (`seed_of`). Sentences are joined with SENTENCE_GAP_MS of silence.

    With a `carrier` (ADR 0065), an item of at most `maxWords` words (the request's word tokens:
    a script written without spaces counts too) is said at the end of the carrier sentence with
    durations set from it, and cut out (nabu.audio.carrier). So is any sentence of a longer item
    that the model would collapse (`carrier.collapses`); the item's other sentences are said as
    they are. `item_settings` names that route, so only the items it changes have new
    identities."""

    name = "piper"
    seeded = True
    SENTENCE_GAP_MS = 200
    #: The sampling noise (Piper's default); the duration noise is off on the carrier path.
    NOISE_SCALE = 0.667

    def __init__(self, voice: AudioVoice | None = None) -> None:
        self.voice = voice.voice if voice is not None else None
        self.model = voice.model if voice is not None else None
        carrier = voice.carrier if voice is not None else None
        self.carrier = carrier.text if carrier is not None else None
        self.max_words = carrier.maxWords if carrier is not None else 0

    def version(self) -> str:
        from importlib.metadata import version

        package = version("piper-tts")
        if self.model is None:
            return package
        repo, revision = checkpoint(self.model)
        # No spaces or "@": it also names the clips' author (generated:piper@<version>).
        return f"{repo}#{revision}+piper-{package}"

    def settings(self) -> dict[str, Any]:
        if self.model is None and self.carrier is None:
            return {}
        out: dict[str, Any] = {
            "sentenceGapMs": self.SENTENCE_GAP_MS,
            "noiseScale": self.NOISE_SCALE,
        }
        if self.carrier is not None:
            from nabu.audio import carrier

            out["carrier"] = {
                "text": self.carrier,
                "maxWords": self.max_words,
                "method": carrier.METHOD,
            }
        return out

    def speed(self, rate: float) -> float:
        return rate

    @staticmethod
    @cache
    def _engine(voice: str, model: str | None) -> Any:
        piper = optional("piper")
        onnx, _config = _piper_files(voice, model)
        return piper.PiperVoice.load(onnx), onnx.read_bytes()

    @staticmethod
    @cache
    def _split(voice: str, model: str | None) -> tuple[Any, bytes]:
        """The duration-reading session (deterministic: no duration noise), and the graph that
        takes durations, for a fresh seeded session per clip."""
        from nabu.audio import carrier

        ort = optional("onnxruntime")
        _engine, raw = PiperProvider._engine(voice, model)
        reading, given = carrier.split(raw)
        return ort.InferenceSession(reading, providers=["CPUExecutionProvider"]), given

    def _session(self, graph: bytes, seed: int) -> Any:
        """Piper's sampling draws from onnxruntime's generator, which a seed sets only for a
        session made after it."""
        ort = optional("onnxruntime")
        ort.set_seed(seed % 2**31)
        return ort.InferenceSession(graph, providers=["CPUExecutionProvider"])

    def _ids(self, engine: Any, text: str) -> list[int]:
        return list(engine.phonemes_to_ids([p for s in engine.phonemize(text) for p in s]))

    def _feed(self, ids: list[int], durations: list[float] | None = None) -> dict[str, Any]:
        """The split graph's inputs for phoneme ids, with no duration noise; with `durations`, the
        frames each id is given (the graph that takes them)."""
        np: Any = importlib.import_module("numpy")
        feed = {
            "input": np.array([ids], dtype=np.int64),
            "input_lengths": np.array([len(ids)], dtype=np.int64),
            "scales": np.array([self.NOISE_SCALE, 1.0, 0.0], dtype=np.float32),
        }
        if durations is not None:
            feed["durations"] = np.array([[durations]], dtype=np.float32)
        return feed

    def _frames(self, voice: str, ids: list[int]) -> list[float]:
        """Predicted frames per phoneme id (no duration noise: deterministic)."""
        from nabu.audio import carrier

        reading, _given = self._split(voice, self.model)
        return [float(f) for f in reading.run([carrier.DURATIONS], self._feed(ids))[0][0, 0]]

    def _symbols(self, engine: Any) -> dict[int, str]:
        return {i: p for p, ids in engine.config.phoneme_id_map.items() for i in ids}

    def _floors(self, engine: Any, voice: str) -> tuple[float, float]:
        """The carrier said on its own, as a sentence: a reading the model gets right."""
        from nabu.audio import carrier

        assert self.carrier is not None
        inv = self._symbols(engine)
        alone = self._ids(engine, regex.sub(r"[\p{P}\s]+$", "", self.carrier.rstrip()) + ".")
        return carrier.floors([inv[i] for i in alone], self._frames(voice, alone))

    def _short(self, r: Request) -> bool:
        """Whether the item is said in the carrier: one of at most `maxWords` words."""
        return self.carrier is not None and r.words <= self.max_words

    def _route(self, engine: Any, voice: str, r: Request) -> list[tuple[str, bool]] | None:
        """A longer item's sentences, each with whether the model would collapse it (then it is
        said in the carrier); None when none would, or when the text does not split as Piper
        splits it (then the item is said as it is)."""
        from nabu.audio import carrier

        if self.carrier is None or self._short(r):
            return None
        text = r.input
        parts = carrier.sentences(text)
        whole = [list(engine.phonemes_to_ids(s)) for s in engine.phonemize(text)]
        alone = [self._ids(engine, part) for part in parts]
        if alone != whole:
            return None
        inv = self._symbols(engine)
        floor, _pad = self._floors(engine, voice)
        route = [
            (part, carrier.collapses([inv[i] for i in ids], self._frames(voice, ids), floor))
            for part, ids in zip(parts, alone, strict=True)
        ]
        return route if any(c for _, c in route) else None

    def item_settings(self, request: Request) -> dict[str, Any]:
        """What shapes this item's clip beyond `settings`: the route through its sentences, when a
        sentence goes through the carrier. Empty otherwise, so other clips keep their identity."""
        if self.voice is None or self.carrier is None or self._short(request):
            return {}
        engine, _raw = self._engine(self.voice, self.model)
        route = self._route(engine, self.voice, request)
        if route is None:
            return {}
        return {"sentences": ["carrier" if c else "plain" for _, c in route]}

    def _sentences(
        self, engine: Any, raw: bytes, r: Request, route: list[tuple[str, bool]]
    ) -> Clip:
        """Each sentence on its own, the collapsing ones in the carrier, joined with the gap."""
        clips = [
            self._carried(engine, replace(r, input=part))
            if carried
            else self._plain(engine, raw, replace(r, input=part))
            for part, carried in route
        ]
        rate = clips[0].sample_rate
        # Silence: zero samples, two bytes each (s16le).
        gap = bytes(2 * (rate * self.SENTENCE_GAP_MS // 1000))
        return Clip(gap.join(c.pcm for c in clips), rate, None, None)

    def _plain(self, engine: Any, raw: bytes, r: Request) -> Clip:
        piper = optional("piper")
        np: Any = importlib.import_module("numpy")
        engine.session = self._session(raw, seed_of(r))
        config = piper.SynthesisConfig(length_scale=1 / r.rate, noise_scale=self.NOISE_SCALE)
        chunks: list[Any] = list(engine.synthesize(r.input, syn_config=config))
        rate = int(chunks[0].sample_rate) if chunks else engine.config.sample_rate
        gap = np.zeros(rate * self.SENTENCE_GAP_MS // 1000, dtype=np.int16).tobytes()
        pcm = gap.join(bytes(c.audio_int16_bytes) for c in chunks)
        return Clip(pcm, rate, None, None)

    def _carried(self, engine: Any, r: Request) -> Clip:
        from nabu.audio import carrier

        np: Any = importlib.import_module("numpy")
        assert self.carrier is not None
        _reading, given = self._split(r.voice, self.model)
        inv = self._symbols(engine)
        space = engine.config.phoneme_id_map[carrier.SPACE][0]
        pad = engine.config.phoneme_id_map[carrier.PAD][0]
        lead = self.carrier.rstrip()
        floor_phone, floor_pad = self._floors(engine, r.voice)
        ids = self._ids(engine, f"{lead} {r.input}")
        first = carrier.item_start(ids, self._ids(engine, lead), space, pad)
        if first is None:
            raise ProviderError(f"piper: the carrier is not read the same before {r.input!r}")
        frames = self._frames(r.voice, ids)
        plan = carrier.plan([inv[i] for i in ids], frames, first, floor_phone, floor_pad)
        scaled = (
            [max(1.0, -(-f / r.rate // 1)) for f in plan.frames] if r.rate != 1.0 else plan.frames
        )
        plan = carrier.Plan(scaled, plan.first, plan.last)
        audio = self._session(given, seed_of(r)).run(None, self._feed(ids, plan.frames))[0].ravel()
        hop = engine.config.hop_length
        begin, end = carrier.bounds(plan, hop)
        cut = np.array(audio[begin:end], dtype=np.float32)
        rate = engine.config.sample_rate
        fade_in = min(len(cut), rate * carrier.FADE_IN_MS // 1000)
        fade_out = min(len(cut), rate * carrier.FADE_OUT_MS // 1000)
        cut[:fade_in] *= np.linspace(0, 1, fade_in, dtype=np.float32)
        cut[len(cut) - fade_out :] *= np.linspace(1, 0, fade_out, dtype=np.float32)
        peak = float(np.abs(cut).max()) if len(cut) else 0.0
        if peak < 1e-8:
            raise ProviderError(f"piper: no audio for {r.input!r}")
        trace = "".join(inv[i] for i in ids[plan.first : plan.last + 1])
        return Clip(to_pcm(cut / peak), rate, None, trace)

    def _phonemes(self, engine: Any, raw: bytes, r: Request) -> Clip:
        """IPA given as phonemes, one [[word]] at a time (ADR 0087): no phonemizer, so a voice of
        another language says what a pinned reading says. Words are joined by a space; a final
        . or ? is the intonation."""
        piper = optional("piper")
        np: Any = importlib.import_module("numpy")
        known = engine.config.phoneme_id_map
        phonemes: list[str] = []
        words: list[str] = [str(w) for w in PIPER_WORD.findall(r.input)]
        for i, w in enumerate(words):
            if i:
                phonemes.append(" ")
            said: list[str] = [c if c in known else PIPER_FALLBACKS.get(c, c) for c in w]
            unknown = [c for c in said if c not in known]
            if unknown:
                raise ProviderError(f"piper: {r.voice} has no phoneme {' '.join(unknown)!r}")
            phonemes.extend(said)
        end = r.input.rstrip()[-1:]
        if end in known and end not in "]":
            phonemes.append(end)
        ids = list(engine.phonemes_to_ids(phonemes))
        engine.session = self._session(raw, seed_of(r))
        config = piper.SynthesisConfig(length_scale=1 / r.rate, noise_scale=self.NOISE_SCALE)
        audio = np.asarray(engine.phoneme_ids_to_audio(ids, syn_config=config), dtype=np.float32)
        pcm = (np.clip(audio, -1.0, 1.0) * 32767).astype(np.int16).tobytes()
        return Clip(pcm, int(engine.config.sample_rate), None, "".join(phonemes))

    def synthesize(self, requests: list[Request]) -> list[Clip]:
        out: list[Clip] = []
        for r in requests:
            engine, raw = self._engine(r.voice, self.model)
            if PIPER_PHONEMES.fullmatch(r.input):
                out.append(self._phonemes(engine, raw, r))
                continue
            if self._short(r):
                out.append(self._carried(engine, r))
                continue
            route = self._route(engine, r.voice, r)
            out.append(
                self._plain(engine, raw, r)
                if route is None
                else self._sentences(engine, raw, r, route)
            )
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
    seeded = True
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
    seeded = False
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
    """Best-effort determinism: the same voice, input, rate and take ask for the same seed. A
    first take keeps the seed clips had before takes existed."""
    fields: list[Any] = [request.voice, request.input, request.rate]
    if request.take:
        fields.append(request.take)
    key = json.dumps(fields, ensure_ascii=False)
    return int.from_bytes(hashlib.sha256(key.encode("utf-8")).digest()[:4], "big")


def retried(speak: Callable[[int], bytes], seed: int, tries: int, sample_rate: int) -> bytes:
    """The PCM `speak` makes with `seed`, or, while what it makes lasts under 100 ms (a model can
    give almost nothing for a very short word), with the next seeds in order: `tries` in all,
    the last kept if none is longer."""
    pcm = b""
    for attempt in range(tries):
        pcm = speak(seed + attempt)
        if len(pcm) // 2 >= sample_rate // 10:  # 100 ms
            break
    return pcm


def checkpoint(model: str) -> tuple[str, str]:
    """A Hugging Face checkpoint pinned to a commit: "owner/name@<40 hex>"."""
    repo, _, revision = model.partition("@")
    if (
        not repo.count("/") == 1
        or len(revision) != 40
        or not all(c in "0123456789abcdef" for c in revision)
    ):
        raise ValueError(f"{model!r}: a pinned model is owner/name@<the 40-hex commit>")
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


#: OmniVoice sometimes leaves near-silence around the speech, up to a second before it. A clip keeps
#: LEAD_S before its first and TAIL_S after its last 20 ms within EDGE_DB of its loudest; the tail
#: is the longer, so a soft last sound (an aspirated -s) stays.
EDGE_DB = 40.0
LEAD_S = 0.08
TAIL_S = 0.15


def trim_edges(samples: Any, sampling_rate: int) -> Any:
    """The samples without the near-silence before and after the speech, short margins kept.
    Samples that are all as loud as each other (silence, a level) come back as they are. numpy's
    when it is there (the model's arrays), plain Python otherwise (without the speech groups)."""
    step = max(1, sampling_rate // 50)
    try:
        np: Any = importlib.import_module("numpy")
    except ImportError:
        y: Any = [float(x) for x in samples]
        n = len(y) // step
        rms = [math.sqrt(sum(v * v for v in y[i * step : (i + 1) * step]) / step) for i in range(n)]
    else:
        y = np.asarray(samples, dtype=np.float32)
        n = len(y) // step
        frames = y[: n * step].astype(np.float64).reshape(n, step)
        rms = np.sqrt(np.mean(frames**2, axis=1)).tolist()
    if n < 2 or max(rms) <= 0.0:
        return samples
    floor = max(rms) * 10 ** (-EDGE_DB / 20)
    loud = [i for i, r in enumerate(rms) if r >= floor]
    if loud[0] == 0 and loud[-1] == n - 1:
        return samples
    start = max(0, loud[0] * step - round(LEAD_S * sampling_rate))
    end = min(len(y), (loud[-1] + 1) * step + round(TAIL_S * sampling_rate))
    return y[start:end]


class OmniVoiceProvider:
    """An OmniVoice checkpoint (`model`: owner/name@commit) speaking `language` in the voice of a
    reference recording. Diffusion sampling is seeded per clip (`seed_of`), so the same input,
    rate and settings give the same clip on the same kind of machine and library versions."""

    name = "omnivoice"
    seeded = True
    #: Its reference: designed from speaker attributes, or a real speaker's recording.
    CASTS: ClassVar[frozenset[Cast]] = frozenset({"design", "recording"})
    DEFAULT_INSTRUCT: ClassVar[str | None] = None
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
        rate = engine.sampling_rate

        def said(s: int) -> bytes:
            samples = engine.speak(
                text, self.language, s, self.NUM_STEP, self.GUIDANCE_SCALE, **extra
            )
            return to_pcm(trim_edges(samples, rate))

        return Clip(retried(said, seed, self.TRIES, rate), rate, None, None)

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
        raise ProviderError(f"uv is needed to run the {runtime.name} runtime")
    return [uv, "run", "--project", str(runtime), "python", str(runtime / "worker.py")]


class RuntimeWorker(JsonLinesProcess):
    """A model in its own environment: worker.py of a runtime (pipeline/runtimes), spoken to in
    JSON lines. Its first message is what to load, which it answers {"ready": {...}}; each later
    one asks for a clip, answered {"pcm": <base64 s16le>} or {"error": ...}. Ended when Python
    exits, if not before."""

    #: Names the runtime in errors.
    label: ClassVar[str]

    def __init__(self, config: dict[str, Any], command: list[str]) -> None:
        import atexit

        super().__init__(command, timeout=60)
        atexit.register(self.close)
        ready = self._ask(config)
        if "ready" not in ready:
            raise ProviderError(
                f"{self.label}: the runtime did not start: {ready.get('error', ready)}"
            )
        self.ready: dict[str, Any] = ready["ready"]
        self.sampling_rate = int(self.ready["sampleRate"])

    def _ask(self, message: dict[str, Any]) -> dict[str, Any]:
        answer = self.ask(message)
        if answer is None:
            raise ProviderError(f"{self.label}: the runtime exited ({self.process.wait()})")
        return answer

    def _pcm(self, message: dict[str, Any]) -> bytes:
        """The clip a message asks for; its error, if the runtime gives one."""
        answer = self._ask(message)
        if "error" in answer:
            raise ProviderError(f"{self.label}: {message['text']!r}: {answer['error']}")
        return base64.b64decode(answer["pcm"])


class CosyVoiceWorker(RuntimeWorker):
    """The CosyVoice runtime's worker.py (Navoiy)."""

    label = "navoiy"

    def __init__(self, config: dict[str, Any], command: list[str] | None = None) -> None:
        super().__init__(config, command or runtime_command())
        self.source = Path(self.ready["source"])

    def speak(self, text: str, instruct: str, prompt: Path, seed: int, speed: float) -> bytes:
        return self._pcm(
            {
                "text": text,
                "instruct": instruct,
                "prompt": str(prompt),
                "seed": seed,
                "speed": speed,
            }
        )


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
    seeded = True
    #: The checkpoint's "calm" (xotirjam) preset, word for word from its emotions_40h.json:
    #: an even, neutral voice for learners.
    STYLE = "calm"
    INSTRUCT = "Speak in a calm, steady, neutral voice with even pacing and relaxed intonation."
    #: Its reference: the text read in the voice of CosyVoice's prompt recording, in a style.
    CASTS: ClassVar[frozenset[Cast]] = frozenset({"design"})
    DEFAULT_INSTRUCT: ClassVar[str | None] = INSTRUCT
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
        pcm = retried(
            lambda s: engine.speak(text, self.INSTRUCT, prompt, s, rate),
            seed,
            self.TRIES,
            engine.sampling_rate,
        )
        return Clip(pcm, engine.sampling_rate, None, None)

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
        pcm = retried(
            lambda s: engine.speak(text, instruct, prompt, s, 1.0),
            seed,
            self.TRIES,
            engine.sampling_rate,
        )
        return Clip(pcm, engine.sampling_rate, None, None)

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


# ------------------------------------------------------------------------------- VoxCPM2 (ADR 0094)

#: The VoxCPM2 runtime's own environment (pipeline/runtimes/voxcpm) and the package it pins.
VOXCPM_RUNTIME = Path(__file__).resolve().parents[3] / "runtimes" / "voxcpm"
VOXCPM_PACKAGE = "2.0.3"


class VoxCPMEngine(Protocol):
    """What the provider needs of VoxCPM2 (a fake one in tests)."""

    sampling_rate: int

    def speak(self, text: str, prompt: Path, prompt_text: str, seed: int) -> bytes:
        """s16le mono PCM of `text`, cloning the prompt recording with its transcript."""
        ...

    def design(self, text: str, instruct: str, seed: int) -> bytes:
        """s16le mono PCM of `text` in a voice designed from `instruct`."""
        ...


class VoxCPMWorker(RuntimeWorker):
    """The VoxCPM2 runtime's worker.py."""

    label = "voxcpm"

    def __init__(self, config: dict[str, Any], command: list[str] | None = None) -> None:
        super().__init__(config, command or runtime_command(VOXCPM_RUNTIME))

    def speak(self, text: str, prompt: Path, prompt_text: str, seed: int) -> bytes:
        return self._pcm(
            {"text": text, "prompt": str(prompt), "promptText": prompt_text, "seed": seed}
        )

    def design(self, text: str, instruct: str, seed: int) -> bytes:
        return self._pcm({"text": text, "instruct": instruct, "seed": seed})


@cache
def load_voxcpm(repo: str, revision: str) -> VoxCPMEngine:
    """VoxCPM2 at that commit, in the runtime (cached)."""
    return VoxCPMWorker(
        {
            "model": {"repo": repo, "revision": revision},
            "cfg": VoxCPMProvider.CFG,
            "steps": VoxCPMProvider.STEPS,
        }
    )


def _samples(pcm: bytes) -> array[int]:
    out = array("h")
    out.frombytes(pcm)
    if sys.byteorder == "big":
        out.byteswap()
    return out


def _pcm_of(samples: array[int]) -> bytes:
    out = array("h", samples)
    if sys.byteorder == "big":
        out.byteswap()
    return out.tobytes()


def speech_span(pcm: bytes, sample_rate: int, floor: float = 0.05) -> tuple[int, int]:
    """First and last sample of the speech: the 20 ms frames within `floor` of the loudest."""
    x = _samples(pcm)
    step = max(1, sample_rate // 50)
    n = len(x) // step
    rms = [math.sqrt(sum(v * v for v in x[i * step : (i + 1) * step]) / step) for i in range(n)]
    if n == 0 or max(rms) <= 0.0:
        return 0, len(x)
    loud = [i for i, r in enumerate(rms) if r >= max(rms) * floor]
    return loud[0] * step, (loud[-1] + 1) * step


def faded(pcm: bytes, sample_rate: int, fade_in_ms: int = 10, fade_out_ms: int = 40) -> bytes:
    """Short linear fades, so a cut does not click."""
    x = _samples(pcm)
    a, b = sample_rate * fade_in_ms // 1000, sample_rate * fade_out_ms // 1000
    for i in range(min(a, len(x))):
        x[i] = round(x[i] * i / a)
    for i in range(min(b, len(x))):
        x[len(x) - 1 - i] = round(x[len(x) - 1 - i] * i / b)
    return _pcm_of(x)


def rubberband_stretch(pcm: bytes, sample_rate: int, stretch: float) -> bytes:
    """`stretch` times longer, pitch and formants kept: Rubber Band's R3 engine (the CLI)."""
    import shutil
    import subprocess
    import tempfile
    import wave

    exe = shutil.which("rubberband")
    if exe is None:
        raise ProviderError("voxcpm: pacing needs Rubber Band (apt install rubberband-cli)")
    with tempfile.TemporaryDirectory() as tmp:
        src, dst = Path(tmp) / "in.wav", Path(tmp) / "out.wav"
        with wave.open(str(src), "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(sample_rate)
            w.writeframes(pcm)
        subprocess.run(
            [exe, "-q", "--fine", "--formant", "-T", f"{1 / stretch:.6f}", str(src), str(dst)],
            check=True,
            capture_output=True,
        )
        with wave.open(str(dst), "rb") as r:
            return r.readframes(r.getnframes())


#: Scripts whose syllables `pace` counts: one Han character is one syllable (ADR 0094).
PACED_SCRIPTS = frozenset({"Hani", "Hans", "Hant"})
_HAN = regex.compile(r"\p{Han}")


class VoxCPMProvider:
    """VoxCPM2 (`model`: openbmb/VoxCPM2@commit) cloning a reference recording and its transcript
    (ADR 0094). Sampling is seeded per clip (`seed_of`). A word card (the request's kind: no
    closing punctuation) is said after the `carrier`, ended with its script's full stop, and cut
    out by forced alignment; a sentence is slowed toward the `pace`, in syllables a second,
    which only a Han script's voice can count. No timings: `nabu audio align` gives them."""

    name = "voxcpm"
    seeded = True
    #: Its reference: a voice it designed (on a GPU, from a description), kept with how it was
    #: designed.
    CASTS: ClassVar[frozenset[Cast]] = frozenset({"designed"})
    DEFAULT_INSTRUCT: ClassVar[str | None] = None
    #: Guidance and diffusion steps: VoxCPM2's defaults, pinned so a change of defaults cannot
    #: change new clips silently.
    CFG = 2.0
    STEPS = 10
    TRIES = OmniVoiceProvider.TRIES
    #: Around a word cut from the carrier: before it, and after it (its last sound's tail).
    LEAD_MS = 40
    TAIL_MS = 150
    #: Shapes the clips: part of their identity, so changing how they are made means a new id.
    CARRIER_METHOD = "voxcpm-align-1"
    PACE_METHOD = "rubberband-r3-formant-1"

    def __init__(
        self,
        voice: AudioVoice,
        reference: Reference | None,
        load: Callable[[str, str], VoxCPMEngine] = load_voxcpm,
        align: Callable[[bytes, int, list[list[str]]], Any] | None = None,
        phonemes: Callable[[str, str], list[list[str]]] = espeak.phonemes,
        stretch: Callable[[bytes, int, float], bytes] = rubberband_stretch,
    ) -> None:
        self.repo, self.revision = checkpoint(_required(voice, "model"))
        #: The eSpeak NG voice the aligner's phones come from ("yue").
        self.language = _required(voice, "language")
        #: The language tag of what the voice reads ("yue-Hant-HK"): its script's full stop
        #: ends a word card said after the carrier.
        self.tag = voice.orthography.split("/")[0]
        self.carrier = voice.carrier.text if voice.carrier is not None else None
        self.pace = voice.pace
        if reference is None:
            raise ValueError(
                f"voice {voice.id}: no reference voice {voice.voice!r} in the audio index "
                f"(`nabu audio cast <course> --voice {voice.id}`)"
            )
        script = next((s for s in self.tag.split("-")[1:] if len(s) == 4 and s.isalpha()), None)
        if self.pace is not None and script not in PACED_SCRIPTS:
            raise ValueError(
                f"voice {voice.id}: `pace` counts syllables as Han characters, and "
                f"{voice.orthography} is not written in them"
            )
        self.reference = reference
        self.load = load
        self.align = align
        self.phonemes = phonemes
        self.stretch = stretch

    def version(self) -> str:
        # No spaces or "@": it also names the clips' author (generated:voxcpm@<version>).
        return f"{self.repo}#{self.revision}+voxcpm-{VOXCPM_PACKAGE}"

    def settings(self) -> dict[str, Any]:
        return {"cfg": self.CFG, "steps": self.STEPS, "reference": self.reference.sha256}

    def speed(self, rate: float) -> float:
        return 1.0

    def carried(self, request: Request) -> bool:
        return self.carrier is not None and request.kind == "word"

    def item_settings(self, request: Request) -> dict[str, Any]:
        """The route of one item, in its clip's identity alone (ADR 0094)."""
        if self.carried(request):
            return {"carrier": {"text": self.carrier, "method": self.CARRIER_METHOD}}
        if self.pace is not None:
            return {
                "pace": {
                    "target": self.pace.target,
                    "maxStretch": self.pace.maxStretch,
                    "method": self.PACE_METHOD,
                }
            }
        return {}

    def _aligner(self) -> Callable[[bytes, int, list[list[str]]], Any]:
        if self.align is None:
            from nabu.audio.phones import align_words

            self.align = align_words
        return self.align

    def _cut(self, pcm: bytes, sample_rate: int, carrier: str, word: str) -> bytes:
        """The word after the carrier, by forced alignment of the two."""
        words = [
            [p for w in self.phonemes(carrier, self.language) for p in w],
            [p for w in self.phonemes(word, self.language) for p in w],
        ]
        timing = self._aligner()(pcm, sample_rate, words)[1]
        per_ms = sample_rate / 1000
        start = max(0, round((timing.start_ms - self.LEAD_MS) * per_ms))
        end = min(len(pcm) // 2, round((timing.end_ms + self.TAIL_MS) * per_ms))
        return faded(pcm[start * 2 : end * 2], sample_rate)

    def _paced(self, pcm: bytes, sample_rate: int, text: str) -> bytes:
        """Slowed toward the pace, if the voice says it faster (ADR 0094)."""
        if self.pace is None:
            return pcm
        syllables = len(_HAN.findall(text))
        start, end = speech_span(pcm, sample_rate)
        seconds = (end - start) / sample_rate
        if syllables == 0 or seconds <= 0:
            return pcm
        stretch = min(self.pace.maxStretch, syllables / seconds / self.pace.target)
        return pcm if stretch <= 1.0 else self.stretch(pcm, sample_rate, stretch)

    def _speak(self, engine: VoxCPMEngine, text: str, seed: int) -> bytes:
        return retried(
            lambda s: engine.speak(text, self.reference.path, self.reference.text, s),
            seed,
            self.TRIES,
            engine.sampling_rate,
        )

    def synthesize(self, requests: list[Request]) -> list[Clip]:
        engine = self.load(self.repo, self.revision)
        rate = engine.sampling_rate
        out: list[Clip] = []
        for r in requests:
            if self.carried(r):
                carrier = cast_str(self.carrier)
                said = with_final_stop(carrier + r.input, self.tag)
                pcm = self._cut(self._speak(engine, said, seed_of(r)), rate, carrier, r.input)
            else:
                pcm = self._speak(engine, r.input, seed_of(r))
                start, end = speech_span(pcm, rate)
                lead, tail = round(LEAD_S * rate), round(TAIL_S * rate)
                pcm = pcm[max(0, start - lead) * 2 : min(len(pcm) // 2, end + tail) * 2]
                pcm = self._paced(pcm, rate, r.input)
            out.append(Clip(pcm, rate, None, None))
        return out

    def design(self, text: str, instruct: str, seed: int) -> Clip:
        """A voice designed from a description, as `nabu audio cast` keeps (its first step)."""
        engine = self.load(self.repo, self.revision)
        return Clip(engine.design(text, instruct, seed), engine.sampling_rate, None, None)

    def design_record(self, instruct: str, seed: int) -> dict[str, Any]:
        return {
            "provider": self.name,
            "version": self.version(),
            "language": self.language,
            "instruct": instruct,
            "seed": seed,
        }


def cast_str(value: str | None) -> str:
    if value is None:
        raise ValueError("no carrier")
    return value


PROVIDERS: dict[str, Callable[[AudioVoice, Reference | None], Provider]] = {
    "espeak-ng": lambda _voice, _ref: EspeakProvider(),
    "piper": lambda voice, _ref: PiperProvider(voice),
    "elevenlabs": lambda voice, _ref: ElevenLabsProvider(voice),
    "cartesia": lambda voice, _ref: CartesiaProvider(voice),
    "omnivoice": lambda voice, ref: OmniVoiceProvider(voice, ref),
    "navoiy": lambda voice, ref: NavoiyProvider(voice, ref),
    "voxcpm": lambda voice, ref: VoxCPMProvider(voice, ref),
}


def provider(voice: AudioVoice, reference: Reference | None = None) -> Provider:
    """The provider of a course voice, configured from it (model, language) and, for a cloning
    provider, its reference voice."""
    if voice.provider not in PROVIDERS:
        raise ValueError(f"unknown TTS provider {voice.provider!r}")
    return PROVIDERS[voice.provider](voice, reference)
