# 0094. Cantonese voices: VoxCPM2 cloning two designed anchors

- Status: Proposed
- Date: 2026-11-12
- Amends: [0040](0040-audio-pipeline.md) (yue's voice), [0065](0065-persian-voice.md) (a carrier for another
  provider), [0091](0091-voice-quality.md) (yue's rating stays good, now earned)

## Context

yue's voice was eSpeak NG reading the pinned Jyutping. It reads every reading right, but it is
robotic, and Whisper could not hear it: 707 of its 724 clips failed the round trip and were held
back. Learners heard almost no Cantonese.

A survey in November 2026 benched seven open models on Kaggle (T4) against the course's own items:
- sentences chosen for polyphones, changed tones and particles;
- word cards;
- six-tone syllables.

The owner listened to every clip on a private page. Six rounds later:

- **VoxCPM2** (openbmb/VoxCPM2, Apache-2.0) cloning a reference read every sentence right. A lone
  word it often misread, or left silent. Said inside a carrier, words came out right.
- **The references.** Voices cloned from Common Voice speakers were noisy. Instead, VoxCPM2
  designed two news anchors from descriptions, so no real person's voice is copied:
  - **The woman.** Designed from a formal bulletin, which pulled readings toward literary and
    Mandarin-like ones (名 ming4, 銀行 like Mandarin). She was then cloned again reading a
    colloquial paragraph. Clones of that read colloquially.
  - **The man.** The first design sounded like a woman (183 Hz). The one kept is 145 Hz,
    designed from a short prompt, as VoxCPM2's own cookbook advises.
- **Pace.** The clones speak at 5.8 and 6.5 syllables a second; Qwen and OmniVoice, which the
  owner did not find fast, are at 3.8–4.0. Two attempts to slow the model itself failed:
  - cloning a slower take, which did not carry over;
  - asking for slow speech in each sentence, which slowed only the woman and cost readings.

  Slowing the finished sentences with Rubber Band, pitch and formants kept, did both voices
  right.
- **The owner's verdict:** the slowed voices, with words cut from the carrier, "are best for
  everything".

The other candidates:

| Candidate | Why not |
|---|---|
| Qwen3-TTS + a Hong Kong LoRA (Apache-2.0, CC0 data) | one female voice only |
| OmniVoice | non-commercial weights |
| canto-tts-nano | the only one fed Jyutping directly; trained on data its author calls copyrighted |
| CosyVoice2-Yue | trained on a CC BY-NC corpus |

## Decision

**A provider, `voxcpm`, in its own runtime** (pipeline/runtimes/voxcpm, as CosyVoice's for uz in
ADR 0059). VoxCPM 2.x brings gradio, funasr, modelscope and an older `datasets`, which the
pipeline's environment should not carry. The pipeline starts the runtime's worker and speaks to
it in JSON lines. The checkpoint is pinned (`model: openbmb/VoxCPM2@<commit>`).

**Every clip clones a reference, transcript and all** (VoxCPM2's "ultimate cloning"): the
recording is the prompt and its text the prompt text. That mode read right where the others did
not.
- **The references** are the two anchors the owner chose, kept as `voices/<id>.wav` at 48 kHz,
  VoxCPM2's own rate. They are synthetic, Apache-2.0.
- **Their record** says how each was made: the design instruction and seed, and for the woman
  the text and seed she was re-read with.
- **Seeds.** Sampling is seeded per clip (`seed_of`), so a rejected clip's next take sounds
  different (ADR 0060).

**Two routes, chosen by the item's text** (in the clip's own identity, `item_settings`):
- **A word card** (no closing punctuation) is said after a carrier, `跟住我讀：` ("repeat
  after me"), and cut out by forced alignment.
  - The aligner is the pipeline's own (nabu.audio.phones): the carrier and the word as two
    words, their phones from eSpeak NG.
  - The cut runs from 40 ms before the word to 150 ms after it.
  - This extends the carrier of ADR 0065 to another provider. Piper's cut is exact from its
    durations; VoxCPM2's comes from alignment.
- **A sentence** is said as it is, then slowed toward a pace: `pace: {target: 4.3, maxStretch:
  1.6}`, in syllables (Han characters) a second.
  - Rubber Band's R3 engine does it (`--fine --formant`).
  - A sentence at or under the target is left alone; none is stretched past maxStretch.
  - This is not the slow speed of ADR 0062, which the player still makes (0.75×). It brings a
    fast voice to a learner's normal pace.

**Not the pinned reading.** VoxCPM2 reads characters; no input pins a Jyutping reading.
- The carrier and the colloquial references are how the readings come out right.
- The round trip (Whisper) checks every clip, and the audio check (ADR 0060) is where a listener
  passes or rejects one. A rejected clip is made again as its next take.
- This is the exception the Phase 5 rule ("synthesize from pinned readings") now has, for a
  voice that reads characters. Recorded here, not hidden.

**The round trip hears Cantonese as Cantonese.** Whisper large-v3-turbo, the check's recognizer
(ADR 0040), writes Cantonese as written Mandarin (佢係我媽媽 as 她是我妈妈) and some short items
in romanization ("Lei ghiu mè mènga?" for 你叫咩名呀). With it, the first run held back 443 of
the 724 clips, nearly all of them said right.
- **The recognizer.** yue's clips are heard by a Whisper fine-tuned on colloquial Cantonese
  (alvanlii/whisper-small-cantonese, Apache-2.0, revision pinned in nabu.audio.qa). It runs
  through transformers, checks clips and ships nothing.
- **The comparison.** A transcript writes homophones and spellings for one another (搭 and 答,
  呀 and 啊, 喺 and 係), so characters that differ count by their readings (PyCantonese).
  - A character said alike is no error.
  - One a tone apart is half an error, so a lone word heard as a homophone of another tone goes
    to the review queue and ships; a listener decides it in the audio check.
  - Any other is a whole error.
- **`nabu audio check`** runs the round trip again on a course's clips without making them again,
  for a new recognizer or comparison.

**The cast** is two voices: `anchor-f` (speaker f) and `anchor-m` (speaker m). Items are shared
between them at random, and a sentence whose grammar says who speaks goes to that gender (ADR
0078). The clips are Apache-2.0, as the weights are. The rating stays `good`: VoxCPM2 is a
model of Cantonese (ADR 0091).

## Consequences

- **What generation needs:** the runtime (`uv sync` in pipeline/runtimes/voxcpm), the pipeline's
  speech group (the aligner and the round trip), and Rubber Band (`apt install rubberband-cli`).
  - Rubber Band is GPL; it shapes the clips offline and ships nothing.
  - On a T4, a course's 724 clips take well under an hour; generation runs on Kaggle.
- **The check, for tones.** A recognizer that writes characters is weak evidence about tones:
  only a listener can pass a clip's tones (ADR 0060). The check catches wrong and missing
  syllables, Mandarin-like readings and silence.
- **Every yue clip is made again,** and eSpeak NG's are removed.
  - Timings come from `nabu audio align`, once per voice.
  - Clips the round trip fails stay out until a listener passes them in the audio check.
- **Not modelled:** a sentence of more than one clause is paced as a whole. Words longer than a
  word card are said as sentences.
