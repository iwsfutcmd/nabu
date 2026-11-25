# 0158. A stricter placement test: typed production only, two probes a lesson, checks on what it skipped

- Status: Proposed
- Date: 2026-11-25
- Amends: [0077](0077-adaptive-placement.md) (its blocks, its node steps and its default of word tiles)
- The owner asked for it (2026-11-25): "I feel like the placement tests are too easy. Simply getting some of the
  easiest cards, like multiple choice, shouldn't be enough to skip a lesson." The owner chose each of the changes
  below among others.

## Context

Every placement block in the twelve fixture courses was two `choose-translation` cards (a multiple choice) and two
production cards, word tiles in every course but es. A block passed with three of four right, so two multiple
choices, which a learner can guess, and one sentence put together from given tiles passed a unit. The search
then counted every unit below the last one passed as known, though it never asked most of them (passing unit 8
places out of units 3 and 5–7 unasked), and inside the unit where it stopped one tile card placed out of each
lesson.

## Decision

- **Every probe is production into the target, typed by default.** A block's four probes are
  `translate-type.l1-l2` (else `complete-translation`, else tiles where typing is ruled out). Recognition probes are
  gone: a learner who can write a sentence can read it, and a multiple choice can be guessed. Only a node that can
  make no production probe is probed by recognition, and then by the l2→l1 word bank, never a multiple choice.
  `placement: {production: tiles}` (course source and manifest) has a course whose learners may lack a keyboard for
  its script ask with word tiles; `typed`, the old opt-in, is now the default (es still states it).
- **Two probes a lesson in the unit where the search stops** (`STEP_SIZE`), both right the first time, each from the
  lesson's own sentences (the block's own probes of the lesson first, so their answers count). A step fails at its
  first miss, so a learner who misses answers one question for it.
- **The search checks what it skipped** (`CHECKS`, `AdaptiveTest.confirm`). Once it has its answer, it asks up to two
  more blocks, each in the middle of the widest run of units below the last one passed that it never asked. A check
  passed changes nothing; a check not passed is the new first unit not passed, and the search bisects again
  between it and the last unit passed below it. This catches ADR 0077's "uneven" learner (passes unit 15, misses
  unit 11) where the gap is wide enough to be checked.
- Passing a block still takes three of four right; the test stays a pure function of its data and the first tries
  (`runTest`), and `later` stays an upper bound (a property test checks it against uneven learners).

## Consequences

- A guess no longer places anyone: every answer that counts is a sentence the learner wrote.
- The test is longer. A learner who knows the first k units, for any k, answers at most 26 questions in fa (eleven
  units; was 20), 24 in uz (was 18), 30 in hbo (twenty; was 24) and 36 in apc (thirty; was 30). The most it can ask,
  which its introduction states ("… at most, and often far fewer"), is a sound worst case that adds every check and
  re-search together: 68 in fa (was 38), 86 in apc (was 47). A tighter bound would search the outcomes; not done.
- Typing needs a keyboard for the script: an Arabic, Hebrew, Han or sitelen pona learner without one has to set one
  up before placing, or the course must ask for tiles. No fixture course does yet.
- Two checks are not a proof: a narrow gap the checks do not reach still counts as known. The planner's reviews and
  any done unit opened to practise remain what catches those (ADR 0077).
