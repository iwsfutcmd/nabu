# 0122. The gate spares placement and claims and says when it opens; leagues say how the week ended and can be declined; AI help says it is a model's and stays

- Status: Proposed
- Date: 2026-11-13
- Amends: [0044](0044-gamification-and-notifications.md) (the gate, leagues), [0052](0052-learner-claims.md) (what a claim moves), [0045](0045-ai-services.md) (the judge and explanations in the app)

## Context

The 2026-11 review found three things in the game and the AI help that only show where an
instance turns them on (M5, M8, M10).

- **The gate punished the wrong people (M5).** With hearts or energy on:
  - placement answers cost, though ADR 0044 says only lesson and story answers do: five misses in
    a placement test left no hearts, the next five hours away;
  - "My answer should have been accepted" gave the heart back, so a false claim paid (and became
    a public report);
  - the empty-gate screen said "come back a little later", though the game state knew when.

  Self-ratings no longer cost a heart (ADR 0099).
- **Leagues said nothing of how a week ended, and could not be declined (M8).** The tier number
  just changed; the zones were a coloured edge, and each row's aria-label hid its rank, name and
  XP from screen readers; every signed-in learner with XP was placed in a league, with no way out;
  league XP used the default game rules, not the deployment's.
- **AI help was easy to lose, and the judge's verdict was not labelled (M10).** "On second look,
  your answer is accepted" did not say a model decided; when the judge answered after Continue,
  the change happened silently; an explanation vanished on Continue and could not be reopened.

## Decision

**The gate** (`replayGame`, `canStart`; still off unless `game.json` sets it):
- Only a lesson's or a story's answers cost. A placement test's never do, and a placement test may
  start with the gate empty, as practice may. An answer whose session the log does not name costs
  nothing.
- The gate counts an answer as graded, or as the server revised it (the judge's accept, a
  reviewer's), never as the learner claimed. A claim neither gives a heart back nor takes one. In
  every other projection it counts at once, as ADR 0052 says (XP, cards, mistakes, leagues).
- `GateState.opensAt`: when a lesson or story may start again, if one may not now. `canStart` takes
  an optional `now`, so a game state worked out a while ago opens on time.
- The app says it: the empty-gate screen says the gate is empty and when the next lesson may start,
  and that practice refills it where it does; once the time comes, with the page still open, it
  offers to start. Home says when the next heart or energy comes back. The end of a session that
  leaves lessons closed says so, with the time, and its next step is practice, with no lesson
  beside it.

**Leagues:**
- **How last week ended.** `GET /v1/league` adds `last`: the previous league week's tier, place,
  cohort size, XP and outcome, and the tier it led to, once rolled over. The panel says "Last week:
  place 3 of 12. You moved up to tier 2."
- **Named zones.** The standings are grouped by outcome, each zone that moves headed "Promotion
  zone" or "Demotion zone", the ranks running on through the groups (`<ol start>`). The coloured
  edge stays; the per-row aria-label goes.
- **Declining.** `PUT /v1/league {optedOut}`: a learner says no to leagues, or takes part again; it
  is the account's. Saying no takes them out of every week not rolled over yet, so they leave the
  standings at once, and they join no cohort until they take part again, which puts them back in
  this week's league if they have its XP. Results already written stay theirs. Standings and the
  rollover leave out anyone who has said no since joining. The panel says what others see of them
  ("your name and your XP for the week"), or that no one sees either.
- **Account data.** The choice is a row in `league_opt_outs` (migration 0009, appended): in `GET
  /v1/export` (`leagues.optedOut`, when, or null), and gone with the user row on `DELETE
  /v1/account`.
- **The deployment's XP.** League XP follows `NABU_GAME`, as `/v1/game`, the export and reminders
  do.
- **Cohorts stay across courses.** Cohorts per course were considered: typing-heavy courses (yue,
  lzh) probably earn less XP a minute. They would split a small instance's learners into tiny
  cohorts and put a learner of several courses in several leagues at once. Decide it on real
  logs: XP per active minute by course.

**AI help:**
- **The judge's accept says a model decided**, that it can be wrong, and that a reviewer will look
  at it too (`ai.judge.accepted.model`, a new key: the meaning changed). The model's name stays in
  the revision's provenance (`judge.model`), the review queue and the export, not in the sentence.
- **The session keeps its AI help** (`useSessionHelp`): the explanations the learner asked for, by
  answer, and the exercises whose answers the judge accepted, also after Continue.
- **The end of a lesson shows it** (`SessionEnd`'s `missedExtra` and `accepted`):
  - under a card missed the first time, its explanation as it was, rating included, or "Explain my
    answer" (the server answers one asked for before from its cache, at no cost to the budget);
  - "Accepted on a second check": each answer the judge accepted, with the card and the learner's
    answer, said to be a model's.

  Nothing outlives the session on the device: a session picked up after a reload asks again, from
  the cache.

## Consequences

- With the gate on, a beginner can take the placement test, and a claim earns nothing on the gate;
  the learner is told when lessons open, before and after a session.
- A game state worked out a while ago opens on time: the app checks `opensAt` against the clock.
  Practice, the other way to refill the gate, is a recorded session, after which the app works the
  state out again.
- A league can be declined and rejoined any time; leaving mid-week drops this week's standing,
  rejoining brings back the week's XP, since standings come from the log.
- `league_opt_outs` is a new table that names a learner: export and delete cover it (CLAUDE.md,
  Account data notes).
- The draft UI catalogs lose `ai.judge.accepted`; they show the English of
  `ai.judge.accepted.model` until translated.
- Not done here:
  - a learner who joins a week before the previous week has rolled over (the six hours' grace)
    joins at their old tier;
  - "Explain my answer" is offered for answers built from tiles, but the server explains typed
    text only (`input.raw`) and refuses them;
  - a second check queued offline is made on a later sync, outside any session: its accept still
    lands without a word.
