"""Phase 2 acceptance: bundle builds are byte-for-byte deterministic and content-addressed."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pytest

from nabu.analyzers import analyzers_by_tool
from nabu.compiler import compile_course, load_profiles, write_bundle
from nabu.compiler.package import canonical, credit_id
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
    for f in BundleManifest.model_validate(manifest).files:
        assert f.bytes == (tmp_path / f.path).stat().st_size


@pytest.mark.parametrize("course", COURSES, ids=lambda p: p.name)
def test_every_medium_downloads_with_a_unit(
    core_cli: CoreCli, course: Path, tmp_path: Path
) -> None:
    """Phase 10: a unit's download carries the media its items use, and every medium in the
    bundle belongs to some unit, so downloading every unit makes the whole course offline."""
    manifest = BundleManifest.model_validate(build(core_cli, course, tmp_path))
    roles = {f.path: f.role for f in manifest.files}
    media = {p for p, role in roles.items() if role in ("audio", "image")}
    listed = {p for u in manifest.units for p in u.assets}
    assert listed == media
    for u in manifest.units:
        assert u.assets == sorted(u.assets)
        unit = json.loads((tmp_path / u.file).read_text(encoding="utf-8"))
        images = {p for p in u.assets if roles[p] == "image"}
        assert images <= {kc["image"] for kc in unit["kcs"] if "image" in kc}


@pytest.mark.parametrize("course", ["tok", "apc"])
def test_credits_are_defined_once(core_cli: CoreCli, course: str, tmp_path: Path) -> None:
    """ADR 0110: the manifest holds each credit's text once, by id; files and clips name the id.
    Every clip of a voice used to repeat its credit, in the manifest and the audio index both."""
    profiles = load_profiles()
    analyzers = analyzers_by_tool()
    diags, compiled = compile_course(ROOT / "courses" / course, core_cli, profiles, analyzers)
    assert compiled is not None, [d.format() for d in diags.items]
    raw = write_bundle(compiled, profiles, analyzers, tmp_path)
    manifest = BundleManifest.model_validate(raw)
    assert manifest.formatVersion == 1
    assert all(credit_id(text) == ident for ident, text in manifest.credits.items())
    named = {f.credit for f in manifest.files if f.credit is not None}
    # Each text once in the manifest (and nowhere in the audio index, below).
    text = (tmp_path / "manifest.json").read_text(encoding="utf-8")
    for credit in manifest.credits.values():
        assert text.count(json.dumps(credit, ensure_ascii=False)) == 1, credit
    # Each file and clip credits what it did before: its source, its speaker or voice.
    by_path = {f.path: f for f in manifest.files}
    for path, (_blob, _license, made_by) in compiled.audio_files.items():
        credit = by_path[path].credit
        assert credit is not None and manifest.credits[credit] == made_by
    index = next(f for f in manifest.files if f.role == "audio-index")
    audio = json.loads((tmp_path / index.path).read_text(encoding="utf-8"))["items"]
    clips = 0
    for item, speeds in compiled.audio_items.items():
        for speed, clip in speeds.items():
            bundled = audio[item][speed]
            assert manifest.credits[bundled["credit"]] == clip["credit"]
            named.add(bundled["credit"])
            clips += 1
    # The credits files and clips name, and nothing else.
    assert clips > len(manifest.credits) > 1
    assert named == set(manifest.credits)
    clip_index = (tmp_path / index.path).read_text(encoding="utf-8")
    assert not any(credit in clip_index for credit in manifest.credits.values())
