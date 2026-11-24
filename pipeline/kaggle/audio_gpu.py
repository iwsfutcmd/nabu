"""Generate a course's audio on a Kaggle GPU: `nabu audio generate` on a T4, from main as pushed.

Heavy compute runs on Kaggle, not on a session's CPU (the owner, 2026-11-24): OmniVoice takes
about 30 s a clip on a cloud container's CPU, about 11 s on a T4. To run it, from a cloud session
(the proxy adds the Kaggle credentials; the CLI only wants placeholders in their format):

    cp -r pipeline/kaggle <scratch>/kaggle && cd <scratch>/kaggle  # set COURSE, CHECK below
    export KAGGLE_USERNAME=iwsfutcmd KAGGLE_KEY=0123456789abcdef0123456789abcdef
    uvx --with six kaggle kernels push -p .
    uvx --with six kaggle kernels status iwsfutcmd/nabu-audio-gpu  # RUNNING, then COMPLETE
    uvx --with six kaggle kernels output iwsfutcmd/nabu-audio-gpu -p out

The run clones the public repo and installs what `nabu audio generate` needs: Node 22 for the
compiler's core-cli, uv and the pipeline with the omnivoice and speech groups. It swaps the pinned
CPU PyTorch for a CUDA build (this run only), makes every clip main lacks (generation resumes), and
leaves <course>-audio.tar (courses/<course>/audio: index.yaml, clips/, voices/) and the logs in
/kaggle/working. Whatever happens, the audio made so far is packed: the index is saved after every
batch. Bring it over by copying index.yaml and the clips it names into courses/<course>/audio, then
`pnpm bundles`; commit the index with every clip it lists, never one without the other.
"""

import os
import subprocess
import sys
import threading
import time
from pathlib import Path

COURSE = "bar"
# The Whisper round trip (ADR 0060): off where Whisper cannot read the language (bar: it writes
# Standard German, ADR 0156).
CHECK = False

W = Path("/kaggle/working")
REPO = Path("/tmp/nabu")
LOG = W / "run.log"
STOP_AFTER = 10.5 * 3600  # Kaggle stops a session at 12 h; pack well before
AUDIO = REPO / "courses" / COURSE / "audio"


def sh(cmd: str, check: bool = True, timeout: float | None = None) -> int:
    with open(LOG, "a") as log:
        log.write(f"\n$ {cmd}\n")
    print(f"\n$ {cmd}", flush=True)
    t = time.time()
    try:
        code = subprocess.run(cmd, shell=True, timeout=timeout, executable="/bin/bash").returncode
    except subprocess.TimeoutExpired:
        code = 124
    msg = f"[exit {code}, {time.time() - t:.0f} s]"
    print(msg, flush=True)
    with open(LOG, "a") as log:
        log.write(msg + "\n")
    if check and code:
        raise RuntimeError(f"failed: {cmd}")
    return code


def heartbeat() -> None:
    # Every 5 minutes, how many clips are on disk: the run's only sign of progress mid-way.
    clips = AUDIO / "clips"
    while True:
        time.sleep(300)
        if clips.is_dir():
            n = len(list(clips.glob("*.mp3")))
            print(f"[heartbeat {(time.time() - start) / 60:.0f} min] {n} clips on disk", flush=True)


start = time.time()
threading.Thread(target=heartbeat, daemon=True).start()
try:
    sh("nvidia-smi; nproc; free -g | head -2; df -h /tmp | tail -1")
    # A mirror mid-sync fails `apt-get update` now and then: retry, and install from what it got.
    sh(
        "for i in 1 2 3; do apt-get update -qq && break; sleep 20; done; "
        "apt-get install -y -qq espeak-ng ffmpeg libicu-dev pkg-config > /dev/null"
    )
    # Node 22 (core-cli runs TypeScript source directly: Node >= 22.18), and pnpm.
    sh(
        "cd /opt && f=$(curl -fsSL https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt | "
        "grep -o 'node-v22[^ ]*-linux-x64.tar.xz') && "
        "curl -fsSLO https://nodejs.org/dist/latest-v22.x/$f && "
        "tar -xJf $f && ln -sfn /opt/${f%.tar.xz} /opt/node"
    )
    os.environ["PATH"] = "/opt/node/bin:" + os.environ["PATH"]
    sh("node --version && npm install -g --silent pnpm@10.28.0 && pnpm --version")
    sh(
        f"git clone --depth 1 https://github.com/iwsfutcmd/nabu {REPO} && "
        f"git -C {REPO} rev-parse HEAD | tee {W}/commit.txt"
    )
    sh(
        f"cd {REPO} && pnpm install --frozen-lockfile --filter '@nabu/core-cli...' "
        f"> {W}/pnpm.log 2>&1"
    )
    # The pipeline, then CUDA PyTorch in place of the pinned CPU build.
    sh("pip install -q uv")
    sh(f"cd {REPO}/pipeline && uv sync --group omnivoice --group speech > {W}/uv.log 2>&1")
    py = f"{REPO}/pipeline/.venv/bin/python"
    # The lock's torch has CUDA builds only for CUDA 13.2, newer than Kaggle's drivers; omnivoice
    # needs torch >= 2.9, so the newest pair built for CUDA 12.6 stands in for this run.
    sh(
        f"uv pip install --python {py} --reinstall torch==2.11.0 torchaudio==2.11.0 "
        f"--index-url https://download.pytorch.org/whl/cu126 >> {W}/uv.log 2>&1"
    )
    sh(
        f"{py} -c \"import torch; print('cuda', torch.cuda.is_available(), "
        f"torch.cuda.get_device_name(0), 'bf16', torch.cuda.is_bf16_supported())\""
    )
    left = STOP_AFTER - (time.time() - start)
    check = "--check" if CHECK else "--no-check"
    sh(
        f"cd {REPO}/pipeline && uv run --no-sync nabu audio generate ../courses/{COURSE} {check} "
        f"2>&1 | tee {W}/generate.log",
        check=False,
        timeout=left,
    )
    sh(
        f"cd {REPO}/pipeline && uv run --no-sync nabu audio report ../courses/{COURSE} "
        f"> {W}/report.txt 2>&1",
        check=False,
    )
except Exception as error:  # pack whatever was made, then say what failed
    print(f"!! {error}", flush=True)
    with open(LOG, "a") as log:
        log.write(f"!! {error}\n")
finally:
    if (AUDIO / "index.yaml").exists():
        sh(f"tar -cf {W}/{COURSE}-audio.tar -C {AUDIO.parent} audio && ls -la {W}", check=False)
    print(f"done in {(time.time() - start) / 60:.0f} min", flush=True)
    sys.stdout.flush()
