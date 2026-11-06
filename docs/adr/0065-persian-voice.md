# 0065. Persian speaks with Mana-Persian-Piper; short items inside a carrier sentence

- Status: Proposed
- Date: 2026-11-06
- Amends: [0040](0040-audio-pipeline.md)

## Context

**fa spoke with eSpeak NG**, the transitional voice: deterministic and robotic. A search for a
Persian voice found two candidates, tried on 18 course items by a listener:
- **Ava-82M** (Kokoro fine-tune): lost every round.
- **Mana-Persian-Piper** (Piper medium, fine-tuned on the Mana-TTS dataset): picked for
  sentences. As plain text, ended with a full stop (ADR 0063), it won 13 of 14 sentences.

**It garbles a lone word.** Every word card failed, in every variant:
- **Durations collapse.** Said alone, each phoneme of a word gets one frame (11.6 ms): سلام
  lasts 0.21 s, اسم 0.16 s. Slowing it barely helps, and duration noise only makes it erratic
  (0.45 to 2.2 s across seeds). نه runs away instead: 2.6 s.
- **The reading is off too.** With the graph split at its duration node and sentence-like
  durations set by hand, lone words were still unintelligible: on a short input the encoder
  itself is out of its depth.
- **In a sentence both are fine.**

## Decision

**fa's cast is Mana-Persian-Piper**, pinned to its commit on Hugging Face (`model`), through the
Piper provider. Its clips are MIT, the model's licence.

**A voice can have a carrier** (`carrier: {text, maxWords}`, Piper only). An item of at most
`maxWords` words (default 2: word cards, and replies like نه، ممنون) is said at the end of the
carrier sentence, then cut out (nabu/audio/carrier.py):
- **The carrier:** "حالا این کلمه را تکرار کن، …" ("now repeat this word, …"). The item ends the
  sentence, so it keeps a statement's fall. A listener picked this over a shorter carrier
  ("لطفاً بعد از من بگو، …") and over slower, calmer renderings: 12 of 14 words.
- **Durations:** the graph is split at its duration node (`/Ceil`, frames per phoneme id), once
  to read the frames and once to take them as an input. The item's phonemes, and the pads after
  them, get at least the mean frames of the carrier's own phonemes and pads, the carrier said on
  its own. Its last syllable, from its last vowel, gets 1.3 times that. The floors come from the
  carrier alone, so a clip depends only on its own input and the voice's settings.
- **The cut:** every frame's length is known, so the item is cut exactly, from a frame before its
  first phoneme through the pad after its last. The closing full stop stays out: the model fills
  it with an in-breath, which a listener heard after every word. 10 ms and 40 ms fades.
- **Checked:** the carrier said alone must be how the item's utterance begins (a prefix of its
  phoneme ids), or the clip fails rather than being cut in the wrong place.

**Piper is seeded** (`seed_of`, a fresh session per clip), so a rejected clip's next take
samples anew. Sentences of one item are joined with 200 ms of silence.

## Consequences

- **fa's clips are made again:** 664, sentences as plain text, 35 short items in the carrier.
- **Word cards say their word,** at about the length a speaker gives it (سلام 0.5 s).
- **Two words still fail:** نه and اسم, short and ending the carrier. They go through the audio
  check like any clip; a listener's rejection makes a new take.
- **و between numbers is read "va"** (بیست و پنج, ده و نیم; 2 of 318 sentences), as eSpeak's
  phonemizer reads it. A way to pin a pronunciation for Piper is still to come.
- **Licence chain:** the model card says MIT; its training data (Mana-TTS, from the magazine of
  Iran's blind community, Nasl-e-Mana) is CC0. Its base checkpoint (SadeghK's amir voice) sits
  in an Apache-2.0 repository whose recordings come from a podcast, with no stated rights.
- **The `onnx` package** joins the speech group (splitting the graph).
