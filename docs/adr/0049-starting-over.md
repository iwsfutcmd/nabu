# 0049. Starting a course over is an event

- Status: Proposed
- Date: 2026-11-04

## Context

Learners asked for a way to reset their progress. Learner state is a projection of an
append-only event log, synced between devices and the server (§1 decision 5; ADRs 0036–0038).
Deleting events would not work:
- another device, or the server, would hand them back at the next sync;
- the server's projection would no longer match the device's;
- the history that game rules, leagues and reports read would quietly change.

## Decision

**A reset is an event, `progress_reset`, for one course** (`schemas/learner-event.schema.json`).
- **The fold.** The learner-state fold forgets everything folded before it:
  - the cards (what the learner knows);
  - the performance model;
  - the lessons done (placement, too);
  - mistakes and latencies.
- **Order.** It sits in the log in its place by device time like any event. A reset that syncs
  late still applies where it happened, and events after it count as usual.
- **XP and the game state stay.** XP, the streak, quests and achievements record practice that
  happened. The course page keeps its XP, and `replayGame` ignores the event.
- **The log keeps everything.** Nothing is deleted, so export still holds the whole history, and
  deleting an account (`docs/next-steps.md`, Phase 11) remains the way to remove data.
- **The app.** The course page has a "Start over" section while the course has progress. A
  confirmation dialog (`role="alertdialog"`, focus on "Keep my progress") says what changes on
  every device and what stays.

## Consequences

- The device and the server forget the same things. The tests cover four things:
  - a synced reset in the API;
  - a late reset in core;
  - the dialog with RTL chrome;
  - the server's check after a reset (`apps/web/tests/e2e/reset.spec.ts`).
- Undoing a reset would be one more event (`progress_reset_undone`, naming the reset). It is not
  built.
- e2e tests that upload seeded history give it fresh ids (`freshIds` in `tests/e2e/solver.ts`).
  The server deduplicates event ids across all users, so history uploaded twice under the same
  ids would vanish from the second account.
