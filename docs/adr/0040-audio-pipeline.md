# 0040. The audio pipeline: pinned-reading synthesis, committed clips, QA gating

- Status: Proposed
- Date: 2026-11-03

## Context

Phase 5 (gameplan §10, §16) needs:
- TTS from pinned readings, with slow variants;
- forced alignment;
- a round-trip QA check;
- ingestion of human recordings with license tracking.

Every audio file needs an SPDX identifier and provenance. Builds must stay deterministic, and CI has
no speech models.

## Decision

**Providers behind one interface** (`nabu.audio.providers`). Both are local.
- **espeak-ng**, rule-based, through its C library (ctypes).
  - It reads the pinned reading. Cantonese uses its `yue-Latn-jyutping` voice, so 行 is said as the
    token's Jyutping pins it (銀行 *ngan4 hong4*, 行路 *haang4 lou6*), never as its dictionary
    guesses.
  - It reports word onsets, so its clips carry exact token timings.
  - eSpeak keeps state between utterances, so each clip is synthesized in a fresh process. Clips
    are then byte-for-byte reproducible.
- **Piper**, neural (ONNX), for voices that exist and whose licenses allow use.
  - The course declares each voice's output license (`AudioVoice.license`).
  - All four Persian Piper voices descend from the English "lessac" voice, whose Blizzard license
    restricts use, so no fixture course uses Piper.
- **Rejected:** MMS-TTS, which is CC BY-NC.
- **Cantonese:** the only strong local voice found (Qwen3-TTS with a CC0-trained Hong Kong LoRA,
  Apache-2.0) awaits a decision on running its toolchain.

**Committed clips.**
- `nabu audio generate <course>` compiles the course and builds each voice's input from the
  compiled tokens: the pinned reading, or the form's text.
- It writes MP3s (mono, 48 kb/s, ffmpeg bitexact) to `courses/<id>/audio/clips/`.
- It lists each clip in `audio/index.yaml` (schemas/audio-index) with:
  - license and provenance (`generated:espeak-ng@1.51`);
  - the exact synthesis input and its hash;
  - token timings;
  - QA.
- Unchanged inputs keep their files, so a changed reading re-synthesizes only its clips.
- The index is checked in. The compiler only reads it, so CI never synthesizes.
- Audio belongs to the language: Uzbek is read from its Latin forms and shared by Cyrillic.

**Compiler stage 9 for audio** (`nabu.compiler.audio`), with seven lints, each with a fixture:
- `audio.schema` and `audio.missing-file` (the sha256 must match);
- `audio.human-required`: synthetic audio in a course that must be recorded (apc);
- `audio.unknown-item`;
- `audio.stale`: the voice would now read something else;
- `audio.timings`: timings must point at the sentence's word tokens;
- `audio.held-back`.

Clips are copied content-addressed into the bundle (role `audio`), with `audio/index.*.json` (role
`audio-index`).

**QA.**
- Every synthesized clip records eSpeak's phoneme trace of what it said.
- `--check` adds a round trip through Whisper large-v3-turbo, with no prompt, comparing the
  character error rate over grapheme clusters: pass ≤ 0.15, review ≤ 0.5, fail above.
- **Failed clips stay out of the bundle** until a person marks them reviewed.
- `nabu audio report` lists the review queue.

**Human recordings** (`nabu audio ingest`).
- Any format is normalized to −16 LUFS and trimmed of silence.
- A slow variant is made by time-stretching, which keeps pitch.
- The SPDX license, speaker and source are recorded. Regeneration never touches recordings.
- Token timings come from forced alignment (`--align`).

**Forced alignment** (`nabu.audio.phones`, `speech` group).
- One multilingual phoneme CTC model, wav2vec2-xlsr-53-espeak-cv-ft, whose outputs are eSpeak IPA.
- Expected phones come from eSpeak, or from our Jyutping → IPA table for Cantonese.
- Alignment is a numpy CTC Viterbi pass.
- CTC fires late in a phone, so word starts are refined from the audio's energy:
  - after a pause, a word starts when sound resumes;
  - across a closure, when the silence starts;
  - otherwise, half way through the gap.
- Against eSpeak's own onsets: mean error 29 ms, about 93% within 80 ms. The outliers are vowel
  onsets after sonorants.

**Responsible use.**
- Synthetic clips are labelled "Synthetic voice" in the player.
- Their MP3s carry a "Synthetic speech" comment, as AI Act Article 50 expects.

## Consequences

- The fixture QA results:
  - Cantonese: 57 of 58 clips fail, so Cantonese ships almost no listening.
  - Persian: 41 of 57 clips ship (pass or review).
  - Uzbek: see the report.
- So license-clean audio quality is the limiting factor. A better voice is a config change plus
  `nabu audio generate`; the gate does the rest.
- `speech` is an optional dependency group (CPU PyTorch, transformers, faster-whisper, Piper):
  heavy, and only `nabu audio` needs it.
