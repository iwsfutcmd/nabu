# 0044. Gamification, profiles, leagues and reminders

- Status: Proposed
- Date: 2026-11-03

## Context

Phase 7 (gameplan §12, §16) asks for:
- a rules engine;
- XP and streaks (local dates, a grace window, freezes);
- quests;
- leagues (cohorts, an idempotent weekly rollover);
- gate policies, off by default;
- Web Push;
- profiles with UTS #39 usernames.

Acceptance:
- property tests across the date line, DST, and syncing after 48 hours offline;
- an idempotent league rollover;
- notifications localized for every UI locale.

## Decision

**Game state is a projection** (`@nabu/core/game`), like the learner state.
- `replayGame(events, config, clock)` folds the log with pure rules, `(event, context) → effects`.
  - It is order-independent and deduplicated by id.
  - It covers XP, streak days, quests, achievements and the gate.
- Nothing in learning reads it, except the gate, which is off unless a deployment turns it on.
- A deployment configures the rules in `game.json` next to the app. It is optional: the defaults
  have the gate off, and XP, streaks and quests on.

**Streaks.** A day counts when a session was completed with that local date.
- **Offline-safe:** an event counts for its own date if the server received it within 72 hours.
  On the device there is no receipt time, so the device and the server agree.
- **Anti-gaming:**
  - the local date must be the clock's date in the event's zone;
  - no event may come from the future;
  - more than three zone changes in seven days stop counting.
- **The date line:** a date a traveller never lived through still bridges the streak. Flying west
  from UTC−11 to UTC+14 between two practices skips a whole date, and it is neither practised nor
  missed. A date is skipped when, at some moment between the two practices, the old zone had not
  reached it and the new one had already left it.
- **Freezes:** one for every seven days of streak, at most two held. They are spent automatically
  on missed days, so "repair" is just the projection.

**Quests and achievements** are declarative counts over event predicates.
- Every learner gets the same three quests on a date, rotated by a hash of the date.
- A completed quest adds 10 XP on its date.
- Achievements: streak lengths, and totals of sessions, stories and right answers.
- All of them are MF2 messages with plurals.

**The gate** has three policies: `none` (the default), `hearts` or `energy`.
- Only lesson and story answers cost.
- Review and mistakes sessions are always open, and finishing one refills the gate.
- The app checks the gate when a session opens; the empty-gate screen links to practice.

**Usernames** (`@nabu/core/text` identifier; data in `@nabu/i18n/src/generated`, generated from
Unicode 16's pinned security files with checked SHA-256).
- **Normalization:** input is NFKC first (fullwidth IME input becomes plain letters).
- **Allowed characters:** letters, marks and digits whose Identifier_Status is Allowed, joined by
  single `_` `-` `.`. ZWNJ is allowed only inside Arabic-script words (UAX #31 A1), so کتاب‌خوان
  works.
- **Scripts:** the Moderately Restrictive level of UTS #39 §5.2 applies.
- **Uniqueness:** names must be unique on NFKC_Casefold (full folding: ß is ss) **and** on the
  UTS #39 skeleton, so сору cannot pose as copy.
- **Display names** are free-form NFC with no controls or bidi overrides. Clients render every
  name inside `<bdi>`.

**Leagues** (opt-in per instance, `NABU_LEAGUES=1`).
- **Cohorts:** 10 tiers, cohorts of 30, promotion and demotion zones per tier that narrow
  towards the top.
- **Joining:** a learner joins a cohort of their tier with their first league XP of the week,
  on upload. An advisory lock per (week, tier) fills cohorts in order.
- **League XP** is the game's XP within the week (Monday 00:00 UTC, with a configurable
  offset), counted only for uploads received within 6 hours of the week's end. The plausibility
  limits are:
  - no XP for answers under 800 ms or beyond 30 a minute;
  - none for a session without one plausible answer;
  - at most 400 XP an hour.
- **Standings** are computed from the log, not stored.
- **The rollover** writes each member's final rank and next tier once. The week's
  `league_weeks` row is inserted in the same transaction, so a second run, or two at once,
  changes nothing.

**Reminders** (opt-in per instance, `NABU_PUSH=1`).
- **Delivery:** Web Push with VAPID (RFC 8292) and aes128gcm encryption (RFC 8291), on
  `node:crypto` alone. No push library: the common one is MPL-2.0.
- **Verification:** encryption is checked byte for byte against RFC 8291's example.
- **When:** at the learner's habitual hour (the median local start time of the last four
  weeks), only on a day without practice, and at most once a day.
- **Caps:** after three ignored reminders, every other day; after seven, none until they
  practise.
- **Which:** rotation with novelty decay over the eligible templates (streak, quest, gentle).
- **Copy:** kind, never guilt-tripping, written in the learner's UI locale (pseudo-locales
  included), with the notification's `lang` and `dir`.
- **Client:** a service worker (`sw.js`) shows the notification; a switch on the account panel
  subscribes.

## Consequences

- The app shows the streak, freezes, quests and achievements for the whole device log, and the
  league when the server runs one.
- **Game state and XP:** game state is never stored on the server. Game XP equals the learner
  model's XP plus quest bonuses; tests check that they agree with quests off.
- **API changes:**
  - migration 0002 adds profiles, league tables, push subscriptions and the reminder log;
  - the API stamps receipt time from its own clock, which the grace windows read.
- **Not done:**
  - names are not structured, so CLDR person-name order does not apply yet;
  - a bandit for reminders waits for traffic;
  - Capacitor push is Phase 10.
- **Amended** (2026-11-13, the review's M5 and M8; [ADR 0122](0122-gate-leagues-and-ai-help.md)):
  - the gate: a placement test costs nothing and may start with the gate empty; the learner's
    claims never move it; the app says when lessons open again;
  - leagues: the week after, how the week ended; zones named, not only coloured; league XP follows
    the deployment's game rules; a learner can decline leagues and take part again.
