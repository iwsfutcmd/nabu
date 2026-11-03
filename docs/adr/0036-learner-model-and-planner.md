# 0036. Learner model and session planner

- Status: Proposed
- Date: 2026-11-03

## Context

Phase 4 adds the learner model (gameplan §9): learner events, the projections they fold into, and a
planner that picks each session. Everything has to replay deterministically from the event log, run
on the device with no server, and agree with the server later (§1 decision 5).

## Decision

**Events** (`schemas/learner-event.schema.json`).
- Five events: `session_started`, `exercise_presented`, `answer_submitted`, `exercise_skipped`,
  `session_completed`.
- They share one envelope:
  - UUIDv7 `id`, `device`, optional `user`;
  - `course`, `orthography`, `support`;
  - `bundle` (manifest sha256) and `session`;
  - `clientTime` (ISO 8601 with offset), `localDate`, `tz`.
- Answers carry the exercise ref, the attempt, the input method with its latency, the verdict, and
  the credit per KC.
- First tries carry the planner's p̂ (`prediction`, shadow mode).

**Credit assignment** (§8.5), at answer time in `learnerEventOf`:
- Gap-fill and complete-translation: the blank's KCs are right or wrong; the rest are `given`.
- A wrong typed translation: per word, from the matcher's alignment.
- Otherwise: every KC gets the verdict.

**Projection** (`@nabu/core/learner`, `replay`).
- `replay` is a pure fold over the events, sorted by `clientTime` then id. Duplicate ids are ignored,
  so replay is order-independent and idempotent.
- **Memory.** One FSRS-6 card per (KC, facet), using ts-fsrs 5.4 (the last release for Node 22), no
  fuzz, retention 0.9.
  - Facets keyed to the language are shared by all orthographies. `read-script` and `write-script`
    are keyed per orthography (§6.3).
  - Ratings follow §9.2, and each facet is rated at most once per session.
  - "Slow" means slower than the median of the learner's last 25 answers on that template (once
    there are 5).
- **Performance** (`elo@1`).
  - The §9.3 logistic model, with these terms:
    - learner ability and per-facet ability;
    - template, KC and item difficulty, starting from per-template priors;
    - a weight on the retrievability of the facets involved.
  - One SGD step per first try, with L2 regularization.
  - Until the server exists, difficulties are learned per learner.
- **XP:** 1 per right answer, 10 per finished session, 5 more for a perfect one. XP is counted by
  `localDate`.
- **Path:** a lesson node is done once its session completes.
- **Mistakes:** a wrong answer or a skip opens a mistake. Only a later right *first* try closes it,
  not the lesson's own retry.

**Planner** (`plan`, `planner@1+elo@1`). Pure and seeded: the same request, state, bundle, clock and
seed give the same plan.
- **Requests:** a lesson node, review, or mistakes.
- **Candidates:**
  - Every exercise the templates can make for the node's sentences and KCs.
  - Lessons interleave up to six earlier sentences whose facets are due.
  - Review draws on every studied sentence.
  - Mistakes rebuild each open mistake's template on its sentence.
- **i+1 at runtime:** every KC that is not new in this lesson must have been seen. This is
  simpler than §9.4's "R ≥ 0.8": with one unit of content, R ≥ 0.8 would starve reviews.
- **Greedy score:**
  - memory gain: new 1, due 0.6 + the retrievability deficit, otherwise 0.15, down-weighted once
    covered;
  - plus a bonus for recognizing a new KC;
  - minus 14 × |the session's mean p̂ − target|;
  - minus 2 × |p̂ − target|;
  - minus small penalties for repeating a template or item.

  The session mean is what gets calibrated, so easy and hard items can balance.
- **Hard constraints:**
  - at most 3 of a template (2 speaking turns, 1 match-pairs, 2 select-image);
  - excluded templates are skipped;
  - a new KC is recognized before it is produced or read.
- **Size:** lessons min(14, max(10, 2 × the node's sentences)); review max(5, min(10, due));
  mistakes up to 10.
- **Order:** selection order (new words first), then the easiest of the last three moves to the end.

**Acceptance (§16):**
- Golden files pin a recorded lesson's events, the state they replay to, and a review plan.
- A 30-day simulation of learners with a hidden truth (their own ability, template and KC
  difficulties unlike the priors, forgetting curves) runs on every course and orthography. Weak to
  strong learners all land within ±5 pp of 85%.

## Consequences

- p̂ drives the planner from day one. §9.3 asks for a calibration curve first; the simulation stands
  in until real data exists (the notebook comes in Phase 4b).
- Global item difficulties, per-user FSRS parameters, "weak facet" targets and runtime adaptation
  (updating p̂ during a session) are later work.
- Projections can change freely: they are recomputed from the log. Event schema changes cannot.
