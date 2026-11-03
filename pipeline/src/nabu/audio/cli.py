"""`nabu audio`: synthesize, ingest and report a course's audio (gameplan §10)."""

from __future__ import annotations

from collections import Counter
from collections.abc import Callable
from pathlib import Path
from typing import Annotated, Any

import typer

from nabu.audio.course import Item
from nabu.audio.providers import Clip
from nabu.schema.models import AudioVoice

app = typer.Typer(no_args_is_help=True, add_completion=False, help="A course's audio clips.")

#: Whisper language codes of the fixture courses' targets.
ASR_LANGUAGE = {"fa": "fa", "yue": "yue", "uz": "uz", "apc": "ar"}


def _compiled(course: Path) -> tuple[Path, Any, list[dict[str, Any]]]:
    from nabu.compiler import compile_course
    from nabu.corecli import CoreCli

    with CoreCli() as cli:
        diags, compiled = compile_course(course, cli)
    if compiled is None:
        for d in diags.sorted():
            typer.echo(d.format(), err=True)
        typer.echo(f"✗ {course} does not compile", err=True)
        raise typer.Exit(code=1)
    course_dir = course if course.is_dir() else course.parent
    return course_dir, compiled.course, compiled.units


@app.command()
def generate(
    course: Annotated[Path, typer.Argument(exists=True, help="Course directory.")],
    check: Annotated[
        bool, typer.Option(help="Round-trip each clip through Whisper (speech group).")
    ] = False,
    voice_id: Annotated[
        str | None,
        typer.Option("--voice", help="Which voice of the cast (its id); default the first."),
    ] = None,
) -> None:
    """Synthesize the course's clips from pinned readings; unchanged inputs are kept.

    Hosted voices (elevenlabs, cartesia) read their API key from the environment.
    """
    from nabu.audio.course import synthesize_course
    from nabu.audio.providers import MissingKey, ProviderError

    course_dir, source, units = _compiled(course)
    audio = source.audio
    if audio is not None and audio.humanRequired:
        typer.echo(
            f"✗ {source.id}: audio is human-required; record and `nabu audio ingest`", err=True
        )
        raise typer.Exit(code=1)
    if audio is None or not audio.voices:
        typer.echo(f"✗ {source.id}: no audio voices in course.yaml", err=True)
        raise typer.Exit(code=1)
    voice = next((v for v in audio.voices if voice_id in (None, v.id)), None)
    if voice is None:
        typer.echo(f"✗ {source.id}: no voice {voice_id!r} in the cast", err=True)
        raise typer.Exit(code=1)
    checker: Callable[[Item, Clip], dict[str, Any]] | None = None
    if check:
        from nabu.audio.qa import round_trip

        language: str = ASR_LANGUAGE.get(source.id) or str(source.target).split("-")[0]

        def round_trip_check(item: Item, clip: Clip) -> dict[str, Any]:
            return round_trip(clip, item.expected, language)

        checker = round_trip_check
    try:
        report = synthesize_course(course_dir, units, voice, checker)
    except (MissingKey, ProviderError, ValueError) as error:
        typer.echo(f"✗ {source.id}: {error}", err=True)
        raise typer.Exit(code=1) from None
    typer.echo(
        f"✓ {source.id}: {report.synthesized} synthesized, {report.kept} kept, "
        f"{report.removed} removed; {len(report.skipped)} without a pinned reading"
    )
    for item in report.skipped:
        typer.echo(f"  - {item}: no {voice.reading} reading", err=True)


@app.command()
def ingest(
    course: Annotated[Path, typer.Argument(exists=True, help="Course directory.")],
    item: Annotated[str, typer.Option(help="Sentence or KC id the recording says.")],
    file: Annotated[
        Path, typer.Option(exists=True, dir_okay=False, help="Any audio ffmpeg reads.")
    ],
    license: Annotated[str, typer.Option(help="SPDX license of the recording.")],
    author: Annotated[str, typer.Option(help="human:<speaker>")],
    source: Annotated[str, typer.Option(help="Where it came from (URL or description).")],
    status: Annotated[str, typer.Option(help="draft, reviewed or published.")] = "draft",
    align: Annotated[
        bool, typer.Option(help="Token timings by forced alignment (speech group).")
    ] = False,
) -> None:
    """Add a human recording (normal and slow) with its license and provenance."""
    from nabu.audio.ingest import Recording
    from nabu.audio.ingest import ingest as add

    course_dir, src, units = _compiled(course)
    alignment = None
    if align:
        tokens = next(
            (
                form["text"]["tokens"]
                for u in units
                for s in u["sentences"]
                if s["id"] == item
                for form in s["forms"].values()
            ),
            None,
        )
        voices: list[AudioVoice] = list(src.audio.voices or []) if src.audio is not None else []
        if tokens is None or not voices:
            typer.echo(f"✗ {item}: alignment needs a sentence and a course voice", err=True)
            raise typer.Exit(code=1)
        alignment = (tokens, voices[0].reading, voices[0].voice)
    entries = add(course_dir, Recording(item, file, license, author, source, status), alignment)
    typer.echo(f"✓ {item}: {len(entries)} clips ({license}, {author})")


@app.command()
def report(course: Annotated[Path, typer.Argument(exists=True, help="Course directory.")]) -> None:
    """QA summary and the human review queue (clips the round-trip check did not pass)."""
    from nabu.audio.course import audio_dir, read_index

    course_dir = course if course.is_dir() else course.parent
    index = read_index(audio_dir(course))
    normal = [c for c in index.clips if c.speed == "normal"]
    counts = Counter(
        c.qa.status if c.qa is not None and c.qa.status else "unchecked" for c in normal
    )
    typer.echo(
        f"{course_dir.name}: {len(index.clips)} clips; "
        f"normal speed by QA: {dict(sorted(counts.items()))}"
    )
    for c in normal:
        if c.qa is not None and c.qa.status in ("review", "fail"):
            typer.echo(f"  {c.qa.status:6} {c.item}: CER {c.qa.cer} heard {c.qa.asrText!r}")
