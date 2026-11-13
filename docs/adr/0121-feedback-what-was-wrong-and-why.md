# 0121. Feedback shows what was wrong, and what a wrong word means

- Status: Proposed
- Date: 2026-11-13
- Amends: [0113](0113-session-end-and-claims-in-session.md) (a missed card at the end of a session is marked as its feedback is)

## Context

The 2026-11 review found that feedback rarely shows exactly what was wrong, and almost never why (P3):

- Only replaced, added and mistyped units were marked. A unit left out marked nothing, so "Your answer"
  was hidden and the solution showed unmarked: the learner had to hunt for the difference.
- A missing accent (cancion), and marks that make another word (esta for está), marked nothing either:
  they match through a fold.
- The only "why" was a profile's note, or "Explain my answer", which needs a language model and an
  account. A wrong option, or a word put in place of another, said nothing about what it means.

W3 (the nearest correct wording) and W4 (the pair a missing accent makes) stay as they are. Grading is
unchanged: every change here is in what feedback shows.

## Decision

**What is marked.** A unit of an answer differs, and is marked, when it was left out, added, replaced or
mistyped, or matched only through a fold that raised a note: a missing accent, a variant character, an
IME homophone, marks that make another word. Case and the profile's silent folds (policy `accept`, marks
`ignore`) are no difference (`answerDiff`, `closestAnswer` in @nabu/core/lesson).

**A gap where something was left out.** The learner's answer shows a gap where units were left out, one
for each run of them, between the words around it: with a space on either side in a spaced script,
between the characters in Han. It is an empty dashed box in the style of a marked part, never colour
alone, named "Left out" for screen readers. `answerDiff` gives the gaps, and `diffParts` the runs of
text and the gaps a view shows. "Your answer" now shows for an answer whose only difference is a gap.

**The solution marks what the answer left out or got wrong.** The answer must line up with the
solution's own wording (`closestIsSolution`) and be a near miss of it (W3's test: at least half of the
wording and of the answer match). Then the solution shown marks the words the answer left out,
replaced, mistyped or matched only through a noted fold (`solutionMarks`): "¿Tú *tienes* hambre?" for
"Tú hambre".
- A word's units, as the profile splits them, must be the alignment's, in order. They are compared as
  grading compares two units without a slip (case, the folds: a vocalization's marks); where they
  differ, nothing is marked.
- A word of several characters (Han) is marked whole.
- Where another accepted wording is nearer, W3's "Nearest correct version" shows instead, marked as
  before.

**What a wrong word means.** After a wrong answer, feedback says what the wrong word means where the
course knows it ("What you chose means:", "What the marked word means:"). The meaning is shown as
tap-for-gloss shows one (`glossAt`), with the form the course pins the word as after it: "hablas: to
speak; to talk, *present tense: you (tú)*". The words explained:
- a wrong option on a card whose options are words of the course (`TemplateInfo.wordOptions`: gap-fill,
  story-complete, listen-select, minimal-pair, select-image), `chosenWordOf`. Not a word's
  vocalizations, its readings, a letter, or a translation;
- the words of a typed or tiled answer that stand where the solution has others (`otherWordsOf`). These
  are its slips (a typo, or a fold or an IME homophone that raised a note), and in a near miss the words
  put in place of others; at most three.

Which reading of a word is glossed (`wordMeanings`, `writtenMeanings` in @nabu/core/story):
- **An option carries its analysis** (a gap's options are words of sentences). It is glossed by its own
  sense, or its morphs one by one: glossAt with no glossary match. An inflected form is glossed by its
  sense, never by an entry spelled like it: como of "Como arroz" is comer's "to eat", not como "like".
- **A word the learner wrote** is looked up among the course's words spelled like it (sentences and
  story lines), keyed as grading's lexicon keys words (`lexiconKey`). Each reading is shown once, at most
  three (como: comer's, and "like, as"). A reading morph by morph is shown only where the course glosses
  the word whole nowhere: Lebanese بدك is baddak "you want" and baddik "you want" (-ik, to a woman), not
  again badd + -ik. A word the course writes nowhere with an analysis is glossed by the glossary's
  entries; a word the course does not know (a slip that makes no word) gets nothing.
- **A word whose sense is a phrase** (por of por favor) is glossed by the glossary's entry for it alone,
  else as part of its phrase (días: "Buenos días", good morning).
- **A KC's form** among a card's options is glossed by the glossary's entries.

Nothing is explained for a right answer, a self-rating, or text in an orthography other than the one
being learned. The app builds what words are looked up in while the learner reads, as it builds
grading's lexicons (`prepareMeanings` beside `prepareGrading`, R5).

**The end of a session** shows a missed card's answer with its gaps, and the right answer with its
marks, as its feedback showed them (amends ADR 0113).

## Consequences

- Grading is unchanged, so no conformance vectors: verdicts, notes and alignments are as before.
- A left-out word, a missing accent and a word that makes another are seen where they are, in the answer
  and in the solution. A wrong option or word says what it means, without a model or an account.
- Visual baselines change and must be made again from the pinned image:
  - the lesson player's Feedback (the solution's word marked, and what the typed word means where it is
    a word of the course);
  - the end of a lesson (Finished: a missed typed card's gaps and marks).
  The story reader's gloss panel keeps its markup (its row is now a shared component).
- An answer far from every wording explains none of the words it put in place of others; a Han word is
  marked whole in the solution, though the answer marks its character.
- **Not done:**
  - tap-for-gloss still glosses an inflected homograph by the entry spelled like it, and shows no form;
    the feedback's choice of reading could serve it too;
  - an added word is marked, never explained;
  - the draft UI catalogs show the three new messages in English until translated.
