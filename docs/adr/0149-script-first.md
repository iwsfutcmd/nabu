# 0149. Script first, by orthography

- Status: Accepted (2026-11-20)
- Date: 2026-11-19
- Revised: 2026-11-20, after the review and the owner's rounds 5 and 6 (what changed is listed at the end)
- Amends: [ADR 0088](0088-script-tracks.md) (the script row never gates the path; placement does not touch
  it; script cards in review, "not yet"), [ADR 0133](0133-script-tracks-ask-the-reading.md), [ADR
  0077](0077-adaptive-placement.md) and [ADR 0111](0111-placement-seeds-words.md) (a placement over a script
  track, which seeds nothing)
- Builds on: [ADR 0146](0146-what-is-learned.md) (a word's parts are what no rule gives), [ADR
  0148](0148-projections-and-misses.md) (a letter's correspondence is a rule; what a script leaves over is
  learned word by word)

## Context

ADR 0146 counts a word's spelling and reading as learned without waiting on its letters: it assumes the
learner reads the script. ADR 0088 put the alphabet row above the units and let it gate nothing, so the
assumption can be false. Today only grc and chg have alphabet tracks; apc's and uz's convert nodes don't run;
fa, hbo, apc's Arabic and uz's Cyrillic have none.

## Decision

- **The path in a gated orthography opens once that orthography's script track is done or tested out of:**
  its lessons, stories, passages (ADR 0144) and practice. The owner: a learner who won't learn a script takes
  the course in another orthography, not a way round it.
- **Gated: a sound-writing orthography in a script the learner can't read.** Sound-writing means signs that
  stand for sounds: an alphabet (grc, uz's Cyrillic), an abjad (fa, hbo, apc's Arabic, chg), a syllabary.
  **A logography never gates:** Chinese characters and sitelen pona are learned with their words. A mixed
  script, when one arrives, gates its sound signs only.
- **Latin orthographies don't gate** (the owner, round 6). The gate is for a script a learner can't read, and
  every course is taught to readers of Latin. es, tok's Latin, apc's Arabizi, yue's Jyutping and uz's Latin
  open at once.
  - What a Latin orthography's spelling asks is taught inside the course, as rules and leftovers (ADR 0148):
    Spanish's c and qu, g and gu, h, ll and y, ñ and the accents; Arabizi's 7, 3 and 2.
  - This takes back part of round 2: "script" means letters again, not an orthography's rules.
  - A Latin orthography may still have a script row (Arabizi's three digits). It gates nothing, as ADR 0088
    had it.
  - A course taught to readers of another script reopens the question for that script. None is.
- **By orthography, not by course.** An apc learner who picks Arabizi starts at once, and meets the Arabic
  track only for Arabic-script cards; uz's Latin opens at once, its Cyrillic gates its own cards.
- **A reading typed in Latin gates nothing either** (the owner, round 6): Jyutping under yue's characters,
  lzh's typed traditions, tok's Latin typed for sitelen pona. A typed reading stays behind its choice card,
  as today (ADR 0131, 0138).
- **A test-out is always offered,** so a learner who reads the script is never held: a short placement over
  the track's letters and words, folded as a placement is (ADR 0039, 0077), which marks the track's nodes
  done. It seeds no cards: after the gate a letter has no memory to seed.
- **A learner already past the letters is not sent back:** one with a graded answer in an orthography from
  before its gate turned on is past it. The fold reads that from the log.
- **After the gate, letters are assumed, and watched** (the owner, round 5). No letter has a schedule, and no
  script card comes back in review (ADR 0088's "not yet" becomes "no"). The fold counts the misses labelled
  against each correspondence (ADR 0148), and when one keeps coming back the app offers that part of the
  track again: an offer, never a second gate. How many misses, over how long, is a constant tuned on real
  logs, never on the simulator.
- **What script first removes is the letters, not the leftovers.** An abjad's vowels and fa's sound-alike
  letters are still learned word by word (ADR 0148).
- **Not a pace rule.** ADR 0105's "never block a lesson" is about pace; this is a prerequisite with a way
  through, as placement already is.

## Consequences

- **The gate turns on only when every gated orthography of the fixture courses has a track and a
  test-out:** fa, hbo, apc's Arabic and uz's Cyrillic (its convert node runs at last), beside grc and chg.
  Never one course at a time.
- **No Latin track is owed.** The dictation card the first draft waited on is not needed for the gate. es
  teaches its spelling in its units.
- **The course page leads with the script row** where the orthography is gated, and the path shows the gate
  and the test-out.
- **Simulation and e2e:** in a gated orthography sessions start after the track or its test-out; the e2e
  solver tests out.
- **The fold keeps no letter edges on words and no memory per letter,** only a count of misses per
  correspondence.
- **The cost,** weighed in the notes and accepted with strict script first: an hour or more of letters
  before the first sentence in a script like Arabic's, where many apps interleave; and a heritage speaker who
  wants to start by ear has only another orthography to start in (Arabizi, for apc).

## Revision (2026-11-20): the review and round 5

After [the review](../review-adr-0145-0151.md) (findings 10, 11, 17; C13) and the owner's fifth round of
answers ([lexemes.md](../lexemes.md) §16).

**Decided by the owner in round 5:** letters after the gate are assumed, and watched. No schedule per letter;
the fold counts labelled misses per correspondence; one that keeps coming back reopens that part of the
track.

**Restored from the notes:** the cost of strict script first.

## Round 6 (2026-11-20): accepted

The owner's sixth round ([lexemes.md](../lexemes.md) §16) ruled on what the revision had proposed, and
accepted the ADR.

**Decided against the draft:**
- **Latin orthographies don't gate.** The draft left open what a Latin track asks and made the gate wait on a
  dictation card. The owner: the gate is for scripts a learner can't read; Spanish spelling is taught inside
  the course.
- **A reading typed in Latin gates nothing.** The draft's proposal 2 (a typed reading scheme gates its typed
  cards) is struck.

**Accepted as drafted:**
1. The line is sound-writing against logography, not "alphabetic" (the list already had four abjads); a
   mixed script gates its sound signs.
2. The test-out marks the track's nodes done and seeds nothing.
3. A learner with a graded answer in an orthography from before its gate is past it.
4. The whole path waits, not only "a unit's cards": stories, passages and practice too.
5. Reopening is an offer, and its threshold a constant tuned on logs.
