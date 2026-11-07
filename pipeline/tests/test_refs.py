"""`nabu refs` (ADR 0079): the reference library client, against a stand-in relay that speaks the
relay's routes (apps/references/src/relay.ts; the relay itself is tested in apps/references)."""

from __future__ import annotations

import hashlib
import json
import threading
import urllib.parse
import urllib.request
from collections.abc import Iterator
from dataclasses import dataclass, field
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

import pytest
from typer.testing import CliRunner

from nabu.cli import app
from nabu.refs import Relay, RelayError
from nabu.refs import client as refs_client

KEY = "test-key"
DOC = "application/vnd.google-apps.document"


@dataclass
class Library:
    """path → (kind, mime type, content). Folders have no content."""

    items: dict[str, tuple[str, str, bytes]] = field(
        default_factory=dict[str, tuple[str, str, bytes]]
    )
    corrupt: set[str] = field(default_factory=set[str])
    agents: set[str] = field(default_factory=set[str])

    def entry(self, path: str) -> dict[str, Any]:
        kind, mime, content = self.items[path]
        out: dict[str, Any] = {"name": path.rsplit("/", 1)[-1], "kind": kind, "mimeType": mime}
        if kind == "file":
            out |= {"size": len(content), "md5": hashlib.md5(content).hexdigest()}
        return out | {"modified": "2026-11-06T00:00:00.000Z"}

    def children(self, path: str) -> list[str]:
        prefix = f"{path}/" if path else ""
        return sorted(p for p in self.items if p.startswith(prefix) and "/" not in p[len(prefix) :])


def _handler(library: Library) -> type[BaseHTTPRequestHandler]:
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, format: str, *args: Any) -> None:
            pass

        def _send(self, status: int, body: Any, headers: dict[str, str] | None = None) -> None:
            data = body if isinstance(body, bytes) else json.dumps(body).encode()
            self.send_response(status)
            for name, value in (headers or {}).items():
                self.send_header(name, value)
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def _route(self) -> tuple[str, dict[str, str]] | None:
            library.agents.add(self.headers.get("User-Agent", ""))
            if self.headers.get("Authorization") != f"Bearer {KEY}":
                self._send(401, {"error": "unauthorized"})
                return None
            url = urllib.parse.urlsplit(self.path)
            params = {k: v[0] for k, v in urllib.parse.parse_qs(url.query).items()}
            return url.path, params

        def do_GET(self) -> None:
            routed = self._route()
            if routed is None:
                return
            route, params = routed
            path = params.get("path", "")
            if route == "/v1/status":
                folder = {"name": "nabu", "kind": "folder", "mimeType": "folder"}
                return self._send(200, {"account": "owner@example.com", "folder": folder})
            if route == "/v1/list":
                if path and library.items.get(path, ("",))[0] != "folder":
                    return self._send(404, {"error": "not-found"})
                entries = [library.entry(p) for p in library.children(path)]
                return self._send(200, {"path": path, "entries": entries})
            if path not in library.items:
                return self._send(404, {"error": "not-found"})
            if route == "/v1/stat":
                return self._send(200, library.entry(path))
            kind, mime, content = library.items[path]
            if kind == "native":
                exported = f"exported as {params.get('export')}".encode()
                return self._send(200, exported, {"Content-Type": params.get("export", "")})
            md5 = hashlib.md5(content).hexdigest()
            sent = content + b"!" if path in library.corrupt else content
            return self._send(200, sent, {"Content-Type": mime, "x-md5": md5})

        def do_PUT(self) -> None:
            routed = self._route()
            if routed is None:
                return
            _, params = routed
            path = params["path"]
            body = self.rfile.read(int(self.headers["Content-Length"]))
            parent = path.rsplit("/", 1)[0] if "/" in path else ""
            if parent and parent not in library.items and params.get("parents") != "1":
                return self._send(404, {"error": "not-found"})
            existed = path in library.items
            library.items[path] = ("file", self.headers["Content-Type"], body)
            self._send(200 if existed else 201, library.entry(path))

        def do_POST(self) -> None:
            routed = self._route()
            if routed is None:
                return
            route, params = routed
            if route == "/v1/mkdir":
                library.items[params["path"]] = ("folder", "folder", b"")
                return self._send(200, library.entry(params["path"]))
            if route == "/v1/move":
                if params["to"] in library.items:
                    return self._send(409, {"error": "exists"})
                library.items[params["to"]] = library.items.pop(params["from"])
                return self._send(200, library.entry(params["to"]))
            if route == "/v1/trash":
                entry = library.entry(params["path"])
                del library.items[params["path"]]
                return self._send(200, {"trashed": entry})
            self._send(404, {"error": "no-such-route"})

    return Handler


@pytest.fixture
def served() -> Iterator[tuple[str, Library]]:
    library = Library()
    library.items |= {
        "grammars": ("folder", "folder", b""),
        "grammars/kline-2022.pdf": ("file", "application/pdf", b"%PDF-kline"),
        "grammars/Café.pdf": ("file", "application/pdf", b"%PDF-cafe"),
        "notes": ("folder", "folder", b""),
        "notes/apc": ("native", DOC, b""),
        "to-private": ("shortcut", "application/vnd.google-apps.shortcut", b""),
    }
    server = ThreadingHTTPServer(("127.0.0.1", 0), _handler(library))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_address[1]}", library
    finally:
        server.shutdown()
        server.server_close()


