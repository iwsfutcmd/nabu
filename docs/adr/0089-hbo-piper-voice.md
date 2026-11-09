# 0089. Biblical Hebrew's voice: Piper's Arabic voice, given an Arabic-bent Tiberian reading

- Status: Proposed
- Date: 2026-11-09
- Amends: [0082](0082-biblical-hebrew.md) (the voices), [0084](0084-hbo-references.md) (the sounds the voice says)

## Context

hbo was voiced by eSpeak NG's Arabic phoneme table (ADR 0082). That table has the gutturals, the
emphatics and the spirants, but it sounds robotic and lacks [ɛ ɔ ʀ ʁ]: segol was said [e], qamets
a backed [ɑ], resh a trill.

Ben asked for a better voice without the work of recording or training one. Options considered:
- **Piper's Arabic voice `ar_JO-kareem-medium`.** Piper takes IPA phonemes as input (ADR 0087).
  This voice was fine-tuned from Piper's English lessac voice on Arabic read in eSpeak NG's
  Arabic IPA, so it learned [ħ ʕ q], the emphatics and [χ ɣ θ ð] from Arabic, and [ɛ ɔ e o v p]
  from English. A test with Genesis 1:1–3 came out as ordinary speech (its spectrogram), with
  every vowel quality given.
- **MBROLA's Arabic diphone voices (ar1, ar2).** Rejected: they lack diphones for [e o v p] and
  uvular r, and more than half of the verse came out as silence.
- **Lahgtna on OmniVoice (apc's voice).** Rejected: it reads Arabic script, not IPA, so the
  vowels would collapse to a, i, u and the stress would follow Arabic.
- **Hosted voices with IPA input (Polly, Azure).** Rejected: a new provider and key, and their
  Arabic voices accept only Arabic phonemes, so qamets and pataḥ would merge.
- **A Yemenite Hebrew model.** None exists. Its vowels would be Babylonian in any case.
- **Training or recording a voice.** Too much work for now (Ben).

## Decision

**hbo is voiced by Piper's `ar_JO-kareem-medium`, given each word's pinned reading as IPA**
(`nabu.audio.tiberian.piper`, `PIPER_PHONEME_SCHEMES` in `nabu.audio.course`). It never reads
Hebrew text.

**The reading is Arabic-bent, as Ben asked.**
- **The vowels, the shewas and the stress** stay Khan's (ADR 0084), as far as the voice can say
  them: seven qualities, the shewa rules, the furtive pataḥ.
- **The consonants are Arabic:**
  - vav is [w], not Khan's [v];
  - resh is an alveolar [r] everywhere;
  - ṭ and ṣ are the Arabic emphatics, and qof is [q];
  - the six begadkefat spirants stay: ḇ [v], ḡ as ghayn [ɣ], ḏ [ð], ḵ [χ], p̄ [f], ṯ [θ];
  - stops are unaspirated, and a doubled yod is [jj], not Khan's [ɟɟ].
- **It is written in the voice's training transcripts**, eSpeak NG's Arabic IPA:
  - ṭ ṣ are t̪ s̪, with a "." after the vowel they colour (t̪ˈo.ːv);
  - the stress mark goes before the vowel;
  - a doubled letter is written twice;
  - a long vowel in a closed syllable has no echo.
- **`tiberian.ipa` and `tiberian.espeak` are unchanged.** Khan's IPA stays the reference, and an
  eSpeak voice can still be cast.

**A word card ends with a full stop**, as a sentence does. `finalStop`, which already did this
for text (ADR 0063), now also ends a phoneme input with ".". Without it, the voice says a lone
word quicker and without its falling end. grc's voice does not set it, so its clips are
unchanged.

**One voice reads everything.**
- kareem is a man's voice, and the only Arabic Piper voice. A line a woman says is read by him
  (ADR 0078 allows a one-voice cast).

**Word timings come from forced alignment** (`nabu audio align`). The aligner's phones are
eSpeak NG's IPA, so it reads a Piper word's IPA directly (`ipa_phones`), not through eSpeak.

**The licence is MIT**, the license of rhasspy/piper-voices, which publishes the model.
- Its training data's repository is gone, and the model card says only "License: See URL".
- Its base voice, lessac, was trained on the Blizzard Challenge 2013 Lessac data, which has its
  own license.
- fa's Piper voice was accepted with a gap of the same kind (ADR 0065). A deployment that needs a
  clean chain replaces this voice.

## Consequences

- **The clips change.** Every hbo clip is made again with the new voice. They are synthetic and
  draft, and they are the course's only audio.
- **What the voice cannot say.**
  - It never learned [ʀ], [ʁ], [ɟ] or aspiration. The Arabic-bent reading avoids them.
  - Its [e] and [o] are learned only as the first part of English diphthongs.
  - A coloured [ɔ ɛ e o] after ṭ or ṣ is a combination it never heard.
  - The vowels may come out muddled. Ben accepted that.
- **Listening stays off** (ADR 0082: hbo's facets leave out listen). Clips still play once a card
  is answered.
- **Better options, in order of cost:**
  - a Piper voice fine-tuned from an English base on a licensed Arabic corpus (ClArTTS, CC BY 4.0,
    12 hours, a single male speaker), for a clean licence chain;
  - recorded readings of the Tiberian reconstruction (`nabu audio ingest`).
