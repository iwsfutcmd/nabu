"""Shadow-mode calibration (§9.3): binning, metrics and filtering over JSONL logs."""

from __future__ import annotations

import json
import math
import subprocess
import sys
from pathlib import Path
from typing import Any

import pytest
from typer.testing import CliRunner

from nabu.analytics.calibration import GroupBy, calibration, format_report, reliability_svg
from nabu.cli import app


def answer(
    n: int, p: float | None, correct: bool, attempt: int = 1, template: str = "choose-translation"
) -> dict[str, Any]:
    event: dict[str, Any] = {
        "id": f"00000000-0000-7000-8000-{n:012x}",
        "type": "answer_submitted",
        "course": "fa",
        "attempt": attempt,
        "exercise": {"id": f"x{n}", "template": template, "item": "s1", "kcs": []},
        "outcome": {"kind": "CORRECT_WITH_TYPO" if correct else "WRONG", "notes": [], "kcs": []},
    }
    if p is not None:
        event["prediction"] = {"p": p, "model": "elo@1"}
    return event


@pytest.fixture
def log(tmp_path: Path) -> Path:
    # Perfectly calibrated: at p = 0.25 one in four is right; at 0.75, three in four.
    events = [answer(i, 0.25, i == 0) for i in range(4)]
    events += [answer(10 + i, 0.75, i != 0, template="gap-fill") for i in range(4)]
    # Not counted: a retry, an answer with no prediction, another event type.
    events += [
        answer(20, 0.9, False, attempt=2),
        answer(21, None, True),
        {"id": "x", "type": "session_started", "course": "fa"},
    ]
    path = tmp_path / "events.jsonl"
    path.write_text(
        "".join(json.dumps(e, ensure_ascii=False) + "\n" for e in events), encoding="utf-8"
    )
    return path


def test_bins_and_metrics(log: Path) -> None:
    [report] = calibration([log], bins=4)
    assert report.model == "elo@1"
    assert report.n == 8
    assert report.predicted == pytest.approx(0.5)
    assert report.observed == pytest.approx(0.5)
    assert report.ece == pytest.approx(0.0)
    # Brier: six answers off by 0.25 (the common outcome in each bin) and two off by 0.75.
    assert report.brier == pytest.approx((6 * 0.25**2 + 2 * 0.75**2) / 8)
    assert report.log_loss == pytest.approx(-(math.log(0.25) + 3 * math.log(0.75)) / 4)
    assert [(b.lo, b.n, b.observed) for b in report.bins] == [(0.25, 4, 0.25), (0.75, 4, 0.75)]
    assert "ECE=0.0000" in format_report(report)


def test_split_by_template(log: Path) -> None:
    reports = calibration([log], bins=4, group_by=GroupBy.template)
    assert [(r.group, r.n, r.observed) for r in reports] == [
        ("choose-translation", 4, 0.25),
        ("gap-fill", 4, 0.75),
    ]


def test_cli(log: Path, tmp_path: Path) -> None:
    runner = CliRunner()
    result = runner.invoke(app, ["calibration", str(log), "--bins", "4"])
    assert result.exit_code == 0, result.output
    assert "elo@1: n=8" in result.output
    empty = tmp_path / "empty.jsonl"
    empty.write_text(json.dumps(answer(1, None, True)) + "\n", encoding="utf-8")
    assert runner.invoke(app, ["calibration", str(empty)]).exit_code == 1


def test_reliability_svg(log: Path) -> None:
    [report] = calibration([log], bins=4)
    svg = reliability_svg([report], min_n=4)
    assert svg.startswith("<svg") and 'role="img"' in svg
    assert "prefers-color-scheme: dark" in svg  # dark mode has its own steps
    assert svg.count("<polyline") == 1  # both bins have enough answers to draw the curve
    assert svg.count("<title>") == 2  # a tooltip per bin
    # One model: the title names it; no legend.
    assert "Calibration of elo@1: n=8" in svg
    sparse = reliability_svg([report], min_n=5)
    assert "<polyline" not in sparse  # no bin is trustworthy: hollow dots, no line


def test_notebook_runs_as_a_script(log: Path) -> None:
    notebook = Path(__file__).parents[1] / "notebooks" / "calibration.py"
    result = subprocess.run(
        [sys.executable, str(notebook), str(log)], capture_output=True, text=True, check=False
    )
    assert result.returncode == 0, result.stderr
    assert "elo@1: n=8" in result.stdout
    assert log.with_suffix(".calibration.svg").read_text(encoding="utf-8").startswith("<svg")
