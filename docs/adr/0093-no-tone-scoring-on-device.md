# 0093. Tones are not scored on the device

- Status: Proposed
- Date: 2026-11-11
- Amends: [0046](0046-speech.md) (tier 3 is off)

## Context

[ADR 0046](0046-speech.md) scores a learner's tones on their device (tier 3): a pitch tracker,
syllables cut from voiced runs, and contours matched against tone templates. A course whose readings
carry tones (yue) then plans scored speaking (`speak`, `listen-speak`) in place of the self-rated
card (`speak.tier-0`), even with no speech server.

The scorer has passed only on synthetic speech. Its CI set is eSpeak NG, whose pitch is exact, and
the acceptance on native recordings (evals/tones) is still open. Two things now show it is not
ready to tell a learner their tones were wrong:

- **The project owner tried it in the app** and found it not accurate enough.
- **Natural voices.** Calibrated on their own clips, as a learner is, it heard 25–46% of the
  six-tone syllables of three neural Cantonese voices as said (November 2026 voice bench), against
  83% of eSpeak's.

A wrong verdict on a learner's tones is worse than none: it teaches them to doubt what was right.

## Decision

**Tier 3 is off** (`DEVICE_TONE_SCORING`, @nabu/core/speech).
- `speechSupportOf` counts speaking as scored only when a speech server scores the orthography
  (tiers 1–2). Without one, a tonal course plans the self-rated card, as Persian does.
- The speaking card never scores tones, even when a server scores words and phones. The server's
  words and phones are the whole score.
- **Kept:**
  - the tone code and its tests;
  - `tone-eval` and the evals/tones sets;
  - tone listening (`tone-identify`), which plays a clip and asks for its tone, and does not
    listen to the learner.

**Turning it back on** is one constant, once the scorer passes the native-speaker acceptance
(evals/tones/README.md) and a native speaker has tried it in the app.

## Consequences

- **yue speaking.** It is self-rated in the app, and in the e2e suite, whose API runs no speech
  server.
  - The "I said it right" claim and the stored pitch range belong to scored cards. They come back
    with tier 3, or with a speech server.
  - The e2e test that drove a scored card through the device's scorer now checks the self-rated
    card instead.
- **Lessons.** Their rotation is unchanged: scored speaking took tier 0's slot (ADR 0046), and now
  tier 0 keeps it.
