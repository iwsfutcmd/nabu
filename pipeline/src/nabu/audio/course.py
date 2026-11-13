"""A course's audio (gameplan §10): plan, synthesize, check and index its clips.

`nabu audio <course>` compiles the course, then for each sentence, word KC and story line (item
"<story>#<step>") reads the course voice's orthography:
- the voice reads the **pinned reading** when it has one (Jyutping for Cantonese), never raw
  characters, so polyphones are said as the content says. A reading in a phoneme scheme (the
  Tiberian reading of Biblical Hebrew, ADR 0082) is said as eSpeak NG phonemes, never as
  text, ending with the sentence's question mark or a full stop for its intonation. Otherwise
  the form's text, punctuation included (it carries the intonation of questions and
  exclamations). A voice that reads text but takes inline IPA (`pronounce`) gets IPA for
  every token whose spelling does not settle its pinned reading, and the plain spelling for
  the rest;
- a voice with `vowelMarks` reads the text with the vowel marks the course's vocalization
  gives (ADR 0053, 0058); the round-trip check still compares with the text as written;
- a voice with `finalStop` gets text with no final punctuation (word cards) ended with its
  script's full stop (ADR 0063: punctuation.py), and phonemes with a "." (ADR 0089);
- each item gets one clip, at normal speed: the player slows it down itself (ADR 0062), so a
  slow clip is never another take with its own mistakes;
- word onsets reported by the synthesizer are mapped back to the sentence's tokens, the same
  token indices the app highlights (karaoke) and taps;
- clips are MP3, content-addressed by their synthesis input, and listed with license,
  provenance and QA in `courses/<id>/audio/index.yaml`, which is checked in. The compiler
  only reads it, so CI never needs a speech model.

Human recordings (`ingest`) live in the same index and are never touched by regeneration.
"""

from __future__ import annotations

import copy
import hashlib
import io
import json
import subprocess
import tempfile
import unicodedata
import wave
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, field, replace
from pathlib import Path
from typing import Any, cast

import regex
import yaml

from nabu import yamlio
from nabu.audio import espeak
from nabu.audio.providers import (
    PIPER_PHONEMES,
    Caster,
    Clip,
    Kind,
    Provider,
    Reference,
    Request,
    provider,
)
from nabu.audio.punctuation import closed, with_final_stop
from nabu.provenance import signed_off
from nabu.schema.models import (
    AudioIndex,
    AudioQa,
    AudioRejection,
    AudioVerdicts,
    AudioVoice,
    ReferenceVoice,
    TokenTiming,
)
from nabu.schemes import Plugins, plugins, schemes

INDEX = "index.yaml"
#: Bitrate of the MP3s: speech, mono.
BITRATE = "48k"
#: Clips synthesized between saves of the index.
BATCH = 16
#: The one speed clips are synthesized at: the player slows them itself (ADR 0062).
SPEED = "normal"
WORD_KINDS = {"word", "number"}


@dataclass(frozen=True)
class Span:
    token: int
    start: int  # character offset in the synthesis input
    end: int


@dataclass(frozen=True)
class Item:
    item: str  # sentence id or KC id
    input: str
    spans: tuple[Span, ...]
    expected: str  # what a listener should hear, in the orthography (for the round-trip check)
    #: A word card (its text as written has no closing punctuation) or a sentence, and how many
    #: word tokens it has: what a carrier voice goes by, whatever its script.
    kind: Kind = "sentence"
    words: int = 1

    def request(self, voice: str, rate: float = 1.0, take: int = 0) -> Request:
        """What a provider is asked to say for it."""
        return Request(self.input, voice, rate, take, self.kind, self.words)


@dataclass(frozen=True)
class Job:
    """A clip to make: the item, the voice that reads it with its provider and the clips'
    author, the rate the provider takes, the clip's identity and its take (ADR 0060)."""

    voice: AudioVoice
    tts: Provider
    author: str
    item: Item
    rate: float
    identity: str
    take: int

    @property
    def key(self) -> tuple[str, str]:
        """Its entry's key in the index: (item, speed)."""
        return (self.item.item, SPEED)

    @property
    def request(self) -> Request:
        return self.item.request(self.voice.voice, self.rate, self.take)


@dataclass
class Report:
    synthesized: int = 0
    kept: int = 0
    removed: int = 0
    #: Stale clips let go of without a new one (`prune`).
    dropped: int = 0
    skipped: list[str] = field(default_factory=lambda: [])
    #: Items the voice said nothing for (left without a clip, so the index stays valid).
    silent: list[str] = field(default_factory=lambda: [])
    #: How many items each voice of the cast reads (ADR 0078), by voice id.
    shares: dict[str, int] = field(default_factory=lambda: {})


def audio_dir(course: Path) -> Path:
    """Where a course's audio lives: audio/ beside course.yaml, or <name>.audio/ beside a
    single-file course <name>.yaml (the lint fixtures)."""
    if course.is_dir():
        return course / "audio"
    return course.parent / ("audio" if course.name == "course.yaml" else f"{course.stem}.audio")


def read_index(adir: Path) -> AudioIndex:
    path = adir / INDEX
    if not path.exists():
        return AudioIndex(version=1, clips=[])
    return AudioIndex.model_validate(yaml.safe_load(path.read_text(encoding="utf-8")))


def write_index(adir: Path, index: AudioIndex) -> None:
    data = index.model_dump(mode="json", by_alias=True, exclude_none=True)
    data["clips"] = sorted(data["clips"], key=lambda c: (c["item"], c["speed"]))
    header = (
        "# Written by `nabu audio`: clips, licenses, provenance, timings, QA. Never hand-edit.\n"
    )
    (adir / INDEX).write_text(header + yamlio.dump(data), encoding="utf-8")


