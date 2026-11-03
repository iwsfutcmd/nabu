"""The `nabu` command line. Phase 0 ships only `validate`; `build` arrives in Phase 2."""

from __future__ import annotations

import json
from enum import StrEnum
from pathlib import Path
from typing import Annotated, Any

import typer
import yaml
from pydantic import BaseModel, ValidationError

from nabu import __version__
from nabu.schema import OrthographyProfile, TaggedText

app = typer.Typer(no_args_is_help=True, add_completion=False)


class Kind(StrEnum):
    auto = "auto"
    profile = "profile"
    tagged_text = "tagged-text"


def load_document(path: Path) -> Any:
    text = path.read_text(encoding="utf-8")
    return json.loads(text) if path.suffix == ".json" else yaml.safe_load(text)


def model_for(kind: Kind, data: Any) -> type[BaseModel]:
    if kind is Kind.profile:
        return OrthographyProfile
    if kind is Kind.tagged_text:
        return TaggedText
    return TaggedText if isinstance(data, dict) and "tokens" in data else OrthographyProfile


@app.command()
def validate(
    files: Annotated[list[Path], typer.Argument(exists=True, dir_okay=False)],
    kind: Annotated[Kind, typer.Option(help="Document type; auto-detected by default.")] = (
        Kind.auto
    ),
) -> None:
    """Validate YAML or JSON documents against the generated models."""
    failed = 0
    for path in files:
        data = load_document(path)
        model = model_for(kind, data)
        try:
            model.model_validate(data)
        except ValidationError as error:
            failed += 1
            typer.echo(f"✗ {path} ({model.__name__})\n{error}", err=True)
        else:
            typer.echo(f"✓ {path} ({model.__name__})")
    raise typer.Exit(code=1 if failed else 0)


def _course_paths(paths: list[Path]) -> list[Path]:
    """Each path is a course (directory or YAML file) or a directory of course directories."""
    out: list[Path] = []
    for path in paths:
        if path.is_dir() and not (path / "course.yaml").is_file():
            out += sorted(p.parent for p in path.glob("*/course.yaml"))
        else:
            out.append(path)
    return out


@app.command()
def build(
    courses: Annotated[
        list[Path],
        typer.Argument(
            exists=True,
            help="Course directories or course YAML files, or a directory of courses (courses/).",
        ),
    ],
    out: Annotated[
        Path, typer.Option(help="Output root; each bundle goes to <out>/<course-id>.")
    ] = Path("dist"),
    strict: Annotated[bool, typer.Option(help="Fail on warnings too.")] = False,
    check: Annotated[bool, typer.Option(help="Lint only; write nothing.")] = False,
) -> None:
    """Compile courses into content-addressed bundles (gameplan §7.5)."""
    from nabu.analyzers import analyzers_by_tool
    from nabu.compiler import compile_course, load_profiles, write_bundle
    from nabu.compiler.package import canonical
    from nabu.corecli import CoreCli

    profiles = load_profiles()
    analyzers = analyzers_by_tool()
    paths = _course_paths(courses)
    if not paths:
        typer.echo("✗ no courses found", err=True)
        raise typer.Exit(code=1)
    failed = False
    index: list[dict[str, Any]] = []
    with CoreCli() as cli:
        for course in paths:
            diags, compiled = compile_course(course, cli, profiles, analyzers)
            for d in diags.sorted():
                typer.echo(d.format(), err=True)
            errors = len(diags.errors)
            warnings = sum(1 for d in diags.items if d.severity == "warning")
            summary = f"{errors} errors, {warnings} warnings"
            if compiled is None or errors or (strict and warnings):
                typer.echo(f"✗ {course} ({summary})", err=True)
                failed = True
            elif check:
                typer.echo(f"✓ {compiled.course.id} ({summary})")
            else:
                manifest = write_bundle(compiled, profiles, analyzers, out / compiled.course.id)
                typer.echo(f"✓ {compiled.course.id} → {manifest['id']} ({summary})")
                index.append(
                    {
                        "id": compiled.course.id,
                        "target": manifest["target"],
                        "orthographies": manifest["orthographies"],
                        "support": manifest["support"],
                        "manifest": f"{compiled.course.id}/manifest.json",
                        "bundle": manifest["id"],
                    }
                )
    if index and not failed and len(paths) > 1:
        # The courses a client can offer, for a directory of bundles (apps/web/public/bundles).
        courses = sorted(index, key=lambda c: c["id"])
        (out / "index.json").write_bytes(canonical({"courses": courses}))
    raise typer.Exit(code=1 if failed else 0)


@app.command()
def lints() -> None:
    """List every compiler lint: id, severity, stage and what it catches (gameplan §7.5)."""
    from nabu.compiler import LINTS

    for lint in LINTS.values():
        typer.echo(f"{lint.id:34} {lint.severity:8} stage {lint.stage}  {lint.description}")


@app.command("import-librelingo")
def import_librelingo(
    source: Annotated[
        Path, typer.Argument(exists=True, file_okay=False, help="LibreLingo course directory.")
    ],
    out: Annotated[Path, typer.Option(help="Output course directory.")],
    course_id: Annotated[str, typer.Option(help="Nabu course id.")],
    orthography: Annotated[str, typer.Option(help="Target orthography id, e.g. es-Latn/standard.")],
) -> None:
    """Import a LibreLingo YAML course as Nabu draft sources (best effort, §7.7)."""
    from nabu.importers.librelingo import import_course, write

    imported = import_course(source, course_id, orthography)
    write(imported, out)
    typer.echo(f"wrote {out} ({len(imported.units)} units)")


@app.command()
def tables(
    out: Annotated[Path, typer.Option(help="Output directory.")] = Path("../profiles/tables"),
) -> None:
    """Regenerate profile data tables from pinned Unihan and OpenCC sources."""
    from nabu.tables import generate

    for path in generate(out):
        typer.echo(f"wrote {path}")


@app.command()
def version() -> None:
    """Print the pipeline version."""
    typer.echo(__version__)
