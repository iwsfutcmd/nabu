"""Phase 2 acceptance: bundle builds are byte-for-byte deterministic and content-addressed."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pytest

from nabu.analyzers import analyzers_by_tool
from nabu.compiler import compile_course, load_profiles, write_bundle
from nabu.compiler.package import canonical
from nabu.schema.models import BundleManifest, BundleUnit

from .conftest import FIXTURES, ROOT, CoreCli

COURSES = sorted(p.parent for p in (ROOT / "courses").glob("*/course.yaml"))


def build(cli: CoreCli, course: Path, out: Path) -> dict[str, object]:
    profiles = load_profiles()
    analyzers = analyzers_by_tool()
    diags, compiled = compile_course(course, cli, profiles, analyzers)
    assert compiled is not None, [d.format() for d in diags.items]
    return write_bundle(compiled, profiles, analyzers, out)


def tree(root: Path) -> dict[str, bytes]:
    return {
        p.relative_to(root).as_posix(): p.read_bytes()
        for p in sorted(root.rglob("*"))
        if p.is_file()
    }


@pytest.mark.parametrize(
    "course", [FIXTURES / "clean.yaml", *COURSES], ids=lambda p: p.stem if p.suffix else p.name
)
def test_builds_are_byte_for_byte_deterministic(
    core_cli: CoreCli, course: Path, tmp_path: Path
) -> None:
    a = build(core_cli, course, tmp_path / "a")
    b = build(core_cli, course, tmp_path / "b")
    assert a["id"] == b["id"]
    assert tree(tmp_path / "a") == tree(tmp_path / "b")


def test_bundle_is_content_addressed_and_valid(core_cli: CoreCli, tmp_path: Path) -> None:
    manifest = build(core_cli, FIXTURES / "clean.yaml", tmp_path)
    BundleManifest.model_validate(manifest)
    body = {k: v for k, v in manifest.items() if k != "id"}
    assert manifest["id"] == hashlib.sha256(canonical(body)).hexdigest()
    for f in BundleManifest.model_validate(manifest).files:
        data = (tmp_path / f.path).read_bytes()
        assert hashlib.sha256(data).hexdigest() == f.sha256
        assert f.sha256[:16] in f.path
    unit = json.loads((tmp_path / manifest["units"][0]["file"]).read_text(encoding="utf-8"))  # type: ignore[index]
    BundleUnit.model_validate(unit)
