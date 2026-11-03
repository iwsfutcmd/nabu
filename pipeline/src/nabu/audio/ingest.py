"""Human recordings into a course's audio index (gameplan §10.2).

A recording (any format ffmpeg reads) is normalized to −16 LUFS, trimmed of leading and
trailing silence, encoded like synthesized clips, and given a slow variant by time-stretching
(pitch kept). Its SPDX license, speaker and source are recorded; regeneration never touches it.
When the speech models are installed, a sentence recording gets token timings by forced
alignment (phones.align_words), for karaoke and tap-a-word.
"""

from __future__ import annotations

import hashlib
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from nabu.audio import espeak, jyutping
from nabu.audio.course import audio_dir, encode_mp3, read_index, write_index
from nabu.schema.models import AudioIndex

SAMPLE_RATE = 22_050
SLOW = 0.8  # time-stretch factor for the slow variant (pitch preserved)


@dataclass(frozen=True)
class Recording:
    item: str
    file: Path
    license: str
    author: str  # human:<name>
    source: str
    status: str = "draft"


def _ffmpeg_pcm(path: Path, filters: str) -> bytes:
    command = ["ffmpeg", "-v", "error", "-i", str(path), "-af", filters]
    output = ["-f", "s16le", "-ar", str(SAMPLE_RATE), "-ac", "1", "-"]
    return subprocess.run([*command, *output], capture_output=True, check=True).stdout


def prepare(path: Path) -> tuple[bytes, bytes]:
    """Normal and slow PCM of a recording: loudness-normalized, silence trimmed at both ends."""
    trim = "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05"
    clean = f"{trim},areverse,{trim},areverse,loudnorm=I=-16:TP=-1.5:LRA=11"
    return _ffmpeg_pcm(path, clean), _ffmpeg_pcm(path, f"{clean},atempo={SLOW}")


def expected_phones(tokens: list[dict[str, Any]], reading: str, voice: str) -> list[list[str]]:
    """Each word token's expected phones: from its pinned Jyutping, or eSpeak NG's phonemes."""
    out: list[list[str]] = []
    for t in tokens:
        if t.get("kind") not in ("word", "number"):
            continue
        if reading == "jyutping" and "jyutping" in t.get("readings", {}):
            out.append(jyutping.phones(t["readings"]["jyutping"]))
        else:
            out.append([p for w in espeak.phonemes(t["surface"], voice) for p in w])
    return out


def ingest(
    course_dir: Path,
    recording: Recording,
    align: tuple[list[dict[str, Any]], str, str] | None = None,
) -> list[dict[str, Any]]:
    """Adds a recording (normal and slow) to the index.

    `align` is (the sentence's tokens, the reading scheme, an eSpeak NG voice for phonemes).
    """
    normal, slow = prepare(recording.file)
    entries: list[dict[str, Any]] = []
    word_timings: list[dict[str, int]] | None = None
    if align is not None:
        from nabu.audio.phones import align_words

        tokens, reading, voice = align
        indices = [i for i, t in enumerate(tokens) if t.get("kind") in ("word", "number")]
        found = align_words(normal, SAMPLE_RATE, expected_phones(tokens, reading, voice))
        word_timings = [
            {"token": i, "startMs": t.start_ms, "endMs": t.end_ms}
            for i, t in zip(indices, found, strict=True)
        ]
    for speed, pcm in (("normal", normal), ("slow", slow)):
        comment = f"Recording: {recording.author.removeprefix('human:')} ({recording.license})"
        data = encode_mp3(pcm, SAMPLE_RATE, comment)
        rel = f"clips/{hashlib.sha256(data).hexdigest()[:16]}.mp3"
        (audio_dir(course_dir) / "clips").mkdir(parents=True, exist_ok=True)
        (audio_dir(course_dir) / rel).write_bytes(data)
        entry: dict[str, Any] = {
            "item": recording.item,
            "speed": speed,
            "file": rel,
            "sha256": hashlib.sha256(data).hexdigest(),
            "durationMs": len(pcm) // 2 * 1000 // SAMPLE_RATE,
            "license": recording.license,
            "provenance": {"author": recording.author, "status": recording.status},
            "source": recording.source,
            "synthetic": False,
        }
        if word_timings is not None:
            scale = 1 if speed == "normal" else 1 / SLOW
            entry["timings"] = [
                {
                    "token": w["token"],
                    "startMs": round(w["startMs"] * scale),
                    "endMs": round(w["endMs"] * scale),
                }
                for w in word_timings
            ]
            entry["timingSource"] = "alignment"
        entries.append(entry)
    index = read_index(audio_dir(course_dir))
    # A new recording of the item replaces the old one at the same speed; synthesized clips stay.
    kept = [
        c.model_dump(mode="json", by_alias=True, exclude_none=True)
        for c in index.clips
        if not (c.item == recording.item and not c.synthetic)
    ]
    write_index(
        audio_dir(course_dir), AudioIndex.model_validate({"version": 1, "clips": [*kept, *entries]})
    )
    return entries
