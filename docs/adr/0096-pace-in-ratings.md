# 0096. Pace in the rating map: slow is relative to length, and sure recall can be Easy

- Status: Proposed
- Date: 2026-11-12
- Amends: gameplan §9.2 (errata 63–64)

## Context

Learners never rate their own recall (§9.2): the answer does. A right answer was Hard when it took
longer than the learner's median for that template over their last 25 answers.
- **By construction that is half of all right answers.** Long sentences are nearly always "slow",
  since the median is the same for every item of a template.
- **What Hard costs.** FSRS raises a card's difficulty on Hard: alternating Good and Hard needs 7
  reviews in six months instead of 5 (+40%), and difficulty rises from 2.1 to 7.6. Every learner
  reviewed more than their recall called for, fast learners too.
- **Easy was never given,** so a learner who clearly knows something could not stretch its
  intervals faster: an all-Easy card needs 3 reviews in six months.

The 2026-11 review found both (L7, L8). The owner wants recall rated automatically, never by the
learner, as the alternative to Anki's buttons.

## Decision

**An answer's pace is judged per unit of length.** Its time is divided by (2 + the item's KCs): the
KCs stand for length, and the 2 for reading the card and deciding. That is compared with the
learner's usual for the template: the median of their last 25 first tries.
- **Slow:** more than twice the usual. A right answer then is Hard.
- **Fast:** at most half the usual.
- **Usual:** in between.

Only first tries make the usual, since a retry is quicker for having just seen the answer.

**Easy, automatically, for sure recall.** A right answer is Easy when all of these hold:
- it is CORRECT or CORRECT_ALT, on the first try;
- it was typed: the template's input is text, so it was recalled, not recognized among options;
- it was fast;
- the card was already sure before it: FSRS recall at least 0.9.

A new or fading card earns Good at most (the fold decides, from the card).

Learners still never rate themselves, except speaking at tier 0.

## Consequences

- **In the 30-day simulation,** which now models answer times (a fixed part and a part per KC,
  slower when recall is weak, with a learner's spread):
  - right answers rated Hard for slowness drop from 47–51% to 1–3%;
  - Easy is rare (0–1%);
  - every course stays within ±5 pp of 85%.
- **Real logs will show** how often Easy and Slow occur. Tune `PACE_SLOW`, `PACE_FAST` and
  `PACE_OVERHEAD` (`state.ts`) on them, with the calibration notebook, not on the simulator.
- **State is a projection,** so every learner's cards are re-derived under the new map on the next
  replay. No migration is needed.
- **Adaptive pacing (the review's L2)** builds on this: it needs ratings that reflect recall, not a
  learner's spread of answer times.
