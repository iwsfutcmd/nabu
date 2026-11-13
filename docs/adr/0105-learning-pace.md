# 0105. The learning pace: Continue, three bands, and a target per learner

- Status: Proposed
- Date: 2026-11-12
- Amends: gameplan §9.4 (the planner), §11.1 (the course page); [0097](0097-review-in-lessons.md) (how much review a lesson brings back)

## Context

Every learner got the same pace (the 2026-11 review's L2). A node opened once the one before it was
finished, however it went. Lessons were 10–14 cards for everyone, and review sessions happened only
if the learner opened them. In 30 simulated days, es learners from weak to strong all finished
exactly 60 lessons and met the same 251 words, and their backlogs only grew: 170–205 words due by
day 30.

`plan()` accepted a retention target, but nothing set it (L11).

The owner decided:

- **D5.** The pace changes automatically, with a visible line saying why and a way to override it.
- **D6.** A backlog never blocks anything. Continue suggests practice first, and "New lesson anyway"
  is always there.

## Decision

**A pace read from the log** (`paceOf`, @nabu/core/learner). It is pure, like the rest of the state.
It has three bands:

- **consolidate:** the last 60 graded first tries were under 78% right, or 30 or more words are
  slipping;
- **accelerate:** those first tries were 90% right or better (a learner this sure can take new
  material and review both);
- **steady:** otherwise, or before 30 graded first tries.

A word is **slipping** when a skill's recall has fallen more than 10 points under the target. A word
just past due is what a lesson's own review takes care of: in a growing vocabulary there are always
some, because a new word's first intervals are a day or two.

The window (`recent` in the fold: graded first tries, self-ratings left out, a revealed answer
counted as a miss) moves slowly, so the band holds from session to session.

The learner may choose a pace instead: Automatic, More practice, Steady or Faster. The choice is kept
per device and course, like a listening break.

**What a band sets** (`PACE`):

| Band | Retention target | Review share of a lesson | Continue practises first at |
| --- | --- | --- | --- |
| consolidate | 0.93 | 35% | 10 slipping words |
| steady | 0.90 | 25% | 20 |
| accelerate | 0.85 | 10% | 60 |

- The **retention target** is what "due" means everywhere: the planner, the course page's count, the
  word list (L11).
- A lesson that runs well under its target success may still give review up to half its cards
  (ADR 0099).

**Continue** (`continueOf`) is the course page's main action. It goes to practice first once enough
words are slipping (or when the path is done and something is due), else to the next lesson or story
on the path. When it suggests practice, "New lesson anyway" sits beside it (D6). A line says why
(D5): how many words are slipping, or that recent answers ran under or over the target, or that the
learner chose the pace.

## Consequences

- **The simulation compares learners who follow Continue with the same learners taking the next
  lesson every time** (test/simulation.test.ts). In es and hbo:
  - A weak, slow learner stays at or above 80% and ends day 30 knowing at least as many words, with
    fewer due.
  - A strong, fast learner does 30 or more lessons (not held back), stays at or under 92% success
    (not drowned in easy review), and knows at least as many words, with fewer due.
  - In measurements across es, fa, uz, hbo and tok, Continue learners did 24–52 lessons in 60
    sessions. They ended day 30 with 33–123 words due, against 168–205 for path learners.
- **The original 19 runs, which follow the path, are unchanged in kind.** The simulator now logs
  self-rated speaking as self-rated, as the player does.
- **Stories and script tracks are not reordered by the pace.** Continue goes to the next node on the
  path, whatever its kind.
- **Not done yet:**
  - offering "test out of the rest of this unit" when accelerating (with L9's seeding of placed words);
  - more or fewer cards per new word by band;
  - keeping the choice in the log, so it would follow the learner across devices.
