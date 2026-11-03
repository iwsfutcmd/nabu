"""The speech service (gameplan §10.4, tiers 1 and 2), for the API to call.

Tier 1: were the right words said? faster-whisper transcribes the recording in the course's
language. It is never prompted with the expected sentence, which would bias it towards
accepting (§10.4). The API grades the transcript against the sentence's accept set.

Tier 2: which phones were wrong? The wav2vec2 phone recognizer's output is aligned to the
expected surface phones (pinned Jyutping, or eSpeak NG phonemes of the surface), and each word
with a substituted or missing phone is reported.

Privacy (§10.4, §14.4): audio arrives in the request body, is decoded in memory, scored and
dropped. Nothing is written to disk and nothing about a request is logged but its timing.
"""

from __future__ import annotations

import base64
import json
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

MAX_SECONDS = 30
"""Longest recording accepted (16-bit mono)."""


@dataclass(frozen=True)
class Request:
    pcm: bytes
    sample_rate: int
    language: str
    tokens: list[dict[str, Any]]
    reading: str | None
    voice: str | None
    tiers: tuple[int, ...]


def align(heard: list[str], expected: list[tuple[int, str]]) -> tuple[float, list[int]]:
    """Levenshtein alignment of heard phones to expected (token, phone) pairs: the phone error
    rate and the tokens whose expected phones were substituted or deleted."""
    n, m = len(expected), len(heard)
    cost = [[0] * (m + 1) for _ in range(n + 1)]
    for i in range(n + 1):
        cost[i][0] = i
    for j in range(m + 1):
        cost[0][j] = j
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            same = expected[i - 1][1] == heard[j - 1]
            cost[i][j] = min(
                cost[i - 1][j - 1] + (0 if same else 1),
                cost[i - 1][j] + 1,
                cost[i][j - 1] + 1,
            )
    off: set[int] = set()
    i, j = n, m
    while i > 0 or j > 0:
        if (
            i > 0
            and j > 0
            and cost[i][j] == cost[i - 1][j - 1] + (0 if expected[i - 1][1] == heard[j - 1] else 1)
        ):
            if expected[i - 1][1] != heard[j - 1]:
                off.add(expected[i - 1][0])
            i, j = i - 1, j - 1
        elif i > 0 and cost[i][j] == cost[i - 1][j] + 1:
            off.add(expected[i - 1][0])
            i -= 1
        else:
            j -= 1
    rate = cost[n][m] / max(n, 1)
    return rate, sorted(off)


def expected_by_token(
    tokens: list[dict[str, Any]], reading: str | None, voice: str
) -> list[tuple[int, str]]:
    from nabu.audio.ingest import expected_phones

    words = expected_phones(tokens, reading or "", voice)
    indices = [i for i, t in enumerate(tokens) if t.get("kind") in ("word", "number")]
    return [(token, p) for token, phones in zip(indices, words, strict=True) for p in phones]


def score(request: Request) -> dict[str, Any]:
    """Tier 1 and 2 results for one recording. Raises on audio it cannot decode."""
    out: dict[str, Any] = {}
    if 1 in request.tiers:
        from nabu.audio.providers import Clip
        from nabu.audio.qa import transcribe

        clip = Clip(pcm=request.pcm, sample_rate=request.sample_rate, words=None, trace=None)
        out["transcript"] = transcribe(clip, request.language)
    if 2 in request.tiers and request.voice is not None:
        from nabu.audio.phones import recognize

        heard = recognize(request.pcm, request.sample_rate)
        expected = expected_by_token(request.tokens, request.reading, request.voice)
        rate, off = align(heard, expected)
        out["phones"] = {"errorRate": round(rate, 4), "offTokens": off, "heard": heard}
    return out


def parse(body: bytes) -> Request:
    data = json.loads(body)
    pcm = base64.b64decode(data["audio"], validate=True)
    rate = int(data["sampleRate"])
    if not 8000 <= rate <= 48000 or len(pcm) % 2 or len(pcm) > MAX_SECONDS * rate * 2:
        raise ValueError("audio: 16-bit mono, 8–48 kHz, at most 30 s")
    tiers = tuple(int(t) for t in data.get("tiers", [1, 2]) if int(t) in (1, 2))
    return Request(
        pcm=pcm,
        sample_rate=rate,
        language=str(data["language"]),
        tokens=list(data.get("tokens", [])),
        reading=data.get("reading"),
        voice=data.get("voice"),
        tiers=tiers,
    )


def handler(scorer: Callable[[Request], dict[str, Any]]) -> type[BaseHTTPRequestHandler]:
    lock = threading.Lock()  # the models are not thread-safe

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, format: str, *args: Any) -> None:
            pass  # requests carry personal data; only timings are printed (below)

        def _send(self, status: int, body: dict[str, Any]) -> None:
            data = json.dumps(body).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self) -> None:
            if self.path == "/healthz":
                self._send(200, {"ok": True})
            else:
                self._send(404, {"error": "not-found"})

        def do_POST(self) -> None:
            if self.path != "/v1/score":
                self._send(404, {"error": "not-found"})
                return
            length = int(self.headers.get("Content-Length") or 0)
            if length <= 0 or length > MAX_SECONDS * 48000 * 2 * 2:
                self._send(413, {"error": "too-large"})
                return
            try:
                request = parse(self.rfile.read(length))
            except (ValueError, KeyError, json.JSONDecodeError):
                self._send(400, {"error": "invalid-request"})
                return
            started = time.monotonic()
            try:
                with lock:
                    result = scorer(request)
            except Exception:
                self._send(422, {"error": "unscorable"})
                return
            print(
                json.dumps(
                    {"tiers": list(request.tiers), "ms": round((time.monotonic() - started) * 1000)}
                ),
                flush=True,
            )
            self._send(200, result)

    return Handler


def serve(
    host: str, port: int, scorer: Callable[[Request], dict[str, Any]] = score
) -> ThreadingHTTPServer:
    return ThreadingHTTPServer((host, port), handler(scorer))
