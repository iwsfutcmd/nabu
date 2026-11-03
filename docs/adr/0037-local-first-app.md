# 0037. The local-first app: on-device log, path and practice

- Status: Proposed
- Date: 2026-11-03

## Context

§12.4 makes the device a complete node: it keeps its own event log, computes its projections and
plans sessions, and needs no account. Phase 4a turns the Phase 3 lesson player into that app. The
server and sync come in Phase 4b.

## Decision

**The log.**
- IndexedDB database `nabu`, with two object stores:
  - `events`: keyed by event id, indexed by course;
  - `meta`: holds the device id, a UUIDv7.
- Writing an event twice is a no-op `put`.
- Nothing else is stored: path, XP, memory and mistakes are replayed from the log when a course
  opens. Live events are then folded onto that state.
- The app asks for persistent storage (`navigator.storage.persist`).
- Without IndexedDB, the log lives in memory and the path says progress will not be kept.
- No library: the API surface is three calls.

**Stamping events.** The shell, never core, supplies:
- UUIDv7 ids, with a 12-bit counter so ids from one page sort in order;
- `clientTime` in local time with its offset;
- `localDate` and the IANA `tz`;
- the latency from presentation to answer.

**The path** (`pathOf`).
- The course's lesson nodes in order.
- A node opens when the one before it is done; done lessons stay open.
- Review is offered once anything is studied, showing how many facets are due.
- Mistakes are offered while any are open.
- XP is shown as a total and for today.
- A finished session shows the XP it earned.

**Routes:** `#/<course>/<orthography>/<node | review | mistakes>`. Node ids are course-prefixed, so
they cannot collide with `review` or `mistakes`.

**Tests.**
- Sessions now depend on the log and the clock.
- The e2e tests fix the page clock (`page.clock.setFixedTime`) and write a learner's history into
  the device's log through `window.nabu`. They plan the same session the app plans and must see
  exactly its exercises.
- `progress.spec.ts` covers one learner's first days, by keyboard and by touch:
  - a lesson with a miss;
  - a reload;
  - the mistakes session;
  - a review the next day;
  - another reload.

## Consequences

- Clearing site data deletes progress until Phase 4b adds accounts and upload.
- Replaying a course's whole log when it opens is linear in its length, which is fine for months of
  practice. Snapshots can come later, since projections are derived.