def _ipa(scheme: str) -> Plugins:
    """The plug-ins a `pronounce` voice needs of its scheme: its IPA, and whether a spelling
    settles a reading; ValueError for a scheme without them (or without data)."""
    found = plugins(scheme) if scheme in schemes() else Plugins()
    if found.ipa is None or found.settled is None:
        raise ValueError(f"no IPA conversion for the reading scheme {scheme!r}")
    return found


def pronounced(surface: str, reading: str, scheme: str) -> str:
    """A token as a `pronounce` voice reads it: its spelling where that settles the pinned
    reading, else the reading in IPA between slashes (the scheme's plug-ins: nabu.schemes)."""
    found = _ipa(scheme)
    assert found.ipa is not None and found.settled is not None
    return surface if found.settled(surface, reading) else f"/{found.ipa(reading)}/"


def phoneme_scheme(scheme: str) -> bool:
    """Whether a voice says the scheme's readings as eSpeak NG phonemes (`[[...]]`), one word at a
    time, never as text: the Tiberian reading of Biblical Hebrew (ADR 0082), which no voice may
    read as Modern Hebrew text, Toki Pona's words in sitelen Lasina (ADR 0086), which no
    synthesizer has a voice for, and Attic with its vowel lengths (ADR 0087), said as
    reconstructed, never as Modern Greek. A scheme with an `espeak` plug-in (nabu.schemes)."""
    return plugins(scheme).espeak is not None


def said(reading: str, scheme: str, provider: str = "espeak-ng") -> str:
    """A pinned reading as the voice takes it: phonemes for a phoneme scheme (the IPA a Piper
    voice takes where the scheme gives it: ADR 0087, 0089; eSpeak NG's mnemonics otherwise),
    else as written."""
    found = plugins(scheme)
    convert = found.piper if provider == "piper" else found.espeak
    return reading if convert is None else convert(reading)


def _final_mark(tokens: list[dict[str, Any]]) -> str:
    """The end of a phoneme-scheme input: its question mark, else a full stop (intonation)."""
    for token in reversed(tokens):
        if token.get("kind") in WORD_KINDS:
            return "."
        if "?" in str(token["surface"]):
            return "?"
    return "."


def _scheme(voice: AudioVoice) -> str | None:
    """The pinned reading scheme the voice depends on, if any."""
    return voice.reading if voice.reading != "text" else voice.pronounce


Written = Mapping[tuple[str, str], list[str]]
"""(item, orthography) → each token's surface as the source wrote it, where the compiler gave
words vowel marks (ADR 0053): voices read the text as written."""


def _input_of(
    tokens: list[dict[str, Any]], voice: AudioVoice, written: list[str] | None = None
) -> tuple[str, tuple[Span, ...]] | None:
    """The string the voice reads, and where each word token sits in it (None: a word token
    lacks the pinned reading the voice needs)."""
    parts: list[str] = []
    spans: list[Span] = []
    offset = 0
    if voice.reading != "text":
        # Pinned readings of the words, space-separated (punctuation has no reading).
        for i, token in enumerate(tokens):
            if token.get("kind") not in WORD_KINDS:
                continue
            piece = token.get("readings", {}).get(voice.reading)
            if piece is None:
                return None
            piece = said(piece, voice.reading, voice.provider)
            if parts:
                offset += 1
            spans.append(Span(i, offset, offset + len(piece)))
            parts.append(piece)
            offset += len(piece)
        if not parts:
            return None
        end = _final_mark(tokens) if phoneme_scheme(voice.reading) else ""
        return (" ".join(parts) + end, tuple(spans))
    # The form's text, every token in order: punctuation and spacing included.
    for i, token in enumerate(tokens):
        piece = str(token["surface"]) if written is None else written[i]
        if token.get("kind") in WORD_KINDS:
            if voice.pronounce is not None:
                reading = token.get("readings", {}).get(voice.pronounce)
                if reading is None:
                    return None
                piece = pronounced(piece, reading, voice.pronounce)
            spans.append(Span(i, offset, offset + len(piece)))
        parts.append(piece)
        offset += len(piece)
    return ("".join(parts), tuple(spans)) if spans else None


def _morph_readings(token: dict[str, Any], scheme: str) -> list[tuple[str, str]]:
    """Each morph's share of its word's pinned reading, as the compiler's ruby pairs the reading's
    syllables with the word's characters: 禮拜一 lai5 baai3 jat1 gives 禮拜 lai5 baai3. A word KC
    that only appears inside longer words (禮拜 in 禮拜一, 百 in 一百) then still has a reading to
    be read from. A word without ruby in the scheme (a loanword in Latin letters) is not split."""
    raw: list[Any] = list(token.get("morphs") or [])
    morphs: list[list[str]] = [regex.findall(r"\X", str(m["surface"])) for m in raw]
    segments = cast(
        list[dict[str, str]], cast(dict[str, Any], token.get("ruby") or {}).get(scheme) or []
    )
    surface: list[str] = regex.findall(r"\X", str(token["surface"]))
    if not morphs or [g for m in morphs for g in m] != surface:
        return []
    if [s["base"] for s in segments] != surface:
        return []
    out: list[tuple[str, str]] = []
    at = 0
    for m in morphs:
        out.append(("".join(m), " ".join(s["text"] for s in segments[at : at + len(m)])))
        at += len(m)
    return out


#: A word of a voice's `spoken` text: letters, marks, digits and the format characters inside
#: words (ZWNJ).
_WORD = regex.compile(r"[\p{L}\p{M}\p{N}\p{Cf}]+")


def _spoken(items: list[Item], spoken: dict[str, str]) -> list[Item]:
    """Items read as the voice's `spoken` says (a homograph's reading), their word spans moved
    onto its words, which must be as many as the item's."""
    by_id = {i.item: i for i in items}
    unknown = sorted(set(spoken) - set(by_id))
    if unknown:
        raise ValueError(f"spoken: no item {', '.join(unknown)} for this voice")
    out: list[Item] = []
    for item in items:
        text = spoken.get(item.item)
        if text is None:
            out.append(item)
            continue
        words = list(_WORD.finditer(text))
        if len(words) != len(item.spans):
            raise ValueError(
                f"spoken: {item.item} has {len(item.spans)} words, its spoken text {len(words)}"
            )
        spans = tuple(
            Span(s.token, w.start(), w.end()) for s, w in zip(item.spans, words, strict=True)
        )
        out.append(replace(item, input=text, spans=spans))
    return out


