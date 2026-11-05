# 0060. Audio check: a person listens to every clip

- Status: Proposed
- Date: 2026-11-05
- Amends: [0040](0040-audio-pipeline.md)

## Context

**The round trip is a weak judge.** Every synthesized clip is checked by transcribing it with
Whisper and comparing the result with the text (ADR 0040). A clip that fails stays out of
bundles until a person reviews it. Whisper misjudges these languages:
- It writes Lebanese words in their MSA spelling, and Uzbek in Turkish or Azerbaijani spelling.
- It "hears" شكرا in a clip of ميرسي.
- It makes up text for one-word clips.

**So good clips are held back, and a bad one can pass.** Before this, the only way to review was
`nabu audio report`, a text listing. Nobody could hear the clips beside their text, and no
review could get back into the index.

## Decision

**An audio check page in the web app:** `#/<course>/<orthography>/audio`.
- **Where to find it:** a link on the course page in debug mode, and a link per course on the
  Pages landing page.
- **What it lists:** every item with a clip, unit by unit (words, sentences, story lines),
  including the clips held back from learners. For each item:
  - its text in the voice's orthography, with karaoke while it plays;
  - its translation or gloss;
  - the text the voice was given, when that differs (vowel marks added, for instance);
  - the round trip's result, error rate and what Whisper heard;
  - whether learners get the clip.
- **What it does:**
  - **Filters:** by kind, by round-trip result (or held back) and by the listener's own verdict;
    sorted in course order or worst first.
  - **Keys:** go by position (`event.code`), so they work on any keyboard layout, and never act
    while the listener types.
- **The listener's verdict:** "Sounds right" or "Sounds wrong", with a note.
  - Verdicts stay on the device (local storage) and download as a file
    (schemas/audio-verdicts.schema.json).
  - A verdict names the clips it heard by sha256.

**The clips come from the course source, not from bundles.** Bundles leave held-back clips out.
- **During development:** the dev and preview servers serve `audio-check/<course>/` from
  `courses/<id>/audio` (a Vite plugin, apps/web/audio-check.ts): the index as JSON, the voices
  from course.yaml, and the clips.
- **On Pages:** the workflow writes the same files beside the demo (`node
  apps/web/audio-check.ts`). It copies only the clips the demo's bundles lack; the index points at
  the bundled ones.
- **Learners never download them.**

**`nabu audio verdicts <course> <file> --reviewer human:<id>`** applies a verdicts file to the
index.
- **Right:** the clips' provenance becomes `reviewed`, with `reviewedBy` and `reviewedAt`. A
  reviewed clip ships even if the round trip failed it; that rule is unchanged.
- **Wrong:** the clips get `rejected` (who, when, the note). The compiler holds a rejected item
  back as it holds a failed one, and `nabu audio report` lists it.
- **Changes of mind:** a later "right" lifts the rejection.
- **Stale verdicts:** a verdict on clips made again since then is skipped.

## Consequences

- **A person's ear decides what ships,** and Whisper only sorts the queue.
- **The demo site is larger:** about 30 MB of held-back clips for the four courses.
  - Pages times out publishing much over 6,000 files, and every clip counts. So the site carries
    each clip once: the audio check points at the bundles' copies, and Pages builds Storybook to
    read the demo's bundles (`NABU_STORYBOOK_BUNDLES`) instead of its own.
- **A rejected clip is made again on the next `generate`, as its next take** (`synthesis.take`).
  - The take joins the clip's identity and the seed it samples with, so a seeded voice (OmniVoice,
    Navoiy, ElevenLabs) says it otherwise.
  - The new take goes back through the round trip and the audio check.
  - A deterministic voice (eSpeak NG, Piper) would say it the same way. Its rejected clips stay
    held back until the text or the voice changes, or a person records it (`nabu audio ingest`).
