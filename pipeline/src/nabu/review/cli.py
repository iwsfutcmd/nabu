"""`nabu review …`: a reviewer's sign-offs into the course source (ADR 0071)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Annotated

import typer

app = typer.Typer(
    no_args_is_help=True,
    add_completion=False,
    help="Reviewers' sign-offs → the course source.",
)


@app.command("apply")
def apply_command(
    course: Annotated[
        Path, typer.Argument(exists=True, file_okay=False, help="The course directory.")
    ],
    signoffs: Annotated[
        Path,
        typer.Argument(
            exists=True, dir_okay=False, help="The sign-offs the app's sentence list downloads."
        ),
    ],
    reviewer: Annotated[
        str, typer.Option(help="Who signed off, as provenance names a person: human:<id>.")
    ],
    dry_run: Annotated[
        bool, typer.Option("--dry-run", help="Show what would change; write nothing.")
    ] = False,
) -> None:
    """Mark each signed-off sentence and story reviewed, if it still says what was signed off."""
    from nabu.analyzers import analyzers_by_tool
    from nabu.compiler import compile_course, load_profiles
    from nabu.corecli import CoreCli
    from nabu.review import apply
    from nabu.schema.models import SignOffs

    if not reviewer.startswith("human:") or len(reviewer) <= len("human:"):
        typer.echo("✗ --reviewer names a person: human:<id>", err=True)
        raise typer.Exit(code=2)
    data = SignOffs.model_validate(json.loads(signoffs.read_text(encoding="utf-8")))
    profiles = load_profiles()
    analyzers = analyzers_by_tool()
    with CoreCli() as cli:
        diags, compiled = compile_course(course, cli, profiles, analyzers)
        if compiled is None:
            for d in diags.sorted():
                typer.echo(d.format(), err=True)
            raise typer.Exit(code=1)
        if compiled.course.id != data.course:
            typer.echo(
                f"✗ these sign-offs are for {data.course}, not {compiled.course.id}", err=True
            )
            raise typer.Exit(code=1)
        # Units written inline in course.yaml are not files to edit; their items are skipped.
        units = [course / u for u in compiled.course.units if isinstance(u, str)]
        author = compiled.course.provenance.author if compiled.course.provenance else ""
        outcome = apply(data, course, units, compiled.units, author, reviewer)
        if not dry_run and outcome.files:
            for file, text in outcome.files.items():
                file.write_text(text, encoding="utf-8")
            # The edited source must still compile, with the items now reviewed.
            diags, again = compile_course(course, cli, profiles, analyzers)
            if again is None or diags.errors:
                for d in diags.sorted():
                    typer.echo(d.format(), err=True)
                typer.echo("✗ the course no longer compiles after the sign-offs", err=True)
                raise typer.Exit(code=1)
    for item in outcome.skipped:
        typer.echo(f"  skipped {item.item}: {item.reason}", err=True)
    verb = "would sign off" if dry_run else "signed off"
    typer.echo(
        f"✓ {data.course}: {verb} {len(outcome.signed)}, already reviewed {len(outcome.already)}, "
        f"skipped {len(outcome.skipped)}"
    )
