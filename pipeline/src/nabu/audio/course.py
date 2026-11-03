"""A course's audio (gameplan §10): plan, synthesize, check and index its clips.

`nabu audio <course>` compiles the course, then for each sentence (and each word KC) reads
the course voice's orthography:
- the voice reads the **pinned reading** when it has one (Jyutping for Cantonese), never raw
  characters, so polyphones are said as the content says; otherwise the form's text,
  punctuation included (it carries the intonation of questions and exclamations). A voice that
  reads text but takes inline IPA (`pronounce`) gets IPA for every token whose spelling does
  not settle its pinned reading, and the plain spelling for the rest;
- each clip comes at normal and slow speed;
- word onsets reported by the synthesizer are mapped back to the sentence's tokens, the same
  token indices the app highlights (karaoke) and taps;
- clips are MP3, content-addressed by their synthesis input, and listed with license,
  provenance and QA in `courses/<id>/audio/index.yaml`, which is checked in. The compiler
  only reads it, so CI never needs a speech model.

Human recordings (`ingest`) live in the same index and are never touched by regeneration.
"""

from __future__ import annotations

import hashlib
import json
import subprocess
import tempfile
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

from nabu import yamlio
from nabu.audio import jyutping
from nabu.audio.providers import Clip, Provider, Request, provider
from nabu.schema.models import AudioIndex, AudioVoice

INDEX = "index.yaml"
SLOW = 0.67
#: Bitrate of the MP3s: speech, mono.
BITRATE = "48k"
#: Clips synthesized between saves of the index.
BATCH = 16
#: Reading schemes `pronounce` can turn into IPA.
IPA_SCHEMES = {"jyutping"}
WORD_KINDS = {"word", "number"}


@dataclass(frozen=True)
class Span:
    token: int
    start: int  # character offset in the synthesis input
    end: int


@dataclass(frozen=True)
class Item:
    item: str  # sentence id or KC id
    input: str
    spans: tuple[Span, ...]
    expected: str  # what a listener should hear, in the orthography (for the round-trip check)


@dataclass
class Report:
    synthesized: int = 0
    kept: int = 0
    removed: int = 0
    skipped: list[str] = field(default_factory=lambda: [])


def audio_dir(course: Path) -> Path:
    """Where a course's audio lives: audio/ beside course.yaml, or <name>.audio/ beside a
    single-file course <name>.yaml (the lint fixtures)."""
    if course.is_dir():
        return course / "audio"
    return course.parent / ("audio" if course.name == "course.yaml" else f"{course.stem}.audio")


def read_index(adir: Path) -> AudioIndex:
    path = adir / INDEX
    if not path.exists():
        return AudioIndex(version=1, clips=[])
    return AudioIndex.model_validate(yaml.safe_load(path.read_text(encoding="utf-8")))


def write_index(adir: Path, index: AudioIndex) -> None:
    data = index.model_dump(mode="json", by_alias=True, exclude_none=True)
    data["clips"] = sorted(data["clips"], key=lambda c: (c["item"], c["speed"]))
    header = (
        "# Written by `nabu audio`: clips, licenses, provenance, timings, QA. Never hand-edit.\n"
    )
    (adir / INDEX).write_text(header + yamlio.dump(data), encoding="utf-8")


def pronounced(surface: str, reading: str, scheme: str) -> str:
    """A token as a `pronounce` voice reads it: its spelling where that settles the pinned
    reading, else the reading in IPA between slashes."""
    if scheme not in IPA_SCHEMES:
        raise ValueError(f"no IPA conversion for the reading scheme {scheme!r}")
    return surface if jyutping.settled(surface, reading) else f"/{jyutping.ipa(reading)}/"


def _scheme(voice: AudioVoice) -> str | None:
    """The pinned reading scheme the voice depends on, if any."""
    return voice.reading if voice.reading != "text" else voice.pronounce


def _input_of(
    tokens: list[dict[str, Any]], voice: AudioVoice
) -> tuple[str, tuple[Span, ...]] | None:
    """The string the voice reads, and where each word token sits in it (None: a word token
    lacks the pinned reading the voice needs)."""
    parts: list[str] = []
    spans: list[Span] = []
    offset = 0
    if voice.reading != "text":
        # Pinned readings of the words, space-separated (punctuation has no reading).
        for i, token in enumerate(tokens):
            if token.get("kind") not in WORD_KINDS:
                continue
            piece = token.get("readings", {}).get(voice.reading)
            if piece is None:
                return None
            if parts:
                offset += 1
            spans.append(Span(i, offset, offset + len(piece)))
            parts.append(piece)
            offset += len(piece)
        return (" ".join(parts), tuple(spans)) if parts else None
    # The form's text, every token in order: punctuation and spacing included.
    for i, token in enumerate(tokens):
        piece = str(token["surface"])
        if token.get("kind") in WORD_KINDS:
            if voice.pronounce is not None:
                reading = token.get("readings", {}).get(voice.pronounce)
                if reading is None:
                    return None
                piece = pronounced(piece, reading, voice.pronounce)
            spans.append(Span(i, offset, offset + len(piece)))
        parts.append(piece)
        offset += len(piece)
    return ("".join(parts), tuple(spans)) if spans else None


