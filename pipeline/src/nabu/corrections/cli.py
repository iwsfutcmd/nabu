"""`nabu corrections …`: learners' corrections into the course source (ADR 0051)."""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from pathlib import Path
from typing import Annotated

import typer

from nabu.paths import REPO

app = typer.Typer(
    no_args_is_help=True,
    add_completion=False,
    help="Corrections to sentences and story lines → the course source.",
)


@app.command("apply")
def apply_command(
    export: Annotated[
        Path,
        typer.Argument(
            exists=True,
            dir_okay=False,
            help="JSON Lines: GET /admin/v1/corrections.jsonl?status=approved, or a device's "
            "export from the app's sentence list.",
        ),
    ],
    courses: Annotated[Path, typer.Option(help="The courses directory.")] = REPO / "courses",
    dry_run: Annotated[
        bool, typer.Option("--dry-run", help="Show what would change; write nothing.")
    ] = False,
    summary: Annotated[
        Path | None, typer.Option(help="Write a summary (Markdown) for the commit or review.")
    ] = None,
    mark: Annotated[
        str | None,
        typer.Option(
            help="API base URL: mark the applied corrections (NABU_ADMIN_TOKEN from the "
            "environment)."
        ),
    ] = None,
) -> None:
    """Write corrections into the unit files, check the courses still compile, list the rest."""
    from nabu.compiler import compile_course
    from nabu.corecli import CoreCli
    from nabu.corrections import apply, read_rows
    from nabu.corrections import summary as describe

    rows = read_rows(export)
    failed = False
    with CoreCli() as cli:
        outcome = apply(rows, courses, cli)
        if not dry_run:
            for file, text in outcome.files.items():
                file.write_text(text, encoding="utf-8")
            for course in sorted({a.row.course for a in outcome.applied}):
                diags, _ = compile_course(courses / course, cli)
                for d in diags.items:
                    # Errors, and the clips the edits made stale (regenerate with `nabu audio`).
                    if d.severity == "error" or d.lint == "audio.stale":
                        typer.echo(d.format(), err=True)
                failed = failed or bool(diags.errors)
    for a in outcome.applied:
        step = "" if a.row.step is None else f" step {a.row.step}"
        typer.echo(f"✓ {a.row.course} {a.row.item}{step}  [{a.where}]")
        for c in a.changes:
            typer.echo(f"    {c}")
        for c in a.checks:
            typer.echo(f"    check: {c}")
    for s in outcome.skipped:
        at = f"  [{s.where}]" if s.where else ""
        typer.echo(f"· {s.row.course} {s.row.item}: {s.reason}{at}", err=True)
    if summary is not None:
        summary.write_text(describe(outcome), encoding="utf-8")
    if failed:
        typer.echo("✗ an edited course no longer compiles: fix it or `git checkout` it", err=True)
        raise typer.Exit(code=1)
    if mark is not None and outcome.applied and not dry_run:
        token = os.environ.get("NABU_ADMIN_TOKEN", "")
        if not token:
            typer.echo("✗ --mark needs NABU_ADMIN_TOKEN in the environment", err=True)
            raise typer.Exit(code=1)
        for a in outcome.applied:
            request = urllib.request.Request(
                f"{mark.rstrip('/')}/admin/v1/corrections/{a.row.id}",
                data=json.dumps({"status": "applied"}).encode(),
                headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"},
                method="POST",
            )
            try:
                with urllib.request.urlopen(request, timeout=30):
                    pass
            except urllib.error.HTTPError as e:
                # A device's own export has event ids, not queue ids.
                if e.code != 404:
                    raise
                typer.echo(f"· {a.row.id}: not in the queue", err=True)
    verb = "would apply" if dry_run else "applied"
    typer.echo(f"{len(outcome.applied)} {verb}, {len(outcome.skipped)} not")
