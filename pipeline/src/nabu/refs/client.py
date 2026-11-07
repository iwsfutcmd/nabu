"""A client for the reference library relay (ADR 0079, apps/references/src/relay.ts).

The relay's key comes from the environment only: NABU_REFS_KEY where it is set, or, in a cloud
session, the network proxy adds it for the relay's host and the client sends none.
"""

from __future__ import annotations

import hashlib
import json
import mimetypes
import os
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Iterator
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal, cast

#: The relay takes uploads up to this size; scans go into Drive itself.
MAX_UPLOAD = 25 * 1024 * 1024

#: What a Google-native file comes down as when pulled, and the extension it is given.
NATIVE_EXPORTS: dict[str, tuple[str, str]] = {
    "application/vnd.google-apps.document": ("text/markdown", ".md"),
    "application/vnd.google-apps.spreadsheet": ("text/csv", ".csv"),
    "application/vnd.google-apps.presentation": ("text/plain", ".txt"),
}

_TYPES = {".md": "text/markdown", ".yaml": "application/yaml", ".yml": "application/yaml"}
_CHUNK = 1024 * 1024
_TIMEOUT = 120
#: Cloudflare refuses Python-urllib's default user agent (error 1010) in front of Workers.
_USER_AGENT = "nabu-refs/0 (+https://github.com/iwsfutcmd/nabu)"

Kind = Literal["folder", "file", "native", "shortcut"]


@dataclass(frozen=True)
class Entry:
    """One file or folder, as the relay lists it."""

    name: str
    kind: Kind
    mime_type: str
    size: int | None = None
    modified: str | None = None
    md5: str | None = None

    @staticmethod
    def of(raw: dict[str, Any]) -> Entry:
        size = raw.get("size")
        return Entry(
            name=unicodedata.normalize("NFC", str(raw["name"])),
            kind=cast(Kind, raw["kind"]),
            mime_type=str(raw.get("mimeType", "")),
            size=int(size) if size is not None else None,
            modified=cast(str | None, raw.get("modified")),
            md5=cast(str | None, raw.get("md5")),
        )


class RelayError(Exception):
    """A failure the relay reported: its HTTP status and error code (relay.ts)."""

    def __init__(self, status: int, error: str, detail: str | None = None) -> None:
        self.status = status
        self.error = error
        self.detail = detail
        super().__init__(f"{status} {error}" + (f": {detail}" if detail else ""))


@dataclass
class PullReport:
    downloaded: list[str] = field(default_factory=list[str])
    unchanged: list[str] = field(default_factory=list[str])
    skipped: list[tuple[str, str]] = field(default_factory=list[tuple[str, str]])


def nfc(path: str) -> str:
    return unicodedata.normalize("NFC", path).strip("/")


def join(*parts: str) -> str:
    return "/".join(p for p in (nfc(part) for part in parts) if p)


def default_local_dir() -> Path:
    """NABU_REFS_DIR, or ~/nabu-references: outside the repository."""
    configured = os.environ.get("NABU_REFS_DIR")
    return Path(configured).expanduser() if configured else Path.home() / "nabu-references"


def inside_git_work_tree(path: Path) -> Path | None:
    """The work tree `path` would be inside, if any. References never go into one."""
    here = path.expanduser().resolve()
    for folder in (here, *here.parents):
        if (folder / ".git").exists():
            return folder
    return None


def _md5_of(path: Path) -> str:
    digest = hashlib.md5(usedforsecurity=False)
    with path.open("rb") as file:
        while chunk := file.read(_CHUNK):
            digest.update(chunk)
    return digest.hexdigest()


def _content_type(path: Path) -> str:
    return (
        _TYPES.get(path.suffix) or mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    )


def _safe_name(name: str) -> bool:
    """Whether a Drive name can be a local file name and a relay path segment."""
    return name not in ("", ".", "..") and "/" not in name and "\0" not in name


