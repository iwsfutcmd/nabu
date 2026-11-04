# 0054. Learners write in the pronunciation their script leaves out

- Status: Proposed
- Date: 2026-11-04

## Context

Some scripts leave a word's pronunciation partly unwritten:
- **Abjads** (Persian, Arabic) usually omit the short vowels: کتاب is *ketāb* only to someone
  who knows the word.
- **Han characters** say nothing reliable about sound: 我哋 is *ngo5 dei6*.

Reading these scripts means knowing what is missing. Learners asked for an exercise where, given a
word's written form and its meaning, they write its pronunciation:
- for abjads, the short vowels;
- for ideographic scripts, the transcription into Latin script.

Alphabets and abugidas write their vowels, so they need no such exercise.

The gameplan's catalog (§8.2) has `vocalize` ("add the harakat to an Arabic word or phrase") but
nothing for Han. Since [ADR 0053](0053-vocalization.md), the fa and apc bundles carry each word's
vocalized form, and the yue KC forms carry their Jyutping (ADR 0050).

## Decision

**Two templates, both on the `read-script` facet** (knowing how the script reads, card key
`kc|read-script|orthography`):

- **`vocalize`.** It shows a word's letters (its KC form with every mark of the profile's mark
  set removed) and its meaning. The field starts from the letters, and the profile's marks are
  keys under it, each shown on a tatweel. The learner writes the marks in.
  - **Where.** A sense KC whose form, as the vocalization marks it, has a mark to supply. Sukun
    alone does not count, and neither does a word with only long vowels (آب).
- **`transcribe`.** It shows a Han word without its ruby, and its meaning. The learner types the
  word's reading in the ruby scheme. The field is tagged as that scheme's text
  (`yue-Latn-HK-jyutping`, left to right).
  - **Where.** A sense KC whose every word has a pinned reading, in a scheme with a known
    syllable shape. Only Jyutping has one so far.

**Grading is all or nothing** (`@nabu/core` `gradeVowels`, `gradeReading`; conformance vectors
in `conformance/pronounce.json`, run by both harnesses):

- **Vowels.** Compared per letter (grapheme), after NFC.
  - **The letters must stay as they are.** A letter added, dropped or changed, or a mark on no
    letter, is `vocalize-letters`.
  - **Each letter's marks must be the vocalization's** (`vocalize-marks`, listing the letters
    that are off).
  - **Optional marks.** The profile's `match.marks.optional` may be written or left out. That set
    is sukun for fa, apc and ar (REVIEW): the fa draft writes none, the apc draft writes every one.
  - **Shadda** counts like a vowel.
- **Readings.** Compared syllable by syllable, after NFC and lower-casing. Spaces, hyphens and
  apostrophes between syllables are ignored, since tone numbers end Jyutping syllables.
  - **Tones are required:** `reading-no-tones` when there are none.
  - **The right sounds with another tone** is `reading-tone`; anything else is
    `reading-syllables`.
  - **No variants** are accepted (*n*/*l*, *ng*-loss) (REVIEW).

**In lessons:** after the reading drills, a lesson adds one `vocalize` or `transcribe` card for a
word it introduces, where the course can make one. The rotation is unchanged. Mistakes mode
rebuilds a missed card from its KC.

**In the player:**
- the vocalize solution always shows its marks, whatever "Show vowel marks" says;
- the transcribe prompt never shows ruby, whatever "Show readings" says, since the ruby is the
  answer.

## Consequences

- **Lessons gain a card.** 55 of 61 fa lessons and 54 of 55 apc-Arab lessons gain a vowel-marks
  card for a new word; 58 of 59 yue lessons gain a Jyutping card. The others introduce no word with
  marks to supply or a pinned reading. No lesson reaches the 14-card cap, and the 30-day
  simulation still holds every course within ±5 pp of 85%.
- Cold-start difficulty 0.8 for both (typed, all or nothing), next to `complete-translation`
  (0.6) and `translate-type` (1.0).
- **The gameplan's `vocalize` facet was `form`.** It is `read-script` here, because the card
  asks how the script reads, not about inflection ([errata 62](../gameplan-errata.md)).
- **Not yet:**
  - Pinyin, Yale or kana readings (each needs a syllable shape and a field tag);
  - a vocalize card for whole phrases;
  - accepting dialect variants of a Jyutping syllable.
