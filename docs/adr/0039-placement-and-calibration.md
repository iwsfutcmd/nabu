# 0039. Placement v0 and the calibration notebook

- Status: Proposed
- Date: 2026-11-03

## Context

Phase 4 lists "placement v0" and "shadow-mode logging and a calibration notebook" (§16).
- §9.5 describes placement as computerized adaptive testing over calibrated items.
- §9.3 wants a calibration curve, plotted with DuckDB, before predictions drive the planner.

There are no calibrated items and no learners yet.

## Decision

**Placement v0** (`@nabu/core/learner/placement.ts`).
- `plan({mode: "placement"})` builds a test that probes every lesson node in path order. Each node
  gets:
  - a recognition item (choose-translation, else tiles into the support language);
  - a production item (tiles into the target, else typing, else complete-translation).
- Items are built from the node's own sentences, preferring those that use most of what the node
  introduces.
- Each item is asked once: the player runs with `retries: false`.
- The learner places through the **longest run of nodes, from the start, whose probes were all
  right the first time**.
  - The shell computes this (`placementOf`) and logs it on `session_completed.placed`.
  - The projection marks those nodes done.
  - The answers update memory like any others.
- The path offers "Already know some …? Find your level" until any lesson is done.
- v0 is not adaptive. For a unit of six nodes, asking every probe is short. A CAT driven by the
  performance model (stop after misses, jump after streaks, ability with an uncertainty band)
  replaces it once there is more content and calibrated items.

**Shadow-mode logging.**
- Every planned first try carries `prediction: {p, model}`, on both `exercise_presented` and
  `answer_submitted`.
- The simulator writes the same events. `pnpm --filter @nabu/core simulate --out <file>` produces
  30-day logs of seven simulated learners across every course and orthography, so the notebook has
  data before any real learner exists.

**Calibration** (`pipeline/src/nabu/analytics/calibration.py`, DuckDB).
- Reads JSONL event logs from any of:
  - the app's "Download my learning data";
  - `GET /v1/events`;
  - Postgres `copy`;
  - the simulator.
- Keeps first tries that have a prediction.
- Output, per model and optionally per template or course:
  - a reliability table (equal-width bins: n, mean p̂, observed rate);
  - Brier score, log loss and ECE.
- `uv run nabu calibration <logs…>` prints the tables.
- `pipeline/notebooks/calibration.py` is the notebook. It is a percent-format script that opens as a
  notebook in VS Code or Jupytext and also runs as a plain script, so CI tests it. It adds the
  per-template gaps and writes a reliability diagram as SVG:
  - light and dark steps of a validated palette;
  - a tooltip per bin;
  - hollow markers for bins with too few answers.

## Consequences

- On the simulated logs, `elo@1` has ECE 0.028 overall. Easy templates (select-image,
  choose-translation, match-pairs) are slightly under-predicted. The online model should close
  that gap as data arrives.
- Placement can only place within the course's linear path. Units with branches, or a "jump to
  section N" test, need the adaptive version.
