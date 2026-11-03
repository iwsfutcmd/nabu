"""Phone-level speech model: forced alignment and round-trip phone recognition (§10.1, §10.3).

One multilingual CTC model, wav2vec2-xlsr-53-espeak-cv-ft, does both jobs. Its outputs are
eSpeak NG's IPA phones, the same phones eSpeak gives for the expected reading, so:
- **forced alignment**: the expected phones of each token, aligned to the model's frame
  posteriors by CTC Viterbi, give every token's start and end (karaoke, tap-a-word);
- **round-trip check**: the phones the model hears, decoded greedily, are compared with the
  expected phones (phone error rate), and for polyphones with the other reading too.

Needs the `speech` dependency group (PyTorch, transformers) and downloads the model (~1.3 GB)
on first use.
"""

from __future__ import annotations

import importlib
import json
import re
import subprocess
from dataclasses import dataclass
from functools import cache
from typing import Any


def optional(module: str) -> Any:
    """A module of the optional `speech` group (untyped ML libraries), imported on first use."""
    return importlib.import_module(module)


MODEL = "facebook/wav2vec2-xlsr-53-espeak-cv-ft"
SAMPLE_RATE = 16_000
_TONE = re.compile(r"[0-9]+")
_MARKS = re.compile("[ˈˌ͜͡]")


@dataclass(frozen=True)
class Model:
    name: str
    vocab: dict[str, int]
    blank: int
    extractor: Any
    network: Any


@cache
def model() -> Model:
    torch = optional("torch")
    hub = optional("huggingface_hub")
    transformers = optional("transformers")
    torch.set_num_threads(4)
    with open(hub.hf_hub_download(MODEL, "vocab.json"), encoding="utf-8") as f:
        vocab: dict[str, int] = json.load(f)
    extractor = transformers.Wav2Vec2FeatureExtractor.from_pretrained(MODEL)
    network = transformers.AutoModelForCTC.from_pretrained(MODEL).eval()
    return Model(MODEL, vocab, vocab["<pad>"], extractor, network)


def to_16k(pcm: bytes, sample_rate: int) -> Any:
    """Signed 16-bit mono PCM at any rate → float32 samples at 16 kHz (ffmpeg's resampler)."""
    np = optional("numpy")

    command = ["ffmpeg", "-v", "error", "-f", "s16le", "-ar", str(sample_rate), "-ac", "1"]
    out = subprocess.run(
        [*command, "-i", "-", "-f", "f32le", "-ar", str(SAMPLE_RATE), "-ac", "1", "-"],
        input=pcm,
        capture_output=True,
        check=True,
    ).stdout
    return np.frombuffer(out, dtype=np.float32).copy()


def emissions(audio: Any) -> Any:
    """Log-posteriors over the phone vocabulary, one row per 20 ms frame."""
    torch = optional("torch")

    m = model()
    inputs = m.extractor(audio, sampling_rate=SAMPLE_RATE, return_tensors="pt")
    with torch.inference_mode():
        logits = m.network(inputs.input_values).logits[0]
    return torch.log_softmax(logits, dim=-1).numpy()


def phone_ids(phones: list[str], vocab: dict[str, int]) -> list[int]:
    """Maps eSpeak IPA phones onto the model's vocabulary.

    The vocabulary holds most eSpeak phones as single symbols. Where a phone is missing (a
    Cantonese tone digit, a rare diacritic), fall back to the phone without its tone, then
    to its longest known pieces; anything still unknown is left out rather than guessed.
    """
    ids: list[int] = []
    for raw in phones:
        p = _MARKS.sub("", raw)
        for candidate in (p, _TONE.sub("", p)):
            if candidate in vocab:
                ids.append(vocab[candidate])
                break
        else:
            rest = _TONE.sub("", p)
            while rest:
                for size in range(len(rest), 0, -1):
                    if rest[:size] in vocab:
                        ids.append(vocab[rest[:size]])
                        rest = rest[size:]
                        break
                else:
                    rest = rest[1:]
    return ids


def ctc_align(log_probs: Any, labels: list[int], blank: int) -> list[tuple[int, int]]:
    """CTC Viterbi forced alignment: each label's [first, last] frame.

    The standard trellis over blank-interleaved labels (2L + 1 states): stay, step to the next
    state, or skip a blank between two different labels.
    """
    np = optional("numpy")
    frames: int = log_probs.shape[0]
    states = [blank]
    for label in labels:
        states += [label, blank]
    n = len(states)
    neg = np.float32(-1e30)
    score = np.full((frames, n), neg, dtype=np.float32)
    back = np.zeros((frames, n), dtype=np.int8)  # 0 stay, 1 from s-1, 2 from s-2
    emit = log_probs[:, states]
    score[0, 0] = emit[0, 0]
    if n > 1:
        score[0, 1] = emit[0, 1]
    skip_ok = np.array(
        [s >= 2 and states[s] != blank and states[s] != states[s - 2] for s in range(n)]
    )
    for t in range(1, frames):
        prev = score[t - 1]
        stay = prev
        step = np.concatenate(([neg], prev[:-1]))
        skip = np.where(skip_ok, np.concatenate(([neg, neg], prev[:-2])), neg)
        best = np.maximum(stay, np.maximum(step, skip))
        back[t] = np.where(best == stay, 0, np.where(best == step, 1, 2))
        score[t] = best + emit[t]
    end = n - 1 if n == 1 or score[-1, n - 1] >= score[-1, n - 2] else n - 2
    path = [end]
    s = end
    for t in range(frames - 1, 0, -1):
        s -= int(back[t, s])
        path.append(s)
    path.reverse()
    spans: list[tuple[int, int]] = [(-1, -1)] * len(labels)
    for t, s in enumerate(path):
        if s % 2 == 1:
            i = s // 2
            first, _ = spans[i]
            spans[i] = (t if first < 0 else first, t)
    return spans


