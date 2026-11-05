# 0057. Learners correct words too, from any word exercise

- Status: Proposed
- Date: 2026-11-05
- Extends: [ADR 0051](0051-corrections.md)

## Context

[ADR 0051](0051-corrections.md) lets a learner correct a sentence or a story line. Word exercises
are built from a KC's forms and gloss, not from a sentence: match the pairs, choose the picture,
listen and choose, vowel marks, Jyutping. Under their feedback "This sentence is wrong" found
nothing to correct, so it did not show. A wrong word could not be reported where it was seen.

A real case: the Lebanese Arabic word for "living room" was drafted as بالصالون, "in the living
room". Match the pairs paired it with "living room", and the learner who noticed had no way to
say so.

## Decision

**A word is correctable.** A KC with forms is a `Correctable` of kind `word`:
- **its form** in each orthography: the first one, which word exercises show;
- **its meaning**: its gloss in the support language, in the field a sentence uses for its
  translation.

It is reported as any correction is: a `sentence_reported` event whose `item` is the KC id. It
goes to the same review queue and report intake ([ADR 0055](0055-report-intake.md)), and its issue
quotes the word's forms and its meaning.

**Every word exercise offers it.**
- **One word:** under the feedback, "This word is wrong" opens the form. Its fields read "Word"
  and "Meaning".
- **Match the pairs** (several words): "One of these is wrong" first asks which. Each choice shows
  the word, with its readings where the profile has ruby, and its meaning, each through `<T>`.
- **Which item:** `correctablesOf(course, exercise)` gives the sentence or word an exercise was
  built from, and every pair's word for match the pairs.

**`nabu corrections apply` edits the KC.**
- It edits the KC's first form and its gloss in place, after checking that they still say what
  the learner saw.
- **What it leaves for a person:**
  - Sentences, stories and the vocalization that write the word are listed to check, never
    changed.
  - A correction to a word's reading is listed for a person, since a word's reading comes from
    the sentences that pin it.

## Consequences

- **No schema shape changes.** Only descriptions say that `item` can be a KC id. Corrections
  stored by the API need no migration; the API already accepts any item `correctable` finds.
- **The sentence list is unchanged.** It still lists sentences and story lines. A words section
  there would be a natural next step.
- **Content found this way.** Five apc word forms carried a preposition or a possessive that
  their gloss did not: بالصالون, بالليل, عالمطعم, عالسوق, بنتي. Their bare forms come first now,
  and each has a sentence of its own. The attached form stays second, so a tap on it in a
  sentence still finds its gloss.
