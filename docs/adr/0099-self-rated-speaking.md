# 0099. A self-rating is no verdict, and a struggling lesson gets more review

- Status: Proposed
- Date: 2026-11-12
- Amends: [0097](0097-review-in-lessons.md) (how much review), gameplan §9.4 (calibration), §12.3 (the gate)

## Context

Every speaking card is self-rated while device tone scoring is off (ADR 0093): read the sentence
aloud, then say "Sounded right", "Not sure" or "Couldn't say it". The 2026-11 review found two
problems.
- **It was treated as a verdict (P5).**
  - "Sounded right" got "Correct!" though nothing was checked.
  - An honest "Couldn't say it" got the buzzer, a red Continue, a lower score, no perfect bonus,
    and, with hearts on, a lost heart.
  - "Can't speak now" counted the card it skipped, and the speaking cards it dropped, as misses.
  - The model clip played only after rating.
- **The planner used it as filler (L6).** With a very easy prior, a self-rated card lifted a
  session's predicted success, so weaker learners got two of them in most lessons.

## Decision

**A self-rating checks nothing, so it is no verdict.**
- The outcome is `selfRated`.
- The feedback says "Noted", with no verdict icon and no right or wrong sound, and Continue stays
  neutral.
- The rating still goes to scheduling ("Couldn't say it" is Again).
- **The score** counts graded first tries only: self-ratings, cards put off with "Can't speak now" or
  "Can't listen now", and the cards those drop are left out. So two right answers of two shown is
  2 of 2.
- **The gate** never takes a heart for a self-rating, and an energy run neither breaks nor grows on
  one.
- **The speaking card** says its model clip when it opens, keeps the play buttons, and puts the focus
  on Record, so a stray Enter never rates it.

**The planner stops using it as filler.**
- At most one self-rated card a session.
- It neither pulls the session's mean p̂ toward the target nor away: the calibration ignores it.

**What weaker learners get instead.**
- **More review when a lesson runs short.** While the cards chosen so far average more than 10
  points under the target success, review may take up to half of the lesson, not a quarter.
- **Recognition before production.** In the lesson that introduces a word, producing it is worth no
  more than any other new card (gain 0.5, not 1). Production counts once it is shown in a later
  session (D2), so a struggling learner gets recognition practice of new words rather than early,
  failed production.

## Consequences

- **In the recorded fa golden**, the first lesson has one self-rated card instead of two, and it
  scores 7 of 9 graded, not 8 of 10.
- **The 30-day simulation holds every course within ±5 pp of 85%.** Removing the two fillers (this
  one, and unit-1 review, ADR 0097) had pushed the weakest uz and grc learners just under 80%; the
  extra review share and the lower gain for producing new words bring them back honestly.
- **Adaptive pacing (the review's L2)** will replace the shortfall rule with a pace signal over
  sessions, not just the cards of one plan.
