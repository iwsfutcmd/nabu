# 0075. An adaptive placement test

- Status: Proposed
- Date: 2026-11-06
- Supersedes: the probe-every-node test of [0039](0039-placement-and-calibration.md) (placement v0)

## Context

Placement v0 (ADR 0039) asks two questions of every lesson node, in path order. Ten units of six
lessons make about 120 questions; the Cuban Spanish course (ADR 0074) has thirty units, so about
360. That is too long for anyone, and it is the course's main entrance: its learners are heritage
speakers who will place well past the first units.

ADR 0039 named the replacement: a computerized adaptive test driven by the performance model.
There are still no calibrated items (no learner data), so item response theory has nothing to
estimate with. The path, though, is ordered by difficulty, and that is enough to search.

## Decision

**The test is a search over units** (`@nabu/core/lesson/adaptive.ts`, built by
`@nabu/core/learner/placement.ts`).

- **A block per unit** with lesson nodes: up to four probes from the unit's own sentences, from
  nodes spread over the unit with the later ones first, alternating production (into the target)
  and recognition (out of it).
- **Passing a block** takes three of its four right the first time. It is decided as soon as the
  outcome is certain: three right, or two wrong.
- **The search** gallops through units 1, 2, 4, 8, 16 … and the last until a block is not passed,
  then bisects between the last block passed and the first not passed. Every unit before the
  last one passed counts as known. Thirty units take at most eleven blocks, usually eight or so:
  about 25 to 35 questions.
- **Inside the first unit not passed**, the test steps through its lesson nodes in order, one
  production probe each (the block's own probe of a node where it asked one), until one is missed.
  The learner also places out of the nodes before the miss.
- **What a passed unit places**: its lesson nodes and its story, so the next unit opens. The
  projection is unchanged: `session_completed.placed` lists the nodes.

**The test is data, and its course is a pure function.** `runTest(test, answers)` takes the
first-try answers so far and returns what to ask next, an upper bound on what may follow (for the
progress bar), and where the learner stands. `placedBy` replays it to the placed nodes. The
player keeps the test in the session (`start(…, {adaptive})`) and, after each answer, replaces
what is left of its queue with the test's next questions. The shell's recorder replays the same
test to log `placed`. Each question is asked once.

**A course may have production typed** (`placement: {production: typed}`, course source and
manifest). By default production is checked with word tiles, which is quick. Typing also checks
spelling and accent marks, which is what a heritage speaker most often lacks; es sets it.

The plan for a placement session carries the whole test (`SessionPlan.placement`), with a
prediction for every question it may ask, so shadow-mode logging (ADR 0039) still covers each
first try. `SessionPlan.probes` is gone.

## Consequences

- A learner of a thirty-unit course places in a few minutes. A ten-unit course asks roughly 15 to
  30 questions instead of v0's 110 to 120.
- **The search assumes the path gets harder in order.** A heritage speaker is uneven: they may
  pass unit 15 and still miss the accent marks of unit 11. Units the search skips over count as
  known. The planner's reviews, and the accent-mark grading of every typed answer (ADR 0074),
  are what catches such gaps; the learner can also open any done unit to practise it.
- Placement grain is the unit, then the node inside the boundary unit, as fine as v0 was.
- When there are calibrated items, the blocks can become an item pool and the search a proper
  ability estimate with an uncertainty band (§9.5). The interface (data in, next question out)
  stays.
