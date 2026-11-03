# 0042. Hosted TTS providers: ElevenLabs and Cartesia

- Status: Proposed
- Date: 2026-11-03
- Amends: [0040](0040-audio-pipeline.md)

## Context

The local voices of ADR 0040 are not good enough to teach listening:
- the round trip fails 57 of 58 Cantonese clips and 39 of 44 Uzbek ones;
- Persian ships 41 of 57.

No local Lebanese Arabic voice exists, so apc is human-required.

Two hosted providers cover these languages:
- **ElevenLabs Eleven v4** lists Persian, Uzbek and Cantonese. It reads IPA written inline
  between slashes, and returns per-character timestamps.
- **Cartesia Sonic** handles Lebanese Arabic well given a good seed voice (the project
  maintainer's experience). It returns word timestamps.

## Decision

**Two more providers behind the same interface** (`nabu.audio.providers`): `elevenlabs` and
`cartesia`.
- A course voice names:
  - its `provider` and `voice` (an ElevenLabs voice_id, or a Cartesia voice id);
  - its `model`, pinned to a dated snapshot where the provider has one (Cartesia
    `sonic-3.6-2026-08-27`; ElevenLabs has no snapshots, so `eleven_v4`);
  - its `language` (ElevenLabs `language_code`, Cartesia `language`);
  - the `license` of the audio it produces.
- The provider's model is the clip's recorded version (`generated:elevenlabs@eleven_v4`).

**Keys come from the environment only.**
- The variables are `ELEVENLABS_API_KEY` and `CARTESIA_API_KEY`. They are read when
  synthesizing, never written anywhere, and never part of an error message.
- In a cloud session the key goes in the environment's settings, not in a course file or a chat.

**Pinned readings for voices that read text** (`pronounce`). This amends 0040's rule that
voices read pinned readings, never raw characters.
- A hosted voice reads the orthography's text, because it speaks text far better than
  romanization.
- With `pronounce: jyutping`, a token's spelling is kept only where it **settles** the pinned
  reading: every character has exactly one reading in the character table (Unihan kCantonese,
  `profiles/tables/jyutping-ime.json`), and it is the pinned one.
- Every other token is sent as its pinned reading in IPA, between slashes:
  - polyphones: 銀行 *ngan4 hong4* becomes /ŋɐn˨˩.hɔːŋ˨˩/;
  - colloquial readings: 學生 *hok6 saang1*;
  - particle tones: 呀 *aa3*.
- IPA tones are Chao tone letters; syllables are joined by ".".
- In the Cantonese fixture, 22 of 84 word tokens go to IPA.
- Whether Eleven v4 honours Cantonese tones in IPA is unverified until a key exists. The round
  trip cannot tell 行 *hong4* from *haang4* (Whisper writes 行 either way), so the first
  generated clips need a native listener.

**Text voices read punctuation**, for every provider.
- The input is the form's whole text, every token in order, so questions and exclamations keep
  their intonation (`نه، ممنون.`, `你好！`).
- Token spans point into it as before.
- Persian and Uzbek eSpeak clips were regenerated for this.

**Identity and reproducibility.**
- A clip's identity also covers the provider's settings when it has any: the language, plus the
  ElevenLabs voice settings, which are pinned to the documented defaults so that a change of
  defaults cannot silently change new clips.
- The rate is the rate the provider actually uses. ElevenLabs' slowest is 0.7, so its slow
  clips are 0.7, not 0.67.
- ElevenLabs gets a seed derived from the input, so its output is repeatable as far as it can
  be. Cartesia takes no seed.
- Hosted audio is not bit-reproducible, so unchanged inputs are never re-requested. Clips stay
  committed, and builds stay deterministic.

**Timestamps.**
- ElevenLabs character onsets and Cartesia word onsets are mapped to code-point offsets in the
  input.
- A piece the provider normalized (a digit read out) has no onset. If a token is left without
  one, that clip has no timings and no karaoke, rather than wrong timings.

**Failures.**
- Rate limits, server errors and network failures are retried four times (2, 4, 8, 16 s).
- The index is saved every 16 clips, so a failure midway keeps every clip already made, and the
  next run resumes.

**The compiler checks each clip against the voice that made it.**
- The match is by (provider, voice) in the cast.
- A clip whose voice has left the cast is `audio.stale`, so switching a course to a hosted
  voice drops the old clips until the new ones are generated.

**Licensing.**
- The course declares the license of each voice's output. The provider's terms for the plan in
  use must allow it: commercial use, and attribution where required.
- A seed or cloned voice needs its speaker's consent.
- The QA gate, the "Synthetic voice" label and the MP3 comment apply as for any synthetic clip.

**Lebanese Arabic.**
- apc stays human-required until its Cartesia seed voice is chosen. Then the course drops
  `humanRequired` and gains a `cartesia` voice (`language: ar`).
- That reverses 0040's decision for apc, which is why it is recorded here.
- Whisper transcribes Levantine into Standard Arabic spellings, so most apc clips will land in
  the review queue. Native review is the real gate there.

**Not adopted:**
- ElevenLabs pronunciation dictionaries: inline IPA is per token and lives in the input, which is
  already the clip's identity.
- Cartesia phoneme timestamps: word onsets are enough for token timings.

## Consequences

- Better voices are a `course.yaml` change plus `nabu audio generate --check` with a key in the
  environment.
- Each changed input costs a request: regeneration is incremental, and the review queue grows
  only with new clips.
- CI never calls a provider. Request building and response parsing are tested against responses
  shaped like the documented APIs (`tests/test_providers.py`). Live tests run with
  `NABU_HOSTED=1` and a key, plus `NABU_ELEVENLABS_VOICE` or `NABU_CARTESIA_VOICE`.
- Course text is sent to the provider. It is published course content, not learner data.
  Learner data never goes to a TTS provider.
