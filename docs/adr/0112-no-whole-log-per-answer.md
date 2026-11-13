# 0112. No whole-log work per answer: recording folds, pulls bring only what is new, the check runs daily in a worker

- Status: Proposed
- Date: 2026-11-12
- Amends: [0038](0038-server-sync-and-accounts.md) (the sync pass and the upload contract),
  [0047](0047-offline.md) (when the game state is checked), [0036](0036-learner-model-and-planner.md)
  (the learner state)

## Context

The app is quick for a new learner and slow for a long-time one, because several paths re-read and
re-process the whole history on every answer (R1 and R4 in the 2026-11 review). Measured with a
year of simulated daily es practice (26,406 events, 1,856 cards), in Chromium at 4× CPU throttling
(a mid-range phone), against the API on PGlite on the same machine:

- **Every recorded event re-read the whole log** (R1). One version string counted recorded events,
  and the game state (every event and receipt time read, then the game replayed) and the open
  course's corrections (every event of the course read) were worked out again whenever it changed.
  The live fold, `applyEvents(state, [event])`, deep-copied the whole state, including `seen`, the
  id of every event ever applied. An exercise records two events: 2.2–3.0 s of main-thread work
  per exercise, against 0.12–0.24 s for a new learner.
- **A signed-in learner synced the whole state after nearly every answer** (R4). A pass runs a
  second after each recorded event. It pulled back the events the device had just uploaded (the
  cursor moved only by pulling), and for every course touched it asked the server for its replay
  of the course (`GET /v1/state`: 3–16 s of server time here, 2.2 s in the review; 596 KB) and of
  the game state, then replayed both on the device to compare: 4 requests, 605 KB and 9.9–10.8 s of
  main-thread time a pass. Signing up with that history uploaded it and then pulled all of it
  back: 194 requests, 21.7 MB up and 25.6 MB down, 15–18 s of main-thread time.

The check itself (§14.2: the server is authoritative, the device checks that it agrees) is worth
keeping: it is how a fold that changed on one side, or an event lost in sync, shows. It need not
run after every answer, nor on the page's thread.

## Decision

**Recording folds the new event, nothing more** (R1).

- The learner state keeps no list of the events it folded (`seen` is gone). `replay` deduplicates
  by id as it folds the sorted log, so the projection is still order-independent and idempotent.
  `applyEvents` folds the events it is given, which in the app are the ones just recorded, new by
  construction. An event the fold does not read (an exercise shown, a report) gives back the same
  state, uncopied.
- The game state is worked out again after the events that change it beyond a session's answers
  (`session_completed`, `goal_set`, `progress_reset`, the revisions), when events are pulled or a
  judge revises an answer, when the screen changes, when the page is shown again and when the date
  turns. Inside a session nothing shows it until the end screen, which reads it after
  `session_completed`, and the gate is decided as a session opens.
- This device's corrections are read again when one is recorded or events are pulled.

**A pull never brings back what the device just uploaded** (R4).

- An upload says where the device's pulls are (`POST /v1/events {events, since}`). When every
  event of the user's log after `since` is in the batch, the answer carries `caughtUp`, the newest
  cursor, and the device moves its cursor there: it holds every event up to it. Otherwise the
  answer says nothing and the device pulls as before.
- A pass pulls first, then uploads, so its upload starts from the newest cursor. Signing up with
  local history is an upload only; signing in where both the device and the account have history
  downloads the account's and uploads the device's, each once.
- Older servers ignore `since`; the service worker's background upload sends none, so the window's
  next pull brings those events back and their courses are checked.

**The check runs after signing in, then once a local day, in a worker** (R4).

- A pass checks the server's projections (each course's state, and the game state) when the
  account has not been checked on this device yet (just signed in or up), or when it is the first
  pass of a local date and something was uploaded or pulled since the last check. The courses
  touched since then wait on the device (`unchecked`); the last check's account, date and verdict
  are kept too (`checked`), so the sync status shows it after a reload. Signing out forgets both.
- The device compares only what the server took: the events set aside, and those still in the
  outbox (read after the events, so one recorded meanwhile is left out of both).
- The device's side of the check runs in a worker of its own (`check-worker.ts`), which opens the
  IndexedDB log itself: replaying a year takes seconds, and the first pass of a day is usually as
  the app opens. Where there is no worker or the log is in memory, the page checks itself.
- Uploads stay prompt (a second after an event): they are small, and they are the backup.

Alternatives considered:

- **A digest of the projections instead of the projections.** It saves the bytes but not the cost:
  both sides still replay the whole log, and that is most of it. Numbers agree only within 1e-9
  across engines (`difference`), so a digest would need rounding and a full comparison when it
  differs. Production also compresses responses (Caddy). Not now.
- **A check at each session's end.** It keeps the check close to the answers, but costs a replay
  on both sides per session, landing on the end screen.
- **Leaving the device's own events out of pulls by device id.** Restored and seeded events carry
  other device ids and would still come back; `caughtUp` relies on the log alone.

## Consequences

With the same year of history, at 4×:

| | Before | After |
|---|---|---|
| Main-thread work per exercise in a lesson | 2.2–3.0 s (new learner 0.12–0.24 s) | 0.08–0.37 s, median 0.12–0.15 s (new learner 0.05–0.13 s) |
| Signed-in pass after an answer | 4 requests, 605 KB, 9.9–10.8 s main thread | 2 requests (a pull and the upload), 1 KB down, 26–82 ms |
| The day's first pass, with the check | (every pass) | 4 requests, 603 KB, 33 ms main thread (the replays run in the worker) |
| Sign-up with the year | 194 requests, 47 MB, 15–18 s main thread | 142 requests (133 of them the upload), 24 MB, 3.6 s |
| Server replays (`/v1/state`, `/v1/game`) | after every answer | once a day per active learner, and at sign-in |

- **The check is rarer.** A fold that changed on one side shows within a day, not after the next
  answer. The day's check still replays the course and the game on the device (in the worker) and
  on the server; R2 (replaying in place) makes both cheaper.
- **The end screen's XP** comes from the game state worked out after `session_completed`, a moment
  after the screen opens, as before.
- **`applyEvents` no longer ignores an event the state already holds.** A log that may repeat events
  is replayed (the app does: after a pull, a revision or a restore).
- **The API** takes `since` on `POST /v1/events` and answers `caughtUp`; `GET /v1/state` is
  unchanged (it never sent `seen`).
- **What stays slow with a year of history** is opening a course page or a session (13–16 s at 4×):
  the course's replay (R2) and planning, not recording or sync.
