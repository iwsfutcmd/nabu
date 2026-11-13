# 0043. Stories: source, compiler, runtime glossary, reader

- Status: Proposed
- Date: 2026-11-03

## Context

Phase 6 (gameplan §8.2 `story`, §16) asks for:
- a story schema and renderer: dialogue lines, inline questions, tap-for-gloss;
- a vertical reading mode;
- a glossary longest match on the runtime matcher, with LEXIS's lessons built in: folded and exact
  passes in parallel taking the longer span, and dead-entry detection;
- one fixture story per course.

Acceptance:
- fixture stories compile with zero lint errors;
- vertical `yue` stories pass visual checks;
- a vocalized apc-Arab story glosses correctly against unvocalized glossary keys.

## Decision

**Source** (`schemas/course-source.schema.json`, `UnitSource.stories`).
- A story sits on a path node of kind `story` and has a title per support language, characters
  (names per orthography) and steps.
- A step is a `line` (speaker, forms in every course orthography, translations) or a `choose`
  question (prompt and options in the support language).
- A line can be asked before it appears:
  - `ask: complete`: choose the word at `gap` (a KC) among `distractors` (KCs, shown by their
    first form in the learner's orthography);
  - `ask: arrange`: build the line from its tiles, given its translation.

**Compiler** (`nabu.compiler.stories`).
- Lines compile through the same `compile_form` as sentence forms: tokens, readings, ruby, text
  hygiene, the script and punctuation audits.
- Five lints, each with a fixture:
  - `story.node`;
  - `story.missing-form`: every orthography and support language, for lines, names, titles and
    questions;
  - `story.speaker`;
  - `story.ahead` (warning): a KC that a later node introduces;
  - `story.question`.
- KCs a story uses must exist and be introduced somewhere (the curriculum lints).
- Bundles carry `stories` per unit (`BundleStory`).

**One glossary matcher, used by app and compiler.**
- `@nabu/core` `glossTokens` / `glossText`: longest match over runtime units with two passes at
  every position:
  - **exact:** normalized units;
  - **folded:** case-folded, with the profile's ignorable marks stripped.
- The longer match wins; on a tie, the exact one.
- Matches map back to tokens and may be partial (我 in 我哋) or span tokens (唔該).
- core-cli `gloss` exposes it, and stage 7's lints (dead entries, shadowed words, tile splits) now
  call it instead of a Python re-implementation, over sentences **and** story lines.
- 14 conformance vectors (`conformance/gloss.json`) pass in both harnesses.

**Tap-for-gloss.**
- Word tokens are buttons inside `<T>` (`onTokenPress`), still whole tokens.
- The meaning shows in a live panel under the transcript, not a floating popover, so it reads the
  same in LTR, RTL and vertical text.
- A word no entry reaches falls back to its own sense, shown as written.

**Reader** (`@nabu/core/story`, `@nabu/ui/story`).
- `storyScript` turns a bundle story into steps for the learner's orthography; options are
  shuffled by the seed.
- `startStory` / `stepStory` is a pure machine. A question nests the lesson player for one
  exercise with retries, so a wrong answer is asked again until right, with the same grading,
  views and events.
- The story is one session of mode `story` at its node. Its completion marks the node done and
  earns session XP.
- Three templates, `story-choose`, `story-complete` and `story-arrange`, credit the `recognize`
  facet of their line's KCs. They do not open mistakes, which could not be practised outside the
  story.
- Arranging accepts tiles that read the same in either order.
- Vertical reading: where the profile allows the `reading` scope (yue), the transcript becomes
  vertical-rl columns.
  - Everything in a column follows it: names, lines, and rotated Latin for translations.
  - The chrome stays horizontal.
  - Ruby is off by default there, as in prompts.

**Path.**
- `pathNodes` lists lessons and stories in course order.
- A story opens when the node before it is done.
- Placement and the planner still work on lessons only.

## Consequences

- Stories are LLM-drafted fixtures (status draft), one per course, placed after the unit's lessons.
  The apc story is vocalized throughout.
- Story lines count for glossary coverage, so a KC used only in a story is no longer a dead entry.
  It is still reported as unused by any sentence.
- The visual matrix gains 60 story baselines (two screens; vertical yue cells on the reading
  screen). The e2e suite reads a story per orthography by keyboard and touch, and checks that a
  vocalized word glosses to its unvocalized entry.

## Amendment: tap-for-gloss in lessons, and a lookup before answering is a hint (2026-11-12)

Lessons now gloss tapped words too (the 2026-11 review's P1), through the same `glossAt` and a shared
panel. A card's target text can be tapped wherever a meaning gives nothing away:
- before answering: the words around a gap, and a sentence to say (its translation is on the card);
- once answered: what a sentence means, how a word is read or vocalized, and what was heard;
- never: options, tiles and pairs, which are the answer.

The owner decided (D16) that looking a word up on a card before its answer is checked is a hint, as
§9.2's "Good: right with no hint" has it:
- The lesson player marks that card's answer `hinted` (`input.hinted` on answer_submitted). A lookup
  once the card is checked is learning, and marks nothing. Story lines stay free to look up: they are
  the reading, not a question's answer.
- The fold rates a hinted right answer Hard at best (`ratingOf`), and a hinted first try shows no
  skill and misses none ([ADR 0100](0100-known-words.md)'s amendment). It still counts in recent
  practice (the learning pace), and the performance model learns it as right or wrong, as it was.
