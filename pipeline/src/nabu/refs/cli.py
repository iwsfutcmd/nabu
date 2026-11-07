"""`nabu refs …`: the reference library (ADR 0079), through the relay at NABU_REFS_URL."""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Annotated, NoReturn

import typer

from nabu.refs.client import Relay, RelayError, default_local_dir, relay_from_env

app = typer.Typer(
    no_args_is_help=True,
    add_completion=False,
    help="The reference library: a private Drive folder of grammars, dictionaries and notes.",
)

UrlOption = Annotated[
    str | None, typer.Option("--url", help="The relay's address (default: NABU_REFS_URL).")
]
ParentsOption = Annotated[
    bool, typer.Option("--parents", "-p", help="Make missing folders on the way.")
]

_HINTS = {
    "unauthorized": "The relay refused the key: set NABU_REFS_KEY, or save it for the relay's host "
    "in the environment's network secrets.",
    "not-signed-in": "The relay is not signed in to Google: see apps/references/README.md.",
    "sign-in-expired": "The relay's Google sign-in lapsed: sign in again "
    "(apps/references/README.md).",
    "inside-git": "References never go inside a git work tree: choose another --to "
    "or NABU_REFS_DIR.",
}


def _relay(url: str | None) -> Relay:
    try:
        return relay_from_env(url)
    except RelayError as error:
        _fail(error)


def _fail(error: RelayError) -> NoReturn:
    typer.echo(f"error: {error}", err=True)
    hint = _HINTS.get(error.error)
    if hint:
        typer.echo(hint, err=True)
    raise typer.Exit(code=1)


def _size(size: int | None) -> str:
    return "-" if size is None else f"{size:,}"


@app.command("status")
def status_command(url: UrlOption = None) -> None:
    """Which Google account the relay acts as, and which folder it serves."""
    try:
        status = _relay(url).status()
    except RelayError as error:
        _fail(error)
    typer.echo(f"account: {status['account']}")
    typer.echo(f"folder:  {status['folder']['name']}")


@app.command("ls")
def list_command(
    path: Annotated[str, typer.Argument(help="A folder in the library ('' is its top).")] = "",
    recursive: Annotated[bool, typer.Option("--recursive", "-r", help="Everything below.")] = False,
    url: UrlOption = None,
) -> None:
    """List a folder: kind, size, last change, path."""
    relay = _relay(url)
    try:
        listed = relay.walk(path) if recursive else ((e.name, e) for e in relay.list(path))
        for name, entry in listed:
            suffix = "/" if entry.kind == "folder" else ""
            modified = (entry.modified or "")[:10]
            typer.echo(f"{entry.kind:<8} {_size(entry.size):>14} {modified:<10} {name}{suffix}")
    except RelayError as error:
        _fail(error)


@app.command("pull")
def pull_command(
    path: Annotated[str, typer.Argument(help="A file or folder in the library ('' for all).")] = "",
    to: Annotated[
        Path | None,
        typer.Option("--to", help="Where copies go (default: NABU_REFS_DIR or ~/nabu-references)."),
    ] = None,
    url: UrlOption = None,
) -> None:
    """Copy references down, keeping their paths; files that have not changed stay as they are."""
    into = to or default_local_dir()
    try:
        report = _relay(url).pull(path, into)
    except RelayError as error:
        _fail(error)
    for remote in report.downloaded:
        typer.echo(f"pulled     {remote}")
    for remote, why in report.skipped:
        typer.echo(f"skipped    {remote} ({why})")
    typer.echo(
        f"{len(report.downloaded)} pulled, {len(report.unchanged)} unchanged, "
        f"{len(report.skipped)} skipped, in {into}"
    )


@app.command("cat")
def cat_command(
    path: Annotated[str, typer.Argument(help="A file in the library (a note, say).")],
    url: UrlOption = None,
) -> None:
    """Print a file (Google Docs come as Markdown)."""
    try:
        sys.stdout.buffer.write(_relay(url).read_bytes(path))
    except RelayError as error:
        _fail(error)


@app.command("put")
def put_command(
    local: Annotated[Path, typer.Argument(exists=True, dir_okay=False, help="The local file.")],
    path: Annotated[str, typer.Argument(help="Where it goes in the library, with its name.")],
    parents: ParentsOption = False,
    url: UrlOption = None,
) -> None:
    """Create a file in the library, or replace its content (25 MB at most)."""
    try:
        entry = _relay(url).upload(local, path, parents)
    except RelayError as error:
        _fail(error)
    typer.echo(f"wrote {path} ({_size(entry.size)} bytes)")


@app.command("mkdir")
def mkdir_command(
    path: Annotated[str, typer.Argument(help="The folder; missing folders above it are made.")],
    url: UrlOption = None,
) -> None:
    """Make a folder."""
    try:
        _relay(url).mkdir(path)
    except RelayError as error:
        _fail(error)
    typer.echo(f"made {path}/")


@app.command("mv")
def move_command(
    source: Annotated[str, typer.Argument(help="What to move or rename.")],
    target: Annotated[str, typer.Argument(help="Its new path, with its name.")],
    parents: ParentsOption = False,
    url: UrlOption = None,
) -> None:
    """Rename or move a file or folder."""
    try:
        _relay(url).move(source, target, parents)
    except RelayError as error:
        _fail(error)
    typer.echo(f"moved {source} → {target}")


@app.command("trash")
def trash_command(
    path: Annotated[str, typer.Argument(help="What to put in Drive's trash.")],
    url: UrlOption = None,
) -> None:
    """Put a file or folder in Drive's trash (the owner can restore it for 30 days)."""
    try:
        _relay(url).trash(path)
    except RelayError as error:
        _fail(error)
    typer.echo(f"trashed {path}")
