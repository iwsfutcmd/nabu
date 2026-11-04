# 0051. Learners correct sentences; reviewers apply the corrections

- Status: Proposed
- Date: 2026-11-04

## Context

Every sentence and story line in the fixture courses is an LLM draft awaiting native review
([ADR 0050](0050-ten-unit-courses.md), `courses/REVIEW.md`). Reviewers, and learners who know
the language, need to say "this sentence is wrong, it should be X" where they meet the sentence.
That might be while reading through a course, in a lesson, or in a story.

The existing report, "my answer should be accepted" ([ADR 0045](0045-ai-services.md)), only
adds an answer to an accept set. A wrong sentence needs its content changed: its text in each
orthography, its words' pinned readings, or its translation. Changing the text also moves its
tokens, readings and audio.

The app must work with no server (the GitHub Pages demo), and course content changes only
through the course source, which a person reviews.

## Decision

**A correction is a learner event, `sentence_reported`** (`schemas/learner-event.schema.json`,
with its fields in `schemas/correction.schema.json`).
- **What it names.** A sentence by id, or a story line by story id and `step` (its step in the
  story, every step counted). Generated sentences (the CLDR number drills) are not in the course
  source and cannot be corrected.
- **`shown`.** Everything the device displayed: each orthography's text and its words' readings
  (a word is its index among the form's words, with its surface), and the translation as
  displayed (a sentence's first accepted translation, through core-cli's `canonicalSource`).
- **`correction`.** Only what the learner changed, NFC and trimmed. A note alone is a report too.
- **Limits.** Graphemes for what the learner sees (500 for a text, translation or note; 50 for a
  reading). A storage bound keeps every event valid against the schema's `maxLength`, so no
  correction can stop a device's sync.
- **Projections.** The learning projections ignore the event. A later report of the same item
  from the same device replaces an earlier one.

**Any learner can correct; nothing reaches the course until a reviewer applies it.**
- **In the app.**
  - A sentence list (`#/<course>/<orthography>/sentences`) shows every sentence and story line,
    unit by unit, with the course's other orthographies and the translation.
  - Each item, each exercise's feedback (when its item is a sentence) and each story line offer
    "This sentence is wrong".
  - The form starts from what the course has, or from the learner's own earlier correction.
  - Every field takes its own text's `lang` and `dir` from the script, never the UI, and its font.
    Jyutping fields are tagged `yue-Latn-HK-jyutping`.
  - Nothing is normalized or sent while an input method is composing.
- **On the device.** The sentence list downloads the device's corrections in a course as JSON
  Lines (`SentenceCorrection` rows, status `pending`).
- **On the server.** With an account, corrections sync like any event and join a review queue.
  - The queue keeps one row per distinct correction of an item, with salted learner hashes.
  - A learner's later correction moves their vote, and a pending row nobody backs any more is
    dropped.
  - Only newly stored events are filed, so a retried upload cannot undo a newer correction.
  - Reviewers use `/admin/v1/corrections` (`NABU_ADMIN_TOKEN`): list, approve or reject, export
    JSON Lines.

**`nabu corrections apply <file>` writes corrections into the course source.** The file is the
queue's approved export or a device's download. Choosing to apply a file is the reviewer's
approval, and the git diff is what they review.
- **Values only.** It edits each value in place, so comments and formatting stay. A plain scalar
  stays plain where it can, and ZWNJ and other invisibles are written as `\u` escapes.
- **Shown first.** It checks the source still says what the learner saw. If not, the correction
  is skipped, so a correction never lands on text it was not about.
- **Readings.** A word's reading is replaced.
- **Text.** The text changes, and its tokens follow in two cases only:
  - every word is still there (a punctuation fix);
  - each change falls inside one word (a spelling fix): that token's surface changes, and its
    reading is flagged if the correction did not also give one.

  A change that adds, removes, splits or swaps a whole word needs new tokens and senses. It is
  left for a person, with its file and line. Words with morphs are left too, and `reverse` is
  always flagged for a check.
- **Translation.** A sentence's translation is edited inside its accept notation when the change
  touches only plain text: `(Hello|Hi), Maryam!` becomes `(Hello|Hi), Mariam!`. Otherwise the
  first line is replaced, and the variants it accepted are flagged. A story line's translation
  is replaced.
- **After.** It compiles each edited course and reports errors and stale clips. `--summary`
  writes the Markdown for a commit or pull request, with language data in `<bdi>`; `--dry-run`
  writes nothing; `--mark` sets the queue rows to `applied`.

**Story answers can be reported too.** "My answer should be accepted" now also works for story
questions:
- a line built from tiles in another order;
- another word in a gap (reported as the whole line);
- another answer to a comprehension question.

The answer event keeps typed text only. The story reader gives its feedback hook the graded
response, and `answerTextOf` (@nabu/core/lesson) turns that into text. Story lines have no accept
sets, so `nabu reports promote` lists these reports with that reason, and a reviewer changes the
story itself.

## Consequences

- The sentence list and the form are @nabu/ui components (`@nabu/ui/corrections`) in the visual
  matrix: UI {en, en-XA, ar-XB} × target {fa, yue, uz, apc}, horizontal only. They are not set
  in columns.
- Modal dialogs render outside the UI root, so `useChrome()` and `chromeClass` give their content
  the chrome's `lang`, `dir` and font. The "start over" dialog uses them too; it fell back to a
  serif font before.
- The story reader takes `lineAction` and `feedbackExtra`, and the lesson player's `feedbackExtra`
  also receives the response. Neither is shown in Storybook, so the existing baselines stay.
- Corrections are personal data in the same sense as typed answers. They are stored with salted
  learner hashes and never with account ids in the queue.
- Not yet: withdrawing a correction, a reviewer UI beyond the admin API, and correcting KC
  glosses, story titles or roleplay scenarios. Rejected rows are never applied.
