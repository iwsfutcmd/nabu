# 0142. Spelling: the right sound with the wrong letter

- Status: Accepted (2026-11-18)
- Date: 2026-11-17
- Amended: 2026-11-22 (a spelling card may have two options; the note at the end)
- Decided, not yet built (ADRs 0145–0151, accepted 2026-11-20), to amend this:
  [0148](0148-projections-and-misses.md) (`soundAlike` becomes the profile's stated correspondences)

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
2026-11-17). They are Iranian Persian's: Dari tells ق from غ (its ع and ء sound alike, as in
Iran), so a Dari profile would leave out the last set.

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
- **Homophone typings are wrong** (the project owner, 2026-11-17: "be accurate"). 唔洗 for 唔使 is
  common in written Cantonese, but the course teaches the character the word is written with, and a
  spelling choice may offer 洗 there as wrong. A spelling a course does accept (駛 for 使) is in its
  accept sets and variants, and a spelling choice never offers it.
- **Feedback** names the slip ("The right sound, the wrong letter"), and the solution shows the
  right spelling.
- **Plans change** where the cards come: fa and yue lessons may trade a card for a spelling choice.

## Amendment (2026-11-22): a spelling card may have two options

The owner, on the open questions of 2026-11-22. A spelling card was made only of a word with two wrong
spellings, as every choice card has two wrong options at least. A word with exactly one other spelling of
its sound had no card (*casa* or *caza*, *vaca* or *baca*, *hola* or *ola*: 242 of the 416 Spanish lexemes
with a spelling leftover, 58 of Persian's 147), so its spelling was asked only inside a typed sentence, and
ADR 0148's own example, a spelling card after *caza* for *casa*, could not be made.

- **A spelling card offers a word against one other spelling where it has only one:** two options, the
  word and that spelling. A word with more keeps up to three others. The choice between two spellings of a
  sound is the one a writer faces.
- **It is the only choice card with two options.** Gap-fill, reading and vowel-mark cards keep two wrong
  options at least.
- A word whose only other spelling the sentence's accept set takes in the gap still gets no card.
- **The other spellings come from one function** (core `otherSpellings`), which the compiler asks through
  core-cli (`spelling-others`) to write a lexeme's spelling leftover. So a Cantonese word with a character
  the course reads alike has a spelling leftover in its character orthography (never in Jyutping), as its
  card always implied; the table is the characters the course attests, so a leftover can come or go as
  sentences are added.

As built: 433 Spanish lexemes can get a spelling card (178 before), 152 Persian (93), 50 Cantonese (10).
In the simulation every course stays in its band with nothing retuned; Persian's weakest learners fall by two
to three points (84.4% to 81.5%, 84.7% to 82.9%), a card nearly every session now having one. The simulator
knows nothing of a two-way guess being easier, so real logs are what will say.
