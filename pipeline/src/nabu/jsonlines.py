"""A subprocess spoken to in JSON lines: one message a line on its stdin, one answer a line on its
stdout, in order. core-cli (the TypeScript grader, §5.1) runs this way, and so do the voice
runtimes that need an environment of their own (pipeline/runtimes: CosyVoice, VoxCPM2)."""

from __future__ import annotations

import contextlib
import json
import subprocess
from collections.abc import Mapping, Sequence
from typing import Any, Self


class JsonLinesProcess:
    """A long-lived subprocess and its pipes. `ask` sends a message and reads the answer; `close`
    ends the input, at whose end the process stops, and waits `timeout` seconds at most for it."""

    def __init__(self, command: Sequence[str], timeout: float) -> None:
        self.process = subprocess.Popen(
            list(command),
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            text=True,
            encoding="utf-8",
        )
        self.timeout = timeout

    def __enter__(self) -> Self:
        return self

    def __exit__(self, *_: object) -> None:
        self.close()

    def ask(self, message: Mapping[str, Any]) -> dict[str, Any] | None:
        """The answer to `message`, or None if the process exited before giving one."""
        stdin, stdout = self.process.stdin, self.process.stdout
        assert stdin is not None and stdout is not None
        stdin.write(json.dumps(message, ensure_ascii=False) + "\n")
        stdin.flush()
        line = stdout.readline()
        if not line:
            return None
        answer: dict[str, Any] = json.loads(line)
        return answer

    def close(self) -> None:
        """Closes the process's input and waits for it to exit. Once it has exited, this only
        reaps it, so closing again does nothing."""
        stdin = self.process.stdin
        if stdin is not None and not stdin.closed:
            # A process that died before reading a whole message leaves it in the buffer.
            with contextlib.suppress(BrokenPipeError):
                stdin.close()
        self.process.wait(timeout=self.timeout)