def plan(units: list[dict[str, Any]], voice: AudioVoice) -> tuple[list[Item], list[str]]:
    """Sentences and word KCs the voice can read, and the ones it cannot (no pinned reading)."""
    orth = voice.orthography
    items: list[Item] = []
    skipped: list[str] = []
    if voice.pronounce is not None and voice.pronounce not in IPA_SCHEMES:
        raise ValueError(f"no IPA conversion for the reading scheme {voice.pronounce!r}")
    scheme = _scheme(voice)
    readings: dict[str, str] = {}  # surface → pinned reading, learned from sentence tokens
    for unit in units:
        for s in unit["sentences"]:
            form = s["forms"].get(orth)
            if form is None:
                continue
            tokens = form["text"]["tokens"]
            for t in tokens:
                if scheme is not None and scheme in t.get("readings", {}):
                    readings.setdefault(t["surface"], t["readings"][scheme])
            planned = _input_of(tokens, voice)
            if planned is None:
                skipped.append(s["id"])
                continue
            text = "".join(t["surface"] for t in tokens if t.get("kind") in WORD_KINDS)
            items.append(Item(s["id"], planned[0], planned[1], text))
    for unit in units:
        for kc in unit.get("kcs", []):
            forms = kc.get("forms", {}).get(orth)
            if not forms:
                continue
            word = forms[0]["tokens"] if isinstance(forms[0], dict) else None
            surface = "".join(t["surface"] for t in word) if word else str(forms[0])
            reading = readings.get(surface)
            if scheme is not None and reading is None:
                skipped.append(kc["id"])
                continue
            if voice.reading != "text":
                piece = reading
            elif voice.pronounce is not None and reading is not None:
                piece = pronounced(surface, reading, voice.pronounce)
            else:
                piece = surface
            assert piece is not None
            items.append(Item(kc["id"], piece, (Span(0, 0, len(piece)),), surface))
    return items, skipped


def identity(
    provider_name: str,
    version: str,
    voice: str,
    input_: str,
    rate: float,
    settings: dict[str, Any] | None = None,
) -> str:
    """A clip's identity. Settings join it only when a provider has any, so the local
    providers' clips keep the identities they had before settings existed."""
    fields: list[Any] = [provider_name, version, voice, input_, rate]
    if settings:
        fields.append(settings)
    key = json.dumps(fields, ensure_ascii=False, sort_keys=True)
    return hashlib.sha256(key.encode("utf-8")).hexdigest()


def encode_mp3(pcm: bytes, sample_rate: int, comment: str) -> bytes:
    """MP3 (mono), byte-for-byte reproducible: ffmpeg's bitexact mode, no encoder tag."""
    decode = ["-f", "s16le", "-ar", str(sample_rate), "-ac", "1", "-i", "-"]
    tags = ["-map_metadata", "-1", "-metadata", f"comment={comment}"]
    exact = ["-fflags", "+bitexact", "-flags:a", "+bitexact"]
    encode = ["-c:a", "libmp3lame", "-b:a", BITRATE, "-ac", "1"]
    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp) / "clip.mp3"
        command = ["ffmpeg", "-v", "error", *decode, *tags, *exact, *encode, str(out)]
        subprocess.run(command, input=pcm, check=True)
        return out.read_bytes()


def timings(item: Item, clip: Clip, duration_ms: int) -> list[dict[str, int]] | None:
    """Token starts from the synthesizer's word onsets; each token ends where the next begins."""
    if clip.words is None:
        return None
    starts: list[tuple[int, int]] = []
    for span in item.spans:
        onsets = [ms for pos, ms in clip.words if span.start <= pos < span.end]
        if not onsets:
            return None
        starts.append((span.token, min(onsets)))
    return [
        {
            "token": token,
            "startMs": start,
            "endMs": starts[k + 1][1] if k + 1 < len(starts) else duration_ms,
        }
        for k, (token, start) in enumerate(starts)
    ]