def held_back(index: AudioIndex) -> set[str]:
    """Items whose clips stay out of the learners' bundles (ADR 0060), the whole item (slow too):
    the round trip failed its normal-speed clip and no person has passed that clip since, or a
    listener rejected one of its clips, until it is made again."""
    failed = {
        c.item
        for c in index.clips
        if c.speed == SPEED
        and c.qa is not None
        and c.qa.status == "fail"
        and not signed_off(c.provenance.status)
    }
    return failed | {c.item for c in index.clips if c.rejected is not None}


# ------------------------------------------------------------------------------------ the cast


def _seeded(key: str) -> int:
    return int.from_bytes(hashlib.sha256(key.encode("utf-8")).digest()[:8], "big")


def pick_voice(key: str, said_by: str | None, voices: Sequence[AudioVoice]) -> AudioVoice:
    """The voice of the cast that reads an item (ADR 0078). Where the item's grammar says who
    speaks (`said_by`: a sentence a woman says, a story character's lines), a voice of that
    gender if the cast has one. Otherwise one at random: a gender first, so a man and three women
    still read half the items each, then a voice of that gender, both seeded by `key` (the item,
    or a story and its character), so every run chooses the same."""
    candidates = [v for v in voices if said_by is not None and v.speaker == said_by] or list(voices)
    groups: dict[str, list[AudioVoice]] = {}
    for v in sorted(candidates, key=lambda v: v.id):
        groups.setdefault(v.speaker or "", []).append(v)
    genders = sorted(groups)
    seed = _seeded(key)
    group = groups[genders[seed % len(genders)]]
    return group[(seed // len(genders)) % len(group)]


def checked_voices(index: AudioIndex, voices: Sequence[AudioVoice]) -> dict[str, str]:
    """Items whose clip a person checked (reviewed or published), and the id of the cast voice
    it is in: they keep that voice rather than lose the check when the cast changes (ADR 0078)."""
    by_name = {(v.provider, v.voice): v.id for v in voices}
    out: dict[str, str] = {}
    for c in index.clips:
        if c.synthesis is None or not signed_off(c.provenance.status):
            continue
        found = by_name.get((c.synthesis.provider, c.synthesis.voice))
        if found is not None:
            out[c.item] = found
    return out


def assignment(
    units: list[dict[str, Any]],
    voices: Sequence[AudioVoice],
    checked: Mapping[str, str] | None = None,
) -> dict[str, str]:
    """Every sentence, word KC and story line, and the id of the cast voice that reads it
    (pick_voice). A story character keeps one voice through the story. An item a person checked
    keeps the voice it was checked in (a story character: that of its first checked line), unless
    the item's grammar wants the other gender and the cast has a voice of it."""
    by_id = {v.id: v for v in voices}
    kept = checked or {}

    def choose(key: str, said_by: str | None, items: list[str]) -> str:
        voice = pick_voice(key, said_by, voices)
        before = next((by_id[kept[i]] for i in items if kept.get(i) in by_id), None)
        if before is not None and (
            said_by is None
            or before.speaker in (None, said_by)
            or not any(v.speaker == said_by for v in voices)
        ):
            voice = before
        return voice.id

    out: dict[str, str] = {}
    for unit in units:
        for s in unit["sentences"]:
            said_by = speaker_of(s.get("persons"))
            out[s["id"]] = choose(s["id"], said_by, [s["id"]])
        for kc in unit.get("kcs", []):
            out[kc["id"]] = choose(kc["id"], None, [kc["id"]])
        for story in unit.get("stories", []):
            genders = {c["id"]: c.get("speaker") for c in story.get("characters", [])}
            lines: dict[str | None, list[str]] = {}
            for step, st in enumerate(story["steps"]):
                if st.get("line"):
                    lines.setdefault(st["line"].get("speaker"), []).append(f"{story['id']}#{step}")
            for who, keys in lines.items():
                chosen = choose(f"{story['id']}#{who or ''}", genders.get(who or ""), keys)
                out.update(dict.fromkeys(keys, chosen))
    return out


def speaker_of(persons: Any) -> str | None:
    """A sentence's persons.speaker (m or f), if it has one."""
    return cast("Mapping[str, Any]", persons or {}).get("speaker")


def _shape(surfaces: list[str], tokens: list[dict[str, Any]]) -> tuple[Kind, int]:
    """An item's kind, from its text as written (a word card has no closing punctuation, ADR
    0094: a voice's final stop or IPA does not change it), and its words, its word tokens."""
    kind: Kind = "sentence" if closed("".join(surfaces)) else "word"
    return kind, sum(1 for t in tokens if t.get("kind") in WORD_KINDS)


def plan(
    units: list[dict[str, Any]],
    voice: AudioVoice,
    written: Written | None = None,
    voices: Sequence[AudioVoice] | None = None,
    checked: Mapping[str, str] | None = None,
) -> tuple[list[Item], list[str]]:
    """Sentences and word KCs the voice can read, and the ones it cannot (no pinned reading).
    Given the course's whole cast (`voices`, and the voices people `checked`), only the items
    the assignment gives this voice (ADR 0078); alone, every item.
    `written`: the source's own surfaces where the compiler added vowel marks."""
    owner = assignment(units, voices or [voice], checked)
    orth = voice.orthography
    items: list[Item] = []
    skipped: list[str] = []
    if voice.pronounce is not None:
        _ipa(voice.pronounce)
    scheme = _scheme(voice)
    # A scheme a word card cites otherwise than a sentence says the word (Attic: an acute for
    # a sentence's grave, καί for καὶ): the same word, with the same reading.
    cite = None if scheme is None else plugins(scheme).cite
    readings: dict[str, str] = {}  # surface → pinned reading, learned from sentence tokens
    in_words: dict[str, str] = {}  # the same for morphs, from the syllables of their word
    for unit in units:
        for s in unit["sentences"]:
            form = s["forms"].get(orth)
            if form is None:
                continue
            tokens = form["text"]["tokens"]
            for t in tokens:
                if scheme is not None and scheme in t.get("readings", {}):
                    readings.setdefault(t["surface"], t["readings"][scheme])
                    for surface, reading in _morph_readings(t, scheme):
                        in_words.setdefault(surface, reading)
            if owner[s["id"]] != voice.id:
                continue  # another voice reads it; its readings still serve word KCs
            as_written = (written or {}).get((s["id"], orth))
            # A vowelMarks voice reads the marked surfaces; every other voice, the source's.
            planned = _input_of(tokens, voice, None if voice.vowelMarks else as_written)
            if planned is None:
                skipped.append(s["id"])
                continue
            surfaces = as_written or [str(t["surface"]) for t in tokens]
            text = "".join(
                w for w, t in zip(surfaces, tokens, strict=True) if t.get("kind") in WORD_KINDS
            )
            items.append(Item(s["id"], planned[0], planned[1], text, *_shape(surfaces, tokens)))
    # Story lines pin readings too: a word card may take its reading from one.
    for unit in units:
        for story in unit.get("stories", []):
            for s in story["steps"]:
                line = cast(dict[str, Any], s.get("line") or {})
                form = cast(dict[str, Any] | None, line.get("forms", {}).get(orth))
                for t in cast(list[dict[str, Any]], (form or {}).get("tokens", [])):
                    if scheme is not None and scheme in t.get("readings", {}):
                        readings.setdefault(t["surface"], t["readings"][scheme])
    for unit in units:
        for kc in unit.get("kcs", []):
            forms = kc.get("forms", {}).get(orth)
            if not forms or owner[kc["id"]] != voice.id:
                continue
            word = forms[0]["tokens"] if isinstance(forms[0], dict) else None
            kc_written = (written or {}).get((kc["id"], orth))
            marked = "".join(t["surface"] for t in word) if word else str(forms[0])
            surface = "".join(kc_written) if kc_written is not None else marked
            reading = readings.get(surface, in_words.get(surface))
            if reading is None and cite is not None:
                reading = next((cite(r) for w, r in readings.items() if cite(w) == surface), None)
            if scheme is not None and reading is None:
                skipped.append(kc["id"])
                continue
            if voice.reading != "text":
                piece = None if reading is None else said(reading, voice.reading, voice.provider)
            elif voice.pronounce is not None and reading is not None:
                piece = pronounced(surface, reading, voice.pronounce)
            else:
                piece = marked if voice.vowelMarks else surface
            assert piece is not None
            kind, words = _shape([surface], word or [{"kind": "word"}])
            items.append(Item(kc["id"], piece, (Span(0, 0, len(piece)),), surface, kind, words))
    # Story lines last, each read like a sentence: its id is "<story>#<step>".
    for unit in units:
        for story in unit.get("stories", []):
            for step, s in enumerate(story["steps"]):
                line = cast(dict[str, Any], s.get("line") or {})
                form = cast(dict[str, Any] | None, line.get("forms", {}).get(orth))
                if form is None:
                    continue
                key = f"{story['id']}#{step}"
                if owner.get(key) != voice.id:
                    continue
                tokens = cast(list[dict[str, Any]], form["tokens"])
                as_written = (written or {}).get((key, orth))
                planned = _input_of(tokens, voice, None if voice.vowelMarks else as_written)
                if planned is None:
                    skipped.append(key)
                    continue
                surfaces = as_written or [str(t["surface"]) for t in tokens]
                text = "".join(
                    w for w, t in zip(surfaces, tokens, strict=True) if t.get("kind") in WORD_KINDS
                )
                items.append(Item(key, planned[0], planned[1], text, *_shape(surfaces, tokens)))
    if voice.spoken:
        items = _spoken(items, voice.spoken)
    if voice.finalStop and voice.reading == "text":
        # Text with no final punctuation reads as a sentence (ADR 0063); spans are unaffected:
        # the stop comes after the last word.
        tag = orth.split("/")[0]
        items = [replace(i, input=with_final_stop(i.input, tag)) for i in items]
    elif voice.finalStop and phoneme_scheme(voice.reading):
        # Phonemes: a word card ends with the "." a sentence ends with (ADR 0089).
        items = [
            i if i.input.rstrip().endswith((".", "?")) else replace(i, input=i.input + ".")
            for i in items
        ]
    return items, skipped


def item_settings(tts: Provider, request: Request) -> dict[str, Any]:
    """What shapes one item's clip beyond the provider's settings (Piper: the route through its
    sentences, ADR 0065). Part of that clip's identity alone, so a provider can change how it says
    some items without making every clip stale."""
    extra = getattr(tts, "item_settings", None)
    if not callable(extra):
        return {}
    out = extra(request)
    return cast("dict[str, Any]", out) if isinstance(out, dict) else {}


def identity(
    provider_name: str,
    version: str,
    voice: str,
    input_: str,
    rate: float,
    settings: dict[str, Any] | None = None,
) -> str:
    """A clip's identity. Settings join it only when a provider has any, so the local
    providers' clips keep the identities they had before settings existed."""
    fields: list[Any] = [provider_name, version, voice, input_, rate]
    if settings:
        fields.append(settings)
    key = json.dumps(fields, ensure_ascii=False, sort_keys=True)
    return hashlib.sha256(key.encode("utf-8")).hexdigest()


def encode_mp3(pcm: bytes, sample_rate: int, comment: str) -> bytes:
    """MP3 (mono), byte-for-byte reproducible: ffmpeg's bitexact mode, no encoder tag."""
    decode = ["-f", "s16le", "-ar", str(sample_rate), "-ac", "1", "-i", "-"]
    tags = ["-map_metadata", "-1", "-metadata", f"comment={comment}"]
    exact = ["-fflags", "+bitexact", "-flags:a", "+bitexact"]
    encode = ["-c:a", "libmp3lame", "-b:a", BITRATE, "-ac", "1"]
    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp) / "clip.mp3"
        command = ["ffmpeg", "-v", "error", *decode, *tags, *exact, *encode, str(out)]
        subprocess.run(command, input=pcm, check=True)
        return out.read_bytes()


def timings(item: Item, clip: Clip, duration_ms: int) -> list[dict[str, int]] | None:
    """Token starts from the synthesizer's word onsets; each token ends where the next begins."""
    if clip.words is None:
        return None
    starts: list[tuple[int, int]] = []
    for span in item.spans:
        onsets = [ms for pos, ms in clip.words if span.start <= pos < span.end]
        if not onsets:
            return None
        starts.append((span.token, min(onsets)))
    return [
        {
            "token": token,
            "startMs": start,
            "endMs": starts[k + 1][1] if k + 1 < len(starts) else duration_ms,
        }
        for k, (token, start) in enumerate(starts)
    ]


def _entry(
    job: Job,
    clip: Clip,
    adir: Path,
    check: Callable[[Item, Clip], dict[str, Any]] | None,
) -> dict[str, Any]:
    """Encode and write one clip; its index entry."""
    item, tts, voice = job.item, job.tts, job.voice
    version = tts.version()
    settings = tts.settings() | item_settings(tts, job.request)
    data = encode_mp3(
        clip.pcm, clip.sample_rate, f"Synthetic speech: {tts.name} {version} ({voice.voice})"
    )
    rel = f"clips/{job.identity[:16]}.mp3"
    (adir / rel).write_bytes(data)
    duration = len(clip.pcm) // 2 * 1000 // clip.sample_rate
    entry: dict[str, Any] = {
        "item": item.item,
        "speed": SPEED,
        "file": rel,
        "sha256": hashlib.sha256(data).hexdigest(),
        "durationMs": duration,
        "license": voice.license,
        "provenance": {"author": job.author, "status": "draft"},
        "synthetic": True,
        "synthesis": {
            "provider": tts.name,
            "version": version,
            "voice": voice.voice,
            "input": item.input,
            "rate": job.rate,
            **({"settings": settings} if settings else {}),
            "inputHash": job.identity,
        },
    }
    token_timings = timings(item, clip, duration)
    if token_timings is not None:
        entry["timings"] = token_timings
        entry["timingSource"] = "synthesis"
    qa: dict[str, Any] = {} if clip.trace is None else {"trace": clip.trace}
    if check is not None:
        qa |= check(item, clip)
    if qa:
        entry["qa"] = qa
    if job.take:
        entry["synthesis"]["take"] = job.take
    return entry


def _twin(
    entry: dict[str, Any],
    clip: Clip,
    first: Item,
    item: Item,
    check: Callable[[Item, Clip], dict[str, Any]] | None,
) -> dict[str, Any]:
    """The entry of an item said exactly as one made in this run: the same clip and file, its
    own token timings, and its own check where a listener should hear something else."""
    twin = copy.deepcopy(entry)
    twin["item"] = item.item
    twin.pop("timings", None)
    twin.pop("timingSource", None)
    token_timings = timings(item, clip, twin["durationMs"])
    if token_timings is not None:
        twin["timings"] = token_timings
        twin["timingSource"] = "synthesis"
    if check is not None and item.expected != first.expected:
        twin["qa"] = ({} if clip.trace is None else {"trace": clip.trace}) | check(item, clip)
    return twin


def intact(path: Path, sha256: str) -> bool:
    """Whether a clip's file is there and still the one its entry names. (Before twins shared
    clips, making one item's clip could write over another's file of the same name.)"""
    return path.exists() and hashlib.sha256(path.read_bytes()).hexdigest() == sha256


def take_field(take: int) -> dict[str, Any]:
    """The take as part of a clip's identity: absent for a first take, so clips made before
    takes existed keep their identities."""
    return {"take": take} if take else {}


def take_of(old: Any, item: Item, tts: Provider) -> int:
    """Which take an item's clip is at (ADR 0060). A clip a listener rejected gets the next one,
    if its provider samples with a seed (another take of eSpeak NG would sound the same);
    otherwise the take of the clip there is, for the same input."""
    if old is None or old.synthesis is None or old.synthesis.input != item.input:
        return 0
    take = old.synthesis.take or 0
    return take + 1 if old.rejected is not None and getattr(tts, "seeded", False) else take


def synthesize_course(
    course_dir: Path,
    units: list[dict[str, Any]],
    voices: AudioVoice | Sequence[AudioVoice],
    check: Callable[[Item, Clip], dict[str, Any]] | None = None,
    written: Written | None = None,
    only: str | None = None,
    prune: bool = False,
) -> Report:
    """(Re)synthesizes the course's clips; unchanged inputs keep their files. Each item is read by
    the voice of the cast the assignment gives it (ADR 0078). `only`: run that voice alone; the
    clips of the others stay as they are until they run.

    A stale clip (its voice left the cast or no longer reads the item, its reference or input
    changed) is kept until its new one is made, so learners keep hearing something. `prune`
    makes nothing and lets the stale clips go instead: the course builds clean at once, and those
    items have no audio until the next run makes it."""
    cast_ = [voices] if isinstance(voices, AudioVoice) else list(voices)
    adir = audio_dir(course_dir)
    index = read_index(adir)
    checked = checked_voices(index, cast_)
    owner = assignment(units, cast_, checked)
    running = [v for v in cast_ if only in (None, v.id)]
    clips_dir = adir / "clips"
    clips_dir.mkdir(parents=True, exist_ok=True)
    human = [c for c in index.clips if not c.synthetic]
    previous = {(c.item, c.speed): c for c in index.clips if c.synthetic}
    report = Report()
    for v in cast_:
        report.shares[v.id] = len(plan(units, v, written, cast_, checked)[0])
    #: The clips to make, voice by voice.
    wanted: list[Job] = []
    kept: list[Any] = []
    claimed: set[tuple[str, str]] = set()
    for voice in running:
        tts = provider(voice, reference_of(adir, index, voice.voice))
        version = tts.version()
        settings = tts.settings()
        author = f"generated:{tts.name}@{version}"
        rate = tts.speed(1.0)
        items, skipped = plan(units, voice, written, cast_, checked)
        report.skipped += skipped
        for item in items:
            key = (item.item, SPEED)
            claimed.add(key)
            old = previous.get(key)
            take = take_of(old, item, tts)
            ident = identity(
                tts.name,
                version,
                voice.voice,
                item.input,
                rate,
                settings | item_settings(tts, item.request(voice.voice)) | take_field(take),
            )
            if (
                old is not None
                and old.synthesis is not None
                and old.synthesis.inputHash == ident
                and intact(adir / old.file, old.sha256)
            ):
                kept.append(old)
                continue
            wanted.append(Job(voice, tts, author, item, rate, ident, take))
    # Items said alike (one input, voice and settings: one identity, so one file) share a clip.
    # One already there serves the rest, so making theirs never writes over it.
    there = {c.synthesis.inputHash: c for c in kept if c.synthesis is not None}
    unmade: list[Job] = []
    for job in wanted:
        clip_there = there.get(job.identity)
        if clip_there is None:
            unmade.append(job)
            continue
        # Its token timings were the other item's: alignment gives this one its own.
        kept.append(
            clip_there.model_copy(
                update={"item": job.item.item, "timings": None, "timingSource": None}
            )
        )
    wanted = unmade
    # Items another voice reads, not run this time, keep their clips until it runs.
    resting = {v.id for v in cast_} - {v.id for v in running}
    others = [
        c for key, c in previous.items() if key not in claimed and owner.get(c.item) in resting
    ]
    fresh: list[dict[str, Any]] = []
    # Everything but the clips (the reference voices) is kept as it was.
    references = {
        k: v
        for k, v in index.model_dump(mode="json", by_alias=True, exclude_none=True).items()
        if k != "clips"
    }

    def dump(clips: list[Any]) -> list[dict[str, Any]]:
        return [c.model_dump(mode="json", by_alias=True, exclude_none=True) for c in clips]

    def save(done: int) -> None:
        # Clips not regenerated yet keep their old entries (and files) until they are.
        waiting = [previous[job.key] for job in wanted[done:] if job.key in previous and not prune]
        clips = [*dump([*human, *kept, *others, *waiting]), *fresh]
        write_index(adir, AudioIndex.model_validate({**references, "clips": clips}))

    # In batches of one voice, saving the index after each: a provider failing midway (a rate
    # limit, an outage) keeps every clip already made, and the next run picks up from there.
    done = len(wanted) if prune else 0
    report.dropped = sum(job.key in previous for job in wanted) if prune else 0
    #: Clips made in this run by identity, with their entry and item: twins share them.
    made: dict[str, tuple[dict[str, Any], Clip, Item]] = {}
    while done < len(wanted):
        voice, tts = wanted[done].voice, wanted[done].tts
        batch = [job for job in wanted[done : done + BATCH] if job.voice is voice]
        todo: list[Job] = []
        for job in batch:
            if job.identity not in made and all(t.identity != job.identity for t in todo):
                todo.append(job)
        clips = tts.synthesize([job.request for job in todo])
        said = dict(zip((job.identity for job in todo), clips, strict=True))
        for job in batch:
            if job.identity in made:
                fresh.append(_twin(*made[job.identity], job.item, check))
                continue
            clip = said[job.identity]
            if len(clip.pcm) < 2:
                report.silent.append(f"{job.item.item} ({SPEED})")
                continue
            entry = _entry(job, clip, adir, check)
            made[job.identity] = (entry, clip, job.item)
            fresh.append(entry)
        done += len(batch)
        save(done)
    report.synthesized = len(fresh)
    report.kept = len(kept)
    live = {c.file for c in [*kept, *others, *human]} | {e["file"] for e in fresh}
    for path in sorted(clips_dir.glob("*.mp3")):
        if f"clips/{path.name}" not in live:
            path.unlink()
            report.removed += 1
    save(len(wanted))
    return report


# ------------------------------------------------------------------------------------ alignment

#: Forced alignment: (16 kHz s16le PCM, its rate, each word's phones) → each word's span.
Aligner = Callable[[bytes, int, list[list[str]]], list[Any]]
ALIGN_RATE = 16_000


def decode_clip(path: Path) -> bytes:
    """A clip as 16 kHz mono s16le, as the aligner takes it."""
    command = ["ffmpeg", "-v", "error", "-i", str(path), "-f", "s16le", "-ac", "1"]
    out = subprocess.run([*command, "-ar", str(ALIGN_RATE), "-"], capture_output=True, check=True)
    return out.stdout


def ipa_phones(word: str) -> list[str]:
    """A Piper input word ([[IPA]], ADR 0087) as the aligner's phones: each symbol with the marks
    after it (t̪, aː, a.ː), stress marks dropped, a doubled consonant once (the aligner's
    phones are eSpeak NG's, which write one long consonant)."""
    out: list[str] = []
    for ch in unicodedata.normalize("NFD", word.strip().removeprefix("[[").removesuffix("]]")):
        if ch in "\u02c8\u02cc":
            continue
        if out and (unicodedata.combining(ch) or ch in "\u02d0\u02d1\u02e4\u02b0."):
            out[-1] += ch
        else:
            out.append(ch)
    return [p for k, p in enumerate(out) if k == 0 or p != out[k - 1]]


def align_course(
    course_dir: Path,
    units: list[dict[str, Any]],
    voice: AudioVoice,
    phonemes: str,
    written: Written | None = None,
    aligner: Aligner | None = None,
    voices: Sequence[AudioVoice] | None = None,
) -> int:
    """Word timings by forced alignment for the voice's clips that have none (a model that
    reports no word onsets: OmniVoice, Navoiy), so its sentences get karaoke and tap-a-word.
    Each word's phones come from eSpeak NG (`phonemes`: its voice for the language). Only clips
    of the text the voice reads now are aligned; the index is saved as it goes. Returns how many
    clips got timings."""
    if aligner is None:
        from nabu.audio.phones import align_words

        aligner = align_words
    adir = audio_dir(course_dir)
    index = read_index(adir)
    cast_ = voices or [voice]
    items = {i.item: i for i in plan(units, voice, written, cast_, checked_voices(index, cast_))[0]}
    clips = list(index.clips)
    done = 0
    for k, clip in enumerate(clips):
        item = items.get(clip.item)
        if (
            clip.timings is not None
            or clip.synthesis is None
            or clip.synthesis.voice != voice.voice
            or item is None
            or clip.synthesis.input != item.input
            or not item.spans
        ):
            continue
        ipa = voice.provider == "piper" and PIPER_PHONEMES.fullmatch(item.input) is not None
        words = [
            ipa_phones(item.input[s.start : s.end])
            if ipa
            else [p for w in espeak.phonemes(item.input[s.start : s.end], phonemes) for p in w]
            for s in item.spans
        ]
        found = aligner(decode_clip(adir / clip.file), ALIGN_RATE, words)
        timings = [
            {
                "token": s.token,
                "startMs": min(t.start_ms, clip.durationMs),
                "endMs": min(t.end_ms, clip.durationMs),
            }
            for s, t in zip(item.spans, found, strict=True)
        ]
        clips[k] = clip.model_copy(
            update={
                "timings": [TokenTiming.model_validate(t) for t in timings],
                "timingSource": "alignment",
            }
        )
        done += 1
        if done % BATCH == 0:
            write_index(adir, index.model_copy(update={"clips": clips}))
    write_index(adir, index.model_copy(update={"clips": clips}))
    return done


def check_course(
    course_dir: Path,
    units: list[dict[str, Any]],
    voices: Sequence[AudioVoice],
    check: Callable[[Item, Clip], dict[str, Any]],
    written: Written | None = None,
) -> dict[str, int]:
    """The round trip run again on the course's synthetic clips, which stay as they are: for a
    new recognizer or comparison. Only clips of the text their voice reads now; the index is
    saved as it goes. Clips said alike share a file, heard once. Returns the clips by status."""
    adir = audio_dir(course_dir)
    index = read_index(adir)
    checked = checked_voices(index, voices)
    reads = {
        (v.voice, i.item): i for v in voices for i in plan(units, v, written, voices, checked)[0]
    }
    clips = list(index.clips)
    heard: dict[str, Clip] = {}
    counts: dict[str, int] = {}
    done = 0
    for k, clip in enumerate(clips):
        if not clip.synthetic or clip.speed != "normal" or clip.synthesis is None:
            continue
        item = reads.get((clip.synthesis.voice, clip.item))
        if item is None or clip.synthesis.input != item.input:
            continue
        said = heard.get(clip.file)
        if said is None:
            said = heard[clip.file] = Clip(decode_clip(adir / clip.file), ALIGN_RATE, None, None)
        trace = None if clip.qa is None else clip.qa.trace
        qa = ({} if trace is None else {"trace": trace}) | check(item, said)
        clips[k] = clip.model_copy(update={"qa": AudioQa.model_validate(qa)})
        counts[qa["status"]] = counts.get(qa["status"], 0) + 1
        done += 1
        if done % BATCH == 0:
            write_index(adir, index.model_copy(update={"clips": clips}))
    write_index(adir, index.model_copy(update={"clips": clips}))
    return counts


# ------------------------------------------------------------------------------------ verdicts


@dataclass
class VerdictResult:
    right: int = 0
    wrong: int = 0
    #: Items whose clips were made again after the verdict: it no longer applies.
    skipped: list[str] = field(default_factory=lambda: [])


def apply_verdicts(course_dir: Path, verdicts: AudioVerdicts, reviewer: str) -> VerdictResult:
    """A listener's verdicts (ADR 0060) into the audio index. Right: the clips are reviewed, so
    they ship whatever the round trip said. Wrong: they are rejected, and their item stays out of
    bundles. A verdict names the clips it heard by sha256 and touches only those."""
    if not regex.fullmatch(r"human:[^\s@]+", reviewer):
        raise ValueError(f"reviewer {reviewer!r}: give it as human:<id>")
    adir = audio_dir(course_dir)
    index = read_index(adir)
    clips = list(index.clips)
    result = VerdictResult()
    for v in verdicts.verdicts:
        heard = set(v.clips)
        matched = [k for k, c in enumerate(clips) if c.item == v.item and c.sha256 in heard]
        if not matched:
            result.skipped.append(v.item)
            continue
        day = v.at[:10]  # ISO 8601: the date the listener judged it
        for k in matched:
            clip = clips[k]
            if v.verdict == "right":
                provenance = clip.provenance.model_copy(
                    update={"status": "reviewed", "reviewedBy": reviewer, "reviewedAt": day}
                )
                clips[k] = clip.model_copy(update={"provenance": provenance, "rejected": None})
            else:
                provenance = clip.provenance.model_copy(
                    update={"status": "draft", "reviewedBy": None, "reviewedAt": None}
                )
                rejection = AudioRejection.model_validate(
                    {"by": reviewer, "at": day, **({"note": v.note} if v.note else {})}
                )
                clips[k] = clip.model_copy(update={"provenance": provenance, "rejected": rejection})
        if v.verdict == "right":
            result.right += 1
        else:
            result.wrong += 1
    write_index(adir, index.model_copy(update={"clips": clips}))
    return result


# ------------------------------------------------------------------------------- reference voices


def reference_of(adir: Path, index: AudioIndex, voice: str) -> Reference | None:
    """The index's reference voice by id, checked against its file."""
    ref = next((r for r in index.references or [] if r.id == voice), None)
    if ref is None:
        return None
    path = adir / ref.file
    if not path.exists() or hashlib.sha256(path.read_bytes()).hexdigest() != ref.sha256:
        raise ValueError(f"reference voice {ref.id}: {ref.file} is missing or changed")
    return Reference(path, ref.text, ref.sha256)


def wav_bytes(pcm: bytes, sample_rate: int) -> bytes:
    """16-bit mono PCM as a WAV file, byte-for-byte reproducible."""
    out = io.BytesIO()
    with wave.open(out, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sample_rate)
        w.writeframes(pcm)
    return out.getvalue()


def record_reference(
    course_dir: Path,
    voice: AudioVoice,
    recording: Path,
    text: str,
    license_: str,
    author: str,
    source: str | None,
    design: dict[str, Any] | None = None,
) -> ReferenceVoice:
    """Keeps a real speaker's recording as the voice's reference (voices/<voice>.wav), replacing
    an earlier one (ADR 0076): every clip of an OmniVoice voice then clones that speaker, accent
    and all. `text` is what the recording says, word for word; the recording is loudness-normalized
    and trimmed like an ingested one. Clips cloned from the old reference become stale."""
    from nabu.audio.ingest import prepare

    adir = audio_dir(course_dir)
    index = read_index(adir)
    if design is None:
        pcm, _ = prepare(recording)
        rate = INGEST_RATE
    else:
        # A designed voice (VoxCPM2, ADR 0094) is kept as the model made it, at its own rate.
        pcm, rate = decoded(recording)
    data = wav_bytes(pcm, rate)
    rel = f"voices/{voice.voice}.wav"
    (adir / "voices").mkdir(parents=True, exist_ok=True)
    (adir / rel).write_bytes(data)
    ref = ReferenceVoice.model_validate(
        {
            "id": voice.voice,
            "file": rel,
            "sha256": hashlib.sha256(data).hexdigest(),
            "text": unicodedata.normalize("NFC", text.strip()),
            "durationMs": len(pcm) // 2 * 1000 // rate,
            "license": license_,
            "provenance": {"author": author, "status": "draft"},
            "synthetic": design is not None,
            **({"source": source} if source is not None else {}),
            **({"design": design} if design is not None else {}),
        }
    )
    others = [r for r in index.references or [] if r.id != voice.voice]
    write_index(adir, index.model_copy(update={"references": [*others, ref]}))
    return ref


def decoded(path: Path) -> tuple[bytes, int]:
    """A recording as 16-bit mono PCM at its own sample rate."""
    probe = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-select_streams",
            "a:0",
            "-show_entries",
            "stream=sample_rate",
            "-of",
            "default=nw=1:nk=1",
            str(path),
        ],
        capture_output=True,
        check=True,
        text=True,
    )
    rate = int(probe.stdout.strip())
    out = subprocess.run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-i",
            str(path),
            "-f",
            "s16le",
            "-ac",
            "1",
            "-ar",
            str(rate),
            "-",
        ],
        capture_output=True,
        check=True,
    )
    return out.stdout, rate


