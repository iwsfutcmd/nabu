"""VoxCPM2 inference for `nabu audio generate` (ADR 0094), run in this directory's environment.

The pipeline starts it as a subprocess (nabu.audio.providers.VoxCPMWorker) and talks to it in JSON
lines. Its first line on stdin says what to load:

    {"model": {"repo": <HF repo>, "revision": <40 hex>}, "cfg": 2.0, "steps": 10}

and it answers {"ready": {"sampleRate": 48000, "torch": <version>, "voxcpm": <version>}}.
Every later line asks for one clip, cloning a reference recording with its transcript
("ultimate cloning"):

    {"text": ..., "prompt": <WAV path>, "promptText": ..., "seed": n}

answered {"pcm": <base64 s16le, mono>} or {"error": ...}. A request with "instruct" instead of
"prompt" designs a voice from that description (VoxCPM2's voice design), for `nabu audio cast`.
Seeds are set per clip, so a clip does not depend on earlier ones.
"""

from __future__ import annotations

import base64
import json
import os
import random
import sys
from importlib.metadata import version
from typing import Any


class Engine:
    def __init__(self, config: dict[str, Any]) -> None:
        import numpy
        import torch
        from huggingface_hub import snapshot_download
        from voxcpm import VoxCPM

        self.torch, self.numpy = torch, numpy
        path = snapshot_download(config["model"]["repo"], revision=config["model"]["revision"])
        self.model = VoxCPM.from_pretrained(path, load_denoiser=False)
        self.cfg = float(config.get("cfg", 2.0))
        self.steps = int(config.get("steps", 10))
        self.sample_rate = int(self.model.tts_model.sample_rate)

    def speak(self, req: dict[str, Any]) -> bytes:
        seed = int(req["seed"])
        random.seed(seed)
        self.numpy.random.seed(seed % 2**32)
        self.torch.manual_seed(seed)
        if "instruct" in req:
            kwargs: dict[str, Any] = {"text": f"({req['instruct']}){req['text']}"}
        else:
            kwargs = {
                "text": req["text"],
                "prompt_wav_path": req["prompt"],
                "prompt_text": req["promptText"],
                "reference_wav_path": req["prompt"],
            }
        wav = self.model.generate(cfg_value=self.cfg, inference_timesteps=self.steps, **kwargs)
        audio = self.numpy.clip(
            self.numpy.asarray(wav, dtype=self.numpy.float32).squeeze(), -1.0, 1.0
        )
        return (audio * 32767.0).round().astype("<i2").tobytes()


def main() -> None:
    # The protocol owns the real stdout; anything the libraries print goes to stderr.
    proto = os.fdopen(os.dup(1), "w", encoding="utf-8")
    os.dup2(2, 1)

    def send(message: dict[str, Any]) -> None:
        proto.write(json.dumps(message, ensure_ascii=False) + "\n")
        proto.flush()

    config = json.loads(sys.stdin.readline())
    engine = Engine(config)
    send(
        {
            "ready": {
                "sampleRate": engine.sample_rate,
                "torch": engine.torch.__version__,
                "voxcpm": version("voxcpm"),
            }
        }
    )
    for line in sys.stdin:
        if not line.strip():
            continue
        try:
            send({"pcm": base64.b64encode(engine.speak(json.loads(line))).decode("ascii")})
        except Exception as error:  # one bad clip does not end the run
            send({"error": f"{type(error).__name__}: {error}"})


if __name__ == "__main__":
    main()
