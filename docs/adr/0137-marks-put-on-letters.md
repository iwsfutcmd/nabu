# 0137. Vowel marks put on a word's letters

- Status: Proposed
- Date: 2026-11-17
- Amends: [0098](0098-pronunciation-by-choice.md) (vowel marks are chosen)

## Context

ADR 0098 made the vocalize card multiple choice. Typing an abjad's marks was a chore: no phone keyboard has
Hebrew points, few have Arabic harakat, and a learner placing them in a text field fights the cursor in
right-to-left text full of combining marks. The card has offered the word with its marks among three or
four vocalizations since.

The sources-of-truth study (docs/sources-of-truth.md) came back to what a reader of an abjad must supply:
the marks themselves, not a recognition of them among options. chg's readings are chosen and then typed
(ADR 0131). The project owner asked for the same in Biblical Hebrew and Lebanese Arabic, with the marks on
buttons, as chg's transliteration has its letters on a bar. Of two ways to put them, the owner chose
letters given and marks tapped onto them.

## Decision

**A new card, `vocalize-build`** (read-script), where a profile asks for it (`input.markBuilder: true`:
hbo-Hebr/tiberian and apc-Arab/standard).
- It asks the word a vocalize card would ask: the sentence without marks, one word marked, its meaning
  below.
- The word's letters are given, and the profile's marks are on buttons, each on a dotted circle.
- A mark goes on the chosen letter; pressed again, it comes off. Backspace, or Take back, removes the last
  mark put on.
- The word shows as it is built, one run of text, so joined letters stay joined and marks sit on their
  letters.

**The chosen letter stays chosen while the course's words ever give it more marks** where it stands. The
attested marks per letter and position, as the vocalize card's variants use them, are on the exercise
(`combos`). So a dagesh is followed by its vowel on the same letter, and a letter that takes one mark
hands on to the next.
- No list of marks is written into code.
- The combinations shown are every one the course attests for that letter, so they say nothing of the
  answer.

**Graded letter by letter** by core's `gradeVowels` (its 22 conformance vectors, both harnesses):
- the same letters;
- each letter's marks, optional ones (sukun) not counted.

**Asked only once a choice card has shown the word's marks**: the fold's `shown` for its read-script
facet, as chg's typed readings are gated (ADR 0131). It credits only the asked word, as the other
pronunciation cards do (ADR 0095). Its input is text, the marked word, so typed-card ratings apply.

## Consequences

- **hbo and apc** learners meet the card once their vocalize cards are right. fa does not set
  `markBuilder`; it can, by one line in its profile.
- **Visual and e2e coverage.**
  - The Marks story (Player/Pronunciation) shows it for Lebanese Arabic.
  - The visual matrix checks it in each UI locale: letters and the word in the target's direction, the
    first letter pressed, a mark put on, no clipping, axe.
  - The e2e solver answers it letter by letter.
- **No new grading behaviour.** `gradeVowels` predates ADR 0098: the typed vocalize card used it.
