"""Python conformance harness (gameplan §15).

Runs every vector in /conformance through a long-lived core-cli subprocess over JSON lines, exactly
as the compiler will. The TypeScript harness (packages/core-cli/test/conformance.test.ts) runs the
same files in-process; both must pass. Matching rules: objects match on the keys the vector lists,
arrays element by element, everything else by equality; `error` expects a failure containing it.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, cast

import pytest

from .conftest import CORE_CLI, ROOT, CoreCli

CONFORMANCE = ROOT / "conformance"


def load_vectors() -> list[tuple[str, dict[str, Any]]]:
    out: list[tuple[str, dict[str, Any]]] = []
    for path in sorted(CONFORMANCE.glob("*.json")):
        for vector in json.loads(path.read_text(encoding="utf-8"))["vectors"]:
            out.append((path.name, vector))
    return out


VECTORS = load_vectors()


def project(actual: object, expected: object) -> object:
    """Projects `actual` onto the shape of `expected`; a failing diff shows only what's pinned."""
    if isinstance(expected, dict):
        if not isinstance(actual, dict):
            return actual
        exp = cast(dict[str, object], expected)
        act = cast(dict[str, object], actual)
        return {k: project(act.get(k), v) for k, v in exp.items()}
    unchanged: object = actual
    if isinstance(expected, list) and isinstance(actual, list):
        exp_items = cast(list[object], expected)
        act_items = cast(list[object], actual)
        if len(act_items) == len(exp_items):
            return [project(a, e) for a, e in zip(act_items, exp_items, strict=True)]
    return unchanged


def test_at_least_300_vectors() -> None:
    assert len(VECTORS) >= 300


@pytest.mark.parametrize(("file", "vector"), VECTORS, ids=[v["id"] for _, v in VECTORS])
def test_vector(core_cli: CoreCli, file: str, vector: dict[str, Any]) -> None:
    response = core_cli.call({"id": vector["id"], "op": vector["op"], **vector["args"]})
    assert response["id"] == vector["id"], file
    if "error" in vector:
        assert response["ok"] is False, response
        assert vector["error"] in response["error"]
        return
    assert response["ok"] is True, response
    assert project(response["result"], vector["expected"]) == vector["expected"]


def test_round_trip_preserves_code_points(core_cli: CoreCli) -> None:
    """Astral characters, ZWJ/ZWNJ, marks and IVSs survive the Python-Node JSON boundary."""
    woman_technologist = "".join(map(chr, (0x1F469, 0x200D, 0x1F4BB)))
    e_acute = "e" + chr(0x301)
    ketabha = "".join(map(chr, (0x6A9, 0x62A, 0x627, 0x628, 0x200C, 0x647, 0x627)))
    kudzu_ivs = chr(0x845B) + chr(0xE0101)
    text = " ".join((woman_technologist, e_acute, ketabha, kudzu_ivs))
    expected = [woman_technologist, " ", e_acute, " "]
    expected += [
        chr(0x6A9),
        chr(0x62A),
        chr(0x627),
        chr(0x628) + chr(0x200C),
        chr(0x647),
        chr(0x627),
    ]
    expected += [" ", kudzu_ivs]
    assert core_cli.call({"id": 1, "op": "graphemes", "text": text})["result"] == expected


def test_paths_are_files() -> None:
    assert CORE_CLI.is_file() and Path(CONFORMANCE).is_dir()
