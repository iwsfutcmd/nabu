# 0141. Minimal ruby: only what the script leaves unwritten

- Status: Proposed
- Date: 2026-11-17
- Amends: [0131](0131-readings-on-new-words.md) (readings over new words only)

## Context

ADR 0131 lets a reading layer show over every word, or over new words only. Once the learner reads
a word right on a reading card, its ruby goes.

The sources-of-truth study (§5) proposed a step between the two, "minimal ruby": show only what the
script leaves out, not the whole reading. For example:

- Chaghatay: only the vowels (*ü·ü·* over اوزوم).
- Cantonese: only the tone (*·5* over 我).
- Pinyin: only the toned vowel (*·à·*).

A learner who knows the consonants the script writes keeps a hint of what it does not.

What a script leaves unwritten is already in the schemes' data:
- `variants`: the letters it writes alike;
- `tones.marks`: the tone marks.

## Decision

**A third choice of where readings show: Unwritten** (`ReadingWords` "open"), beside All words and
New words.
- Over new words, the whole reading. Over the words read before (as for New words), only the
  scheme's open letters and tone marks.
- Each run of other letters becomes a middle dot (core `openLetters`: üzüm is ü·ü·, ngo5 dei6 is
  ·5 ·6). Spaces between syllables stay.
- A reading with nothing open shows nothing, as under New words.
- The choice is offered only where the layer shown fades (`fade: by-facet`) and its scheme says what
  is unwritten (`hasOpenLetters`):
  - Schluessel (chg), Jyutping (yue, lzh), Pinyin and Baxter (lzh) have it;
  - sitelen Lasina (tok) does not.
- It is kept per device and per orthography, as the other display choices are.
- A tapped word's gloss still shows the whole reading (ADR 0131 amendment).

## Consequences

- **A scaffold** from all readings, through new words with hints, to new words only, then none. The
  learner can step back at any point.
- **The readings control** for a layer that fades has four segments where the scheme says what is
  unwritten (All words, New words, Unwritten, Off). Visual baselines of the display menu change.
- Ruby faded to its open letters is marked `data-open-letters` for tests.
