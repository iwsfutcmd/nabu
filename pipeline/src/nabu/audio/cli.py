"""`nabu audio`: synthesize, ingest and report a course's audio (gameplan §10)."""

from __future__ import annotations

from collections import Counter
from collections.abc import Callable
from pathlib import Path
from typing import Annotated, Any

import typer

from nabu.audio.course import Item, Written
from nabu.audio.providers import Clip
from nabu.schema.models import AudioVoice

app = typer.Typer(no_args_is_help=True, add_completion=False, help="A course's audio clips.")

#: Whisper language codes of the fixture courses' targets.
ASR_LANGUAGE = {"fa": "fa", "yue": "yue", "uz": "uz", "apc": "ar"}
#: eSpeak NG voices for forced alignment where the course voice is not eSpeak's.
ESPEAK_VOICE = {"apc": "ar"}


def _compiled(course: Path) -> tuple[Path, Any, list[dict[str, Any]], Written]:
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
    return course_dir, compiled.course, compiled.units, compiled.written


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

    Hosted voices (elevenlabs, cartesia) read their API key from the environment. OmniVoice
    voices need the omnivoice group (`uv sync --group omnivoice`) and a reference (`cast`).
    """
    from nabu.audio.course import synthesize_course
    from nabu.audio.providers import MissingKey, ProviderError

    course_dir, source, units, written = _compiled(course)
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
        report = synthesize_course(course_dir, units, voice, checker, written)
    except (MissingKey, ProviderError, ValueError) as error:
        typer.echo(f"✗ {source.id}: {error}", err=True)
        raise typer.Exit(code=1) from None
    typer.echo(
        f"✓ {source.id}: {report.synthesized} synthesized, {report.kept} kept, "
        f"{report.removed} removed; {len(report.skipped)} without a pinned reading"
    )
    for item in report.skipped:
        typer.echo(f"  - {item}: no {voice.reading} reading", err=True)
    for item in report.silent:
        typer.echo(f"  - {item}: the voice said nothing; no clip", err=True)


@app.command()
def cast(
    course: Annotated[Path, typer.Argument(exists=True, help="Course directory.")],
    text: Annotated[
        str, typer.Option(help="What the reference says (a few seconds, the course's language).")
    ],
    instruct: Annotated[
        str | None,
        typer.Option(
            help='OmniVoice: speaker attributes, e.g. "male, young adult, moderate pitch". '
            "Navoiy: the style instruction (default its calm preset)."
        ),
    ] = None,
    seed: Annotated[
        int, typer.Option(help="Sampling seed: the same seed gives the same voice.")
    ] = 0,
    voice_id: Annotated[
        str | None,
        typer.Option("--voice", help="Which voice of the cast (its id); default the first."),
    ] = None,
) -> None:
    """Make a cloning voice's reference: OmniVoice designs it from speaker attributes (ADR 0058),
    Navoiy reads the text in the voice of CosyVoice's prompt recording (ADR 0059).

    Every clip of the voice clones the reference, so the course voice is one speaker. Casting
    again replaces it, and its clips are synthesized again on the next `generate`.
    """
    from nabu.audio.course import cast_reference
    from nabu.audio.providers import NavoiyProvider, ProviderError

    _, source, _, _ = _compiled(course)
    voices: list[AudioVoice] = list(source.audio.voices or []) if source.audio is not None else []
    voice = next((v for v in voices if voice_id in (None, v.id)), None)
    if voice is None or voice.provider not in ("omnivoice", "navoiy"):
        typer.echo(
            f"✗ {source.id}: no OmniVoice or Navoiy voice {voice_id or ''} in the cast", err=True
        )
        raise typer.Exit(code=1)
    if instruct is None:
        if voice.provider == "omnivoice":
            typer.echo(f"✗ {source.id}: an OmniVoice voice needs --instruct", err=True)
            raise typer.Exit(code=1)
        instruct = NavoiyProvider.INSTRUCT
    course_dir = course if course.is_dir() else course.parent
    try:
        ref = cast_reference(course_dir, voice, text, instruct, seed)
    except (ValueError, ProviderError) as error:
        typer.echo(f"✗ {source.id}: {error}", err=True)
        raise typer.Exit(code=1) from None
    typer.echo(f"✓ {source.id}: {ref.file} ({ref.durationMs} ms, {ref.license}), {instruct}")


@app.command()
def align(
    course: Annotated[Path, typer.Argument(exists=True, help="Course directory.")],
    voice_id: Annotated[
        str | None,
        typer.Option("--voice", help="Which voice of the cast (its id); default the first."),
    ] = None,
) -> None:
    """Word timings by forced alignment for clips their voice gave none (speech group).

    OmniVoice and Navoiy report no word onsets; aligned, their sentences highlight word by word
    and their words can be tapped. Phones come from eSpeak NG for the course's language.
    """
    from nabu.audio.course import align_course

    course_dir, source, units, written = _compiled(course)
    voices: list[AudioVoice] = list(source.audio.voices or []) if source.audio is not None else []
    voice = next((v for v in voices if voice_id in (None, v.id)), None)
    if voice is None:
        typer.echo(f"✗ {source.id}: no voice {voice_id or ''} in the cast", err=True)
        raise typer.Exit(code=1)
    phonemes = ESPEAK_VOICE.get(source.id, str(source.target).split("-")[0])
    done = align_course(course_dir, units, voice, phonemes, written)
    typer.echo(f"✓ {source.id}: {done} clips aligned (eSpeak NG {phonemes} phones)")


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

    course_dir, src, units, _ = _compiled(course)
    alignment = None
    if align:
        voices: list[AudioVoice] = list(src.audio.voices or []) if src.audio is not None else []
        voice = voices[0] if voices else None
        # The sentence in the voice's orthography: the one its recordings say.
        tokens = next(
            (
                s["forms"][voice.orthography]["text"]["tokens"]
                for u in units
                for s in u["sentences"]
                if s["id"] == item and voice is not None and voice.orthography in s["forms"]
            ),
            None,
        )
        if tokens is None or voice is None:
            typer.echo(f"✗ {item}: alignment needs a sentence and a course voice", err=True)
            raise typer.Exit(code=1)
        # Phonemes come from eSpeak NG: the voice's own, or one for the course's language.
        phonemes = (
            voice.voice
            if voice.provider == "espeak-ng"
            else ESPEAK_VOICE.get(src.id, str(src.target).split("-")[0])
        )
        alignment = (tokens, voice.reading, phonemes)
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
