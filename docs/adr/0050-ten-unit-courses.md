# 0050. Ten-unit fixture courses, and every new word presented in its lesson

- Status: Proposed
- Date: 2026-11-04

## Context

The fixture courses ([ADR 0033](0033-fixture-courses.md)) had one unit each, 24–39 sentences.
That was enough to build every phase against, but too little to learn from, to judge the planner
by or to show a reviewer. The next step was more content before more features: about ten times
as much in every course.

Growing the courses showed three things the small ones had hidden.

- **The planner skipped new words.** At its old calibration weight (14), the 30-day simulation
  kept every learner within ±5pp of 85% with one unit. With ten units a month is almost all new
  lessons. Raising the weight brought accuracy back by leaving the harder new KCs out of their
  own lessons: at weight 40, apc presented every new KC in only 44 of its 55 lessons. A KC skipped
  there is never taught.
- **Word banks offered words from far ahead.** Distractors (word-bank tiles, other options, rival
  readings, minimal-pair rivals) were drawn from the whole course. With ten units, the first
  lesson's word bank showed words from the tenth, which the learner had never met.
- **The audio planner missed words that occur only inside longer words.** It learned each KC's
  reading from whole sentence tokens. In yue, 禮拜 "week" occurs only inside 禮拜一 "Monday", and
  百 "hundred" only inside 一百, so they got no reading and no clip.

## Decision

**The courses.** Each course keeps its `intro` unit unchanged and gains nine more, from A1 to
early A2.

| Course | Units | Sentences (was) | KCs (was) | Lessons | Stories | Scenarios |
|---|---|---|---|---|---|---|
| `fa` | 10 + drill | 318 + 10 drill (29 + 10) | 259 + 1 (25 + 1) | 60 | 10 | 6 |
| `yue` | 10 + drill | 348 + 10 drill (27 + 10) | 263 + 1 (23 + 1) | 58 | 10 | 6 |
| `uz` | 10 | 318 (26) | 244 (26) | 58 | 10 | 6 |
| `apc` | 10 | 293 (24) | 252 (24) | 55 | 10 | 6 |

- **What is taught.** The units cover family, numbers and money, food, home, places and
  directions, the day and the week, shopping, the past, and plans and weather. The grammar
  follows each language: Persian می‌ present, imperative, subjunctive and simple past; Cantonese
  classifiers, 咗 未 過, 緊 and 不如; Uzbek possessive, case and tense suffixes; Lebanese
  possessive endings and the b- present, subjunctive and past.
- **Conventions.** The ADR 0033 conventions all hold: i+1 with k = 1, a stem before its
  suffixes, chunks where a stem never occurs bare, and real variants in accept sets. Three
  conventions are added:
  - **Verb persons** are `form:` KCs carried on the verb token, which keeps the verb's own sense.
    For apc, Arabic script writes "you (to a man)" and "she" the same (بتشتغل), and "I" and "you"
    the same in the past (كنت), so each token names its person.
  - **A verb first meets the learner as a command** where that keeps one new KC per sentence:
    apc كول! and اشرب!, uz *Choy ich!*.
  - **Glossary forms are the surfaces that occur.** Where a bare form never appears, the entry
    is the inflected or definite one (apc البحر).
- **Every unit has a story** (5 or more lines and at least two questions). Each course uses both
  `complete` and `arrange` lines.
  - Every story line is pinned in every orthography.
  - The apc stories are vocalized.
- **Provenance.** Everything new is an LLM draft (`llm:claude@<prompt-hash>`, `status: draft`,
  CC-BY-SA-4.0) and needs a native speaker's review, starting with the lists in
  [`courses/REVIEW.md`](../../courses/REVIEW.md).
- **Images.** Images are reused across courses (`courses/images/README.md`), and no new ones
  were drawn.

**The planner presents every new KC in its lesson.** This is a hard constraint, like
recognize-before-produce. While some new KC of the lesson that an allowed exercise could present
is not yet in the plan, only exercises that present one qualify. The scores choose among them,
and once every new KC is in, they fill the session as before. The new words still come first,
since the selection order already put them there.

**The calibration weight is 34.** With the constraint in place it keeps every simulated learner
within ±5pp of 85%:

| Run | Accuracy |
|---|---|
| fa (θ* 1, 1.6, 2) | 85.1%, 86.1%, 86.4% |
| yue (θ* 1.3, 2) | 85.8%, 85.8% |
| uz-Latn (θ* 1) | 81.1% |
| uz-Cyrl (θ* 1.6) | 85.7% |
| apc-Arab (θ* 1.3) | 85.2% |
| apc-Latn (θ* 1) | 84.0% |

The weakest uz-Latn learner sets the weight. That run reaches 80.2% at 24 and 81.1% at 34, and
gains little beyond (81.5% at 40). With every new word presented, the content limits it, not the
weight.

The simulation now also fails if a lesson leaves out a new KC it carries.

**Distractors come from the item's own unit or an earlier one.** This applies to every template
that draws distractors: sentences for tiles, options and readings, and KCs for pictures, heard
words and minimal pairs. It stays until the confusion log can choose distractors (gameplan §8.1).
A lesson therefore draws on the same pool however many units follow it, so adding a unit never
changes earlier lessons.

**A KC met only inside longer words reads its share of their reading.** The audio planner splits
a word's pinned reading among its morphs when the word is Han characters read one syllable each,
which is the pairing the compiler's ruby uses. 禮拜一 *lai5 baai3 jat1* gives 禮拜 *lai5 baai3*.
It splits nothing else.

## Consequences

- **Tests.**
  - Pipeline tests ask for at least one story per course with every line in every orthography,
    not exactly one.
  - The apc vocalized-story test looks the story up by id and builds the glossary from every
    unit.
  - yue has three more expected reading warnings: 名 *meng2*, 弟弟 *dai4 dai2* and 平 *peng4*.
    These are colloquial readings that PyCantonese does not give.
  - The audio round-trip test runs on the yue intro unit alone, so it no longer synthesizes the
    whole course.
- **Goldens.** The lesson golden files changed, because the planner's choices changed, so they
  were rewritten on purpose (`UPDATE_GOLDEN=1`). Adding units no longer changes earlier lessons'
  exercises.
- **Placement.** Every story stays locked after placement.
- **Listening.** uz now has real minimal pairs (*bor*/*qor*, *yoʻl*/*yoʻq*). The listening test
  checks that each one differs by a single letter, instead of asserting there are none.
- **Audio.**
  - The new fa and uz sentences have no clips until `nabu audio generate --check` is run for
    each course, which takes hours.
  - yue clips mostly stay held back, because Whisper does not understand eSpeak's Cantonese
    (errata 36 and 54).
  - apc still needs human recordings.
  - Until then, listening exercises appear only where a clip exists.
- **Script gaps.** The yue script audit allows only CLDR's yue_Hant exemplars plus the profile's
  extras, so everyday characters are kept out: 佬 畀 埋 叉 粥 餓 㗎 吖 咋 晏 炒 嫲 囡 and others.
  The content works around them (俾 for "give", with 畀 accepted). Adding them to
  `exemplarsExtra`, marked REVIEW, is a separate change for Ben.
- **Structural misses.** A few KCs are taught by script nodes or drills, not by lesson exercises:
  `grapheme:zwnj`, `grapheme:hamze-ezafe` and `construction:numbers`. The planner's coverage
  constraint does not apply to them.
