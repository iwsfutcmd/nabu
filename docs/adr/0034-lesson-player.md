# 0034. The lesson player

- Status: Proposed
- Date: 2026-11-03

## Context

§16 Phase 3 asks for:
- the player state machine (§11.5);
- the Phase 3 templates (§8.2);
- feedback categories (§8.6);
- IME-safe input (§6.7);
- the special-character bar and touch keyboards;
- ruby and harakat toggles;
- word banks in RTL and vertical layouts.

Acceptance:
- Playwright completes one lesson per fixture course, by keyboard and by touch;
- the IME composition test passes;
- the visual matrix passes;
- axe finds no serious violations.

## Decision

**Pure lesson core.** `@nabu/core/lesson`:

- **Exercise instances are plain data.** They hold everything needed to render and to grade, so a
  lesson can be serialized, replayed and tested.
- **Templates.** Each template has `make(context, item)` and `grade(instance, response, grader)`:
  - §8.1's `eligible` and `instantiate` are merged; `make` returns `undefined` when the template
    does not apply.
  - Phase 3 templates: `select-image`, `match-pairs`, `choose-translation`, `translate-tap`
    (`l2-l1`, `l1-l2`), `translate-type.l1-l2`, `complete-translation`, `gap-fill`, `char-read`,
    `reading-disambiguation`, `speak.tier-0`.
  - Distractors never look the same as the answer, compared with the gloss key (normalized,
    folded, ignorable marks stripped).
- **`assembleCourse`** compiles a bundle's profiles.
- **`createGrader`** grades typed and tiled answers through the Phase 1 engine. Its lexicon of
  glossary forms lets a typo that lands on a real word grade as `WRONG_WORD`.
- **`buildLesson`** is a seeded, deterministic stand-in for the Phase 4 planner. One lesson is one
  path node:
  1. the node's new words (a picture, then pairs);
  2. one exercise per sentence, rotating templates so recognition comes before production;
  3. reading drills where the orthography has ruby.
- **`step(state, event)`** implements §11.5:
  - States: `presenting` / `answering` / `checking` / `feedback` / `interrupted` / `finished`.
  - Each state carries a session (queue, results); §11.5's state only had the current exercise.
  - Effects (grade, emit learner event, sound) are returned as data.
  - Wrong answers come back at the end of the lesson. Speaking and pairs are exempt.
  - "Can't speak now" drops the remaining speaking exercises.

**IME safety (§6.7).**
- `submit` is ignored while composing.
- Drafts are stored exactly as typed.
- `compositionend` settles the text.
- The field's Enter handler and the player's shortcuts both ignore `isComposing` and keyCode 229.

**Shell and views.** In `@nabu/ui/player`:
- `usePlayer` runs `step` and executes the effects.
- `LessonPlayer` renders the header (quit with confirmation, progress), the toggles, the
  exercise's view, feedback and the footer.
- Target regions take the answer language's direction, and turn into columns in vertical text
  where the profile allows it.
- Everything a learner reads or taps is language data rendered through `<T>`.

**Keyboard and touch.**
- A capturing window listener handles:
  - Enter: check, then continue;
  - digits in the Latin, Persian and Arabic numbering systems: options and tiles in reading order
    (§11.3);
  - Backspace: take back the last tile.
- Every tap target is at least 2.75 rem.
- Tiles can also be dragged.

**Feedback (§8.6, §11.6, §11.7).**
- Shown in a live region: an icon, a headline per verdict, profile notes, and the solution.
- For typed and tiled answers, the learner's answer is shown with the differing units marked.
  Marks are a wavy underline plus a dashed box, never colour alone, and whole tokens in spaced
  scripts (`answerDiff`).

**Toggles.**
- Readings: ruby; off by default in vertical text, where rotated Latin reads badly (§11.4).
- Vowel marks: `<T marks="hide">` strips the profile's mark set for display only (§6.6).
- Vertical text, where the profile allows it.

**Speak tier 0.**
- Recording and playback stay in memory and are never stored.
- The learner rates themselves.

**On-screen keyboards are deferred.**
- CLDR's Keyboard 3.0 set has no `fa`, `ar` or `uz` layouts to compile.
- Phones' own keyboards and IMEs already cover these scripts well.
- The field stays IME-safe and leaves typing to the device.
- The special-character bar (`extraKeys`: ZWNJ, ʻ, ʼ) stays, for desktop learners without the
  layout.
- The shift layers added to `profiles/keyboards/*.yaml` are inert until the keyboard returns.

## Consequences

- `apps/web/tests/e2e`: a solver rebuilds the same seeded lesson from the committed bundles, then
  completes:
  - by keyboard: fa, yue, uz-Latn, apc-Arab;
  - by touch: fa, yue, uz-Cyrl, apc-Latn (text from the device keyboard).
  - Between them, every template and all six orthographies.
  - axe runs on every screen.
- The IME test drives Chromium's real composition (CDP `Input.imeSetComposition`) on a Cantonese
  typing exercise.
- The visual matrix gains 78 player cells: word bank, typing and feedback, × UI locale, target and
  writing mode, × two viewports.
- The real planner (Phase 4) replaces `buildLesson`; `step` and the views stay.
