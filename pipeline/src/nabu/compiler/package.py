"""Stage 9: a byte-for-byte deterministic, content-addressed bundle (gameplan §7.5).

Every file is canonical JSON (sorted keys, no insignificant whitespace, NFC, trailing newline)
named by the first 16 hex digits of its sha256. The manifest lists every file with its role,
hash and SPDX license, plus the versions of everything that can change the output; its own id is
the sha256 of its content without the id. No timestamps, no absolute paths.
"""

from __future__ import annotations

import hashlib
import json
import shutil
import unicodedata
from importlib import metadata
from pathlib import Path
from typing import Any, cast

import yaml

from nabu.analyzers import Analyzer, versions
from nabu.compiler.build import Compiled
from nabu.compiler.stories import line_item
from nabu.drills.rbnf import icu_version
from nabu.paths import I18N_GENERATED, PROFILES
from nabu.schema.models import BundleAudio, BundleManifest, BundleUnit, OrthographyProfile

FORMAT_VERSION = 0


def canonical(data: Any) -> bytes:
    return (
        json.dumps(data, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n"
    ).encode("utf-8")


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _profile_files(profile: OrthographyProfile) -> list[tuple[str, str, str]]:
    """(role, id, path) of the tables and keyboard a profile needs."""
    out: list[tuple[str, str, str]] = []
    match = profile.match
    if match is not None:
        for table in (
            getattr(match.variants, "table", None),
            getattr(match.homophones, "table", None),
            getattr(match.scriptMismatch, "table", None),
        ):
            if table is not None:
                out.append(("table", table, str(PROFILES / "tables" / f"{table}.json")))
        layout = getattr(match.typo, "layout", None)
        if layout is not None:
            kid = layout.removeprefix("cldr-kbd:").lower()
            out.append(("keyboard", kid, str(PROFILES / "keyboards" / f"{kid}.yaml")))
    keyboard = getattr(profile.input, "keyboard", None)
    if keyboard is not None:
        kid = str(getattr(keyboard, "root", keyboard)).removeprefix("cldr-kbd:").lower()
        if not any(role == "keyboard" and ident == kid for role, ident, _ in out):
            out.append(("keyboard", kid, str(PROFILES / "keyboards" / f"{kid}.yaml")))
    return out


def tool_versions(
    analyzers: dict[str, Analyzer], tools: set[str] | None = None, uses_icu: bool = True
) -> dict[str, str]:
    """Versions of everything that shaped the bundle; only the analyzers (and ICU) it used."""
    cldr = json.loads((I18N_GENERATED / "cldr-meta.json").read_text(encoding="utf-8"))
    out = {
        "schema": str(FORMAT_VERSION),
        "cldr": cldr["cldrVersion"],
        "unicode.cldr": cldr["unicodeVersion"],
        "unicode.python": unicodedata.unidata_version,
        "nabu-pipeline": metadata.version("nabu-pipeline"),
        **(versions(analyzers) if tools is None else versions(analyzers, tools)),
    }
    if uses_icu:
        out["icu"] = icu_version() or "absent"
    return out


def _used_tools(
    compiled: Compiled, profiles: dict[str, OrthographyProfile]
) -> tuple[set[str], bool]:
    """Segmentation tools of the taught orthographies, and whether ICU shaped the bundle."""
    taught = [profiles[o] for o in compiled.orthographies]
    transforms = any(
        p.transliterate is not None and p.transliterate.via == "cldr-transform" for p in taught
    )
    return {p.segmentation.content for p in taught}, transforms or bool(compiled.course.drills)


def _strings(data: object) -> set[str]:
    """Every string anywhere in parsed JSON."""
    if isinstance(data, str):
        return {data}
    values: list[object] = []
    if isinstance(data, dict):
        values = list(cast(dict[str, object], data).values())
    elif isinstance(data, list):
        values = list(cast(list[object], data))
    return {s for v in values for s in _strings(v)}


def unit_assets(unit: dict[str, Any], compiled: Compiled) -> list[str]:
    """The media a unit's items use (Phase 10 per-unit downloads): the images it names, and the
    bundled clips of every item id it names (its sentences, drills and story lines). An item
    another unit owns but this one uses is included, so a downloaded unit never misses a clip."""
    # Story lines are items by position ("<story>#<step>"), a string the unit itself never holds.
    lines = {
        line_item(story["id"], step)
        for story in unit.get("stories", [])
        for step, s in enumerate(story["steps"])
        if s.get("line")
    }
    named = _strings(unit) | lines
    images = {p for p in named if p in compiled.images}
    clips = {
        clip["path"]
        for item in sorted(named & compiled.audio_items.keys())
        for clip in compiled.audio_items[item].values()
        if clip.get("path") in compiled.audio_files
    }
    return sorted(images | clips)


def write_bundle(
    compiled: Compiled,
    profiles: dict[str, OrthographyProfile],
    analyzers: dict[str, Analyzer],
    out_dir: Path,
    *,
    release: bool = False,
) -> dict[str, Any]:
    """Writes the bundle into out_dir (replacing it) and returns the manifest. With `release`, the
    compiled course is a release (compiler/release.py) and the manifest says so."""
    if out_dir.exists():
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True)
    files: list[dict[str, Any]] = []
    course = compiled.course

    def put(role: str, name: str, data: bytes, license_: str, source: str | None = None) -> str:
        digest = sha256(data)
        rel = f"{role}s/{name}.{digest[:16]}.json"
        (out_dir / rel).parent.mkdir(parents=True, exist_ok=True)
        (out_dir / rel).write_bytes(data)
        entry: dict[str, Any] = {
            "path": rel,
            "role": role,
            "sha256": digest,
            "license": license_,
            "bytes": len(data),
        }
        if source is not None:
            entry["source"] = source
        files.append(entry)
        return rel

    units: list[dict[str, Any]] = []
    for unit in compiled.units:
        BundleUnit.model_validate(unit)
        rel = put("unit", unit["id"], canonical(unit), course.license or "NOASSERTION")
        units.append({"id": unit["id"], "file": rel, "assets": unit_assets(unit, compiled)})

    seen: set[str] = set()
    for orth in [*compiled.orthographies, *compiled.support]:
        profile = profiles[orth]
        put(
            "profile",
            orth.replace("/", "."),
            canonical(profile.model_dump(mode="json", by_alias=True, exclude_none=True)),
            "MIT OR Apache-2.0",
        )
        for role, ident, path in _profile_files(profile):
            if f"{role}:{ident}" in seen:
                continue
            seen.add(f"{role}:{ident}")
            raw = Path(path).read_text(encoding="utf-8")
            data: dict[str, Any] = (
                json.loads(raw) if path.endswith(".json") else yaml.safe_load(raw)
            )
            license_ = str(data.get("license", "MIT OR Apache-2.0"))
            put(role, ident, canonical(data), license_, str(data.get("source", "")) or None)

    for rel, (blob, image_license, image_source) in sorted(compiled.images.items()):
        (out_dir / rel).parent.mkdir(parents=True, exist_ok=True)
        (out_dir / rel).write_bytes(blob)
        entry: dict[str, Any] = {
            "path": rel,
            "role": "image",
            "sha256": sha256(blob),
            "license": image_license,
            "bytes": len(blob),
        }
        if image_source is not None:
            entry["source"] = image_source
        files.append(entry)

    for rel, (blob, clip_license, credit) in sorted(compiled.audio_files.items()):
        (out_dir / rel).parent.mkdir(parents=True, exist_ok=True)
        (out_dir / rel).write_bytes(blob)
        files.append(
            {
                "path": rel,
                "role": "audio",
                "sha256": sha256(blob),
                "license": clip_license,
                "source": credit,
                "bytes": len(blob),
            }
        )
    if compiled.audio_items:
        index = {"items": compiled.audio_items}
        BundleAudio.model_validate(index)
        index_blob = canonical(index)
        rel = f"audio/index.{sha256(index_blob)[:16]}.json"
        (out_dir / rel).write_bytes(index_blob)
        license_ = course.license or "NOASSERTION"
        files.append(
            {
                "path": rel,
                "role": "audio-index",
                "sha256": sha256(index_blob),
                "license": license_,
                "bytes": len(index_blob),
            }
        )

    manifest: dict[str, Any] = {
        "formatVersion": FORMAT_VERSION,
        "course": course.id,
        "target": course.target,
        "orthographies": compiled.orthographies,
        "support": compiled.support,
        # Only where the course names them (ADR 0071): other manifests stay as they were.
        **({"facets": list(course.facets)} if course.facets else {}),
        "versions": tool_versions(analyzers, *_used_tools(compiled, profiles)),
        "files": sorted(files, key=lambda f: f["path"]),
        "units": units,
        "licenses": dict(sorted(compiled.licenses.items())),
        "provenance": dict(sorted(compiled.provenance.items())),
    }
    if release:
        manifest["release"] = True
    manifest["id"] = sha256(canonical(manifest))
    BundleManifest.model_validate(manifest)
    (out_dir / "manifest.json").write_bytes(canonical(manifest))
    return manifest
