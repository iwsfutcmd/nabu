# 0113. The end of a session shows what was learned, and a claim counts at once in its session

- Status: Proposed
- Date: 2026-11-12
- Amends: [0052](0052-learner-claims.md) (a claim within the session it was made in)

## Context

The 2026-11 review found the end of a session showed points, not learning or progress (P9), and that an
answer "counted as right" still counted as wrong in the session it was claimed in (P14).

- **The end screen.** After a lesson, a review, a mistakes session or a story it said what ended (titles
  per kind came with S15), "N of M right the first time", "+X XP" and Continue. Nothing about:
  - the cards missed, or the words the lesson taught;
  - the streak, the week's practice days against the goal (ADR 0107), quests, achievements, or a unit
    finished;
  - where to go next.

  The XP was the loudest thing on it, though ADR 0107 put practice over points. Placement already says
  where it placed (S5, ADR 0108).
- **A claim during feedback.** "My answer should have been accepted" (ADR 0052), or the judge's accept,
  revised the answer in the log and in every projection, but not in the session being played:
  - Continue stayed red;
  - the card came back as a retry;
  - the session's summary (and so its perfect bonus) counted it wrong.

  ADR 0052 accepted this because "the player has already scheduled any retry", but the player queues the
  retry on Continue, after the claim.

## Decision

**A revision counts at once in its session** (amends ADR 0052).

- **`revise`.** The core player takes a pure `revise` event (the answer's exercise id and a verdict). The
  app sends it after a claim (CORRECT for "should have been accepted" and "I said it right", WRONG for
  "should have been wrong") and after the judge's accept (its verdict), as `revisionVerdict` gives them.
- **In the answer's feedback** (the claim's place), the answer counts that verdict:
  - Continue's colour, and whether the card comes back;
  - the progress bar and the score.

  The feedback itself keeps the grading: its headline, the solution and the marked answer stay as graded.
- **After Continue** (the judge can answer late), the result is revised:
  - a retry not shown yet is taken back (or, for a revision to wrong, one is added);
  - a card on screen stays;
  - an adaptive test asks on as it was, but its first tries, and so where it places, take the revision.
- **Stories** pass the event to the question being asked; a question answered before is revised in the
  story's results, which its score counts. A finished session is not revised: its summary is logged.
- **The shell's own count.** The player says so (`answer_revised`, no learner event of its own), so the
  shell's count of first tries, from which a placement test places, agrees.
- **A session picked up after a reload** (ADR 0108) agrees:
  - `doneOf` gives each answer the verdict its latest revision gives (`answer_reported` or
    `outcome_revised`, latest by device time, then id, as the projections take them);
  - `resume` revises it in its feedback, unless the log shows the card asked again (the revision came
    late), and then as that later attempt opens, which changes the score and nothing that was asked.

**The end of a session shows what was learned before the points** (one component for the lesson player
and the story reader):

1. **What ended, and the score.** The title by kind (lesson, review, mistakes, placement, story) and the
   score, as before. A placement test's result takes their place (S5).
2. **New words.** A lesson's new words (its `introduces`, in the order its cards showed them; letters are
   no words), each with its meaning and its clip behind a play button. None for a lesson done before.
3. **Missed the first time.** Each card the score counts wrong, in the order asked:
   - what it asked, where that was text other than its answer (`promptOf`), and the right answer;
   - the learner's answer, the parts that differ marked as its feedback marked them, or "You skipped this
     one".

   The player keeps each answer's response for this (`SessionResult.response`). A session picked up after
   a reload knows only the typed answers from before it, since the log keeps no choice or tile order. A
   card claimed right is not listed. A placement test lists none: it asks ahead of the path on purpose.
4. **Your progress.** The learner model and the game state with the session against without it (the log
   less the session's events), worked out once the session ends:
   - words that became known in the session (ADR 0100), and how many are known in all;
   - a unit finished;
   - the streak, where the session made today a practice day;
   - the week's practice days against the goal, and "Goal met" where the session met it;
   - quests completed and achievements unlocked;
   - then the XP, the game's (quests included).

   Nothing is kept beside the log, and a session picked up after a reload counts whole.
5. **The next step.** What the course page's Continue offers (`continueOf`, ADR 0105):
   - the next lesson or story ("Next: Lesson 4");
   - or practice first, with why and "New lesson anyway" (D6).

   "Back to the course" stays beside it. With nothing to go on to, Continue goes back, as before.

Nothing on it plays by itself (P6, D18): the words' clips play when their buttons are pressed, whatever
the sound setting or a listening break. The next step takes the focus without scrolling to it, described
by the title and the score, and the screen shows its title: a screen reader hears what ended first, and
Enter takes the next step (where Continue went back to the course before).

## Consequences

- A learner told "Counted as right" sees Continue agree. The card does not come back, the score and the
  perfect bonus count it, and a reload changes nothing. One who says "This should have been wrong" gets
  the card again at the end, as after any miss; the progress bar steps back to say so.
- The session's logged summary counts revisions made before it ended. A judge's accept that arrives after
  the end revises the projections (ADR 0052) but not that summary.
- A late revision during a placement test changes where it places, not what it asked. A reload after
  one may find the log no longer fits the plan, and then starts the test afresh (ADR 0108).
- The end screen is longer: learning first, the points last and smaller. It is in the visual matrix
  (`player-lesson-player--finished`).
- The app's XP at the end comes from the same before-and-after, so the earlier per-session XP plumbing
  (the XP before the session, counted again for a resumed one) is gone.
- **Not done:**
  - a mistakes session started from the end screen (the course page offers it);
  - known words gained in a placement test (seeded words become known only on a later day);
  - claims from the end screen itself.