def _relay(url: str, key: str | None = KEY) -> Relay:
    # The test server is local: no proxy.
    return Relay(
        url=url, key=key, opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
    )


def test_pull_copies_the_tree_and_leaves_unchanged_files(
    served: tuple[str, Library], tmp_path: Path
) -> None:
    url, _ = served
    into = tmp_path / "refs"
    report = _relay(url).pull("", into)
    assert (into / "grammars" / "kline-2022.pdf").read_bytes() == b"%PDF-kline"
    assert (into / "grammars" / "Café.pdf").exists()
    assert (into / "notes" / "apc.md").read_text() == "exported as text/markdown"
    assert report.skipped == [("to-private", "shortcut")]
    assert not list(into.rglob("*.part"))

    again = _relay(url).pull("grammars", into)
    assert sorted(again.unchanged) == ["grammars/Café.pdf", "grammars/kline-2022.pdf"]
    assert again.downloaded == []

    one = _relay(url).pull("grammars/kline-2022.pdf", tmp_path / "one")
    assert one.downloaded == ["grammars/kline-2022.pdf"]


def test_pull_never_writes_into_a_git_work_tree(
    served: tuple[str, Library], tmp_path: Path
) -> None:
    url, _ = served
    (tmp_path / "repo" / ".git").mkdir(parents=True)
    with pytest.raises(RelayError) as raised:
        _relay(url).pull("", tmp_path / "repo" / "refs")
    assert raised.value.error == "inside-git"
    assert not (tmp_path / "repo" / "refs").exists()


def test_a_corrupted_download_leaves_nothing(served: tuple[str, Library], tmp_path: Path) -> None:
    url, library = served
    library.corrupt.add("grammars/kline-2022.pdf")
    with pytest.raises(RelayError) as raised:
        _relay(url).download("grammars/kline-2022.pdf", tmp_path / "k.pdf")
    assert raised.value.error == "checksum-mismatch"
    assert list(tmp_path.iterdir()) == []


def test_notes_and_arranging(served: tuple[str, Library], tmp_path: Path) -> None:
    url, library = served
    relay = _relay(url)
    note = tmp_path / "kline.md"
    note.write_text("# Kline 2022\n\np. 12: …\n", encoding="utf-8")
    assert relay.upload(note, "notes/kline.md").size == len(note.read_bytes())
    assert library.items["notes/kline.md"][1] == "text/markdown"
    assert relay.read_bytes("notes/kline.md").decode() == "# Kline 2022\n\np. 12: …\n"
    relay.mkdir("apc/grammars")
    relay.move("grammars/kline-2022.pdf", "apc/grammars/kline-2022.pdf")
    assert "apc/grammars/kline-2022.pdf" in library.items
    with pytest.raises(RelayError) as raised:
        relay.move("notes/kline.md", "apc/grammars/kline-2022.pdf")
    assert (raised.value.status, raised.value.error) == (409, "exists")
    assert relay.trash("notes/kline.md").name == "kline.md"


def test_uploads_over_the_limit_never_leave(
    served: tuple[str, Library], tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    url, library = served
    monkeypatch.setattr(refs_client, "MAX_UPLOAD", 4)
    big = tmp_path / "scan.pdf"
    big.write_bytes(b"12345")
    with pytest.raises(RelayError) as raised:
        _relay(url).upload(big, "scan.pdf")
    assert raised.value.error == "too-large"
    assert "scan.pdf" not in library.items


def test_paths_go_out_in_nfc(served: tuple[str, Library]) -> None:
    url, _ = served
    assert _relay(url).stat("grammars/Café.pdf").name == "Café.pdf"


def test_the_cli(
    served: tuple[str, Library], tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    url, _ = served
    monkeypatch.setenv("NABU_REFS_URL", url)
    monkeypatch.setenv("NO_PROXY", "127.0.0.1")
    monkeypatch.setenv("no_proxy", "127.0.0.1")
    monkeypatch.setenv("NABU_REFS_DIR", str(tmp_path / "refs"))
    runner = CliRunner()

    monkeypatch.delenv("NABU_REFS_KEY", raising=False)
    refused = runner.invoke(app, ["refs", "ls"])
    assert refused.exit_code == 1
    assert "unauthorized" in refused.output
    assert "NABU_REFS_KEY" in refused.output

    monkeypatch.setenv("NABU_REFS_KEY", KEY)
    listed = runner.invoke(app, ["refs", "ls", "-r"])
    assert listed.exit_code == 0, listed.output
    assert "grammars/kline-2022.pdf" in listed.output
    assert "grammars/\n" in listed.output

    pulled = runner.invoke(app, ["refs", "pull", "grammars"])
    assert pulled.exit_code == 0, pulled.output
    assert (tmp_path / "refs" / "grammars" / "kline-2022.pdf").exists()
    assert "2 pulled, 0 unchanged, 0 skipped" in pulled.output

    status = runner.invoke(app, ["refs", "status"])
    assert "owner@example.com" in status.output

    # Cloudflare turns Python-urllib's own user agent away (error 1010).
    assert {a.split("/")[0] for a in served[1].agents} == {"nabu-refs"}
