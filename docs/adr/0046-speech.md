# 0046. Speech: tones on the device, words and phones on a speech service

- Status: Proposed
- Date: 2026-11-03
- Amended by: [0093](0093-no-tone-scoring-on-device.md) (tier 3 is off)

## Context

Phase 9 (gameplan §10.4, §16) asks for:
- a speech service with tiers 1–3;
- `speak` and `listen-speak` with automatic scoring;
- `tone-identify` and tone production for `yue`;
- privacy controls.

Acceptance: tone accuracy reported per tone on a recorded fixture set of native and deliberately
wrong tones.

## Decision

**Tier 3 (tone) runs on the learner's device** (`@nabu/core/speech`).
- **Pitch.** A YIN pitch tracker runs on the decoded recording; the audio never leaves the device
  for tone feedback.
- **Syllables.** Voiced runs are split or merged to the expected syllable count, and each
  syllable gives a contour (start, middle, end).
- **Classification.** Contours are compared with tone templates in Chao letters. Cantonese in
  Jyutping is the first system (REVIEW: from standard descriptions, to tune on native speech).
- **Expected tones** come from the pinned surface readings, changed tones included (§10.4).
- **Calibration.** The speaker's range is learned from their own recordings: a running mean and
  spread of log-F0, three numbers kept on the device, which the learner can forget.
  - Until about a second of voiced speech has been heard, only the contour's shape (level,
    rising, falling) is judged, since register cannot be known.
  - An utterance of three or more syllables can normalize itself.

**Tiers 1 and 2 run on a speech service** (`nabu speech serve`, reached by the API through
`NABU_SPEECH_URL`), with the models Phase 5 already uses.
- **Tier 1, the words.** faster-whisper (large-v3-turbo) transcribes the recording and is
  never prompted with the sentence. The API grades the transcript against the sentence's own
  accept set, with the same grader as typed answers.
- **Tier 2, the sounds.** The wav2vec2 eSpeak phone recognizer's output is aligned to the
  expected surface phones (pinned Jyutping, or eSpeak NG phonemes of the surface), giving a phone
  error rate and the words with wrong phones.
- **Tiers per orthography.** Tier 1 needs the recognizer to write the orthography's own script.
  Tier 2 needs trustworthy expected phones.
  - So `uz-Cyrl` and `apc-Latn` get neither tier, and `apc-Arab` gets tier 1 only (REVIEW).
- **Budget.** Calls count against a daily budget per learner (hashed id).

**Grading is feedback, not a verdict** (§10.4). `gradeSpeech` combines what was heard:
- **Silence or other words.** Silence is WRONG, as are words the recognizer heard as different.
- **Tones.** Wrong tones on a calibrated majority of syllables are WRONG; fewer are PARTIAL
  ("Close!").
- **Phones never fail an answer.** Above 0.2 they leave a note; above 0.45 they make it PARTIAL.
  Recognizers lean towards dictionary forms and miss accepted variants.
- **Credit per word** (§8.5): the KCs of words said wrong are debited, the others credited.
- **No microphone.** The learner rates themselves, as at tier 0.

**Templates.**
- **`speak` and `listen-speak`.** They take tier 0's place when the app can score a course:
  tones on the device for tonal courses, or tiers 1–2 on the server.
- **The rotation slot.** The lesson builder substitutes them in the speaking slot, so lessons keep
  their length and order (golden files unchanged), and the planner leaves them out otherwise.
- **`tone-identify`.** It needs a one-syllable clip in a tonal reading scheme.
- **No yue clips yet.** The committed yue clips are held back by the Phase 5 round-trip check, so
  the exercise appears once reviewed or recorded clips exist.

**Privacy** (§10.4, §14.4).
- **Recordings.** They live in memory for one scoring and are dropped: never stored on the
  device, the API or the speech service, and never logged.
- **Events.** A speaking answer is logged with method `voice` and no transcript.
- **Choices.** Learners can turn the server off (tones still work) and forget their voice range.
- **No retention.** Nothing is retained, so there is nothing to opt into yet.
- **Tests prove it** (the acceptance's "no audio is stored by default"):
  - The API keeps nothing from a scoring request (neither audio nor transcript) in any table or
    any log (`apps/api/test/speech.test.ts`).
  - The service writes no file and prints only timings (`pipeline/tests/test_speech_service.py`,
    with the real models under `NABU_SPEECH=1`).
  - The app logs a speaking answer without a transcript and keeps only the three calibration
    numbers (`apps/web/tests/e2e/speech.spec.ts`).

**Tone evaluation** (`pnpm --filter @nabu/core tone-eval <set>`).
- **Sets.** WAV clips of single syllables labelled with the tone expected and the tone said,
  per speaker; each speaker is calibrated on their own native clips.
- **Report.** Per tone: native clips heard as said, and deliberately wrong clips flagged.
- **Synthetic set.** `evals/tones/synthetic-espeak` is marked synthetic: native clips 77% heard as
  said, wrong clips 97% flagged. It is CI's regression floor only.

## Consequences

- Half of the Phase 9 acceptance is open: the per-tone report needs recordings of native speakers
  saying each tone, and deliberately wrong ones (`evals/tones/README.md` gives the format). The
  harness and the report are ready. The other half, no audio stored, is tested.
- An instance without a speech service still scores tones for Cantonese and lets everyone else
  rate themselves.
- Not yet:
  - tier 2's goodness-of-pronunciation confidence;
  - phone-level feedback in the UI;
  - on-device tiers 1–2 (ONNX or WebGPU);
  - tones for other systems (Mandarin, Vietnamese, Thai) beyond data.
