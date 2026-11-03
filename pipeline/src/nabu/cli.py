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


@app.command()
def version() -> None:
    """Print the pipeline version."""
    typer.echo(__version__)
