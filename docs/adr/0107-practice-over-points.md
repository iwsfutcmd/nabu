# 0107. XP for practice, quests the learner can do, and a Home that starts with the courses

- Status: Proposed
- Date: 2026-11-12
- Amends: [0044](0044-gamification-and-notifications.md) (the XP rules), gameplan §12

## Context

The 2026-11 review measured the game rules of [ADR 0044](0044-gamification-and-notifications.md)
on replayed logs (M1, M3, M4):
- **XP paid most for the shortest sessions and for replays.** Every finished session paid 10 XP and
  every perfect one 5 more, whatever its length: a 14-card lesson paid 29 XP (2.1 a card), a 5-card
  review 20 (4.0), a 1-card mistakes session 16. A finished lesson replayed paid in full again.
  Leagues use the same rule, so back-to-back mini-sessions won within the 400 XP an hour cap.
- **The XP on screen was not the game's.** The course page and the end of a session showed the
  learner model's XP (`LearnerState`, fixed constants), so a deployment's `game.json` and quest XP
  never showed.

The owner's line: learning over points. XP should follow practice, and stay simple to explain.

## Decision

**XP follows practice** (`DEFAULT_GAME.xp`, `xpRule`):
- a right answer: 1 (unchanged);
- a finished session: a point a card, up to 10 (`xp.session`);
- a perfect session (every card right the first time): 5 more, only from 5 cards (`xp.perfectFrom`);
- a lesson or story finished before pays for its answers only. "Before" is the course's own record
  of done nodes (`replaysOf`): an earlier finish or a placement test, since the learner last started
  the course over (`progress_reset`), as the learner model's path marks them;
- a daily quest: 10 (unchanged).

So a 14-card lesson pays 29 XP if perfect (2.1 a card), a perfect 5-card review 15 (3.0), a 1-card
mistakes session 2, and a replayed 14-card lesson 14.

**One XP for display.** The course page (total and today's) and the end of a session show the game
state's XP: the deployment's rules, quests included, every course together. The learner model's XP
stays as ADR 0044 has it: it pays the same with the default rules, and equals the game's with quests
off (a property test over random logs with replays and starts over).

**Leagues** count the same rule. To know a replay, league XP reads the learner's earlier finished
sessions and starts over too (they earn nothing in the week).

## Consequences

- The shortest sessions no longer pay most: a 1-card session pays 2 XP, not 16. A session pays about
  two XP a card up to ten cards and one beyond, plus the perfect bonus from five cards (a perfect
  5-card review: 3 a card, a perfect 14-card lesson: 2.1). Review and mistakes sessions still pay;
  they are practice.
- Replaying a lesson is still worth doing, and still pays for every right answer, but no session
  bonus: a review session is the way to practise what a lesson taught.
- Learners see less XP than before for the same practice (a 5-card review: 15, was 20). Logs replay
  to the new totals, the week's league standings included; nothing stored changes.
- **Not done:**
  - XP for a word met the first time, or for a review that was due (the review's other two ideas):
    "due" needs the learner model's memory, which the game projection (and the server's league)
    does not replay. The session's points per card already favour practice over taps.
  - A lesson replayed long after it was learned pays like one replayed the same day.
