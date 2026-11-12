# 0097. Review inside a lesson: a small share, picked by need, marked as review

- Status: Proposed
- Date: 2026-11-12
- Amends: gameplan §9.4 (step 1, "due facets": which ones a lesson takes)

## Context

A lesson mixes in earlier sentences with due words (§9.4: "interleave practice"). It took them in
course order and kept the first six. Unit 1's sentences hold the most common words, one of which is
nearly always due, so unit 1 won every time.
- **apc:** in a simulated learner, lessons from unit 3 on spent 42% of their questions on
  earlier-unit sentences. The same intro greetings came back 14 to 21 times each (*mni7,
  el7amdella*, *ana mni7*).
- **es:** every review item inside a lesson came from units 1 and 2; later material was never
  reviewed inside a lesson.

The owner saw "Thank you" in late apc lessons, and decided (D1 in the 2026-11 review) that lessons
keep some review: a small share, picked by need, marked as review on the card.

## Decision

- **Which sentences.** A lesson brings back up to six sentences from the lessons before it on the
  path; a later lesson's sentence is new, whatever its words.
  - They are chosen greedily by the due words they would practise, the most forgotten first: the
    sum of desired retention minus recall over their due recognize and produce cards.
  - Each due word is counted once, so after one sentence covers the common words, others' needs
    lead.
  - A sentence reviewed in one lesson is no longer due, so it does not come back in the next.
- **How much.** Review takes at most a quarter of a lesson's cards (at least one). The scores choose
  which of the brought-back sentences' cards fill it.
- **Marked.** Those cards carry `review: true`. The player shows a "Review" label above the
  instruction, said first by screen readers.

## Consequences

- **apc, unit 3+ lessons:** earlier-unit questions fall from 42% to 21% of first tries, and no intro
  sentence comes back more than 3 times.
- **es:** review draws on units 1 to 10 in proportion to need, instead of units 1 and 2.
- **Share:** in-lesson review is 20–23% of first tries (it was 22–50%, more for weaker learners).
- Every course stays within ±5 pp of 85% in the 30-day simulation.
- **Adaptive pacing (the review's L2) will vary the share** by how a learner is doing; the quarter is
  its steady default.
- Review sessions are unchanged; this is only what lessons mix in.
