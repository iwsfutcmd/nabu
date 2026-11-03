"""`nabu speech …`: the speech service, and the tone evaluation (gameplan §10.4, §16 Phase 9)."""

from __future__ import annotations

from pathlib import Path
from typing import Annotated

import typer

from nabu.paths import REPO

app = typer.Typer(no_args_is_help=True, add_completion=False, help="Speech scoring for learners.")


@app.command("serve")
def serve_command(
    host: Annotated[
        str, typer.Option(help="Interface to listen on (the API's network only).")
    ] = "127.0.0.1",
    port: Annotated[int, typer.Option()] = 8790,
) -> None:
    """Serve tiers 1 (words) and 2 (phones) to the API. Audio is scored in memory and never kept."""
    from nabu.speech.service import serve

    server = serve(host, port)
    typer.echo(f"speech service on http://{host}:{port} (POST /v1/score)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.shutdown()


@app.command("tone-fixtures")
def tone_fixtures_command(
    out: Annotated[
        Path, typer.Argument(help="Directory for the set (clips/ and index.json).")
    ] = REPO / "evals/tones/synthetic-espeak",
) -> None:
    """Synthesize the eSpeak NG tone set (marked synthetic) the tone evaluation runs on in CI."""
    from nabu.speech.tones import synthetic_set

    index = synthetic_set(out)
    clips = index["speakers"][0]["clips"]
    typer.echo(f"✓ {out}: {len(clips)} clips (synthetic)")
