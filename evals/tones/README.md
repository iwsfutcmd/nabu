# Tone evaluation

Phase 9's acceptance (gameplan §16): tone accuracy reported per tone on a recorded fixture set of
native and deliberately wrong tones.

```sh
pnpm --filter @nabu/core tone-eval [evals/tones/<set>] [--json report.json]
```

It prints a table:

- **Native clips:** per tone, how many were heard as the tone said.
- **Wrong clips:** per expected tone, how many deliberately wrong clips were flagged (heard as
  anything but the expected tone).

Each speaker is calibrated on their own native clips, as a learner is calibrated on their own
speech.

## A set

`<set>/index.json` and its clips (16-bit mono WAV, any sample rate):

```json
{
  "set": "hk-native-2027",
  "system": "yue-jyutping",
  "synthetic": false,
  "license": "CC-BY-SA-4.0",
  "provenance": {"author": "human:…", "status": "reviewed"},
  "speakers": [
    {"id": "speaker-1", "clips": [
      {"file": "clips/s1-si1.wav", "syllable": "si1", "expected": "1", "said": "1", "kind": "native"},
      {"file": "clips/s1-si5-as-2.wav", "syllable": "si5", "expected": "5", "said": "2", "kind": "wrong"}
    ]}
  ]
}
```

Record each speaker saying the same syllables in all six tones (詩 史 試 時 市 事 for *si*), then
some of them deliberately in the tones learners confuse (2 and 5, 3 and 6, 4 and 6, 1 and 3). One
syllable per clip, with a little silence on each side. Record several speakers, with a range of
voices.

## Sets here

- `synthetic-espeak/`: synthesized with eSpeak NG from Jyutping (`nabu speech tone-fixtures`). It
  is marked **synthetic**: a regression set for CI, and **not** the acceptance.
  - Native clips heard as said: 77%. Tones 4 and 2 are the weakest.
  - Wrong clips flagged: 97%.

No native recordings are in the repository yet, so the Phase 9 acceptance is open.
