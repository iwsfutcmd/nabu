# 0103. Reminders come after the usual window

- Status: Proposed
- Date: 2026-11-12
- Amends: [0044](0044-gamification-and-notifications.md) (when reminders come, the caps), gameplan §12.6 ("the median of their recent session start times")

## Context

Reminders went out at the median local start time of the learner's sessions in the last four
weeks (ADR 0044). The 2026-11 review found (M9):
- **They came just before practice.** On about half the days the learner practises anyway, the
  median comes before they begin. The reminder lands just before practice that was going to
  happen, and the day counts as answered, so the back-off never starts for the learners it is
  meant for.
- **They stopped for good.** After seven unanswered reminders none were sent, and practising
  again never lifted that: ADR 0044 says "none until they practise".
- **The quest count was the defaults'.** Reminders replayed the log with `DEFAULT_GAME`, not the
  deployment's `game.json`.

## Decision

**When: after the learner's usual window.**
- The window ends at the 80th percentile (nearest rank) of the local start times of their sessions
  in the last four weeks, each in its own zone. By then four practice days in five have begun.
- The reminder may go 30 minutes later: time for a session begun at the end of the window to
  finish and sync.
- Before there are any sessions, 19:00. Never after 23:30: past midnight it would never come.
- As before: only on a day without practice so far, at most once a day, in the zone of the
  learner's latest event.
- The 75th percentile was the other candidate. The 80th leaves a fifth of practice days later
  than the window rather than a quarter, for a reminder a few minutes later.

**Answered: practice after the reminder, that day.**
- A reminder is answered when the learner completes a session begun after it was sent, on the
  day it was sent. Practice before it (offline, synced later) was going to happen anyway.
- `push_log.sent_at` is written from the jobs' clock, not the database's.
- **Caps:** after three unanswered in a row, every other day at most (unchanged).
- After seven, none until the learner practises again: a session begun after the last reminder
  lifts the stop. While the run of unanswered reminders stands, every other day still applies;
  an answered reminder ends it.

**The deployment's rules.** Reminders replay the log with the instance's game rules (`NABU_GAME`,
the `game.json` its web app is deployed with), as `/v1/game` and the export do. The streak and
the quests a reminder speaks of are the ones the learner sees.

## Consequences

- A learner who usually begins between 18:00 and 19:00 hears at about 19:20, not at 18:30.
- Everyone with a habit hears later than before: by the spread of their start times, plus half an
  hour.
- Learners who practise before the reminder, offline, now count it unanswered. Their reminders
  thin out to every other day and stop after seven, until they practise again.
- **Not done:**
  - a reminder still opens Home, not the course the learner was in (the review's S1);
  - reminders need an account and a server: the native apps do not schedule them on the device.
