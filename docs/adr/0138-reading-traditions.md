# 0138. Reading traditions: one asked at a time, each with its own progress

- Status: Accepted (2026-11-18)
- Date: 2026-11-17
- Amends: [0071](0071-classical-chinese.md) (Classical Chinese never drills its readings)
- Decided, not yet built (ADRs 0145–0151, accepted 2026-11-20), to amend this: [0145](0145-lexical-model.md)
  (lzh's pinned readings become projections)

## Context

ADR 0071 gave Classical Chinese three ruby layers: Pinyin, Jyutping, and Baxter's Middle Chinese.
The learner shows one or none, and no exercise practises any of them. The sources-of-truth study
(docs/sources-of-truth.md, §12, question 5) asked what a course should do when its script is read
in several traditions. The project owner decided:

- the learner picks one tradition per course, and the others show on request;
- Classical Chinese gets reading cards: chosen first, then typed (Pinyin with its tone marks on the
  character bar, Baxter in his ASCII);
- the owner wants to switch between the Cantonese and the Middle Chinese readings, and learning a
  word's reading in one tradition must not count as learning it in another.

Until now a reading card asked the first ruby layer whose scheme can be asked (`answer`): Jyutping
for yue, Schluessel for chg, sitelen Lasina for tok. It was keyed like any read-script card: one card
per word and orthography. Pinyin and Baxter had no answer orthography, so nothing could ask them.

## Decision

**An orthography's reading traditions** are its ruby layers of kind `reading` whose scheme has an
`answer` orthography, in the profile's order (`readingTraditions`, core). The learner's tradition is
the layer they last chose to show. Turning readings off keeps it. With no choice, it is the first.
Reading cards (char-read, reading-disambiguation, transcribe) ask the learner's tradition.

**Progress by tradition, where there is a choice.**
- Where an orthography has more than one tradition, a reading card names its tradition (`tradition`
  on the exercise, `reading` on the logged exercise), and so does its card key:
  `kc|read-script|orthography|scheme`.
- What the fold keeps per tradition:
  - FSRS cards;
  - what the learner has shown (`shown`), so ruby fades per tradition;
  - what they missed.
- The planner reads the learner's tradition's cards (`reading` in its options):
  - due facets;
  - predictions;
  - the typed card's gate (ADR 0131).
- Where an orthography has one tradition (every course but lzh), nothing changes. Cards and events
  stay as they were.
- lzh had no reading cards before this, so no log has to be read again.
- Adding a second tradition to an orthography whose reading cards have been answered needs a fold
  migration: its old keys are its first tradition's.

**Classical Chinese reads in three traditions.**
- The facets: lzh's `facets` add `read-script`. It is still never heard or spoken.
- Pinyin:
  - Pinyin gains `answer: zh-Latn/pinyin`, a profile that grades typed Pinyin.
  - Tone numbers are accepted (`tone-numbers`: xue2 is xué, the mark on a or e, the o of ou, else
    the last vowel).
  - The tone marks and ü are `required` (ADR 0134). A tone left out or wrong is wrong, with the note
    "right syllable, check the tone" where the letters are right.
  - The marked vowels are on the character bar.
- Baxter:
  - Baxter gains `answer: ltc-Latn/baxter`, a profile that grades his ASCII.
  - Case is folded (his X and H come only at a syllable's end, where no lowercase letter does).
  - Spaces between syllables are optional. There is no typo leeway: a letter off is a different
    reading.
- Jyutping keeps its syllable shape (ADR 0109): typed with tone numbers, as in yue.
- The wrong options of a choice card:
  - Pinyin's are the same syllables in another tone: its `variants` set the four marked forms of each
    vowel side by side, as Schluessel's sets the vowels the Arabic script leaves out (ADR 0131).
  - Baxter's trade x and h, his tone letters and his initials alike.
  - Then the course's other readings of the word's spelling, then other words' readings.
- The typed card comes only once a choice card has shown the word's reading in that tradition, as
  chg's does (ADR 0131).
- Ruby fades by facet (`fade: by-facet`) in all three layers, so "New words" shows the learner's
  tradition over the words they have not yet read in it.
- The bundle ships each typed tradition's answer profile, as it ships a script track's Latin one.

## Consequences

- **A learner who switches** from Pinyin to Baxter starts Baxter's reading cards from nothing, and
  keeps their Pinyin progress for when they switch back. Words they know (recognize, produce) are
  known in every tradition: only the readings are kept apart.
- **Instructions and labels name the tradition** where there is a choice: "How is the marked word
  read in Baxter?", "Reading in Pinyin". The scheme's name comes from its data (ADR 0109).
- **Pinyin's normalization** is a new step with conformance vectors (normalize, grade) that pass in
  both harnesses.
- **Golden plans and the simulation** for lzh change: its lessons now plan reading cards.
