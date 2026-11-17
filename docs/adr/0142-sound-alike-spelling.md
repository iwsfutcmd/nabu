# 0142. Spelling: the right sound with the wrong letter

- Status: Proposed
- Date: 2026-11-17

## Context

The sources-of-truth study (docs/sources-of-truth.md, §6.3 and §7) found the writing side's gap. A
script may write one sound with several letters:
- Persian writes /s/ as س ص ث and /z/ as ز ذ ض ظ;
- Cantonese writes *saam1* as 三 "three", 衫 "shirt" or 杉 "fir".

A learner who knows the word's sound still has to know its letter.

Until now a slip like this was graded like any other letter. It was a typo where the keyboard model
called it one, WRONG_WORD where it spelled another word of the course, else wrong, with no note on
what went wrong. No card asked for the spelling. The project owner chose the writing side next
(decision 6b): spelling choice from sound-alike letters, and "right sound, wrong letter".

## Decision

**A profile names the letters its script writes for one sound** (`match.soundAlike: {sets, note}`).
Persian's are `[س ص ث] [ز ذ ض ظ] [ت ط] [ه ح] [ء ع] [ق غ]` (reviewed by the project owner,
2026-11-17). They are Iranian Persian's: Dari tells ع from ء and ق from غ, so a Dari profile would
keep only the first four sets.

**Grading: right sound, wrong letter** (core `grade`). Take a word of the answer that differs from
the expected word only by such letters, each traded within its set. The comparison is of the
profile's letters, with case folded and marks stripped.
- It is never a typo.
- It is WRONG, with the profile's note (`sound-alike`: "The right sound, the wrong letter").
- It is WRONG_WORD where it spells another word of the course (سد "dam" for صد "hundred").

Conformance vectors (grade.json) pin the rule in both harnesses.

**A new card, `spelling-choice`** (write-script): which spelling of a word fits a sentence's gap.
- It shows the gap-fill card's layout: the sentence with the word left out, and what it means.
- Where the course's first reading layer writes the word (Cantonese), it also gives the word's
  reading, as the sound.
- The options are the word and the word with one letter traded for a sound-alike one:
  - a letter of the profile's sets, its marks kept (سَلام: صَلام, ثَلام);
  - or, where the profile knows homophone characters (`match.homophones`), a character the course
    reads alike in its first layer (老師 *lou5 si1*: 老思, 老司).
- No option shows a reading. It credits the word (askedKcs), and is planned once the word is
  recognized, at most one a session.

## Consequences

- **fa and yue** get spelling choices. Other courses get none until their profiles name sound-alike
  sets (chg could take Persian's; its profile is its own course's to decide).
- **REVIEW.** A character read alike may be an accepted colloquial spelling: 唔洗 for 唔使 is
  common in written Cantonese. Such a pair belongs in the profile's variants table, accepted with a
  note, before a spelling choice offers it as wrong.
- **Feedback** names the slip ("The right sound, the wrong letter"), and the solution shows the
  right spelling.
- **Plans change** where the cards come: fa and yue lessons may trade a card for a spelling choice.
