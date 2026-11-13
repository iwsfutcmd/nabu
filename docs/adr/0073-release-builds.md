# 0073. Release builds: only what a reviewer signed off

- Status: Proposed
- Date: 2026-11-06
- Amends: [0072](0072-sign-off.md)
- Amended: below (2026-11-13, the owner's D51: script tracks stay in a release)

## Context

Phase 13 asks that a release build of a course leave out unreviewed items, while the demo keeps
showing drafts, labelled as drafts. Sign-off (ADR 0072) now marks items reviewed in the source,
but every build still shipped everything, and nothing in the app said a course was an unchecked
draft.

## Decision

**`nabu build <course> --release`** writes a release bundle. The full build stays the default:
the committed bundles, the demo and Storybook keep drafts, because drafts are what reviewers read.

A release (pipeline/src/nabu/compiler/release.py) keeps the sentences, stories and roleplay
scenarios whose provenance is `reviewed` or `published`. Generated drills are reviewed by
construction. Then:
- **Nodes:**
  - A lesson or script node keeps its reviewed sentences, and goes when none is left.
  - A story node goes with its story.
  - A practice node stays while its unit keeps a lesson.
  - A scenario stays while the lesson or story node it follows does, in whichever unit.
- **Units:** a unit with no node left goes. With no unit left, the build fails ("nothing reviewed
  yet").
- **Media:** only the clips of what is kept (sentences, story lines, the words of kept units) and
  the images of kept units' words.
- **The manifest** says `release: true` (schemas/bundle.schema.json). Its license and provenance
  summary counts only what ships. The compiler records what each count is for
  (compiler/counts.py), so a release recounts instead of guessing.
- **The report:** the command prints how many sentences, stories, scenarios and units it kept and
  left out.

**Words (KCs) stay with their unit.** They have no provenance of their own yet (ADR 0072), and
the sentences and stories that teach them are what a reviewer signs off.

**The demo labels drafts.** A course's page shows how many of its sentences (story lines included)
no native speaker has signed off: `draftCount` (@nabu/core/corrections), message
`app.course.drafts`. A release build has none, so the note never shows there.

## Consequences

- **Releases grow as review does:** signing off a unit's sentences in the sentence list, then
  `nabu review apply` and `nabu build --release`, ships that unit.
- **Planner and lesson code are unchanged.** A release is an ordinary bundle with fewer items, and
  ADR 0050 keeps distractors within a unit and the ones before it. A unit that loses sentences
  teaches fewer KCs in its lessons, but its KCs stay: they are the unit's word list.
- **Bundles are unchanged** for full builds: the counting refactor leaves them byte-identical.

## Amendment: script tracks stay in a release (2026-11-13)

An alphabet node (ADR 0088) has no sentences, so it went like a lesson with none reviewed, and
every release left out grc's Greek alphabet. The owner decided (D51) that a release keeps its
script tracks:

- **An alphabet node stays, with its letters and their grapheme KCs.** Its letters come from the
  orthography's profile (ADR 0124), not from content a reviewer signs off.
- **Its words are those whose KCs the release keeps and its reviewed content uses**: a KC of a
  kept unit that a kept sentence or story uses (their `kcs`). A word card then shows a word a
  reviewer has seen in context. A node left with no word teaches its letters alone, and the app
  builds no word cards for it.
- **A track goes along with reviewed content.** Script tracks alone are no release: with nothing
  reviewed the build still fails ("nothing reviewed yet"). A practice node still stays only while
  its unit keeps a lesson, and an alphabet node is no lesson.
- **Convert nodes** (uz, apc) keep the lesson rule: their reviewed sentences, and they go when none
  is left.
- **The report** also counts the alphabet words a release kept and left out.

**What changed.**
- Full builds are byte-identical, for every course.
- Of the release builds, only grc's changes: its alphabet unit ships.
- In a scratch copy of the courses with every third sentence and every second story and scenario
  signed off, grc's release keeps all eight nodes with their letters, and 59 of their 61 words.
  sense:nai and sense:hodos go, because no signed-off sentence or story uses them.
- Every other course's release is byte-identical.
