# 0098. Vowel marks are chosen; Han readings are chosen and typed

- Status: Proposed
- Date: 2026-11-12
- Amends: [0054](0054-pronunciation-exercises.md), [0095](0095-pronunciation-in-context.md) (how the cards are answered)

## Context

ADR 0095 put the pronunciation cards in their sentences, with the abjad card answered by typing the
word's marks. The owner found that a chore: writing vowel marks is a pain in any abjad (Arabic,
Hebrew, Syriac), and a word has only a few plausible vocalizations, so choosing among them still
teaches what matters. A Han word's reading is harder to work out, so it should be practised both
ways.

## Decision

**`vocalize` is multiple choice.** The sentence is shown without marks, one word marked; the learner
picks that word with its marks among three or four options.
- **Real homographs first:** the course's other spellings of the same letters.
- **Then generated variants** (`vocalizationVariants`): one letter's marks changed, then two
  letters'.
  - Only marks that letter takes **in that place** elsewhere in the course (`attestedMarks`: start,
    middle or end of a word), at least twice and in at least 5% of its occurrences there. So, with no
    list of rules for any one script: no shadda word-initially, no dagesh in alef, no vowel on a long
    vowel's seat.
  - Every option must still carry a vowel, and must grade WRONG against the word, so a difference in
    optional marks (sukun) never counts as a wrong option.
- **Where the profile names an orthography that spells the vowels** (`marks.spelledIn`: Arabizi),
  "Write it in Arabizi instead" still switches to typing. The number keys then type, not choose.
- **Cold-start difficulty** −0.4, like `char-read`; it was 0.8 when typed.

**Han readings both ways.**
- **`transcribe`** stays typed (all or nothing, tones required).
- **`char-read` is the choice card**, now in context: the sentence without ruby, one word marked, and
  its reading among four.
  - Two of the others are the same syllables in another tone the course's readings use
    (`toneVariants`), since tones are what learners miss.
  - The rest are other words' readings with as many syllables.
  - Only the marked word is credited; the sentence is given, as for the other pronunciation cards.

## Consequences

- Lessons still get a pronunciation card where they can: fa 60 of 61, apc 99 of 99, hbo 90 of 90,
  yue 58 of 59. A few sentences make none (fa 282 of 338), since a word needs two plausible wrong
  options.
- Answers to `vocalize` are logged as choices; the goldens changed accordingly. The 30-day simulation
  holds every course within ±5 pp of 85%.
- The "Write it in Arabizi" field and its grading are unchanged from ADR 0095.
- **REVIEW** (native readers):
  - whether the generated vocalizations are plausible enough. They are learned from the course's own
    vocalization, so they are only as good as it.
  - Hebrew's shin and sin dots are in the profile's mark set, so they can be swapped too.