@dataclass(frozen=True)
class Timing:
    start_ms: int
    end_ms: int


#: A silent stretch this long between two words is a pause; shorter, a stop closure (§10.3).
PAUSE_MS = 150
CLOSURE_MS = 30
#: CTC fires late in a phone; with no silence to go by, a word starts at most this much earlier.
CTC_LEAD_MS = 60


def _quiet_frames(audio: Any, frame_ms: int = 10) -> list[bool]:
    """Which 10 ms frames are near-silent (below 2% of the clip's loudest frame)."""
    np = optional("numpy")
    width = SAMPLE_RATE * frame_ms // 1000
    count = max(1, len(audio) // width)
    rms = np.sqrt((audio[: count * width].reshape(count, width) ** 2).mean(axis=1))
    return [bool(x) for x in rms < 0.02 * float(rms.max() or 1)]


def _boundary(prev_end: float, first: float, quiet: list[bool], frame_ms: int = 10) -> float:
    """Where a word starts, between the previous word's last phone and its own first one.

    CTC posteriors are peaky and late, so the first frame of a word's first phone is after its
    onset. Inside the gap: after a pause, the word starts when sound resumes; across a short
    silence (a stop closure), when the silence starts; otherwise half way, at most CTC_LEAD_MS
    before the first phone. Measured against eSpeak NG's own word onsets: mean error 29 ms.
    """
    a, b = int(prev_end // frame_ms), int(first // frame_ms)
    best = (0, a, a)
    i = a
    while i <= b and i < len(quiet):
        if quiet[i]:
            j = i
            while j <= b and j < len(quiet) and quiet[j]:
                j += 1
            if j - i > best[0]:
                best = (j - i, i, j)
            i = j
        else:
            i += 1
    run, start, end = best
    if run * frame_ms >= PAUSE_MS:
        return end * frame_ms
    if run * frame_ms >= CLOSURE_MS:
        return start * frame_ms
    return max((prev_end + first) / 2, first - CTC_LEAD_MS)


def align_words(pcm: bytes, sample_rate: int, words: list[list[str]]) -> list[Timing]:
    """Start and end of each word (a token's phones) in the clip, by CTC forced alignment."""
    m = model()
    audio = to_16k(pcm, sample_rate)
    log_probs = emissions(audio)
    ms_per_frame = len(audio) / SAMPLE_RATE * 1000 / log_probs.shape[0]
    ids = [phone_ids(w, m.vocab) for w in words]
    spans = ctc_align(log_probs, [i for w in ids for i in w], m.blank)
    quiet = _quiet_frames(audio)
    firsts: list[float] = []
    lasts: list[float] = []
    k = 0
    for w in ids:
        mine = spans[k : k + len(w)] or [(-1, -1)]
        k += len(w)
        firsts.append(max(0, mine[0][0]) * ms_per_frame)
        lasts.append((max(0, mine[-1][1]) + 1) * ms_per_frame)
    starts = [firsts[0]] + [
        _boundary(lasts[i - 1], firsts[i], quiet) for i in range(1, len(firsts))
    ]
    duration = len(audio) / SAMPLE_RATE * 1000
    return [
        Timing(
            round(start), round(starts[i + 1] if i + 1 < len(starts) else min(duration, lasts[i]))
        )
        for i, start in enumerate(starts)
    ]


def recognize(pcm: bytes, sample_rate: int) -> list[str]:
    """The phones the model hears (greedy CTC decoding)."""
    m = model()
    log_probs = emissions(to_16k(pcm, sample_rate))
    inverse = {i: p for p, i in m.vocab.items()}
    best = log_probs.argmax(axis=-1).tolist()
    out: list[str] = []
    previous = -1
    for i in best:
        if i != previous and i != m.blank:
            out.append(inverse[i])
        previous = i
    return [p for p in out if not p.startswith("<")]


def phone_error_rate(heard: list[str], expected: list[str]) -> float:
    """Levenshtein distance over phones, divided by the expected length (tones ignored)."""
    a = [_TONE.sub("", p) for p in heard]
    b = [_TONE.sub("", p) for p in expected]
    row = list(range(len(b) + 1))
    for i, x in enumerate(a, start=1):
        prev, row[0] = row[0], i
        for j, y in enumerate(b, start=1):
            prev, row[j] = row[j], min(row[j] + 1, row[j - 1] + 1, prev + (x != y))
    return row[len(b)] / max(1, len(b))
