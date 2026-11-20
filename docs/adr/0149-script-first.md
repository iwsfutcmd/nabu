# 0149. Script first, by orthography

- Status: Proposed
- Date: 2026-11-19
- Amends: [ADR 0088](0088-script-tracks.md) (the script row never gates the path; placement does not touch
  it), [ADR 0133](0133-script-tracks-ask-the-reading.md), [ADR 0077](0077-adaptive-placement.md) and [ADR
  0111](0111-placement-seeds-words.md) (a placement over a script track, and what it leaves behind)
- Builds on: [ADR 0146](0146-what-is-learned.md) (a word's parts are what no rule gives), [ADR
  0148](0148-projections-and-misses.md) (a letter's correspondence is a rule; what a script leaves over is
  learned word by word)

## Context

ADR 0146 counts a word's spelling and reading as learned without waiting on its letters: it assumes the
learner reads the script. ADR 0088 put the alphabet row above the units and let it gate nothing, so the
assumption can be false. Today only grc and chg have alphabet tracks; apc's and uz's convert nodes don't run;
fa, hbo, apc's Arabic, es, tok's Latin and yue's Jyutping have none.

## Decision

- **A unit's cards in an alphabetic orthography open once that orthography's script track is done or tested
  out of.** The owner: a learner who won't learn a script takes the course in another orthography, not a way
  round it.
- **By orthography, not by course.** An apc learner who picks Arabizi passes Arabizi's short track (7, 3, 2)
  and meets the Arabic track only for Arabic-script cards; yue's Jyutping gates, its characters don't; uz's
  Latin and Cyrillic each gate their own cards.
- **Logographies never gate:** Chinese characters and sitelen pona are learned with their words.
- **A test-out is always offered,** so a learner who reads the script is never held: a short placement over
  the track's letters and words, folded like any placement (ADR 0039), seeding the grapheme KCs it shows (as
  ADR 0111 seeds a placed unit's words).
- **"Script" means the orthography's rules, not only its letters.** A Latin-script course still has one where
  its spelling isn't the learner's: es's track teaches Spanish spelling (c, qu, g and gu, h, ll and y, ñ, the
  accent rules), the real gap for heritage speakers; tok's is a minute long.
- **What script first removes is the letters, not the leftovers.** An abjad's vowels and fa's sound-alike
  letters are still learned word by word (ADR 0148).
- **Not a pace rule.** ADR 0105's "never block a lesson" is about pace; this is a prerequisite with a way
  through, as placement already is.

## Consequences

- **The gate turns on only when every alphabetic orthography of the fixture courses has a track and a
  test-out:** fa, hbo, apc (Arabic and Arabizi), uz (Latin and Cyrillic: its convert node runs at last), es,
  tok's Latin, yue's Jyutping, beside grc and chg. Never one course at a time.
- **The course page leads with the script row,** and the path shows the gate and the test-out.
- **Simulation and e2e:** sessions start after the track or its test-out; the e2e solver tests out.
- **The fold needs no letter edges on words:** a learner past the gate has the letters.
