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


def _register_audio() -> None:
    from nabu.audio.cli import app as audio_app

    app.add_typer(audio_app, name="audio")


_register_audio()


def _register_ai() -> None:
    from nabu.ai.cli import author_app, reports_app

    app.add_typer(reports_app, name="reports")
    app.add_typer(author_app, name="author")


def _register_corrections() -> None:
    from nabu.corrections.cli import app as corrections_app

    app.add_typer(corrections_app, name="corrections")


_register_corrections()


def _register_review() -> None:
    from nabu.review.cli import app as review_app

    app.add_typer(review_app, name="review")


_register_review()


def _register_refs() -> None:
    from nabu.refs.cli import app as refs_app

    app.add_typer(refs_app, name="refs")


_register_refs()


def _register_speech() -> None:
    from nabu.speech.cli import app as speech_app

    app.add_typer(speech_app, name="speech")


_register_ai()
_register_speech()


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
    release: Annotated[
        bool,
        typer.Option(
            help="A release build (ADR 0073): only reviewed content. Demo bundles keep drafts."
        ),
    ] = False,
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
                if release:
                    from nabu.compiler.release import release as release_of

                    compiled, report = release_of(compiled)
                    if not compiled.units:
                        typer.echo(f"✗ {course}: nothing reviewed yet, so no release", err=True)
                        failed = True
                        continue
                    kept = ", ".join(f"{v} {k}" for k, v in sorted(report.kept.items()))
                    dropped = ", ".join(f"{v} {k}" for k, v in sorted(report.dropped.items()) if v)
                    typer.echo(f"  release: kept {kept}; left out {dropped or 'nothing'}")
                manifest = write_bundle(
                    compiled, profiles, analyzers, out / compiled.course.id, release=release
                )
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
        entries = sorted(index, key=lambda c: c["id"])
        (out / "index.json").write_bytes(canonical({"courses": entries}))
    raise typer.Exit(code=1 if failed else 0)


@app.command()
def lints() -> None:
    """List every compiler lint: id, severity, stage and what it catches (gameplan §7.5)."""
    from nabu.compiler import LINTS

    for lint in LINTS.values():
        typer.echo(f"{lint.id:34} {lint.severity:8} stage {lint.stage}  {lint.description}")


@app.command("tiberian")
def tiberian_reading(
    words: Annotated[
        list[str],
        typer.Argument(
            help="Pointed Biblical Hebrew, with the cantillation accents where you have them "
            "(WLC); words joined by maqaf are read as one stress unit."
        ),
    ],
) -> None:
    """The Tiberian reading of pointed words, as the hbo course pins them (ADR 0081): the reading,
    its IPA, and where its stress came from."""
    from nabu.audio import tiberian
    from nabu.audio.pointing import reading, strip_accents

    for argument in words:
        parts = argument.split("\u05be")
        for k, word in enumerate(parts):
            r = reading(word, bound=k < len(parts) - 1)
            typer.echo(f"{strip_accents(word)}\t{r.text}\t{tiberian.ipa(r.text)}\t{r.stress}")


@app.command("calibration")
def calibration_command(
    events: Annotated[
        list[Path], typer.Argument(help="JSONL learner-event logs.", exists=True, dir_okay=False)
    ],
    bins: Annotated[int, typer.Option(min=2, help="Number of equal-width probability bins.")] = 10,
    by: Annotated[str, typer.Option(help="Also split by: none, template or course.")] = "none",
) -> None:
    """Shadow-mode calibration of the performance model (§9.3): predicted vs observed."""
    from nabu.analytics.calibration import GroupBy, calibration, format_report

    reports = calibration(events, bins=bins, group_by=GroupBy(by))
    if not reports:
        typer.echo("no first tries with a logged prediction")
        raise typer.Exit(1)
    typer.echo("\n\n".join(format_report(r) for r in reports))


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