#: The sample rate a recorded reference is kept at (ingest.SAMPLE_RATE).
INGEST_RATE = 22_050


#: The reference a cloning provider is made with before it has one: to cast it, or to say how.
NO_REFERENCE = Reference(Path(), "", "0" * 64)


def caster_of(voice: AudioVoice) -> Caster | None:
    """The voice's provider, if its every clip clones a reference voice (`nabu audio cast`). A
    voice its provider cannot be made from (no model, an unknown provider) is a ValueError."""
    tts = provider(voice, NO_REFERENCE)
    return tts if isinstance(tts, Caster) else None


def cast_reference(
    course_dir: Path,
    voice: AudioVoice,
    text: str,
    instruct: str,
    seed: int,
    tts: Caster | None = None,
) -> ReferenceVoice:
    """Makes the voice's reference and keeps it in the audio index (voices/<voice>.wav),
    replacing an earlier one, with a provider that designs one ("design" in its CASTS):
    OmniVoice from speaker attributes, Navoiy reading the text in its prompt recording's voice.
    Clips cloned from the old one become stale."""
    adir = audio_dir(course_dir)
    index = read_index(adir)
    designer = tts or caster_of(voice)
    if designer is None or "design" not in designer.CASTS:
        raise ValueError(f"voice {voice.id}: {voice.provider} does not design a reference voice")
    text = unicodedata.normalize("NFC", text.strip())
    clip = designer.design(text, instruct, seed)
    data = wav_bytes(clip.pcm, clip.sample_rate)
    rel = f"voices/{voice.voice}.wav"
    (adir / "voices").mkdir(parents=True, exist_ok=True)
    (adir / rel).write_bytes(data)
    version = designer.version()
    ref = ReferenceVoice.model_validate(
        {
            "id": voice.voice,
            "file": rel,
            "sha256": hashlib.sha256(data).hexdigest(),
            "text": text,
            "durationMs": len(clip.pcm) // 2 * 1000 // clip.sample_rate,
            "license": voice.license,
            "provenance": {"author": f"generated:{designer.name}@{version}", "status": "draft"},
            "synthetic": True,
            "design": designer.design_record(instruct, seed),
        }
    )
    others = [r for r in index.references or [] if r.id != voice.voice]
    write_index(adir, index.model_copy(update={"references": [*others, ref]}))
    return ref