def _entry(
    item: Item,
    speed: str,
    rate: float,
    ident: str,
    clip: Clip,
    tts: Provider,
    voice: AudioVoice,
    author: str,
    adir: Path,
    check: Callable[[Item, Clip], dict[str, Any]] | None,
) -> dict[str, Any]:
    """Encode and write one clip; its index entry."""
    version = tts.version()
    settings = tts.settings()
    data = encode_mp3(
        clip.pcm, clip.sample_rate, f"Synthetic speech: {tts.name} {version} ({voice.voice})"
    )
    rel = f"clips/{ident[:16]}.mp3"
    (adir / rel).write_bytes(data)
    duration = len(clip.pcm) // 2 * 1000 // clip.sample_rate
    entry: dict[str, Any] = {
        "item": item.item,
        "speed": speed,
        "file": rel,
        "sha256": hashlib.sha256(data).hexdigest(),
        "durationMs": duration,
        "license": voice.license,
        "provenance": {"author": author, "status": "draft"},
        "synthetic": True,
        "synthesis": {
            "provider": tts.name,
            "version": version,
            "voice": voice.voice,
            "input": item.input,
            "rate": rate,
            **({"settings": settings} if settings else {}),
            "inputHash": ident,
        },
    }
    token_timings = timings(item, clip, duration)
    if token_timings is not None:
        entry["timings"] = token_timings
        entry["timingSource"] = "synthesis"
    qa: dict[str, Any] = {} if clip.trace is None else {"trace": clip.trace}
    if check is not None and speed == "normal":
        qa |= check(item, clip)
    if qa:
        entry["qa"] = qa
    return entry


def synthesize_course(
    course_dir: Path,
    units: list[dict[str, Any]],
    voice: AudioVoice,
    check: Callable[[Item, Clip], dict[str, Any]] | None = None,
) -> Report:
    """(Re)synthesizes the course's clips; unchanged inputs keep their files."""
    tts = provider(voice)
    version = tts.version()
    settings = tts.settings()
    items, skipped = plan(units, voice)
    adir = audio_dir(course_dir)
    index = read_index(adir)
    clips_dir = adir / "clips"
    clips_dir.mkdir(parents=True, exist_ok=True)
    human = [c for c in index.clips if not c.synthetic]
    previous = {(c.item, c.speed): c for c in index.clips if c.synthetic}
    report = Report(skipped=skipped)
    wanted: list[tuple[Item, str, float, str]] = []
    kept: list[Any] = []
    for item in items:
        for speed, requested in (("normal", 1.0), ("slow", SLOW)):
            rate = tts.speed(requested)
            ident = identity(tts.name, version, voice.voice, item.input, rate, settings)
            old = previous.get((item.item, speed))
            if (
                old is not None
                and old.synthesis is not None
                and old.synthesis.inputHash == ident
                and (adir / old.file).exists()
            ):
                kept.append(old)
                continue
            wanted.append((item, speed, rate, ident))
    author = f"generated:{tts.name}@{version}"
    fresh: list[dict[str, Any]] = []

    def dump(clips: list[Any]) -> list[dict[str, Any]]:
        return [c.model_dump(mode="json", by_alias=True, exclude_none=True) for c in clips]

    def save(done: int) -> None:
        # Clips not regenerated yet keep their old entries (and files) until they are.
        waiting = [
            previous[(i.item, sp)] for i, sp, _, _ in wanted[done:] if (i.item, sp) in previous
        ]
        clips = [*dump([*human, *kept, *waiting]), *fresh]
        write_index(adir, AudioIndex.model_validate({"version": 1, "clips": clips}))

    # In batches, saving the index after each: a provider failing midway (a rate limit, an
    # outage) keeps every clip already made, and the next run picks up from there.
    for start in range(0, len(wanted), BATCH):
        batch = wanted[start : start + BATCH]
        clips = tts.synthesize(
            [Request(item.input, voice.voice, rate) for item, _, rate, _ in batch]
        )
        for (item, speed, rate, ident), clip in zip(batch, clips, strict=True):
            fresh.append(_entry(item, speed, rate, ident, clip, tts, voice, author, adir, check))
        save(start + len(batch))
    report.synthesized = len(fresh)
    report.kept = len(kept)
    live = {c.file for c in kept} | {e["file"] for e in fresh} | {c.file for c in human}
    for path in sorted(clips_dir.glob("*.mp3")):
        if f"clips/{path.name}" not in live:
            path.unlink()
            report.removed += 1
    save(len(wanted))
    return report
