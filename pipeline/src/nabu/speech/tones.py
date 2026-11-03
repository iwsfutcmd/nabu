"""Tone evaluation sets (gameplan §16 Phase 9): clips of single syllables, each labelled with the
tone the exercise expected and the tone actually said, per speaker.

The Phase 9 acceptance asks for native recordings and deliberately wrong tones. This module also
synthesizes a *synthetic* set with eSpeak NG (marked synthetic, never presented as recorded
speech), so the evaluation harness has something to run on in CI and regressions show up.
"""

from __future__ import annotations

import json
import wave
from pathlib import Path
from typing import Any

#: Syllables that take all six tones, and tone pairs learners confuse (said instead of expected).
SYLLABLES = ("si", "fu", "jau", "se", "ji")
CONFUSIONS = ((2, 5), (5, 2), (3, 6), (6, 3), (4, 6), (1, 3))


def write_wav(path: Path, pcm: bytes, sample_rate: int) -> None:
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sample_rate)
        w.writeframes(pcm)


def synthetic_set(out: Path, voice: str = "yue-Latn-jyutping") -> dict[str, Any]:
    """Writes the synthetic set to `out` (clips/*.wav and index.json) and returns the index."""
    from nabu.audio.espeak import synthesize, version

    clips_dir = out / "clips"
    clips_dir.mkdir(parents=True, exist_ok=True)
    clips: list[dict[str, Any]] = []
    for base in SYLLABLES:
        files: dict[int, str] = {}
        for tone in range(1, 7):
            s = synthesize(f"{base}{tone}", voice)
            name = f"clips/{base}{tone}.wav"
            write_wav(out / name, s.pcm, s.sample_rate)
            files[tone] = name
            clips.append(
                {
                    "file": name,
                    "syllable": f"{base}{tone}",
                    "expected": str(tone),
                    "said": str(tone),
                    "kind": "native",
                }
            )
        # "Wrong" clips: the exercise expected one tone; the clip says another.
        for expected, said in CONFUSIONS:
            clips.append(
                {
                    "file": files[said],
                    "syllable": f"{base}{expected}",
                    "expected": str(expected),
                    "said": str(said),
                    "kind": "wrong",
                }
            )
    index = {
        "set": "synthetic-espeak",
        "system": "yue-jyutping",
        "synthetic": True,
        "note": "Synthesized with eSpeak NG from Jyutping: a regression set for the harness, "
        "not native speech. The Phase 9 acceptance needs recorded native speakers.",
        "license": "CC0-1.0",
        "provenance": {"author": f"generated:espeak-ng@{version()}", "status": "draft"},
        "speakers": [{"id": f"espeak-ng:{voice}", "clips": clips}],
    }
    (out / "index.json").write_text(
        json.dumps(index, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return index
