"""Phase 9 speech service (tiers 1–2): phone alignment, the HTTP contract, and (with the speech
models, NABU_SPEECH=1) real scoring of committed clips. The stub scorer tests the plumbing only."""

from __future__ import annotations

import base64
import json
import os
import subprocess
import tempfile
import threading
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

import pytest

from nabu.speech.service import Request, align, parse, serve

SPEECH = os.environ.get("NABU_SPEECH") == "1"
REPO = Path(__file__).resolve().parents[2]


def test_alignment_finds_the_words_said_wrong() -> None:
    expected = [(0, "s"), (0, "a"), (0, "l"), (0, "a"), (0, "m"), (2, "m"), (2, "a"), (2, "n")]
    assert align(["s", "a", "l", "a", "m", "m", "a", "n"], expected) == (0.0, [])
    rate, off = align(["s", "a", "l", "a", "m", "m", "o", "n"], expected)
    assert off == [2] and rate == pytest.approx(1 / 8)
    rate, off = align(
        ["s", "a", "l", "m", "m", "a", "n"], expected
    )  # a dropped vowel in the first word
    assert off == [0] and rate == pytest.approx(1 / 8)
    rate, off = align(
        ["s", "o", "l", "a", "m", "m", "a", "t"], expected
    )  # one wrong vowel, one wrong consonant
    assert off == [0, 2] and rate == pytest.approx(2 / 8)
    assert align([], expected) == (1.0, [0, 2])


def test_parse_bounds_the_audio() -> None:
    body: dict[str, Any] = {
        "audio": base64.b64encode(b"\0\0" * 1600).decode(),
        "sampleRate": 16000,
        "language": "fa",
        "tokens": [],
    }
    assert parse(json.dumps(body).encode()).tiers == (1, 2)
    with pytest.raises(ValueError):
        parse(json.dumps({**body, "sampleRate": 4000}).encode())
    with pytest.raises(ValueError):
        parse(json.dumps({**body, "audio": base64.b64encode(b"\0" * 3).decode()}).encode())


def test_the_service_scores_in_memory_and_answers_json() -> None:
    seen: list[Request] = []

    def stub(request: Request) -> dict[str, Any]:
        seen.append(request)
        return {"transcript": "سلام", "phones": {"errorRate": 0.0, "offTokens": [], "heard": []}}

    server = serve("127.0.0.1", 0, stub)
    port = server.server_address[1]
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        base = f"http://127.0.0.1:{port}"
        with urllib.request.urlopen(f"{base}/healthz") as r:
            assert json.loads(r.read()) == {"ok": True}
        body = {
            "audio": base64.b64encode(b"\1\0" * 16000).decode(),
            "sampleRate": 16000,
            "language": "fa",
            "tokens": [],
            "tiers": [1],
        }
        req = urllib.request.Request(
            f"{base}/v1/score",
            data=json.dumps(body).encode(),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req) as r:
            assert json.loads(r.read())["transcript"] == "سلام"
        assert seen[0].tiers == (1,) and len(seen[0].pcm) == 32000
        bad = urllib.request.Request(f"{base}/v1/score", data=b"{}", method="POST")
        with pytest.raises(urllib.error.HTTPError) as error:
            urllib.request.urlopen(bad)
        assert error.value.code == 400
    finally:
        server.shutdown()


def files_under(root: Path) -> list[Path]:
    return sorted(p for p in root.rglob("*") if p.is_file())


@pytest.fixture
def watched(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """An empty working directory and temporary directory, to show nothing is written."""
    tmp = tmp_path / "tmp"
    tmp.mkdir()
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("TMPDIR", str(tmp))
    monkeypatch.setattr(tempfile, "tempdir", str(tmp))
    return tmp_path


def test_no_audio_is_kept(watched: Path, capfd: pytest.CaptureFixture[str]) -> None:
    """Phase 9 acceptance: the service keeps no audio. It scores in memory, writes no file, and
    prints only timings: no audio, no transcript, nothing from the request."""
    pcm = b"".join(
        ((i * 37) % 20000 - 10000).to_bytes(2, "little", signed=True) for i in range(16000)
    )
    marked = base64.b64encode(pcm).decode()

    def stub(request: Request) -> dict[str, Any]:
        return {"transcript": "من مریم هستم"}

    server = serve("127.0.0.1", 0, stub)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        body = {"audio": marked, "sampleRate": 16000, "language": "fa", "tokens": [], "tiers": [1]}
        req = urllib.request.Request(
            f"http://127.0.0.1:{server.server_address[1]}/v1/score",
            data=json.dumps(body).encode(),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req) as r:
            assert r.status == 200
    finally:
        server.shutdown()
        server.server_close()
    assert files_under(watched) == []
    out, err = capfd.readouterr()
    printed = [json.loads(line) for line in out.splitlines() if line.strip()]
    assert all(set(line) == {"tiers", "ms"} for line in printed) and len(printed) == 1
    assert marked[1000:1064] not in out + err and "مریم" not in out + err


def decode(clip: Path) -> bytes:
    return subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(clip), "-f", "s16le", "-ar", "16000", "-ac", "1", "-"],
        capture_output=True,
        check=True,
    ).stdout


@pytest.mark.skipif(
    not SPEECH, reason="needs the speech models (uv sync --group speech; NABU_SPEECH=1)"
)
def test_real_models_hear_a_committed_clip(watched: Path) -> None:
    import yaml

    from nabu.speech.service import score

    index = yaml.safe_load((REPO / "courses/fa/audio/index.yaml").read_text(encoding="utf-8"))
    clip = next(
        c for c in index["clips"] if c["item"] == "s.13" and c["speed"] == "normal"
    )  # من مریم هستم
    pcm = decode(REPO / "courses/fa/audio" / clip["file"])
    tokens = [
        {"surface": "من", "kind": "word"},
        {"surface": " ", "kind": "space"},
        {"surface": "مریم", "kind": "word"},
        {"surface": " ", "kind": "space"},
        {"surface": "هستم", "kind": "word"},
    ]
    right = score(Request(pcm, 16000, "fa", tokens, None, "fa", (1, 2)))
    assert right["transcript"].strip() != ""
    other = [{"surface": "خداحافظ", "kind": "word"}]
    wrong = score(Request(pcm, 16000, "fa", other, None, "fa", (2,)))
    assert right["phones"]["errorRate"] < wrong["phones"]["errorRate"]
    assert files_under(watched) == []  # the models score in memory: no file is written
