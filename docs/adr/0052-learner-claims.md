# 0052. A learner's claim about their answer counts for them at once

- Status: Proposed
- Date: 2026-11-04

## Context

"My answer should be accepted" ([ADR 0045](0045-ai-services.md)) only queued a report: the
answer stayed wrong in the learner's progress unless the judge, which needs a model, accepted
it. The accept sets are LLM drafts ([ADR 0050](0050-ten-unit-courses.md)), so learners and
reviewers meet two kinds of wrong grading:
- a right answer marked wrong (the accept set lacks it);
- a wrong answer marked right (the accept set or the typo tolerance allows too much).

Learners asked for both to count the way they say, straight away.

Only the server issued revisions (`outcome_revised`), so that no device could rewrite its own
grading.

## Decision

**An `answer_reported` event is the learner's own revision of the answer it names.**
- **The claim.** `claim` is `accept` ("My answer should have been accepted", and the default when
  absent) or `reject` ("This should have been wrong").
- **The fold.** `revisionsOf` (@nabu/core/learner) treats it like an `outcome_revised`. The answer
  counts `CORRECT` with every KC right, or `WRONG` with every KC wrong, with a note
  (`learner-accepted` or `learner-rejected`).
- **Every projection.** Cards, mistakes, XP, the game and leagues all see the claim, on the
  device and on the server alike, because they all fold through the same revisions.
- **The latest wins.** When an answer has several revisions (the judge's, the learner's, a change
  of mind), the latest by device time, then id, applies.
- **The review queue.** The queue keeps accept and reject claims as separate rows (`claim` on
  `AnswerReport`, migration `0006_report_claims`). `nabu reports promote` adds approved accepts
  to accept sets as before. A reject needs an alternative taken out of the notation, so promote
  lists it for a person.

**What can be claimed.** Any answer with text: typed, built from tiles, or an option chosen, story
questions included (`answerTextOf`). A wrong answer offers "My answer should have been accepted";
a right one offers "This should have been wrong". Speaking cards are graded by the voice, and
pairs have no single answer, so neither offers a claim.

**The app replays at once.** A report is appended and the course's log replayed, so the path,
mistakes and XP change on the spot. The report uploads like any event.

## Consequences

- **Scored speaking cards** (speak, listen-speak; 2026-11-05). Tone and sound scoring can be wrong,
  so a learner can claim a spoken answer right: "I said it right". The claim's text is the sentence
  they were asked to say, never a recording or a transcript, and promotion skips it: the scoring was
  wrong, not the accept set. A self-rated card (speak.tier-0) has nothing to overrule.
- A learner can now change their own grading, and only their own. Others' progress and the
  course do not move until a reviewer applies the report.
- Claims earn or lose XP like the answers they revise, in leagues too. Leagues' plausibility
  limits ([ADR 0044](0044-gamification-and-notifications.md)) bound what claiming every answer right could gain, and
  the reports are visible in the review queue.
- Within the session the claim was made in, the player has already scheduled any retry of a wrong
  answer, so an accepted answer can still come back once. The session summary keeps the grading as
  it was shown.
- ADR 0045's rule "only the server issues revisions" now reads "only the server issues
  `outcome_revised`; a learner's claim revises only their own answers".
