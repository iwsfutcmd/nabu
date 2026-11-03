"""Phase 2 acceptance: every lint has a fixture that makes it fire, with file and line."""

from __future__ import annotations

from pathlib import Path

import pytest

from nabu.analyzers import Analyzer, analyzers_by_tool
from nabu.compiler import LINTS, compile_course, load_profiles
from nabu.drills.rbnf import icu_version
from nabu.schema.models import OrthographyProfile

from .conftest import FIXTURES, REQUIRE_TOOLS, CoreCli

PROFILES = load_profiles()
ANALYZERS = analyzers_by_tool()
NEEDS = {"enrich.reading-mismatch": "pycantonese", "enrich.transliteration-mismatch": "icu"}


def _available(tool: str) -> bool:
    return icu_version() is not None if tool == "icu" else tool in ANALYZERS


def compile_fixture(
    cli: CoreCli,
    path: Path,
    profiles: dict[str, OrthographyProfile] = PROFILES,
    analyzers: dict[str, Analyzer] = ANALYZERS,
):
    return compile_course(path, cli, profiles, analyzers)


def test_clean_fixture_has_no_diagnostics(core_cli: CoreCli) -> None:
    diags, compiled = compile_fixture(core_cli, FIXTURES / "clean.yaml")
    assert [d.format() for d in diags.items] == []
    assert compiled is not None


def test_every_lint_has_a_fixture() -> None:
    assert sorted(p.stem for p in (FIXTURES / "lints").glob("*.yaml")) == sorted(LINTS)


@pytest.mark.parametrize("lint", sorted(LINTS))
def test_lint_fires_with_file_and_line(core_cli: CoreCli, lint: str) -> None:
    tool = NEEDS.get(lint)
    if tool is not None and not _available(tool):
        if REQUIRE_TOOLS:
            pytest.fail(f"{tool} is required (NABU_REQUIRE_TOOLS=1)")
        pytest.skip(f"needs {tool}")
    path = FIXTURES / "lints" / f"{lint}.yaml"
    diags, compiled = compile_fixture(core_cli, path)
    hits = [d for d in diags.items if d.lint == lint]
    assert hits, [d.format() for d in diags.items]
    # Audio lints point into the course's audio index; everything else into the course.
    where = f"lints/{lint}.audio/index.yaml" if lint.startswith("audio.") else f"lints/{lint}.yaml"
    assert all(d.loc.file == where and d.loc.line > 1 for d in hits), [d.format() for d in hits]
    if LINTS[lint].severity == "error":
        assert compiled is None, "errors must stop the build"


def test_i_plus_one_points_at_the_sentence(core_cli: CoreCli) -> None:
    path = FIXTURES / "lints" / "curriculum.i-plus-one.yaml"
    lines = path.read_text(encoding="utf-8").splitlines()
    expected = next(i + 1 for i, line in enumerate(lines) if line.strip() == "- id: s.4")
    diags, _ = compile_fixture(core_cli, path)
    hit = next(d for d in diags.items if d.lint == "curriculum.i-plus-one")
    assert hit.loc.line == expected
    assert hit.format().startswith(
        f"lints/curriculum.i-plus-one.yaml:{expected}: error curriculum.i-plus-one: s.4 brings in 2"
    )
