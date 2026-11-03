"""Client for core-cli: the one TypeScript implementation of normalization and matching (§5.1).

The compiler keeps one subprocess alive and speaks JSON lines to it, so accept sets are checked
with exactly the code that will grade learners.
"""

from __future__ import annotations

import json
import subprocess
from typing import Any, Self

from nabu.paths import CORE_CLI


class CoreCliError(RuntimeError):
    pass


class CoreCli:
    def __init__(self) -> None:
        self.proc = subprocess.Popen(
            ["node", str(CORE_CLI)],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            text=True,
            encoding="utf-8",
        )
        self.next_id = 0

    def __enter__(self) -> Self:
        return self

    def __exit__(self, *_: object) -> None:
        self.close()

    def call(self, request: dict[str, Any]) -> dict[str, Any]:
        assert self.proc.stdin is not None and self.proc.stdout is not None
        self.proc.stdin.write(json.dumps(request, ensure_ascii=False) + "\n")
        self.proc.stdin.flush()
        line = self.proc.stdout.readline()
        if not line:
            raise CoreCliError("core-cli exited")
        return json.loads(line)

    def try_result(self, op: str, **args: Any) -> tuple[bool, Any]:
        """(True, result) or (False, error message)."""
        self.next_id += 1
        response = self.call({"id": self.next_id, "op": op, **args})
        return (True, response["result"]) if response["ok"] else (False, response["error"])

    def result(self, op: str, **args: Any) -> Any:
        ok, value = self.try_result(op, **args)
        if not ok:
            raise CoreCliError(f"{op}: {value}")
        return value

    def close(self) -> None:
        if self.proc.stdin is not None and not self.proc.stdin.closed:
            self.proc.stdin.close()
        self.proc.wait(timeout=10)
