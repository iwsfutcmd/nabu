# 0058. A Lebanese voice: Lahgtna on OmniVoice, run locally

- Status: Accepted (2026-11-18)
- Date: 2026-11-05
- Amends: [0040](0040-audio-pipeline.md), [0042](0042-hosted-tts-providers.md), [0053](0053-vocalization.md)
- Amended 2026-11-24 (Proposed): time for pauses (below)

## Context

The apc course had no audio: no local voice spoke Lebanese Arabic, so the course was
human-required (ADR 0040, 0042). Its learners got no listening exercises, and no clip on any
sentence or word.

**Lahgtna** is a fine-tune of OmniVoice for 13 Arabic dialects, Lebanese among them. Its card
says it reads text with vowel marks (تشكيل) more accurately.
- **The model:** `oddadmix/lahgtna-omnivoice-v2`, a 0.6B diffusion model at 24 kHz, about 2.5 GB.
- **Dialects:** a language id each, reusing country codes. `lb` is Lebanese in this checkpoint;
  in upstream OmniVoice the same id is Luxembourgish.
- **Voices:** a voice is designed from speaker attributes ("male, young adult"), or cloned from a
  short reference recording.
- **License:**
  - OmniVoice's code is Apache-2.0.
  - Its pretrained weights are CC-BY-NC, because of their training data (Emilia).
  - Lahgtna, a fine-tune of those weights, states no license of its own.

## Decision

**A local provider, `omnivoice`** (`nabu.audio.providers`), beside espeak-ng and Piper.
- **The model** is pinned to a commit (`model: owner/name@<40-hex>`), downloaded from Hugging
  Face and run on this machine, on a GPU if there is one.
- **It runs** with the PyPI `omnivoice` package, in the `omnivoice` uv group. CI leaves the group
  out, as it does `speech`: committed clips need no model.
- **Determinism:** each clip's sampling is seeded from its identity. Steps (32), guidance (2.0)
  and precision (bfloat16, as the checkpoint was trained) are pinned, and the clip's identity
  holds them, the language and the reference.

**One course voice is one speaker.**
- `nabu audio cast` designs a reference once, from speaker attributes and a seed. It keeps the
  reference as `audio/voices/<id>.wav`, listed in the audio index with its license, provenance
  and how it was made.
- Every clip clones that reference.
- Casting again makes the clips stale, so `generate` makes them again, and the compiler says so
  (`audio.stale`).

**The apc voice** is `beirut`.
- **The speaker is a man** ("male, young adult, moderate pitch"). Every apc sentence tagged with
  a speaker is a man speaking (ADR 0056), and its text is in the masculine.
- **Its reference** is course sentences: مَرْحَبا! أَنا سامي. أَنا مِن لِبْنان، وأَنا بْبيروت. كيفَك؟
- **The language** is `lb`.
- **It reads the vowel-marked Arabic** (`vowelMarks: true`). This amends 0053, under which voices
  read the text as written. The round-trip check still compares Whisper's transcript with the
  text as written.
- `humanRequired` is off for apc. Human recordings still come in through `nabu audio ingest`.

**License: the clips are CC-BY-NC-4.0.** The voice's `license` sets every clip's license. The
weights are non-commercial and the fine-tune grants nothing more. The project maintainer
accepted non-commercial audio for apc (2026-11-05).

## Consequences

- **apc gets audio,** and with it listening exercises and a clip on every sentence and word.
- **Its audio is non-commercial,** unlike the rest of the course (CC-BY-SA-4.0). A deployment
  that needs commercial terms must replace it, with human recordings or a voice under other
  terms.
- **No timings.** OmniVoice reports no word onsets, so apc clips have no karaoke highlighting.
  Forced alignment (`ingest --align`) could add it later.
- **Speed.**
  - On a CPU with AMX (bfloat16) a clip takes 10 to 20 s; without AMX, in float32, about 30 s.
    The course's roughly 1,160 clips (two speeds) take hours. A GPU takes minutes.
  - Generation saves after every 16 clips, and a rerun picks up where it stopped.
- **Review.** The round-trip check (Whisper, CER) puts doubtful clips in the review queue
  (`nabu audio report`). A native speaker should still listen to the clips: Whisper writes
  Lebanese words in their MSA spelling (هيدا as هذا), so a high CER is not always a bad clip.

## Amendment: time for pauses (2026-11-24)

**Context.** A listener rejected lines whose last word was cut off (2026-11-24). OmniVoice decides a
clip's length before it speaks, from a rule over the text (each Arabic letter 1.5, a space 0.2, a
punctuation mark 0.5, scaled by the reference's pace). The rule leaves about a tenth of a second
for a comma or a full stop between sentences. A voice that pauses there for longer runs out of time
before the end. Measured on apc's clips (the last 10 ms within 25 dB of the loudest no more than
140 ms before the end):

| Lines | Woman's voice cut off | Man's voice cut off |
| --- | --- | --- |
| No pause inside | 2% of 299 | 0% of 383 |
| One pause inside | 24% of 76 | 5% of 83 |
| Two or more | 54% of 13 | 14% of 14 |

The cut lines paused about 130 ms at each mark (the man's 360 ms) where the whole ones paused
50 ms. None of the 33 lines the listener had marked right was cut this way.

**Decision.** An OmniVoice voice may set `pauseTime`: seconds added to the model's own estimate for
each run of punctuation before a space inside the text (`inner_pauses`), given to the model as the
clip's length. The setting joins only the identity of the clips whose text has such a pause
(`item_settings`), so other clips stay as they are. apc's woman's voice sets 0.3 s. Of her 24 cut
lines, made again with the same seeds, 23 then ended whole. Scaling the whole estimate by 1.15
instead left 6 still cut. The man's voice does not set it: it would remake 97 lines (13 of them
approved by the listener) to mend about six.

**Consequences.** Her 88 lines with a pause inside are made again and need listening to, the 4 she
had approved among them. The rule's numbers belong to the OmniVoice package (`omnivoice-0.2.1` in
the clips' version), so a new package can need another `pauseTime`.

