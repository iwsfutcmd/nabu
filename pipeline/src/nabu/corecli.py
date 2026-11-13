"""Client for core-cli: the one TypeScript implementation of normalization and matching (§5.1).

The compiler keeps one subprocess alive and speaks JSON lines to it, so accept sets are checked
with exactly the code that will grade learners.
"""

from __future__ import annotations

from typing import Any

from nabu.jsonlines import JsonLinesProcess
from nabu.paths import CORE_CLI


class CoreCliError(RuntimeError):
    pass


class CoreCli(JsonLinesProcess):
    def __init__(self) -> None:
        super().__init__(["node", str(CORE_CLI)], timeout=10)
        self.next_id = 0

    def call(self, request: dict[str, Any]) -> dict[str, Any]:
        answer = self.ask(request)
        if answer is None:
            raise CoreCliError("core-cli exited")
        return answer

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
