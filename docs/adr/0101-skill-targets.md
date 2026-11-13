# 0101. Sessions aim at the skills words lack

- Status: Proposed
- Date: 2026-11-12
- Amends: gameplan §9.4 (the planner), [0097](0097-review-in-lessons.md) (what review brings back),
  [0099](0099-self-rated-speaking.md)

## Context

Most words were never asked for in production, and almost none by ear (the 2026-11 review's L5).
The planner had no goal per word. Its calibration aims each session's mean predicted success at
85%, which easy recognition cards meet, and typing is the hardest card.

Making gap-fill recognition ([ADR 0100](0100-known-words.md)) showed how far this had gone. Typed
answers in 30 simulated days, es / fa / uz:

| Version | es | fa | uz |
| --- | --- | --- | --- |
| main | 72 | 63 | 42 |
| after ADRs 0097 and 0099 | 31 | 3 | 22 |
| gap-fill as recognition | 0 | 0 | 0 |

Gap-fill, counted as production, had been what started production cards. Typing a word with no
production card predicts about 0.4, so the calibration never chose it. The simulation test checked
only the success rate, so it passed.

## Decision

**Needs.** A word met before today that has yet to show a skill the course asks of it (ADR 0100), and
hasn't missed that skill today, *needs* it.
- `PlanOptions.today` is the learner's local date, as events stamp it. The web app passes
  `localDate(now)`; the date of `now` is the default.
- A card is worth `NEED_GAIN` (0.5) more for each needed skill it exercises, once a session.
- Review sentences (ADR 0097) weigh needed skills the same way, beside due cards.

**Skill cards, spread through each session.** Once a lesson's new words are presented, the planner
places cards that have a word show a skill it lacks: typing (`produce`) and hearing (`listen`).
- **How many.** A skill whose cards predict at least `SKILL_EASY` (0.65) for this learner gets a
  share of the session: 20% for typing, 15% for listening. A skill they find harder gets one.
- **When.** Each comes in only where the session can still reach the target success with it: the
  cards chosen, the gentlest such card, and the easiest of the rest. A session the rest can't balance
  gets fewer, so a learner who struggles isn't pushed into typing yet.
- **Within the hard rules.** These cards never break the hard constraints: new words are presented
  first, and the pronunciation card never replaces one of them.

**Blanks aim at the words that need typing.** `MakeContext.focus` lists them, and `complete-translation`
and `gap-fill` blank one of them before a word the lesson introduces.

**Earlier words come back where they are needed.**
- An earlier word that needs hearing brings its own clip back (`listen-select`, `minimal-pair`) as
  review: the gentlest way to show it.
- Each lesson is offered the three earlier sentences whose words the learner recognizes best, as
  review. Their cards gain little, so the calibration picks them only to bring a lesson that runs
  hard back toward its target. That is the repetition a struggling learner needs, and the room for
  skill cards.

**Credit is what the card asks.** Predictions, gains and the fold's performance model use the recall
of what an answer is credited to: a blank's word, not the sentence around it.

**The simulation test checks production too.** Every run types at least five times, and some word
shows it can be written.

## Consequences

- **Typed answers in 30 simulated days are back, and above main:** 10 to 195 a run. The weakest are
  grc and hbo at θ=1 (10 and 21); lzh and tok reach 195. Success stays within ±5 pp of 85%
  (80.9–89.2%).
- **Weaker learners keep their success.** Over six seeds each, uz at θ=1 averages 83.2% (83.6% before
  this) and hbo at θ=1 83.4% (82.8%), while typing 26–38 times a month instead of 2–6.
- **The fa golden review plan** has a listening card for a word that lacked it, in place of a vowel-mark
  card.
- **Adaptive pacing (L2) should build on this.** When a learner's skill cards stay unaffordable, new
  material should slow until their sessions run near the target, so typing and hearing can come in.
