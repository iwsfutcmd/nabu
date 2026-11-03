import json
import subprocess
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest

ROOT = Path(__file__).resolve().parents[2]
SCHEMAS = ROOT / "schemas"
PROFILES = ROOT / "profiles"
EXAMPLES = SCHEMAS / "examples"
CORE_CLI = ROOT / "packages" / "core-cli" / "src" / "main.ts"


class CoreCli:
    """A core-cli subprocess speaking JSON lines (one request, one response, in order)."""

    def __init__(self) -> None:
        self.proc = subprocess.Popen(
            ["node", str(CORE_CLI)],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            text=True,
            encoding="utf-8",
        )
        self.next_id = 0

    def call(self, request: dict[str, Any]) -> dict[str, Any]:
        assert self.proc.stdin is not None and self.proc.stdout is not None
        self.proc.stdin.write(json.dumps(request, ensure_ascii=False) + "\n")
        self.proc.stdin.flush()
        return json.loads(self.proc.stdout.readline())

    def result(self, op: str, **args: Any) -> Any:
        self.next_id += 1
        response = self.call({"id": self.next_id, "op": op, **args})
        assert response["ok"], response
        return response["result"]

    def close(self) -> None:
        assert self.proc.stdin is not None
        self.proc.stdin.close()
        self.proc.wait(timeout=10)


@pytest.fixture(scope="session")
def core_cli() -> Iterator[CoreCli]:
    c = CoreCli()
    yield c
    c.close()
