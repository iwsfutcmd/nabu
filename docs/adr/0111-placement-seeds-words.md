# 0111. Placement seeds the words of the units placed out of

- Status: Proposed
- Date: 2026-11-12
- Amends: [0039](0039-placement-and-calibration.md), [0077](0077-adaptive-placement.md) (what a placement test leaves behind)

## Context

A placement test asks 17–33 questions and marks the nodes the learner placed out of as done. Only
the KCs those questions touched got cards (the 2026-11 review's L9). The planner counts a word as
seen only once it has a card. So after placing out of uz units 1–5, only 3 of the next lesson's 8
sentences passed its rule that every word not new in the lesson has been seen. The placed words
never came back in review, and the word list didn't show them.

## Decision

- The finished placement event (`session_completed`, mode placement) carries `seeded`: the KCs the
  placed nodes introduce. `learnerEventOf` works it out from the course (`placedKcs`), next to
  `placed`.
- The fold gives each seeded KC that has no card yet a recognize card, as if recalled with ease at
  the end of the test, and records it as met. A KC with a card keeps it.
- The event schema gains the optional `seeded`; older placement events without it fold as before.

## Consequences

- **The planner counts placed words as seen.** After placing out of uz units 1–5, the next lesson
  uses more of its own sentences.
- **Review brings placed words back.** An easy first review puts the next one days away, so it comes
  at long intervals.
- **The word list shows placed words** as being learned: placement shows recognition, not every
  skill a known word needs (ADR 0100).
- **A placement taken before this change seeded nothing.** Retaking it (S5) seeds.