@dataclass(frozen=True)
class Relay:
    url: str
    key: str | None = None
    opener: urllib.request.OpenerDirector = field(default_factory=urllib.request.build_opener)

    def _request(
        self,
        method: str,
        route: str,
        params: dict[str, str] | None = None,
        body: bytes | None = None,
        headers: dict[str, str] | None = None,
    ) -> Any:
        query = f"?{urllib.parse.urlencode(params)}" if params else ""
        request = urllib.request.Request(
            f"{self.url.rstrip('/')}{route}{query}",
            data=body,
            method=method,
            headers={"User-Agent": _USER_AGENT, **(headers or {})},
        )
        if self.key:
            request.add_header("Authorization", f"Bearer {self.key}")
        try:
            return self.opener.open(request, timeout=_TIMEOUT)
        except urllib.error.HTTPError as error:
            raw = error.read()
            try:
                payload = cast(dict[str, Any], json.loads(raw))
            except ValueError:
                payload = {"error": "http", "detail": raw.decode("utf-8", "replace")[:300]}
            raise RelayError(
                error.code,
                str(payload.get("error", "http")),
                cast(str | None, payload.get("detail")),
            ) from None

    def _json(self, method: str, route: str, params: dict[str, str] | None = None) -> Any:
        with self._request(method, route, params) as response:
            return json.loads(response.read())

    def status(self) -> dict[str, Any]:
        return cast(dict[str, Any], self._json("GET", "/v1/status"))

    def list(self, path: str = "") -> list[Entry]:
        raw = cast(dict[str, Any], self._json("GET", "/v1/list", {"path": nfc(path)}))
        return [Entry.of(cast(dict[str, Any], e)) for e in cast(list[Any], raw["entries"])]

    def stat(self, path: str) -> Entry:
        return Entry.of(cast(dict[str, Any], self._json("GET", "/v1/stat", {"path": nfc(path)})))

    def walk(self, path: str = "") -> Iterator[tuple[str, Entry]]:
        """Every entry under a folder, depth first, with its path."""
        for entry in self.list(path):
            if not _safe_name(entry.name):
                continue
            inner = join(path, entry.name)
            yield inner, entry
            if entry.kind == "folder":
                yield from self.walk(inner)

    def read_bytes(self, path: str, export: str | None = None) -> bytes:
        params = {"path": nfc(path), **({"export": export} if export else {})}
        with self._request("GET", "/v1/file", params) as response:
            return cast(bytes, response.read())

    def download(self, path: str, target: Path, export: str | None = None) -> None:
        """Streams a file to `target` through a .part file, checking Drive's MD5 if it has one."""
        target.parent.mkdir(parents=True, exist_ok=True)
        partial = target.with_name(target.name + ".part")
        params = {"path": nfc(path), **({"export": export} if export else {})}
        digest = hashlib.md5(usedforsecurity=False)
        with self._request("GET", "/v1/file", params) as response, partial.open("wb") as out:
            expected = cast(str | None, response.headers.get("x-md5"))
            while chunk := cast(bytes, response.read(_CHUNK)):
                digest.update(chunk)
                out.write(chunk)
        if expected and digest.hexdigest() != expected:
            partial.unlink()
            raise RelayError(502, "checksum-mismatch", path)
        partial.replace(target)

    def upload(self, local: Path, path: str, parents: bool = False) -> Entry:
        size = local.stat().st_size
        if size > MAX_UPLOAD:
            raise RelayError(413, "too-large", f"{size} bytes; put large files into Drive itself")
        params = {"path": nfc(path), **({"parents": "1"} if parents else {})}
        body = local.read_bytes()
        headers = {"Content-Type": _content_type(local), "Content-Length": str(len(body))}
        with self._request("PUT", "/v1/file", params, body, headers) as response:
            return Entry.of(cast(dict[str, Any], json.loads(response.read())))

    def mkdir(self, path: str) -> Entry:
        return Entry.of(cast(dict[str, Any], self._json("POST", "/v1/mkdir", {"path": nfc(path)})))

    def move(self, source: str, target: str, parents: bool = False) -> Entry:
        params = {"from": nfc(source), "to": nfc(target), **({"parents": "1"} if parents else {})}
        return Entry.of(cast(dict[str, Any], self._json("POST", "/v1/move", params)))

    def trash(self, path: str) -> Entry:
        raw = cast(dict[str, Any], self._json("POST", "/v1/trash", {"path": nfc(path)}))
        return Entry.of(cast(dict[str, Any], raw["trashed"]))

    def pull(self, path: str, into: Path) -> PullReport:
        """Copies a file or a folder's tree into `into`, keeping its path; unchanged files stay."""
        work_tree = inside_git_work_tree(into)
        if work_tree is not None:
            raise RelayError(400, "inside-git", f"{into} is inside {work_tree}")
        report = PullReport()
        root = self.stat(path) if nfc(path) else None
        if root is not None and root.kind != "folder":
            entries: list[tuple[str, Entry]] = [(nfc(path), root)]
        else:
            entries = list(self.walk(path))
        for remote, entry in entries:
            self._pull_one(remote, entry, into, report)
        return report

    def _pull_one(self, remote: str, entry: Entry, into: Path, report: PullReport) -> None:
        local = into.joinpath(*remote.split("/"))
        if entry.kind == "folder":
            local.mkdir(parents=True, exist_ok=True)
        elif entry.kind == "shortcut":
            report.skipped.append((remote, "shortcut"))
        elif entry.kind == "native":
            export = NATIVE_EXPORTS.get(entry.mime_type)
            if export is None:
                report.skipped.append((remote, f"no export for {entry.mime_type}"))
                return
            self.download(remote, local.with_name(local.name + export[1]), export[0])
            report.downloaded.append(remote)
        elif local.exists() and entry.md5 is not None and _md5_of(local) == entry.md5:
            report.unchanged.append(remote)
        else:
            self.download(remote, local)
            report.downloaded.append(remote)


def relay_from_env(url: str | None = None) -> Relay:
    """The relay at `url` or NABU_REFS_URL, with NABU_REFS_KEY if set (else the proxy's)."""
    resolved = url or os.environ.get("NABU_REFS_URL")
    if not resolved:
        raise RelayError(0, "no-url", "set NABU_REFS_URL to the relay's address (or pass --url)")
    return Relay(url=resolved, key=os.environ.get("NABU_REFS_KEY") or None)
