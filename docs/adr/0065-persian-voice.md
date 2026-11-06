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

**A longer item's collapsing sentences go through the carrier too.** Piper reads an item sentence
by sentence, so a long item can still hold a short sentence the model collapses: «این مریم است.»
came out as half a second of static, the «خداحافظ!» closing a story line was cut off. Before
synthesis, each sentence's sounds are measured with the duration predictor (deterministic): a
sentence whose sounds average under 0.8 of the carrier's floor is said in the carrier on its own,
the others as before, and the item's sentences are joined as usual.
- **Measured:** under 0.8 were all six sentence clips a listener heard as static or cut off and
  10 of the 16 plain items the round trip failed, and none of the clips a listener passed.
- **Only those items change:** the route (`"sentences": ["carrier", "plain", …]`) joins the
  clip's own settings and identity (`item_settings`), so the other clips, those passed by a
  listener among them, keep theirs. 28 of 369 longer items take the route.

**A voice can read an item otherwise** (`spoken: {item: text}`): for a reading its text does
not settle. fa's numbers drill says 9 as نه, which is noh ("nine"); spelled bare, the voice says
na ("no"), and the two items shared one clip. It reads نُه. The text must have as many words as
the item, so word timings still map; the full stop of `finalStop` comes after it.

**Piper is seeded** (`seed_of`, a fresh session per clip), so a rejected clip's next take
samples anew. Sentences of one item are joined with 200 ms of silence.

## Consequences

- **fa's clips are made again:** 664. 369 sentences as plain text; 295 items of one or two words
  (word cards, mostly) in the carrier. Whisper's round trip passes 365 and fails 90, 74 of them
  short items, where it is least reliable (it writes نه, said right, as نا).
- **Word cards say their word,** at about the length a speaker gives it (سلام 0.5 s).
- **The shortest words need nothing more.** A listener compared four ways of saying ten of
  them (نه, اسم, و, از, تو, من, به, آب, سه, یک): the carrier as it is, the word stretched to
  0.4 s, the same with a calmer voice, and the word opening the carrier. The carrier as it is
  won all ten (2026-11-06). A bad take is a matter of the seed: it goes through the audio
  check like any clip, and a listener's rejection makes a new take.
- **Whisper fails good short words** (it hears و and سه as موسیقی), so 91 clips, most of them
  word cards, wait out of the bundles until a listener passes them in the audio check.
- **First pass of the audio check** (2026-11-06, human:ben): 46 clips judged, 37 passed, 8
  rejected. Six of the rejections were collapsed sentences, now routed through the carrier; the
  other two (چقدر, قند, cut off) were made again as their next take.
- **و between numbers is read "va"** (بیست و پنج, ده و نیم; 2 of 318 sentences), as eSpeak's
  phonemizer reads it. Written بیستُ پنج it says bist-o panj, but that has a word fewer, which
  `spoken` does not allow (the word timings would not map).
- **Licence chain:** the model card says MIT; its training data (Mana-TTS, from the magazine of
  Iran's blind community, Nasl-e-Mana) is CC0. Its base checkpoint (SadeghK's amir voice) sits
  in an Apache-2.0 repository whose recordings come from a podcast, with no stated rights.
- **The `onnx` package** joins the speech group (splitting the graph).
