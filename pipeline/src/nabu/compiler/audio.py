"""Stage 9 for audio (gameplan §10): check a course's committed clips and package them.

The compiler never synthesizes: `nabu audio` writes clips and audio/index.yaml, which are
checked in, and this stage only reads them, so builds stay deterministic and need no speech
model. It checks that every clip exists with its recorded hash, carries a license and
provenance, is not synthetic in a human-required course, still matches what the voice would
read now (a changed reading makes a clip stale) and the reference voice it cloned (ADR 0058),
and that its timings point at word tokens of its sentence. Clips the round-trip check failed
stay out of the bundle until a human marks them reviewed.
"""

from __future__ import annotations

import hashlib
from collections.abc import Callable
from pathlib import Path
from typing import TYPE_CHECKING, Any

from pydantic import ValidationError

from nabu.audio.course import INDEX, audio_dir, plan
from nabu.compiler.source import Doc, load_doc
from nabu.schema.models import AudioClip, AudioIndex, CourseSource

if TYPE_CHECKING:
    from nabu.compiler.build import Compiled, Ctx

WORD_KINDS = {"word", "number"}


def _items(units: list[dict[str, Any]]) -> tuple[dict[str, list[list[dict[str, Any]]]], set[str]]:
    """Every sentence's and story line's tokens per orthography (id → forms; a line's id is
    "<story>#<step>"), and every KC id."""
    sentences: dict[str, list[list[dict[str, Any]]]] = {}
    kcs: set[str] = set()
    for unit in units:
        for s in unit["sentences"]:
            sentences[s["id"]] = [form["text"]["tokens"] for form in s["forms"].values()]
        for story in unit.get("stories", []):
            for step, s in enumerate(story["steps"]):
                if s.get("line"):
                    key = f"{story['id']}#{step}"
                    sentences[key] = [form["tokens"] for form in s["line"]["forms"].values()]
        kcs.update(kc["id"] for kc in unit.get("kcs", []))
    return sentences, kcs


def _credit(clip: AudioClip) -> str:
    if clip.synthesis is not None:
        return f"{clip.synthesis.provider} {clip.synthesis.version} ({clip.synthesis.voice})"
    speaker = clip.provenance.author.removeprefix("human:")
    return speaker if clip.source is None else f"{speaker}: {clip.source}"


def _load(ctx: Ctx, path: Path, display: str) -> tuple[Doc, AudioIndex] | None:
    doc = load_doc(path, display)
    try:
        return doc, AudioIndex.model_validate(doc.data)
    except ValidationError as error:
        for e in error.errors():
            where = ".".join(str(p) for p in e["loc"])
            loc_path = list(e["loc"])
            ctx.diags.report("audio.schema", f"{where}: {e['msg']}", doc.loc(*loc_path))
        return None


