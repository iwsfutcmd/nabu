# 0063. Voices read a lone word as a sentence

- Status: Proposed
- Date: 2026-11-05
- Amends: [0040](0040-audio-pipeline.md)

## Context

**Word cards give a voice one bare word:** *salom*, 學生, سلام. Neural voices are trained on
sentences. Given a fragment with no final punctuation, they are more likely to:
- rush or clip it;
- say it with a rising, unfinished intonation;
- run on past it (GPT-SoVITS did, in the yue trial).

A listener heard this in other voices: ending the text with a full stop helps, above all for
single words.

## Decision

**A voice can ask for a final stop:** `finalStop: true` on a course voice.
- **When:** text it reads with no final punctuation gets its script's full stop before
  synthesis.
- **Where:** in `nabu audio`'s planning (pipeline/src/nabu/audio/punctuation.py). The stop is
  part of the clip's synthesis input, so the audio check shows it as what the voice was given.
- **Which stop:** by the orthography's script subtag (ISO 15924):
  - "." for Latin, Cyrillic, Greek, Arabic, Hebrew, Georgian and Hangul;
  - "。" for Han and kana;
  - "।" for Devanagari, Bengali, Gurmukhi and Odia;
  - each script's own mark for Armenian, Ethiopic, Myanmar, Khmer and Tibetan.
  - **By language** where one script has several: Urdu takes "۔".
- **Left alone:**
  - text that ends with punctuation, closing quotes included;
  - text ending in a digit: "12." is an ordinal in Uzbek, Turkish and German;
  - scripts that end sentences with no mark (Thai, Lao), and orthographies without a script
    subtag.

**It is a setting per voice, not a default.** A clip's input is part of its identity, and the
compiler holds a stale clip back. Turning it on everywhere at once would take the word clips of
every course out of its bundle until each voice made them again. Each voice turns it on when its
clips are made again: new voices from the start.

## Consequences

- **Word cards say their word as a statement:** settled intonation, and less run-on.
- **Turning it on regenerates every clip it touches,** mostly the word cards.
- **Sentences are unchanged:** the courses punctuate them.
