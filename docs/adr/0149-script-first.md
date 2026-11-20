# 0149. Script first, by orthography

- Status: Proposed
- Date: 2026-11-19
- Revised: 2026-11-20, after the review and the owner's round 5 (what changed is listed at the end)
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
fa, hbo, apc's Arabic, es, tok's Latin and yue's Jyutping have none.

## Decision

- **The path in a sound-writing orthography opens once that orthography's script track is done or tested out
  of:** its lessons, stories, passages (ADR 0144) and practice. The owner: a learner who won't learn a script
  takes the course in another orthography, not a way round it.
- **Sound-writing means signs that stand for sounds:** an alphabet, an abjad (fa, hbo, apc, chg), a
  syllabary. **A logography never gates:** Chinese characters and sitelen pona are learned with their words.
  A mixed script, when one arrives, gates its sound signs only.
- **By orthography, not by course.** An apc learner who picks Arabizi passes Arabizi's short track (7, 3, 2)
  and meets the Arabic track only for Arabic-script cards; yue's Jyutping gates, its characters don't; uz's
  Latin and Cyrillic each gate their own cards.
- **A reading scheme a learner types gates its typed cards the same way:** Jyutping under yue's characters,
  lzh's typed traditions, tok's Latin typed for sitelen pona.
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
- **"Script" means the orthography's rules, not only its letters.** A Latin-script course still has one where
  its spelling isn't the learner's: es's track teaches Spanish spelling (c, qu, g and gu, h, ll and y, ñ, the
  accent rules), the real gap for heritage speakers; tok's is a minute long.
- **Not decided here: what a track asks where the orthography is itself Latin** (es, tok, Arabizi, Jyutping,
  uz's Latin). The four script templates ask a reading in Latin (ADR 0133) and have nothing to ask there.
  Spanish spelling is asked from sound to spelling, a dictation card that doesn't exist yet: an ADR of its
  own, before the gate turns on.
- **What script first removes is the letters, not the leftovers.** An abjad's vowels and fa's sound-alike
  letters are still learned word by word (ADR 0148).
- **Not a pace rule.** ADR 0105's "never block a lesson" is about pace; this is a prerequisite with a way
  through, as placement already is.

## Consequences

- **The gate turns on only when every sound-writing orthography of the fixture courses has a track and a
  test-out:** fa, hbo, apc (Arabic and Arabizi), uz (Latin and Cyrillic: its convert node runs at last), es,
  tok's Latin, yue's Jyutping, beside grc and chg. Never one course at a time. The Latin ones wait on the
  card named above.
- **The course page leads with the script row,** and the path shows the gate and the test-out.
- **Simulation and e2e:** sessions start after the track or its test-out; the e2e solver tests out.
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

**Proposed with this revision, not yet the owner's:**
1. The line is sound-writing against logography, not "alphabetic" (the list already had four abjads); a
   mixed script gates its sound signs.
2. A typed reading scheme gates its typed cards.
3. The test-out marks the track's nodes done and seeds nothing, which follows from the ruling.
4. A learner with a graded answer in an orthography from before its gate is past it.
5. The whole path waits, not only "a unit's cards": stories, passages and practice too.
6. Reopening is an offer, and its threshold a constant tuned on logs.
7. Named as not decided: what a Latin track asks. It needs a dictation card and an ADR, and the gate can't
   turn on without it.
