# 0125. One lesson builder: lessons are what plan() plans, and tests check the planner

- Status: Proposed
- Date: 2026-11-13
- Amends: [0034](0034-lesson-player.md) (`buildLesson`, the planner's stand-in, is gone, as it
  foresaw), [0046](0046-speech.md) (no rotation slot: the planner's exclusions put scored speaking
  in tier 0's place), [0041](0041-listening-in-the-app.md) and [0071](0071-classical-chinese.md)
  (where they name the lesson builder)
- Amended: below (2026-11-13, the owner's D52: tone cards, from clips a person confirmed)

## Context

The 2026-11 review (C5) found a second lesson builder in `packages/core/src/lesson/build.ts`.
`buildLesson` and its template `ROTATION` were the Phase 3 stand-in for the planner (ADR 0034). The
planner replaced it in the app, but the builder stayed:

- `test/lesson.test.ts` checked dozens of lesson properties on it, for every lesson node of six
  course variants: card ids, grading, options, template coverage, speech tiers, matching pairs and
  pronunciation cards.
- `sampleExercise` took its card from it. Stories, tests and previews use that card.
- The card gallery made its cards its own way, from any sentence or word.
- CLAUDE.md constrained the rotation.

So the tests passed on a path no learner takes. That is how C1 got past CI: lessons never planned
a vowel-mark or Jyutping card, while the builder made 165 to 270 in each course's lessons (three
seeds) and the gallery showed one.

## Decision

**One builder: every session is `plan()`'s.** `buildLesson`, `ROTATION` and `LessonOptions` are
removed. What production used of `build.ts` moves to modules of its own, exported from
`@nabu/core/lesson` as before:

- `lesson/nodes.ts`: `lessonNodes` and `sentencesOf`, the path's lesson nodes and their sentences.
- `lesson/exclusions.ts`: `SpeechSupport`, `speechSupportOf`, and the exclusions of a course's facets
  and voice and of the app's speech support.
- `lesson/candidates.ts`: the planner's enumerator. `candidatesFor` gives every card the templates
  make of some sentences and words. `lessonCandidates` gives a lesson's own: its sentences, and its
  new words (with the unit's words met before, where it brings in fewer than three).

**The gallery and samples show the planner's candidates.** `sampleExercise(course, kind, seed)` is
the first card of that kind the course's lessons make. Lesson by lesson in path order, each makes its
cards as a plan that may use only that kind does: `lessonCandidates`, with the lesson's own rng
seeded alike, for a learner who has met nothing else. Script kinds come from the alphabet nodes'
candidates. The card gallery is each kind's sample. So debug mode, stories and tests show a kind
only where lessons can plan it.

**The tests check what `plan()` plans.** `test/planned.ts` walks a course's path as a learner does:

- each lesson in path order, two a day;
- after every fourth lesson, a review session, and a mistakes session once there are mistakes;
- every card right the first time, but every seventh, which is right the second time.

`test/planned.test.ts` walks every fixture course in each orthography and checks every session:

- every lesson is planned, with more than one card and no card twice; reviews and mistakes too;
  planned again, every tenth session and the last give the same plan;
- each card's own answer grades right and a wrong one wrong; no two options look alike; matching
  pairs show no two words or meanings alike (also the pairs each lesson plans among with seeds 1
  and 11);
- every kind of card is planned in some course, listening included (the builder never made it).
  Stories', script tracks' and the speech the app must support are tested where they come from;
- scored speaking takes tier 0's place only where the app scores it, and never makes a lesson
  longer; speaking can be left out;
- lessons plan vowel-mark cards in fa, apc-Arab and hbo and Jyutping cards in yue, each checked as
  before, and none elsewhere; Toki Pona's lessons plan its char-read cards.

The player, revision, end-of-session and resume tests play a lesson the walk planned. The UI's
end-of-lesson test and the player's Finished story play a lesson `plan()` plans for a new learner.

Two limits keep the walks to about half a minute:

- Cuban Spanish walks its first 85 of 169 lessons (A1 to A2, every kind of card it makes). A plan
  costs more the more the learner has met: its whole walk cost more than all the others' together.
- Each walk plans every tenth session again, not every one, to check that a plan is the same.

## Consequences

- `plan()` is unchanged. The moved planner plans the same 4,071 sessions as before over walks of
  every fixture course, with and without speech support and exclusions, mistakes and placement
  included. The golden files and the simulation test are untouched.
- Samples change their sentence or distractors: 20 of the 23 cards the player, pronunciation and
  persons stories show (all but fa's and apc's complete-translation and yue's transcribe), and the
  Finished story's lesson. Their visual baselines change.
  - The Feedback story types the gap-fill option before the answer, which is marked in one place
    in every target, as the visual matrix checks.
  - The Finished story's lesson, planned for a new learner, has no typed card, so its missed cards
    are a wrong choice and a skip. How the end of a session marks a typed answer is still checked,
    in the DOM (`packages/ui/test/feedback.test.tsx`), but no longer in the pixels. A learner who
    took the first lesson the day before gets a typed card in the second (complete-translation).
- The gallery shows the same kinds in every fixture course; grc gains its matching pairs.
- **A finding: lessons never plan a tone card.** The builder gave yue lessons a `tone-identify` card
  where it could make one. Where the app supports tones, the planner has them among its candidates,
  but never picks one: its p̂ is about 0.5, and nothing reserves it a place as one is reserved for a
  pronunciation card. `test/planned.test.ts` keeps the check as `it.fails`. Making lessons plan
  them changes `plan()`, so it is left to a change of its own.

## Amendment: tone cards, from clips a person confirmed (2026-11-13)

The owner decided (D52) that lessons reserve a tone card a place where they can make one, as they do
a pronunciation card. TTS is not trusted to say a lone syllable's tone, so a tone card may play only
a clip a person confirmed.

**A confirmed clip** is a recording (`nabu audio ingest`, not synthetic), or a synthetic clip a
listener marked right in the audio check (`nabu audio verdicts --reviewer human:<id>`, ADR 0060): one
a human reviewer signed off, reviewed or published. The compiler writes `confirmed: true` on such a
clip in the bundle's audio index (`BundleClip.confirmed`), and nothing on the others. Absent means
not confirmed, so `formatVersion` stays 1 (ADR 0110): the field is optional, and a bundle cached
without it plans no tone card, as before.

**The card.** `makeToneIdentify` makes a tone card only from a confirmed clip of a one-syllable
sentence (its slow take confirmed too, where it has one).

**Its place.** After its selection, `plan()` gives a lesson that can make a tone card one, as it
gives a pronunciation card. It takes an empty place, or the last card no new word depends on, and
never the pronunciation card's. A lesson gets no tone card where:

- the app offers no tones (`speechSupportOf`);
- the course is not heard (its facets, an iffy voice: `courseExclusions`);
- the learner is not listening: a break, or listening turned off for good (D41). Those leave the
  template out, and the planner checks `facetsOff` as well.

**What changed.**
- No yue clip is confirmed yet, so no lesson of the committed courses plans a tone card. The numbers
  drill's synthetic clips no longer make tone cards at all.
- One plan of 4,924 compared changed: yue's numbers drill, planned with scored speech after a walk
  with speech support. Its calibration had picked a tone card from an unconfirmed synthetic clip;
  that place now holds a translate-tap card. Plans without speech support, which the golden files
  and the simulation make, are unchanged.
- In the bundles, es, grc, hbo, lzh, tok and yue build byte for byte as before. apc, fa and uz have
  synthetic clips a listener marked right (82, 37 and 29). Those clips gain `confirmed: true`, and
  their audio index files and manifests change with it, nothing else.
- `test/planned.test.ts` replaces the finding's `it.fails`:
  - a yue view with one confirmed one-syllable clip (係！) plans its tone card in the copula
    lesson, one a lesson at most, and keeps every lesson's length;
  - an unconfirmed clip plans none, and neither do the cases above;
  - nor does the walk over the committed courses.
