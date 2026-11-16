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

## Amendment: a mistake on one word asks that word again (2026-11-16)

A mistake was kept as its item and template only. A card about one word of its sentence was rebuilt
without the lesson's new words: a gap-fill, a complete-the-translation, a word's marks or its reading.
It therefore asked about the sentence's default word, its last or first readable one, and rarely the
word that was missed. In the first lessons of seven courses, 13 of 51 such cards came back about the
same word. A right answer about another word of the sentence also closed the mistake.

- **A mistake keeps its word:** `Mistake.ask` holds the KCs its answer credited, where the rest of the
  sentence was given, sorted. A whole-sentence card keeps none.
- **The rebuilt card asks that word** before any other (`MakeContext.ask`: the blank, the word to
  vocalize or read).
- **The course may no longer have it:** where the sentence no longer has the word, the course no longer
  makes that mistake's card, and it is not practised or counted.
- **Only an answer about the same word closes it.** A right answer about another word of the sentence
  leaves it open.
- **What stays as it was:** a revealed answer (skip) records no credit, so its mistake keeps no word.
  Two mistakes on one card of a sentence come back one at a time, since the card's id is the
  sentence's. The wrong option the learner chose is not kept: the rebuilt card draws its options
  afresh.
