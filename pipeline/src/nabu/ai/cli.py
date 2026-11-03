"""`nabu reports …` and `nabu author …`: the pipeline side of the AI features (gameplan §13)."""

from __future__ import annotations

import json
import os
import subprocess
import urllib.request
from pathlib import Path
from typing import Annotated

import typer

from nabu.paths import REPO

reports_app = typer.Typer(
    no_args_is_help=True, add_completion=False, help="The review queue → accept sets."
)
author_app = typer.Typer(
    no_args_is_help=True, add_completion=False, help="LLM-drafted content, for review."
)


@reports_app.command("promote")
def promote_command(
    export: Annotated[
        Path,
        typer.Argument(
            exists=True, help="The queue's export: GET /admin/v1/reports.jsonl?status=approved"
        ),
    ],
    courses: Annotated[Path, typer.Option(help="The courses directory.")] = REPO / "courses",
    weight: Annotated[
        float, typer.Option(help="Accept-set weight of a promoted answer (§7.4).")
    ] = 0.5,
    pr_body: Annotated[
        Path | None, typer.Option(help="Write the pull request's description here.")
    ] = None,
    branch: Annotated[
        str | None, typer.Option(help="Commit the change on this new git branch.")
    ] = None,
    mark: Annotated[
        str | None,
        typer.Option(
            help="API base URL: mark the promoted reports (NABU_ADMIN_TOKEN from the environment)."
        ),
    ] = None,
) -> None:
    """Add approved answers to their sentences' accept sets, check them, and describe the change."""
    from nabu.ai.reports import pr_body as describe
    from nabu.ai.reports import promote, read_export
    from nabu.compiler import compile_course
    from nabu.corecli import CoreCli

    reports = read_export(export)
    with CoreCli() as cli:
        outcome = promote(reports, courses, cli, weight)
        touched = sorted({r.course for r, _, _ in outcome.promoted})
        failed = False
        for course in touched:
            diags, _ = compile_course(courses / course, cli)
            for d in diags.errors:
                typer.echo(d.format(), err=True)
                failed = True
    for r, alt, file in outcome.promoted:
        typer.echo(f"✓ {r.course} {r.item} ({r.orthography}): + {alt}   [{file.name}]")
    for r, why in outcome.skipped:
        typer.echo(f"· {r.id}: {why}", err=True)
    if failed:
        typer.echo("✗ the edited courses no longer compile; nothing committed", err=True)
        raise typer.Exit(code=1)
    body = describe(outcome, courses.parent)
    if pr_body is not None:
        pr_body.write_text(body, encoding="utf-8")
    if branch is not None and outcome.promoted:
        files = sorted({str(f) for _, _, f in outcome.promoted})
        subprocess.run(["git", "checkout", "-b", branch], check=True)
        subprocess.run(["git", "add", *files], check=True)
        subprocess.run(
            [
                "git",
                "commit",
                "-m",
                f"feat(courses): promote {len(outcome.promoted)} reviewed answers into accept sets",
                "-m",
                body,
            ],
            check=True,
        )
    if mark is not None and outcome.promoted:
        token = os.environ.get("NABU_ADMIN_TOKEN", "")
        if not token:
            typer.echo("✗ --mark needs NABU_ADMIN_TOKEN in the environment", err=True)
            raise typer.Exit(code=1)
        for r, _, _ in outcome.promoted:
            request = urllib.request.Request(
                f"{mark.rstrip('/')}/admin/v1/reports/{r.id}",
                data=json.dumps({"status": "promoted"}).encode(),
                headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"},
                method="POST",
            )
            with urllib.request.urlopen(request, timeout=30):
                pass
    typer.echo(f"{len(outcome.promoted)} promoted, {len(outcome.skipped)} not")


@author_app.command("draft")
def draft_command(
    course: Annotated[
        Path, typer.Argument(exists=True, file_okay=False, help="The course directory.")
    ],
    node: Annotated[str, typer.Option(help="The lesson node to draft sentences for.")],
    count: Annotated[int, typer.Option(min=1, max=20)] = 5,
    strict: Annotated[bool, typer.Option(help="Fail if the drafts trip any error lint.")] = False,
) -> None:
    """Draft sentences with the configured model (NABU_LLM…) into <course>/drafts/<node>.yaml."""
    from nabu.ai.author import draft
    from nabu.ai.llm import NoModel, model_from_env

    try:
        model = model_from_env()
    except NoModel as error:
        typer.echo(f"✗ {error}", err=True)
        raise typer.Exit(code=2) from None
    out, findings = draft(course, node, count, model)
    for f in findings:
        typer.echo(f"  {f}", err=True)
    typer.echo(f"✓ {out} ({len(findings)} lint findings)")
    if strict and any(f.startswith("error") for f in findings):
        raise typer.Exit(code=1)
