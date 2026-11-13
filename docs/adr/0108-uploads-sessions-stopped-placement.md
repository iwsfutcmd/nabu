# 0108. Uploads take what is valid, sessions survive a reload, and a stopped placement places

- Status: Proposed
- Date: 2026-11-12
- Amends: [0038](0038-server-sync-and-accounts.md) (the upload contract), [0039](0039-placement-and-calibration.md)
  and [0111](0111-placement-seeds-words.md) (what a placement test leaves behind)

## Context

The 2026-11 review found three ways the app lost or stalled a learner's work (S13, S3, S5), and the
owner settled how each should behave (decisions D7–D10).

- **One invalid event stalled sync for good** (S13). ADR 0038's `POST /v1/events` refused a whole
  batch over its first invalid event. The device then sent the same oldest batch every minute, so
  nothing newer ever uploaded. A schema drift between an app and its server would freeze every
  affected learner, and nobody would see it: the server logged nothing.
- **A reload restarted the lesson** (S3). A reload, or a phone that dropped the tab, planned the
  lesson again with a new seed and started it from its first card.
- **A placement test stopped part-way threw its answers away** (S5). Placing by the answers so far,
  first built by recording the stopped test as completed, also paid the session's XP, which
  rewards stopping (D9).

## Decision

**Uploads take what is valid** (amends ADR 0038; S13, D10).

- `POST /v1/events` takes the valid events of a batch and names the others in `rejected`: by
  index, with the event's id where it has one, a code (`invalid-event`, `foreign-event`) and the
  schema errors of the event's own type's definition (the schema is a `oneOf`, so its own first
  error is seldom the one that matters). Only a batch that is not a list, or is too long, is still
  refused whole (400).
- The server logs each rejection as one line: the code, the event's id and the schema error that
  explains it (path, keyword, Ajv's message and parameters). Never the event's values, so no
  learner text reaches the log. A drift between app and server shows there first.
- The device sets a rejected event aside (meta `held`): out of the outbox, kept in its log, where it
  still counts. Your progress says how many and that they stay on the device. They are sent again
  when the learner asks, when they sign in again, and once the first time a new build of the app
  runs (meta `app-build` against the build's `__NABU_BUILD__`). Never on their own every minute. A
  server from before this change, which refuses the batch naming one event, is handled the same way.
- The device's check against the server's projections leaves the events set aside out: the server
  never took them.

**A session in progress is kept on the device** (S3, D7, D8).

- A session's plan is kept on the device (meta `open-session`) from its start until it ends. A
  session opened at the same route, from the same course bundle, within 12 hours, is picked up
  where it was: core `resume` folds the session's logged answers and skips through the player's own
  state machine, so retries, cards put off and the placement test's search go on as they would
  have. The session keeps its id and logs no second `session_started`.
- The plan is kept, not planned again from the log: the planner's inputs include what the log does
  not hold (the listening and speaking breaks, what the speech server can score, the clock to the
  millisecond), and the log may have grown since. The plan is no learner state: nothing reads it
  but `resume`, and it goes when the session ends.
- While a session runs, Back and Forward ask, as its quit button does. A new navigation (a link, an
  address typed, a tapped reminder) goes ahead; the session waits to be picked up.

**A placement test stopped part-way places, without the session's XP** (amends ADR 0039 and 0111;
S5, D9).

- It is recorded as what it is, a stopped session (`summary.completed` false), whose `placed` and
  `seeded` say what its answers so far placed. Answers that place nothing leave them out.
- The learner model's fold and the game's replays mark a placement's nodes done (and seed their
  KCs) whether or not it finished. The session's XP stays with finished sessions, in the fold and
  the game alike.

## Consequences

- A learner whose app and server drift apart keeps syncing everything else, is told what was not
  taken, and gets it sent again by the update that fixes the drift. Operators see the drift in the
  server's log, with nothing of the learner's in it.
- A learner with events set aside has a server-side projection without them until they go up. The
  device says so; its own projection keeps them.
- A session in progress can be resumed on the device that started it, for 12 hours, from the same
  course bundle. Another device, a cleared browser or an update of the course starts it afresh.
- Stopping a placement test never pays; finishing it pays as any session does. Its placing is the
  same either way, and a test can be taken again (S5): a placement only ever adds nodes done.
