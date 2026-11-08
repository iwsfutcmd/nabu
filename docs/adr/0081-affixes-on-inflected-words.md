# 0081. Affixes that carry meaning, on the words a course inflects

- Status: Proposed
- Date: 2026-11-08
- Amends: [0066](0066-meaningful-endings.md)

## Context

[ADR 0066](0066-meaningful-endings.md) stops the typo model forgiving some meaning changes.
- **Endings.** A slip that trades one of a profile's endings for another is WRONG_WORD.
- **The lexicon.** A slip that spells another word of the course is WRONG_WORD too.

Neither covers how Lebanese marks a verb's person and mood.
- **Prefixes.** b- (I), bt- (you, she), bi- (he), mn- (we). Without b-, the verb is the
  imperfect, which follows badna, lezem or ra7 (Kline 2022, ch. 13, 22).
- **One letter apart.** بتشتغل (you work) is a slip away from بشتغل (I work); شتغل (no b-) is
  one too. In "then we go to work", نروح for منروح is wrong.
- **What the grader did.** It called these typos unless the slip happened to spell a word the
  course writes elsewhere. After the lexicon fix (ADR 0066's note), 15 such slips on apc's
  sentences still passed in Arabic script, and 49 in Arabizi.
- **Endings that agree.** بعيد for "the school is far" (بعيدة) and the -i of a verb said to a
  woman were the same story.

A slip that makes the sentence ungrammatical is wrong, even when it looks like a typo.

## Decision

**Contrast sets can be prefixes, and can be limited to inflected words.**
- **`at: start`.** The members are prefixes: they start the word, or follow one of the set's
  `after` proclitics (Arabic و, "and").
- **`inflected: true`.** The set applies only to words the course inflects. A noun's first
  letter stays a typo; a verb's prefix does not.
- **Empty members.** An empty spelling is the word without the affix: the bare imperfect, a
  masculine adjective.

**What counts as inflected comes from the course.**
- **Tokens carry their form.** Bundled tokens keep the `form` KC the source pins on them
  (tagged-text schema), as they keep `sense`.
- **Senses.** A sense whose tokens carry a form somewhere is inflected, and so is every word of
  it. A masculine adjective counts with its feminine; a bare past verb counts with its present.
- **Accept-set spellings.** A sentence's accept set may spell the word otherwise (Arabizi be2ra
  beside b2ra). Such a word counts when the nearest word of its sentence is inflected.
- **The grader.** `createGrader` passes these words to `grade()` (`GradeOptions.inflected`,
  keyed by `lexiconKey`). core-cli's `grade` op takes them as `inflected`.

**apc's profiles (REVIEW) get two sets each.**
- **verb-prefix** (the new note `contrast-prefix`):
  - Arabic script: ب, بت, بي, من / بن, ت, ي, ن, and ا or nothing.
  - Arabizi: each consonant prefix with the vowel spellings it takes (b / bi / be, bt / bti /
    bte…), so be2ra → bt2ra is a different prefix while be2ra → bi2ra is not.
- **agreement** (the existing note `contrast-ending`):
  - Arabic script: no ending, ة, ي, وا.
  - Arabizi: no ending, e / a / i, o / u.

## Consequences

- **Measured on every apc sentence.** The slips were b- dropped, mn- dropped, b- / bt- / bi-
  traded, and the feminine dropped. None passes as a typo in either script, through the app's
  grader. The only ones accepted are the alternatives the course accepts on purpose: بعيد for
  "it's not far", نشوف for "shall we watch".
- **Real typos stay typos.**
  - A noun's first letter (يروت for بيروت), because the course does not inflect nouns.
  - Another vowel after the same Arabizi prefix (bu2ra for b2ra).
- **Some typos become wrong.** A slip that adds or drops a member letter of an inflected word for
  another reason is WRONG_WORD (بحك for بحكي). It is no form of the verb either.
- **Bundles of courses that pin forms** (apc, es) carry `form` on their tokens. Courses whose
  profiles have no such sets grade as before.
- **No Arabizi possessive set.** Final vowels vary freely in Arabizi spelling (ahwe / ahwa), so
  a set over nouns would fail right answers. Arabic script has one (ADR 0066).
- **Conformance.** Eight vectors, in both harnesses:
  - prefixes, after و, and the feminine, in each script;
  - a noun's first letter and one prefix's vowels, which stay typos.
