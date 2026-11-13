"""Stage 9 for audio (gameplan §10): check a course's committed clips and package them.

The compiler never synthesizes: `nabu audio` writes clips and audio/index.yaml, which are
checked in, and this stage only reads them, so builds stay deterministic and need no speech
model. It checks that every clip exists with its recorded hash, carries a license and
provenance, is not synthetic in a human-required course, still matches what the voice would
read now (a changed reading makes a clip stale) and the reference voice it cloned (ADR 0058),
and that its timings point at word tokens of its sentence. Clips the round-trip check failed
stay out of the bundle until a human marks them reviewed. A clip a person confirmed (a recording,
or a synthetic clip a listener marked right) says so in the bundle (`confirmed`, ADR 0125): only
such a clip may ask which tone a lone syllable has.
"""

from __future__ import annotations

import hashlib
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING

from pydantic import ValidationError

from nabu.audio.course import INDEX, assignment, audio_dir, checked_voices, held_back, plan
from nabu.compiler.counts import Counted, count
from nabu.compiler.source import Doc, load_doc
from nabu.items import WORD_KINDS, iter_items
from nabu.provenance import signed_off
from nabu.schema.models import AudioClip, AudioIndex, BundleClip, CourseSource, TokenTiming

if TYPE_CHECKING:
    from nabu.compiler.build import Compiled, Ctx


@dataclass(frozen=True)
class ShippedClip:
    """A clip that ships, as the bundle's audio index lists it (BundleClip), but for its credit:
    the text, which the bundle names by its id (ADR 0110)."""

    path: str
    durationMs: int
    synthetic: bool
    license: str
    credit: str
    timings: tuple[TokenTiming, ...] | None = None
    #: A person confirmed what it says (confirmed_by_person); the bundle says so only when true.
    confirmed: bool = False

    def bundled(self, credit: str) -> BundleClip:
        """The clip as the audio index lists it, its credit named by `credit` (an id)."""
        timings = None if self.timings is None else list(self.timings)
        return BundleClip(
            path=self.path,
            durationMs=self.durationMs,
            synthetic=self.synthetic,
            license=self.license,
            credit=credit,
            confirmed=True if self.confirmed else None,
            timings=timings,
        )


def confirmed_by_person(clip: AudioClip) -> bool:
    """Whether a person confirmed what a clip says (ADR 0125): a recording (`nabu audio ingest`),
    or a synthetic clip a listener marked right in the audio check (`nabu audio verdicts`, ADR
    0060), which signs it off as a human reviewer. Only such a clip may ask which tone it says."""
    if not clip.synthetic:
        return True
    p = clip.provenance
    return signed_off(p.status) and (p.reviewedBy or "").startswith("human:")


def _credit(clip: AudioClip, recordings: dict[str, str]) -> str:
    """Who made a clip; a voice cloned from a person's recording also names that recording, which
    its license may ask for (CC BY: ADR 0076)."""
    if clip.synthesis is not None:
        made = f"{clip.synthesis.provider} {clip.synthesis.version} ({clip.synthesis.voice})"
        recording = recordings.get(clip.synthesis.voice)
        return made if recording is None else f"{made}, cloning {recording}"
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
    if course.audio is not None and course.audio.quality == "bad":
        # A voice too broken to present (ADR 0091): no clip ships. The clips stay in the course's
        # audio folder, where reviewers and the audio check still hear them.
        return
    loaded = _load(ctx, path, display(path))
    if loaded is None:
        return
    doc, index = loaded
    # Every sentence, word KC and story line ("<story>#<step>"), by id.
    known = {item.id: item for item in iter_items(compiled.units)}
    human_required = course.audio is not None and course.audio.humanRequired is True
    voices = course.audio.voices if course.audio is not None and course.audio.voices else []
    # What each voice of the cast would read now, by (provider, voice).
    planned: dict[tuple[str, str], dict[str, str]] = {}
    # Which voice of the cast reads each item (ADR 0078); a person's check keeps a clip's voice.
    checked = checked_voices(index, voices)
    owner = assignment(compiled.units, voices, checked) if voices else {}
    by_id = {v.id: v for v in voices}
    for voice in voices:
        try:
            reads = plan(compiled.units, voice, compiled.written, voices, checked)[0]
        except ValueError as error:
            ctx.diags.report("audio.schema", f"voice {voice.id}: {error}", doc.loc())
            continue
        planned[(voice.provider, voice.voice)] = {r.item: r.input for r in reads}
    failed = held_back(index)
    # Reference voices a cloning provider imitates: each must be its recorded file.
    references: dict[str, str] = {}
    recordings: dict[str, str] = {}  # a recorded reference's speaker, license and source
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
        if not ref.synthetic and ref.source is not None:
            speaker = ref.provenance.author.removeprefix("human:")
            recordings[ref.id] = f"{speaker} ({ref.license}): {ref.source}"
    held = 0
    items: dict[str, dict[str, ShippedClip]] = {}
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
        said = known.get(clip.item)
        if said is None:
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
            reader = by_id.get(owner.get(clip.item, ""))
            if reader is not None and (reader.provider, reader.voice) != (
                clip.synthesis.provider,
                clip.synthesis.voice,
            ):
                ctx.diags.report(
                    "audio.stale",
                    f"{clip.item}: in {clip.synthesis.voice}'s voice, but {reader.id} reads it now "
                    "(ADR 0078); run `nabu audio generate`",
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
        if clip.timings is not None and said.kind != "kc":
            ok = any(
                all(
                    t.token < len(tokens) and tokens[t.token].kind in WORD_KINDS
                    for t in clip.timings
                )
                for tokens in said.forms.values()
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
        credit = _credit(clip, recordings)
        files.setdefault(clip.item, {})[rel] = (data, clip.license, credit)
        timings = None if clip.timings is None else tuple(clip.timings)
        entry = ShippedClip(
            rel,
            clip.durationMs,
            clip.synthetic,
            clip.license,
            credit,
            timings,
            confirmed_by_person(clip),
        )
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
            p = clip.provenance
            count(compiled, Counted(item, clip.license, p.status, p.author))
