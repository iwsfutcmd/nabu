# 0134. Marks an answer must write: a transliteration's vowels

- Status: Proposed
- Date: 2026-11-17
- Amends: [0131](0131-readings-on-new-words.md) (chg's typed readings)

## Context

chg's typed reading cards (transcribe, ADR 0131) are graded by the chg-Latn/schluessel profile. That
profile treated every mark on Schluessel's letters the same way: a missing or misplaced mark was
accepted with a note, unless the answer spelled another word of the course.
- *uzum* for *üzüm* passed.
- The choice card asking the same word offers *uzum* as a wrong option, because the vowel is what the
  card tests.

The sources-of-truth study (docs/sources-of-truth.md) separated what Schluessel's marks do:
- **The vowel marks** (ä ö ü, ā ī ū ē, à) say what the Arabic script leaves out: the reading itself.
- **The consonant marks** (ṣ ḥ ṭ ẓ ż ź s̱ ḫ č š ž ǧ) say which Arabic letter was written. The script
  writes those plainly, and many are not said differently in Turkic, so a slip there is transliteration
  convention, not a misreading.

The project owner decided: a wrong or missing vowel mark is wrong; a consonant mark is noted.

## Decision

**A profile's marks may name `required` marks** (schemas/orthography-profile.schema.json), with a
`requiredNote`.
- A required mark left out, added, changed or moved is never folded away by the marks policy, and never
  a typo. The word is wrong.
- core's comparison (`compareUnits`) checks the required marks letter by letter:
  1. Strip the other marks.
  2. Align the letters by edit distance.
  3. The required marks differ wherever a letter carrying one is left out, added or traded, or two
     aligned letters' required marks differ.
- So *kordü* for *kördi* is wrong (the ö lost, the diaeresis moved), though u and i are neighbouring
  keys. *bazārǧs* for *bazārǧa*, a slip away from the marks, stays a typo.
- Where the required marks are all that differ, the word carries `requiredNote`.
- Where the answer spells another word of the course (the grader's lexicon, with `distinguishes`), it
  is WRONG_WORD with `wordNote`, as before: *bardi* "went" for *bärdi* "gave".

**chg-Latn/schluessel's required marks** are the vowels': the diaeresis, the macron and the grave
(U+0308, U+0304, U+0300). The consonants' marks keep `accept-with-note` (`translit-marks`). The new
note is `translit-vowels`: "Mind the vowels: the Arabic script leaves them out, so ö is not o and ā is
not a."

## Consequences

- **Conformance vectors** pass in both harnesses:
  - a consonant's mark left out is still noted;
  - a vowel's mark left out, a length left out, and a moved diaeresis are wrong;
  - a consonant typo stays a typo;
  - both kinds left out is wrong, with both notes.
  - The existing ʿayn vector types the ā it asks for.
- **Only chg-Latn/schluessel uses `required`.** Other profiles grade as before.
- **chg's typed readings now agree with its choice cards:** the vowel a choice card trades is the
  vowel a typed card requires.
- A vowel *letter* typed for another (i for u, with no marks involved) is still judged by the
  keyboard typo model. Making every vowel slip wrong in a reading is a separate decision.