def check_audio(
    ctx: Ctx,
    course: CourseSource,
    course_file: Path,
    display: Callable[[Path], str],
    compiled: Compiled,
) -> None:
    adir = audio_dir(course_file)
    path = adir / INDEX
    if not path.exists():
        return
    loaded = _load(ctx, path, display(path))
    if loaded is None:
        return
    doc, index = loaded
    sentences, kcs = _items(compiled.units)
    human_required = course.audio is not None and course.audio.humanRequired is True
    voices = course.audio.voices if course.audio is not None and course.audio.voices else []
    # What each voice of the cast would read now, by (provider, voice).
    planned: dict[tuple[str, str], dict[str, str]] = {}
    for voice in voices:
        try:
            reads = plan(compiled.units, voice, compiled.written)[0]
        except ValueError as error:
            ctx.diags.report("audio.schema", f"voice {voice.id}: {error}", doc.loc())
            continue
        planned[(voice.provider, voice.voice)] = {r.item: r.input for r in reads}
    # The round trip checks the normal-speed clip; when it fails, the whole item (slow too) waits.
    # So does an item a listener rejected a clip of (ADR 0060), until the clip is made again.
    failed = {
        c.item
        for c in index.clips
        if c.speed == "normal"
        and c.qa is not None
        and c.qa.status == "fail"
        and c.provenance.status not in ("reviewed", "published")
    } | {c.item for c in index.clips if c.rejected is not None}
    # Reference voices a cloning provider imitates: each must be its recorded file.
    references: dict[str, str] = {}
    for i, ref in enumerate(index.references or []):
        file = adir / ref.file
        if not file.exists() or hashlib.sha256(file.read_bytes()).hexdigest() != ref.sha256:
            ctx.diags.report(
                "audio.missing-file",
                f"reference voice {ref.id}: {ref.file} is missing or does not match its sha256",
                doc.loc("references", i),
            )
            continue
        references[ref.id] = ref.sha256
    held = 0
    items: dict[str, dict[str, Any]] = {}
    files: dict[str, dict[str, tuple[bytes, str, str]]] = {}
    tallies: dict[str, list[AudioClip]] = {}
    for i, clip in enumerate(index.clips):
        loc = doc.loc("clips", i)
        file = adir / clip.file
        if not file.exists():
            ctx.diags.report("audio.missing-file", f"{clip.item}: no file {clip.file}", loc)
            continue
        data = file.read_bytes()
        if hashlib.sha256(data).hexdigest() != clip.sha256:
            ctx.diags.report(
                "audio.missing-file", f"{clip.item}: {clip.file} does not match its sha256", loc
            )
            continue
        if clip.synthetic and human_required:
            ctx.diags.report(
                "audio.human-required",
                f"{clip.item}: synthesized audio in a course whose audio is human-required",
                loc,
            )
            continue
        if clip.item not in sentences and clip.item not in kcs:
            ctx.diags.report(
                "audio.unknown-item",
                f"{clip.item}: no such sentence, story line or KC in the course",
                loc,
            )
            continue
        if clip.synthesis is not None and voices:
            reads = planned.get((clip.synthesis.provider, clip.synthesis.voice))
            if reads is None:
                ctx.diags.report(
                    "audio.stale",
                    f"{clip.item}: synthesized by {clip.synthesis.provider} "
                    f"({clip.synthesis.voice}), which is no longer in the course's cast; "
                    "run `nabu audio generate`",
                    loc,
                )
                continue
            cloned = (clip.synthesis.settings or {}).get("reference")
            if cloned is not None and references.get(clip.synthesis.voice) != cloned:
                ctx.diags.report(
                    "audio.stale",
                    f"{clip.item}: cloned from an earlier reference voice "
                    f"({clip.synthesis.voice}); run `nabu audio generate`",
                    loc,
                )
                continue
            if reads.get(clip.item, clip.synthesis.input) != clip.synthesis.input:
                ctx.diags.report(
                    "audio.stale",
                    f"{clip.item}: synthesized from {clip.synthesis.input!r}, but the voice now "
                    f"reads {reads[clip.item]!r}; run `nabu audio generate`",
                    loc,
                )
                continue
        # Sentence clips time the sentence's tokens; a word KC's clip times its own form.
        if clip.timings is not None and clip.item in sentences:
            forms = sentences[clip.item]
            ok = any(
                all(
                    t.token < len(tokens) and tokens[t.token].get("kind") in WORD_KINDS
                    for t in clip.timings
                )
                for tokens in forms
            )
            ordered = all(t.startMs <= t.endMs <= clip.durationMs + 5 for t in clip.timings)
            if not ok or not ordered:
                ctx.diags.report(
                    "audio.timings",
                    f"{clip.item}: timings do not fit the sentence's word tokens or the clip",
                    doc.loc("clips", i, "timings"),
                )
                continue
        if clip.item in failed:
            held += clip.speed == "normal"
            continue
        rel = f"audio/{clip.sha256[:16]}.mp3"
        files.setdefault(clip.item, {})[rel] = (data, clip.license, _credit(clip))
        entry: dict[str, Any] = {
            "path": rel,
            "durationMs": clip.durationMs,
            "synthetic": clip.synthetic,
            "license": clip.license,
            "credit": _credit(clip),
        }
        if clip.timings is not None:
            entry["timings"] = [t.model_dump(mode="json") for t in clip.timings]
        items.setdefault(clip.item, {})[clip.speed] = entry
        tallies.setdefault(clip.item, []).append(clip)
    if held:
        ctx.diags.report(
            "audio.held-back",
            f"{held} clips failed the round-trip check or a listener rejected them; they stay out "
            "of the bundle until reviewed or made again (`nabu audio report`)",
            doc.loc("clips"),
        )
    # An item plays only with its normal-speed clip; only playable items' files ship.
    compiled.audio_items = {k: v for k, v in sorted(items.items()) if "normal" in v}
    for item in compiled.audio_items:
        compiled.audio_files.update(files.get(item, {}))
        for clip in tallies.get(item, []):
            compiled.licenses[clip.license] = compiled.licenses.get(clip.license, 0) + 1
            kind = clip.provenance.author.split(":", 1)[0]
            for key in (f"status.{clip.provenance.status}", f"author.{kind}"):
                compiled.provenance[key] = compiled.provenance.get(key, 0) + 1
