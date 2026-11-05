"""GitHub workflow files parse as YAML. GitHub reports a file it cannot read only as a failed run
with no jobs, so a broken workflow (Pages, the report intake) is otherwise easy to miss."""

from __future__ import annotations

from pathlib import Path
from typing import Any, cast

import pytest
import yaml

from .conftest import ROOT

WORKFLOWS = sorted((ROOT / ".github" / "workflows").glob("*.yml"))


def test_there_are_workflows() -> None:
    assert len(WORKFLOWS) >= 3


@pytest.mark.parametrize("path", WORKFLOWS, ids=lambda p: p.name)
def test_a_workflow_parses_and_every_job_has_steps(path: Path) -> None:
    workflow = cast(dict[str, Any], yaml.safe_load(path.read_text(encoding="utf-8")))
    jobs = cast(dict[str, dict[str, Any]], workflow["jobs"])
    assert jobs
    for name, job in jobs.items():
        assert job.get("steps") or job.get("uses"), name
