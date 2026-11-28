# CLAUDE.md: Nabu

Open-source, script-first, Duolingo-style language-learning app.
Architecture and roadmap: docs/gameplan.md (Phases 0–10, built). Next phases: docs/next-steps.md.
§1 lists the decisions; any change to one needs an ADR in docs/adr/.

## Non-negotiables
- Language data is never a bare string. Use `TaggedText` (a BCP 47 tag with script, plus tokens) and render it only through `<T>`.
- No physical CSS (left/right, margin-left, text-align: left, width/height in components). Use logical properties.
  stylelint enforces this. Never disable the rule.
- No user-facing string literals. Add MF2 messages in packages/i18n/messages/.
- Never index, slice, reverse or count user-visible text by UTF-16 unit or code point. Use the grapheme utilities in @nabu/core/text.
- NFC at every boundary. NFKC only through a named orthography-profile step.
- No toLowerCase()/toUpperCase() on language data without a locale. Prefer the profile's case folding.
- packages/core is pure: no I/O, no Date.now(), no Math.random(). Inject the clock and a seeded RNG.
- Direction comes from the script subtag (Intl.Locale#maximize plus generated script metadata), never from a language name.
- During IME composition: never submit, never normalize, never reset the input value.
- Every new normalization or matching behavior needs vectors in conformance/ that pass in BOTH the TS and Python harnesses.
- Every content item and asset needs provenance and an SPDX license.
- What the prompt does not decide, the learner may choose (ADR 0085): accept sets take every order, word choice,
  optional word and form whose translation would be the prompt, in both directions; never one that would translate
  otherwise. The grader stays literal: the answers are listed in the accept set.
- The fixture courses (fa, yue-Hant-HK, uz, apc, lzh, es, hbo, tok, grc, chg, sk, bar) must stay green, and UI changes must pass the visual matrix (LTR, RTL, vertical).
- Never hand-edit packages/schema or the Pydantic models. Edit schemas/ and regenerate.

## Style
- TypeScript: strict; functional; discriminated unions; Result types for expected failures; no classes in core.
- Python: uv; generated Pydantic models; Typer CLIs; pytest + Hypothesis; type-checked with pyright.
- Conventional commits. Small PRs, one roadmap deliverable each.

## Commands
- pnpm i && pnpm dev               # web + api (API on PGlite in apps/api/.data; no database server needed)
- pnpm lint · pnpm typecheck · pnpm test   # all packages incl. the Python pipeline (via turbo)
- pnpm test:visual:docker          # visual matrix in the pinned Playwright image (needs Docker)
- pnpm test:visual:update          # same, rewriting baselines: review every changed PNG
- pnpm storybook                   # toolbar: UI locale, pseudo-locale, target, dir, writing mode
- pnpm codegen                     # schemas/ → packages/schema (TS) + pipeline (Pydantic); CSS module types
- pnpm cldr                        # regenerate packages/i18n/src/generated from the pinned CLDR packages
- pnpm conformance                 # TS + Python harnesses over conformance/ (≥300 vectors)
- pnpm test:perf                   # grading p95 < 5 ms, 4× CPU throttling, cold caches (Chromium)
- pnpm tables                      # regenerate profiles/tables from pinned Unihan/OpenCC
- pnpm courses                     # compile every course in courses/ (lint only; diagnostics as file:line)
- cd pipeline && uv run nabu build ../courses/<id>   # write the bundle to dist/<id>; `uv run nabu lints` lists lints
- pnpm bundles                     # rebuild apps/web/public/bundles (committed; CI fails if stale)
- pnpm test:e2e                    # lesson per course by keyboard and touch, IME composition, axe
- pnpm license-check               # what ships (web, API, mobile) has only allowed licenses (packages/lint/src/licenses.ts)
- pnpm check:catalogs              # every UI catalog in packages/i18n/messages passes the catalog check (ADR 0070)

## Phase 0–1 notes (see docs/adr/0013–0026)
- TypeScript is pinned to 6.0.x: typescript-eslint's type-aware rules need the JS compiler API, which TS 7 lacks.
- Workspace packages ship TS source; relative imports carry `.ts` extensions; Node ≥ 22.18 runs scripts directly.
- Generated, never hand-edited: packages/schema/src/generated, pipeline/src/nabu/schema/models.py,
  packages/i18n/src/generated, **/*.module.d.css.ts. CI fails if they are stale.
- Visual baselines are only valid from the pinned container; never update them from a bare host run.
- Lint rules and their fixtures live in packages/lint. A new rule needs a fixture that proves it fires.
- Write invisible characters (ZWNJ, bidi controls) as \u escapes in source, never literally.
- Italics only where the script has them (@nabu/i18n `italicAllowed`, data/script-overlay.json `italic`: Latin,
  Cyrillic, Greek, Armenian): <T> sets any other upright (`data-upright`), whatever its surroundings; chrome italics are
  `font-style: var(--nabu-italic, normal)`, which useChrome sets by the UI language's script. stylelint rejects a
  literal italic or oblique.
- Grading lives in @nabu/core (accept/, match/, normalize/, profile/); profiles get their data passed in.
- A new grading behaviour needs conformance vectors (conformance/*.json) that pass in both harnesses.
- Endings that carry meaning (ADR 0066): a profile's `typo.contrasts` (person, possessive, case endings, pronouns;
  REVIEW). A slip trading one member for another is WRONG_WORD, not a typo. Group allomorphs (ga, ka, qa) in one member.
- A typo that spells another word of the course is WRONG_WORD (the lexicon). Key lexicon words and lookups with
  `lexiconKey` (marks the profile ignores stripped), or a vocalized course's marked words never match typed answers.
- Contrast sets can be prefixes (`at: start`, `after` proclitics) and can apply only to inflected words (`inflected`,
  ADR 0081): bundled tokens carry their lexemes' `feats`, and createGrader passes the words of every lexeme some token
  writes outside its part of speech's `bare` cell (language.yaml; `spellingsIn`). A slip that makes
  a word ungrammatical is WRONG_WORD even when it looks like a typo; a noun's first letter stays a typo.
- Profile policies marked REVIEW await Ben's linguistic sign-off.

## Phase 2 notes (see docs/adr/0027–0033)
- Course sources: courses/<id>/course.yaml + units/*.yaml (schemas/course-source.schema.json),
  their lexemes in lexicons/<lang>/ (Lexical model notes). Every orthography's form is pinned; tokens are aligned to
  `text`; translations and `reverse` are accept sets.
- Fixture courses fa, yue, uz, apc are LLM-drafted (`llm:` provenance, status draft) and await native review.
  Ten units each (ADR 0050; apc twenty, ADR 0080); courses/REVIEW.md lists what a reviewer should check first.
  Tests pin intro.yaml's sentences, readings and glossary forms: change them with care.
- A new lint needs a registry entry (pipeline/src/nabu/compiler/diagnostics.py) and a fixture: add a mutation to
  pipeline/tests/fixtures/make_lint_fixtures.py and run it. clean.yaml must stay diagnostic-free.
- Write course YAML with nabu.yamlio.dump (keeps invisibles as \u escapes), never yaml.safe_dump.
- Analyzers (PyCantonese, hazm) are a default uv group; PyICU is the `icu` group (apt install libicu-dev pkg-config,
  then uv sync --all-groups). NABU_REQUIRE_TOOLS=1 turns tool-dependent skips into failures (CI sets it).
- CLDR exemplar gaps go in a profile's `exemplarsExtra` (marked REVIEW), never by loosening the script audit.

## Phase 3 notes (see docs/adr/0034–0035)
- Lessons: pure @nabu/core/lesson (templates, the candidates sessions choose among, step); every session is
  @nabu/core/learner `plan`'s, and there is no other builder (ADR 0125). Test lessons on what plan() plans
  (test/planned.ts walks a fixture course), never on a builder of the tests' own; the card gallery and `sampleExercise`
  show the planner's candidates (`lessonCandidates`). Distractors come from the item's own unit or an earlier one
  (ADR 0050), so adding a unit never changes earlier lessons. The player shell and views are @nabu/ui/player; views
  render state and dispatch PlayerEvents, never grade or advance themselves.
- After changing courses/, lexicons/ or profiles/, run `pnpm bundles`: the web app, Storybook and tests read the
  committed bundles.
- Typing is left to the device keyboard or IME; on-screen keyboards are deferred (ADR 0034). Keep the field IME-safe.
  A new text field for language text spreads `keyboardHint` (ADR 0143), so the Android app can switch the keyboard.
- Check stays enabled while an IME composes: a press is held until compositionend (core `queued`) and moves focus to
  Check; Enter never checks while composing (ADR 0118).
- Any other button that submits typed text (roleplay Send, the correction form, Start over) takes a press while
  composing through `useSettledSubmit` (@nabu/ui); never disable a button while composing (ADR 0118, D39).
- Distractors must not give the answer away (P2): rank them (`pickRanked`) by the answer's final punctuation, length,
  shared words and capital. Match-pairs show `cardGloss` (first sense, no notes); tap-for-gloss shows the full gloss.
- A lexeme's picture shows what it means: courses/images/README.md lists every file with the lexemes that use it and
  their glosses. Never reuse a picture for another meaning (waves.svg is water; wave.svg is a hand saying hello).
- A gap-fill asks one thing (ADR 0132, `asks`): which lexeme (options share the answer's form signature, `formSignature`
  in lesson/lexemes.ts, its lexeme's own features included, and its lexeme's UD `pos`; none the accept set takes in the
  gap, none whose gloss shares a meaning) or which form (the answer's own lexeme in other attested forms; the answer must
  have a form to credit, `formPartsOf`). It credits the base lexeme or the form's parts; a mistake keeps `asks` and is
  asked again as the same question. Lexemes' `pos` and `feats` are drafted (REVIEW).
- A choice's words are shown alike (ADR 0132 amendment): options, the gap a chosen option fills, word-bank tiles and
  whole-parts tiles render inside `ChoiceWords` (@nabu/ui marks.tsx; core `choiceWords`): no homograph mark, and
  readings and vowel marks kept on all where any word would keep its own. Pass `texts` to `Options` where options are text.
- Letters placed to build a word (word-write) show as the word they spell: one token, one run of text (`data-spelled-word`),
  so a script whose letters join shows them joined and marks sit on their letters. Never lay letter tiles side by side as
  the answer; pressing the word or Backspace takes back the last letter.
- Word-bank and story-arrange tiles come from `tilesOf` (lesson/tiles.ts, ADR 0130), never `tileGroups`: lower case but
  for words that must be capitalized (a sentence's first word loses its capital where the course writes it in lower
  case; a capital inside a sentence stays). A capital would show the answer's first tile and which tiles are distractors.
- Quote YAML values like "on"/"off"/"yes": PyYAML (YAML 1.1) reads them as booleans; the JS parser does not.
- Debug mode labels each card with its full id (core `cardId`: tok/tok-Qaap.sitelen-pona/choose-translation:s.u01.1)
  and copies a link to it (`#/<course>/<orth>/card/<code>`,
  apps/web/src/card-link.ts): the exercise itself, deflated, tied to the link's `FORMAT` and `BUNDLE_FORMAT`; it opens
  that card alone, nothing recorded. Raise `FORMAT` when an exercise's shape changes. Read a pasted link with `decodeCard`.
- Keyboard shortcuts live in one capturing window listener, `usePlayerKeys` (packages/ui/src/player/Shell.tsx), shared by
  the lesson player and the story reader with their header, toggles and quit dialog (C14); views register digit/Backspace handlers.
- Bring an action into view with `focusInReach` (player/shared.ts), never a bare focus(): a phone browser's bottom
  toolbar covers the viewport's last strip. Pages hosting the player keep `--nabu-space-reach` below the card.

## Phase 4 notes (see docs/adr/0036–0039)
- Learner state is a projection: @nabu/core/learner `replay(events)`. Never store derived state; change the fold.
- The fold changes its private draft in place (`learn`, ADR 0119): never pass it a state's own objects, and mirror a
  deliberate fold change in test/fold-before-r2.ts (the oracle a replay is checked against).
- Ratings come from the answer, never the learner (but tier-0 speaking): pace per unit of length decides Hard and
  Easy (ADR 0096, `PACE_*` in state.ts); tune those on real logs, never on the simulator's latency model.
  Never delete events to undo progress: starting a course over is a `progress_reset` event (ADR 0049).
- A lesson's review (ADR 0097): earlier lessons' sentences picked by need (`reviewSentences`), at most a quarter of
  its cards, marked `review: true` (the player labels them). Never pick review in course order.
- The planner is pure: (request, state, bundle, now, seed) → plan. Re-tune CALIBRATION_WEIGHT only against
  test/simulation.test.ts (every course within ±5pp of 85%, no lesson dropping a new part); golden files:
  UPDATE_GOLDEN=1 after a deliberate change. Every new part of a lesson is presented in it (a hard constraint, ADR 0050).
- Card keys: "part|skill", and "part|skill|orthography" for read-script/write-script (§6.3).
- The web app stamps events (apps/web/src/clock.ts, session.ts) and keeps them in IndexedDB (store.ts).
- A running lesson or story holds the route against Back and Forward (navigation.ts, ADR 0108): Back, or Android's
  back button, asks as the quit button does; a new navigation (a link, a typed address, a reminder, an e2e `goto`)
  goes ahead. Leave a session with `leave()`, never `location.hash =`, so Back never plays it again. A session is
  keyed by its route and the visit (`routeVisit`): leaving one for its own route (Keep practising after a review)
  mounts a fresh session, never the finished one again (its buttons are spent). A reload, or
  opening a lesson left part-way, picks the session up: its plan is kept on the device until it ends
  (open-session.ts), and core `resume` folds the session's logged answers through the player. Never re-plan a
  session that is under way.
- Placement (ADR 0039, 0077, 0108) says what it does before it starts and what it placed after. Stopped part-way, it
  stays a stopped session (no session XP) whose `placed` still says what the answers so far placed (D9); the fold and
  the game's replays mark those nodes done whether or not the session finished. It is offered until every node is
  done: a placement only ever adds nodes done, in the fold.
- e2e sessions depend on the log and clock: fix the clock (page.clock.setFixedTime), seed history through
  window.nabu, and plan with the solver's `planned()`. Seeded history that gets uploaded needs `freshIds()`.
- The API (apps/api) runs on PGlite unless DATABASE_URL is set; migrations are SQL in src/db/migrations.ts
  (append, never edit). Events are validated against schemas/learner-event.schema.json with Ajv.
- API tests open their database with test/database.ts: PGlite, or with NABU_TEST_DATABASE_URL a fresh Postgres
  database per test file (CI's api-postgres job).
- Sync is optional: the web app talks to a server only with VITE_NABU_API (dev: .env.development) or ?api=.
  Every recorded event enters the IndexedDB outbox; sign-up uploads it. Never derive state on the server
  differently from core's replay.
- Signing up re-queues the whole log (`store.requeue`, ADR 0123); signing in sends the outbox. A 401 signs out and
  remembers who (meta `signed-out`) until sign-in or "Stay signed out". `offline` is `navigator.onLine` false;
  `unreachable` is no answer while online, or 502-504.
- One bad event never holds back a batch (ADR 0108): POST /v1/events takes the valid events and names the rest
  (`rejected`, by index, with the errors of the event's own type) and logs each (code, id, that error; never event
  values). The device sets those aside (outbox.ts, meta `held`, still in its log), says so in Your progress, and sends
  them again when the learner asks, signs in again, or first runs a new build (`__NABU_BUILD__`, meta `app-build`).
  Sync's check against the server leaves them out.
- Your progress says what keeps the log (EventStore.durable: persistent storage granted, or a browser that may clear
  it) and restores a download (apps/web/src/restore.ts): every event checked with the schema as the API checks
  uploads (event-schema.ts, Ajv loaded only then), ids dedupe, added events enter the outbox.
- Calibration: `pnpm --filter @nabu/core simulate --out f.jsonl`, then `cd pipeline && uv run nabu calibration f.jsonl`
  or `uv run python notebooks/calibration.py f.jsonl`.
- Count open mistakes with @nabu/core/learner `practicableMistakes` (the course page does), never `state.mistakes`:
  a session leaves out templates on a break, items the course no longer makes, and items needing unseen parts.
  A card about one word of its sentence keeps that word (`Mistake.ask`): the session asks it again (`MakeContext.ask`),
  and only an answer about it closes the mistake (ADR 0037 amendment).
- The word list (`#/<course>/<orth>/words`): @nabu/core/learner `learnedWords` (lexemes with a reviewed card; script
  facets count only in their orthography; each known or learning, ADR 0100), `orderWords`, `wordMatcher` (letters as
  the profile compares them, marks stripped; readings with or without tones; glosses folded in their own language);
  @nabu/ui/words WordList. It reads the log; it records nothing.
- Home leads with where the learner left off (ADR 0120): each course's latest start, `studiedCourses` over
  `EventStore.latestStarts` (read back from each course's newest event; never the whole log). The course page marks
  where it opens with `data-arrival` (screen.tsx brings it into view; focus stays on the h1); finished units fold
  (their lists stay in the DOM, `hidden`); its other pages are linked under its title; Offline is its own page.

## Known words notes (see docs/adr/0100–0101)
- Known (ADR 0100): every skill `skillsAsked(course)` asks of a word (recognize; produce where a sentence uses it; listen
  where the voice is good and the word can be heard) is in the fold's `shown`: a first try right, not self-rated, on a
  later local date than `met` and than its last `missed`. Never store known status; change the fold.
- A miss counts against a word only where the grading pins it (a one-word card, `askedParts`, word-level credit); a
  sentence missed as a whole leaves its words alone. Gap-fill is recognition; production is typing (D4).
- A new word is presented only by a card credited to it (`creditedParts`), never as a pronunciation card's context.
- Sessions aim at the skills words lack (ADR 0101): `NEED_GAIN`, typing and listening slots that only come in where the
  session can still reach its target, `focus` blanks. Callers pass `today`, the learner's local date (web
  `localDate(now)`; the e2e solver UTC, as its browser). Tune against the simulation, which checks typing too.
- The simulator logs credits as the player does: test/learner-fixtures `creditsOf` calls `creditOf` itself
  (`rightCredits` for a right answer), so the two cannot drift.
- The learning pace (ADR 0105): `paceOf(course, state, now, choice)` reads a band (consolidate, steady, accelerate)
  from the fold's `recent` first tries and slipping words; `PACE` sets the retention target, a lesson's review share
  and when `continueOf` offers practice first. Pass the band to `plan` (web: SessionBody; e2e: the solver) so plans
  match. Never block a lesson (D6); tune `PACE` only against the simulation's pacing runs.
- Due means a facet's recall is below the target and the course can make a card that credits it (`dueFacets`,
  `LearnedWord.due`; `askable` in learner/due.ts: given the course's lasting exclusions, the facets turned off for good
  and the learner's reading tradition; never a break; never a letter, ADR 0149): never a card's FSRS due date. The
  course page counts due words. What a card credits is `creditedKeys`: `creditOf` given an answer exactly right (a typed
  sentence also credits its words' spelling leftovers); the planner's gain and the simulator use only that. A review
  session has a card per word needing one (5–15), finds a card for each due facet from the sentences carrying its part
  (`cardCrediting`, the search `askable` uses; never candidates from every studied sentence, R3), takes cards for due
  facets nothing else covers while it can afford them (`affordableOf`), and always one for its most forgotten due facet.
  Reviews answered right clear what is due, in every course (test/due.test.ts): keep it so.
- Readings on new words only (ADR 0131): the fold witnesses the read-script facet too (`WITNESSED_FACETS`, by D2's rule);
  it is never a skill a word is known by. A reading layer with `fade: by-facet` shows over all words or new ones
  (`DisplayChoice.readings`); <T> fades a word's ruby only inside `FadeReadings` (lessons, stories), by core
  `readingsShown`: never in a tapped word's gloss or the word list, nor on a word tapped (`pressed`) or marked (`highlight`).
  Pass `readingsShown` wherever `known` goes. A gloss always shows a reading, readings off or not (`glossRuby`); a word
  glossed by its parts heads its panel with its own reading. The feedback's right answer is tappable too (a right sentence
  typed whole comes again to tap), and so are an answered word bank's tiles.
- Writing side (ADR 0142, 0148): a typed word that says what the expected one says by a fixed correspondence of its
  profile's statement (fa سد for صد, es bolber for volver) has the right sound and the wrong letter: never a typo, the
  label orthographic (Losses and labels notes); `spelling-choice` (write-script) offers the word among its other
  spellings of that sound (core `otherSpellings`: `projection.spellings`; yue: homophone characters the course attests,
  `courseHomophones`, the Jyutping given). One other spelling is enough: the only choice card with two options (ADR 0142,
  amended). The compiler asks the same function (core-cli `spelling-others`) for `leftovers.spelling`. A homophone typing
  (唔洗 for 唔使) is wrong, however common: the course teaches the character the word is written with.
- Reading side (ADR 0139–0141): a feature card (`reading-feature`) asks one place a script leaves open (`readingFeatures`:
  a place the scheme's statement leaves open, by the word's own letters where the scheme names the orthography, or an
  attested tone), options differing there alone; homographs (`homographsOf`) are marked
  in lessons and stories (`HomographsProvider`) and a tap lists the other readings; the readings choice Unwritten (`open`)
  keeps only `openLetters` over words read before. All from scheme data: never a list of letters or tones in code.
- Listening or speaking turned off for good (Preferences, D41/D45; never a break) is asked of no word and never due: pass `facetsOff`
  (web `facetsOffOf`, breaks.ts) wherever `skillsAsked`, `learnedWords`, `dueFacets`, `paceOf` or `plan` is called.

## Phase 5 notes (see docs/adr/0040–0042)
- Audio is committed source: courses/<id>/audio/{index.yaml,clips/}. `cd pipeline && uv run nabu audio generate
  ../courses/<id> [--check]` writes it (needs espeak-ng and ffmpeg; --check needs `uv sync --group speech`). The compiler only
  reads it; after changing a reading, regenerate (the compiler warns `audio.stale`), then `pnpm bundles`.
- Synthesize from pinned readings (Jyutping), never raw characters, except a voice that reads only characters (yue's
  VoxCPM2, ADR 0094: the round trip and the audio check catch its readings). Human recordings: `nabu audio ingest`.
- A word's reading is the one the compiler pins on its lexeme's spelling (`nabu.compiler.readings`, ADR 0117: every
  scheme, the lexeme's most common in lessons first): its card, its clip and minimal pairs all read that; never look
  one up by spelling. A change to the order can make clips stale: `test_readings.py` checks every course's, grc's too.
- Readings are fixed by their words (ADR 0135): tokens annotated alike (spelling, the lexemes they write with the
  feature values chosen on each, `context`, bound or not) read alike in every scheme and vocalization. With
  `consistentReadings: true` (course.yaml; on in apc, es, fa, grc, hbo, lzh, tok, uz) a form read two ways is an error,
  elsewhere a warning: annotate what tells them apart (another lexeme, a feature value, a lexeme the script does not
  write, a `context` such as hbo's `pause`/`nesiga`), or mark a free variant `readingVariant`; never
  change a reading to hide it. A token pinning no reading takes its form's, so pin a form once.
- One synthesized clip an item, at normal speed: "slow" is the player slowing it (0.75×, pitch kept;
  ADR 0062). Never synthesize slow clips; a recorded slow take (`ingest`) still plays as it is.
- `finalStop: true` on a voice (ADR 0063) ends unpunctuated text (word cards) with its script's full stop
  (nabu/audio/punctuation.py: by script subtag, language overrides). Turning it on makes those clips stale.
- apc's voices (ADR 0058, 0078): Lahgtna on OmniVoice, local (`uv sync --group omnivoice`, CI skips it), reading the
  vowel-marked text, each cloning its reference (beirut-m, beirut-f; `nabu audio cast`; recasting makes clips stale). Clips are CC-BY-NC-4.0
  (the weights are non-commercial). bfloat16; CPU ~15 s a clip, a T4 ~11 s; generation resumes. Live test: NABU_OMNIVOICE=1.
- OmniVoice clips are trimmed to their speech (`trim_edges`: 80 ms before, 150 ms after); a clip cloned from a recorded
  reference credits it (speaker, license, source). OmniVoice sets a clip's length before it speaks and leaves no time for
  a pause at a comma: a voice's `pauseTime` adds seconds per pause inside the text (`inner_pauses`, ADR 0058 amendment),
  in those clips' identity alone. apc's woman's voice has 0.3; the man's none (it would remake approved lines).
- Items said alike (one input, voice and settings) share one clip and file; a clip is kept only if its file matches its
  sha256, so `generate` or `prune` mends an index whose file was written over. `--check` runs Whisper on a GPU if it can.
- uz's voice (ADR 0059): Navoiy (CosyVoice2) runs in its own uv project, pipeline/runtimes/cosyvoice (older torch and
  transformers); the pipeline starts its worker.py. CI never installs it. ~6 GB RAM: run it alone. Clips Apache-2.0.
  `nabu audio align` gives clips without timings (OmniVoice, Navoiy) word timings by forced alignment. Live: NABU_NAVOIY=1.
- Clips that fail the round-trip check stay out of bundles until reviewed (`nabu audio report`).
- No card says a form alone: a form's clip ships in no bundle, and `nabu audio prune <course> --forms` drops the
  synthesized ones (no voice runs). Since 2026-11-22 apc and fa keep none.
- Audio check (ADR 0060): `#/<course>/<orth>/audio` (debug link) plays every clip, held-back ones too; clips come from
  courses/ via apps/web/audio-check.ts (Vite plugin; Pages writes a copy), never from bundles. Its verdicts file goes
  through `nabu audio verdicts <course> <file> --reviewer human:<id>`: right → reviewed (ships), wrong → rejected (held);
  the next `generate` makes a rejected clip again as its next take (another seed; seeded voices only).
- Speech tests need NABU_SPEECH=1 and the speech group; CI runs only the espeak-ng tests.
- Listening templates exist only where a clip does; "Can't listen now" uses the planner's exclude (LISTENING), and so do
  Preferences' lasting Listening and Speaking switches (per device, apps/web/src/breaks.ts).
  Once answered, a listening card shows what was heard and what it means: a sentence's translation, a word's gloss
  (`translation` on the exercise, shown by ListenPrompt). Never before the answer: it would give it away.
- Every card says its clip once answered (ADR 0064: `useSayWhenAnswered`, `AnswerAudio` in Views.tsx); each view owns
  its clip (never the shell), so nothing plays twice. New views with a clip use the same hook. A card asking what a target
  sentence means (choose-translation, the l2-l1 word bank) also says it as it opens (`sayOnOpen`, ADR 0064 amendment),
  as listening cards do; never a card whose answer the clip would give (reading cards, gap-fill, into the target).
- A clip said on answering waits for the feedback sound (`SAY_AFTER_ANSWER_MS`), never over it. Clip elements load with
  the card and are reused (`useClipElements`); never `new Audio()` at play time (choppy starts, Firefox on Android).
- fa's voice (ADR 0065): Mana-Persian-Piper (Piper, pinned `model`, MIT). Its `carrier` says items of at most
  `maxWords` words inside "حالا این کلمه را تکرار کن، …" with durations set from the carrier (the graph split at
  /Ceil, nabu/audio/carrier.py) and cuts them out exactly; lone words otherwise collapse. Piper is seeded.
  A longer item's sentence the duration predictor collapses (`carrier.collapses`) is carried too; that route is in
  the clip's own identity (`item_settings`), so changing how some items are said never makes every clip stale.
- Hosted voices (ADR 0042): provider elevenlabs/cartesia with `model` and `language`. Keys only from the environment
  (ELEVENLABS_API_KEY, CARTESIA_API_KEY): never in course files, commits or chat. `pronounce: jyutping` sends IPA for
  tokens whose characters do not settle the pinned reading. `--voice <id>` picks a cast voice. Live tests: NABU_HOSTED=1.

## Phase 6 notes (see docs/adr/0043)
- Stories: `stories:` in a unit (schemas/course-source), each on a node of kind story. Lines compile like sentence
  forms and need every course orthography; questions are `choose` steps or lines with `ask: complete|arrange`.
- A story question asks one thing, and its wrong options fail for that reason only (ADR 0132). A `complete` line asks
  which lexeme (`asks: lexeme`, the default: `distractors` are lexemes of the gap's `pos`, each shown as the course
  writes it in the gap's form, unit or earlier) or which form (`asks: form`: the gap's lexeme in other attested forms,
  `distractors` as feature values). A wrong
  word makes the line false or absurd, never another sensible line (pears for grapes, tea for wine, three for seven); a
  wrong form makes it ungrammatical, never one the line also takes. Nothing else may mark the answer (a manuscript
  spelling, a capital). `story.distractor-form` and `story.distractor-pos` are errors.
- One glossary matcher: @nabu/core `glossTokens` (exact and folded passes, longer wins). The app's tap-for-gloss and
  stage 7's lints both use it (core-cli `gloss`); never re-implement matching in Python.
- The story reader nests the lesson player per question (@nabu/core/story); story sessions are mode "story".
- `pathNodes` (lessons and stories) drives the path; placement and the planner use lessons only.
- Tappable words: `<T onTokenPress>`; never wrap tokens by hand.
- A tapped word opens in a dialog (ADR 0157, `GlossDialog` in player/Gloss.tsx; its body `GlossContent` is what
  server-rendered tests read, since the modal portals): the word with its reading, its entries, and each entry's
  forms from core `lexemeForms` (its paradigm's cells, with the readings and other words of a cell the course writes,
  then the forms the course writes outside them, named by `labelOf`) with the
  tapped word's own cell (`formCellAt`) marked. Never work out forms in UI code.

## Phase 7 notes (see docs/adr/0044)
- Game state is a projection: @nabu/core/game `replayGame(events, config, clock)`. Never store it; change the rules.
  Deployments configure it in `game.json` beside the app; the gate (hearts/energy) is off unless set there.
- Streak tests are properties (date line, DST, 48 h offline): keep them generating physically possible timelines, and
  within the anti-gaming caps (≤3 time-zone changes a week: `withinZoneCap`) unless the cap is what they test.
- Usernames go through `checkUsername` with the UTS #39 data in packages/i18n/src/generated (regenerate with
  `pnpm --filter @nabu/i18n generate:security`; pinned sha256). Render every user-chosen name inside <bdi>.
- API options: NABU_LEAGUES=1, NABU_PUSH=1 (VAPID key kept in the database unless NABU_VAPID_PRIVATE_JWK),
  NABU_TEST_HOOKS=1 only in tests (push sink, job runner). Reminder copy lives in packages/i18n (push.reminder.*).
- The gate never counts placement answers or the learner's own claims (only graded answers and server revisions);
  `GateState.opensAt` says when lessons open. Leagues can be declined (`league_opt_outs`, in export and delete) and say
  how last week ended (ADR 0122).
- Web Push is our own RFC 8291/8292 code (apps/api/src/webpush.ts); its test pins the RFC's example bytes.

## Phase 8 notes (see docs/adr/0045)
- AI goes through the gateway (apps/api/src/ai): providers from the environment only (NABU_LLM, NABU_LLM_MODEL,
  NABU_LLM_URL, a key), outputs validated against schemas/ai.schema.json, provenance on every output. No model: AI off.
- Prompts live in prompts/*.md, referenced by hash. Learner text goes in as data (asData). Changing judge.md closes
  every judge gate until `pnpm --filter @nabu/api evals -- --run` with a model writes new ones.
- evals/gates.json: never hand-write a gate or a result. Golden items must stay real judge cases (check mode, in CI).
- A judge accept is an outcome_revised event the server issues; projections fold logs through withRevisions.
- A claim or the judge's accept revises the running session too (`revise`, ADR 0113): Continue, the retry and the score
  follow it, and a reload agrees. The end screen's progress is the log with the session against without it
  (apps/web/src/session-end.ts); never store it.
  A learner's answer_reported is their own revision (claim accept or reject, ADR 0052); it counts at once.
- Reports are answer_reported events. Review: /admin/v1 (NABU_ADMIN_TOKEN); `nabu reports promote` edits accept sets.
- Roleplay scenarios are course content (`scenarios:`, no target text); model turns are checked before shown.
- Explanations: segments render through <T>; the paragraph takes the support language's direction, never the UI's.
- Tests use a scripted provider for plumbing only; never present stand-in output as a model's result.

## Phase 9 notes (see docs/adr/0046, 0093)
- Tone scoring on the device (@nabu/core/speech: pitchTrack, scoreTones, gradeSpeech) is OFF (`DEVICE_TONE_SCORING`,
  ADR 0093): not accurate enough on natural speech. Without a speech server, speaking is self-rated (tier 0) in every
  course. Turn it on only after the native-speaker acceptance (evals/tones) and a native speaker's try in the app.
- Expected tones come from pinned surface readings. Never tune templates to synthetic speech; tune on native
  recordings (evals/tones).
- Tiers 1–2: `cd pipeline && uv run nabu speech serve`, API NABU_SPEECH_URL. Never prompt the recognizer with the
  sentence. What an orthography is scored on is its profile's `speech` (ADR 0116): `tiers` (REVIEW), `recognizer`
  (a fine-tune where Whisper's own fails), `phones`. The API reads it from the course's bundle; the round trip and
  `nabu audio align` read it too. A language Whisper or eSpeak NG lacks is heard as its macrolanguage (CLDR's data,
  `macrolanguages.json`: apc as ar). Never key speech settings by course id in code.
- Recordings are never stored or logged anywhere; speaking answers log method voice with no raw text.
  A scored speaking card (speak, listen-speak) can be claimed right ("I said it right", ADR 0052): the claim's
  text is the prompt sentence, never what was heard; `nabu reports promote` skips it.
- `speak`/`listen-speak` replace tier 0 only with SpeechSupport (speechSupportOf); `tone-identify` needs a one-syllable
  clip a person confirmed (`confirmed` in the bundle: a recording, or a synthetic clip a listener marked right in the
  audio check; never TTS alone, ADR 0125), and a lesson that can make one plans one. Speech never changes a lesson's
  length (the planner's size, golden files): scored speaking takes tier 0's place.
- `pnpm --filter @nabu/core tone-eval [set]` reports per-tone accuracy; evals/tones/synthetic-espeak is synthetic.
- Speech e2e uses Chromium's fake microphone (tests/e2e/fixtures); speech service tests need NABU_SPEECH=1.

## Phase 10 notes (see docs/adr/0047–0048)
- Offline: @nabu/core/offline (coreFiles, downloadPlan, restrictMedia). The manifest's units list their `assets`;
  never make a template depend on media without the builder checking course.audio or lexeme.image (restrictMedia
  drops them).
- The service worker is apps/web/sw/sw.ts (built by vite-sw.ts, its own tsconfig with the WebWorker lib). Code it
  shares with the app (idb.ts, outbox.ts, http.ts, caches.ts) must not touch window or import React.
- Files under `assets/` come from the HTTP cache (hashed names); the worker precaches only the UI catalogs listed under
  `ui-catalogs` (ADR 0119). Han font faces live only in `@nabu/ui/fonts-han.css`, loaded with the text that needs them.
- Course files are cached by URL in "nabu-bundles"; downloads check sha256 and store the manifest last.
- Game state on the server: GET /v1/game; devices replay with the server's receipt times (store.receivedTimes).
  Instances set NABU_GAME to the game.json the web app is deployed with.
- e2e that needs Background Sync uses `channel: "chromium"` (the headless shell has none); the CI image has it.
- Tests import projection helpers from src/compare.ts. sync.ts imports no React (the game state comes from
  game-log.ts), so sync is tested from Node; the daily check of the server's projections runs in check-worker.ts (ADR 0112).
- Native apps (ADR 0048): apps/mobile (Capacitor 8; android/ and ios/ are committed, generated projects). After a web
  change: `pnpm --filter @nabu/mobile build`. Capacitor plugins load only in the native shell (src/native.ts, dynamic
  imports). Native reminders: apps/api/src/nativepush.ts; credentials only as file paths in the environment
  (NABU_FCM_SERVICE_ACCOUNT, NABU_APNS_*): never in the repo or chat. CI builds the preview APK (`assemblePreview`:
  org.nabu.app.preview, debuggable, signed with the committed public preview key) and replaces the APK on the
  android-preview release from main. Never sign a store release with the preview key.
- The Android app asks the keyboard app for each text field's languages as it takes focus (ADR 0143: NabuWebView sets
  `EditorInfo#hintLocales`; native.ts calls the KeyboardLanguage plugin). A field whose orthography is known names them
  (`{...keyboardHint(lang, profile)}`, @nabu/ui), best first: its own language, the profile's `input.keyboard`
  (after `und-Latn`, Gboard's Alphabet, for a Latin orthography on another language's keyboard), else the CLDR
  macrolanguage, then `und-<Script>`; others ask for their `lang`. The app puts first the first one the keyboard has
  (KeyboardChoice: Gboard reads only the first). Browsers and iOS cannot. Keep res/layout/capacitor_bridge_layout_main.xml
  in step with Capacitor's on upgrades.

## Corrections notes (see docs/adr/0051)
- A correction is a `sentence_reported` event: `shown` (what the device displayed) and `correction` (only what
  changed). Build drafts and events with @nabu/core/corrections; never hand-assemble them. Projections ignore it.
- Words are addressed by their index among a form's words (not spaces or punctuation) plus their surface.
- The UI (`@nabu/ui/corrections`) gives every field its own text's lang/dir/font; never normalize while composing.
- Modal content renders outside UiRoot: wrap it with `useChrome()` (lang, dir, font) and `chromeClass`.
- `nabu corrections apply <jsonl>` edits values in place and skips anything whose `shown` no longer matches the
  source; changes that need new tokens or lexemes are listed with file:line, never guessed. Regenerate audio after.
- "My answer should be accepted" also covers story questions (answerTextOf); promote skips them (no accept set).
- Words are correctable too (ADR 0057): `item` is the lexeme id (an older correction's KC id goes through the course's
  aliases.yaml); `correctablesOf(course, ex)` gives what an exercise offers (each pair's word for match-pairs). apply
  edits the lexeme's first spelling and gloss in its lexicon; readings stay with sentences.

## Vowel marks notes (see docs/adr/0053)
- Course sources stay as written; `vocalization:` files (courses/<id>/vocalization.yaml) give words their marks
  at compile time. A token pins its own with `vocalized` (needed for `ambiguous` words). New word: add an entry.
- Compare letters, never marks: grading, credit, glossary, corrections apply. Voices read `Compiled.written`
  (the source's surfaces), so a vocalization never changes clips.
- Pronunciation cards (ADR 0054, in context since ADR 0095, answered by choice since ADR 0098): `vocalize` (abjads:
  the word with its marks among attested variants, never typed marks) and `transcribe` (typed; a ruby scheme whose
  data gives a syllable shape: only Jyutping so far; `char-read` is its multiple-choice twin, tone variants first, or
  where the scheme's statement leaves letters open (what the same letter also writes: chg's vowels), homographs then
  those, ADR 0131) are
  sentence templates asking about one word (`word`, marked with `<T emphasis>`); only that word is credited; a lesson
  plans one where it can. Optional marks: the profile's `match.marks.optional`, and `optionalBefore` for marks optional
  before a letter (apc, ar: the fatha before ا or ى, never before a hamza's seat; the kasra before a `bare` ي and the
  damma before a bare و, `unless` the letter has a sukun; ADR 0054 amendments), `optionalOn` for marks a letter
  already says (the kasra under إ); orthographies that spell the vowels (apc: Arabizi), `match.marks.spelledIn`.
  A wrong vocalization never touches a long vowel's letter or the unmarked letter before a ya or waw (other words'
  shapes: كيّفَك, كَيفَك), and reading cards show the sentence's `persons` tags (كيفَك to a man, كيفِك to a woman).
- Where a profile sets `input.markBuilder` (hbo, apc), `vocalize-build` asks the same word's marks put on its letters
  from buttons (ADR 0137), only once a vocalize card has shown them (`shown`); graded by `gradeVowels`. Never a text
  field for marks; never a list of marks in code (the letter stays chosen while the course attests more marks on it).
- Reading schemes are data (ADR 0109): a new scheme is `profiles/schemes/<id>.yaml` (schemas/reading-scheme.schema.json:
  `names` per language, lang, answer orthography, syllable shape, tones), plug-ins in `nabu.schemes` for what voices need, and
  `reading-syllables`/`reading-tone` conformance vectors. Never hard-code a scheme id in TS or Python.
- Course and orthography names, blurbs and hints are course data (`names` in course.yaml, ADR 0109), read through
  `@nabu/i18n` names.ts (`schemeName`, `toneName` for schemes); never in the catalogs. Translations carry provenance
  (drafts are `llm:`); pseudo-locales show the English names pseudo-localized.

## Report intake notes (see docs/adr/0055, docs/reports.md)
- Reports (sentence_reported, answer_reported) also go to the deployment's Firestore intake (`reports.json` beside
  the app; Pages writes it from repo variables). What leaves the device: @nabu/core/reports `submissionOf`, never
  device/user/session ids. The Reports workflow files them as GitHub issues (apps/api/scripts/file-reports.ts).
- Firebase keys and the service account live only in repo settings (variables/secrets): never in chat or commits.
  The rules in deploy/firebase/ are merged into a shared project's rules, never deployed on their own.
- Learner text in issues stays in code spans (no mentions, links, markup); keep it so when changing the rendering.
- What came of a report is the device's own comparison with its bundle (ADR 0115): `correctionStatus`/`openCorrection`,
  `claimStatus`/`reportsOf`; never a server route, never stored. Confirmations say where a report goes (`useReportsReach`).

## Morphology notes (see docs/adr/0061)
- A lexeme's `spelled` forms are its lemma (first: what word cards show) and its variants, never an inflected word (a
  form no rule gives yet is one of its `forms`); the compiler's `lexeme.inflected-form` catches a spelling the sentences
  write with several lexemes. Verbs: infinitive (ichmoq, خوردن).
- Taps on a token that writes several lexemes show each (`glossAt`); list a token's `lexemes` rather than adding
  inflected spellings.
- A morpheme the script does not write, or writes only as a mark on a letter it shares (the ezafe: fa کتابِ), is a
  lexeme with an empty surface, last in its token's `lexemes` (`{lexeme: ezafe, surface: ''}`, ADR 0136); a tap glosses
  it as unwritten. Never a sentence-level tag for something one word carries. chg's ezafe is one too (حضرت ḥażrat-i,
  31 tokens, introduced at chg.u06.dates): a token whose other lexemes are unwritten is spelled as its lemma, and
  `lexeme.inflected-form` does not count them.

## Persons and register notes (see docs/adr/0056, 0075)
- A `persons` tag in a sentence's `tags` (`- {persons: {addressee: m}}`, read with `sentencePersons`: speaker m/f;
  addressee m/f, sg (number but no gender: yue 你), du, pl) is shown as tags under l1-l2 prompts and gap-fill hints;
  tag where the target marks gender/number and English cannot, and keep the accept set to the forms that fit.
  Untagged means every form is accepted. The same goes for "it" and a bare "this": unless the sentence names the
  thing, accept both genders (mish b3id / mish b3ide, jarrbo / jarrba).
- Exercise every person the language marks, never one default (ADR 0075): a woman speaking as well as a man, to a
  woman, to one/two/several people. Draft the set together (kifak / kifik / kifkon) and check the spread per course
  before committing (counts in docs/adr/0075). Never let "a man speaking to one man" be the norm.
- Register is the same idea, half modelled: a sentence may carry a `register` tag (`- {register: formal}`: es, fa, uz;
  a language declares its `registers` in language.yaml) and the AI judge is told it (`sentenceRegister`), but no prompt
  shows it and no accept set is held to it (ADR 0147's prompt tags are not built). Speech levels are not modelled at
  all: Javanese (ngoko/krama/krama inggil), Korean/Japanese honorifics. When a register language arrives: an ADR, a tag
  the prompt shows, accept sets that fit it, and every level exercised. Gendered plurals (Hebrew atem/aten) will need
  a gendered pl.
- A course's voices share its items (ADR 0078): each sentence, word and story character gets one voice at random
  (seeded by its id: `assignment` in nabu/audio/course.py), except where grammar says who speaks (a `persons` tag's
  `speaker`, a story character's `speaker`): then a voice of that gender, if cast. A one-voice cast reads everything
  (a man reading a woman's line is fine). Checked clips keep their voice. Set a character's `speaker` only where the text fixes it
  (agreement, kinship words), never from a name alone. Adding a voice re-draws about half the items: regenerate.

## Account data notes (see docs/adr/0067, 0069)
- `GET /v1/export` and `DELETE /v1/account` (src/privacy.ts): a new table that names a learner (user id or subject) must
  be in both. Deleting asks for the password; the device keeps its log.
- Abuse limits (src/limits.ts): sign-up, sign-in, uploads; 429 + Retry-After. `NABU_RATE_LIMITS=off` (the e2e API sets it),
  `NABU_TRUST_PROXY=1` only behind a proxy the instance runs.
- Age gate (ADR 0069, src/age.ts): `NABU_MIN_AGE` makes sign-up ask the age (400 age-required, 403 age). Keep nothing of
  the answer anywhere, never show the threshold, and parse digits with `parseDigits` (@nabu/i18n), never Number().

## Sign-off notes (see docs/adr/0072–0074)
- Reviewers sign off sentences, whole stories or a unit in the sentence list (debug mode); the file goes through
  `cd pipeline && uv run nabu review apply ../courses/<id> <file> --reviewer human:<id>`, which edits provenance in place.
- A sign-off pins the sha256 of `signoffText` (@nabu/core/corrections); its Python twin is nabu/review. Change both,
  with the pinned text in packages/core/test/signoff.test.ts and pipeline/tests/test_review.py.
- Release builds (ADR 0073): `uv run nabu build ../courses/<id> --release` keeps only reviewed sentences, stories and
  scenarios, and script tracks: an alphabet node keeps its letters and the lexemes reviewed content uses (D51);
  script tracks alone are no release. Committed bundles and the demo stay full builds. The manifest's summary counts come from
  `compiled.counted` (compiler/counts.py): count through `count()`, never by editing the dicts.
- Review workspace (ADR 0074): reviewer accounts (`PUT /admin/v1/reviewers {email, handle, courses}`) work at `#/review`
  through /v1/review/* (apps/api/src/review.ts, apps/web/src/Review.tsx, @nabu/ui/review). Every route checks the course is
  the reviewer's. Sign-offs wait on the server; `GET /admin/v1/signoffs` is a file `nabu review apply` takes as it is.
  An accepted answer is an approved report (`addAccepted`); promote writes it. The tables are in export and delete.

## UI catalogs notes (see docs/adr/0070)
- A translated catalog (packages/i18n/messages/<locale>.json) carries `provenance`; drafts are `llm:` and status draft.
  It ships (CATALOGS in src/catalog.ts) only when reviewed, complete and clean under `pnpm check:catalogs`.
  Until then it is listed in DRAFTS: reviewers see it with `?ui=<locale>&drafts=1` or in Storybook's UI-locale menu.
- Each translated message records `source`, the fingerprint of the English it translates (`check-catalogs.ts --stamp`).
  Changing an English message's meaning means a new key; a wording change makes translations stale until re-stamped.
- A plural selector covers the locale's CLDR categories; a language that needs no plural forms drops the `.match`.
- Invisible characters in catalogs are JSON escapes (\u200c), never literal; bidi controls never (MF2 isolates).

## Classical Chinese notes (see docs/adr/0071)
- A course's `facets` (course.yaml, manifest) rule out every template of another facet (`facetExclusions`, wherever
  speechExclusions applies). lzh is [recognize, produce, read-script]: no audio, never spoken or heard.
- Reading traditions (ADR 0138): an orthography's ruby layers whose scheme has an `answer` (`readingTraditions`). Reading
  cards ask the learner's (the layer last chosen, kept when readings are off: web `storedTradition`; pass it as `reading`
  to `plan`, `readingsShown`, `practicableMistakes`). Where there are several (lzh: Pinyin, Jyutping, Baxter) a card names
  its `tradition` and its read-script card is that tradition's (`part|read-script|orth|scheme`); with one, keys are as
  before. Typed readings come after a choice card in that tradition. Pinyin is typed with marks or tone numbers
  (`toneNumbers` step), its tones `required`; Baxter's ASCII is case folded, no typo leeway.
- An orthography may pin several ruby layers (lzh: pinyin, jyutping, baxter). Every Han word token pins all of them,
  chosen by lexeme (說.yue is yuè / jyut6 / ywet), one reading in all three: never Pinyin of one word with Baxter of
  another (見 "see" jiàn / gin3 / kenH, "appear, have an audience" xiàn / jin6 / henH). The compiler checks they line up per character. Jyutping is the
  literary reading; Baxter is Baxter & Sagart 2014 ASCII from the Guangyun. The player shows one layer or none.
- A layer's `lang` tags its ruby text (`<rt lang>`): zh-Latn-pinyin, yue-Latn-jyutping, ltc-Latn-x-baxter.
- Lexemes spelled alike take a suffix (知, 知.zhi); a token names its lexeme, and glossAt glosses it as that.
- Each unit's lessons teach the words of its story, an authentic passage; stories may use no word taught later.
- Target-language text is sized apart from the rest: a profile's `fonts.scale` (lzh 1.25), times the learner's size
  for the language being learned (Preferences; `--nabu-target-scale` on <T> text marked `data-target`). Render course
  pages inside `CourseUiProvider` so <T> knows which orthographies are targets.
- lzh is checked against Baxter & Sagart's list (2015 xlsx: the Baxter layer is their transcription, row by row),
  Kroll (2017: senses and glosses) and Pulleyblank (1995: grammar); notes in `nabu/notes/lzh/` (ADR 0127). Kroll's PDF
  has a clean text layer (printed page = PDF − 16); Pulleyblank's is a scan (OCR, then page images; PDF − 11).
- Grammar the accept sets keep: after a negative a pronoun object precedes the verb (王不我知; 之 dropped after 不,
  before the verb after 莫/未: 莫之能知); 吾 only before its head (never 吾也, 非吾); 於, never 于 for it.

## Cuban Spanish notes (see docs/adr/0076–0077)
- courses/es: thirty units A1–B2 for heritage speakers; courses/es/README.md is the brief, syllabus and conventions.
  Cuban forms are canonical (guagua, ¿Qué tú quieres?); pan-Hispanic ones are accepted, never the reverse.
- Verb tenses are feature values in the token's `feats` (tengo: `{Mood: Ind, Number: Sing, Person: '1', Tense: Pres,
  VerbForm: Fin}`), never a lexeme of their own; `iPlusOne: 2`. The node that first teaches a tense introduces its value
  (`feature:Tense=Past`), and lexicons/es/language.yaml's `labels` name the forms ("past tense (preterite): I (yo)").
- A noun's gender is its lexeme's (ADR 0132 amendment): stored in lexicons/es/lexemes.yaml (`feats: {Gender: Fem}`)
  only where language.yaml's `defaults` do not give it (mano, Cuba, Marisol; casa and agua are feminine by their -a), or
  chosen on its tokens where its entry says `chooses: [Gender]` (tío, tía). A noun's token chooses its number (casa
  `{Number: Sing}`); every agreeing adjective, determiner and pronoun chooses gender and number by its agreement in the
  line (mi casa: mi `{Gender: Fem, Number: Sing}`), never by its ending alone; a new sentence's tokens need them.
  Pronouns choose theirs (ella `{Gender: Fem, Number: Sing}`; ustedes, nos, les `{Number: Plur}`).
- es-Latn/standard: a missing accent is CORRECT_MARKS; one that spells another word of the course is WRONG_WORD
  (`marks.distinguishes`, the grader's lexicon). ñ is a letter, not a mark.
- A finished placement seeds what the placed nodes introduce (ADR 0111): `seeded` on the event (`placedParts`), a card
  each in the fold (recognize; read-off for a feature value). Placement is adaptive (ADR 0077: a block per unit,
  gallop then bisect, then node steps); `placement: {production: typed}` makes its production typed. The test is
  data and `runTest` a pure function: never make it stateful.
- Two voices clone Cuban recordings (`nabu audio cast --recording`; a man's CC BY, a woman's CC0); clips are CC-BY-NC-4.0
  (OmniVoice weights) and credit the recording. Cut a reference on whole words, no breath at either end.

## Reference library notes (see docs/adr/0079, 0090)
- Grammars, dictionaries and notes are copyrighted: they live in the owner's private Drive behind the relay
  (apps/references), never in the repo, bundles, issues or commits; nor does text extracted from them.
- Two roots: `books/` is the library (books_bak/books, sorted by subject and language family, and still being sorted);
  `nabu/` is the work folder. Notes per course live in `nabu/notes/<course>/` (hbo, tok, …): read them first.
- Find a book by name, never by a remembered path: `cd pipeline && uv run nabu refs find kline lebanese` (every word
  starts a word of the name; `--in books/ling` narrows). Courses cite books by author, title and year, not path.
- `pull <path>` (into NABU_REFS_DIR, default ~/nabu-references; refuses a git work tree and more than --max-gb),
  `put <file> nabu/notes/<course>/<name>.md --parents` for notes. Extract text and page images there, not here.
- Courses take facts from references (forms, paradigms, glosses), never example sentences or definitions verbatim.
- Cloud sessions: NABU_REFS_URL is an environment variable; the key is the relay host's network secret (never chat).
  The relay trashes, never deletes; uploads stop at 25 MB (scans go into Drive directly).
- The PDF text layer garbles Arabic (presentation forms, loose shaddas, words out of order): read Latin from the text
  and check every Arabic spelling on a page image (`pdftoppm -png -f N -l N`).

## apc twenty units notes (see docs/adr/0080)
- apc has thirty units, checked against Kline (2022); units 21–30 (B1) were put through the rules by a generator kept
  in the reference library (`nabu/notes/apc/generator`), then edited as sources. Lexemes spelled alike take a suffix (ra7.fut, fi.can, men.than,
  ba3d.still, jem3a.uni); multi-word patterns are rules (lexicons/apc/language.yaml `rules`: rule:used-to,
  rule:was-doing, rule:shu-excl), named in a sentence's `uses`.
- Spelling: -o/-a (his/her, him/her; enno, la2anno) are ـه/ـها as Kline writes them, ـو/ـا accepted; -on (their) is ـهن.
  Vowel marks put a damma before ـه (بَيُّه): the voice says -o from it. New vocalizations mark ج as a sun letter.
- Vowel marks write the helping vowel in every cluster that ends a word (the owner, 2026-11-21): خِبِز, بِنِت, كِنِت,
  فيلِم; a damma after a damma inside the stem (صُبُح), a kasra before the past's -t (رُحِت). A new vocalization follows
  it; the Arabizi stays as written (khebz). No word stores it: it is a rule (docs/lexical-forms/apc.md). Inside a
  word it stands before an ending that begins with a consonant that is said (بِنِتْكُن, سْمِعِتْني), never before a
  vowel or the silent ه of their (إِبْنْهُن, ebnon). "She" in the past has the speaker's shape (3ajbetni, 3azmetna).
- A voice's `spoken` may name only items that voice reads: in a two-voice cast an item's voice can change (ADR 0078),
  and `nabu audio generate` then refuses. Use it for homographs in one-voice casts, not to keep old clips.
- Gender and number (ADR 0132 amendment, then ADR 0159): a noun's gender is its lexeme's, stored only where
  language.yaml's `defaults` do not give it (teta, Beirut `feats: {Gender: Fem}`; ahwe, قهوة, by its ة); its token
  lists its number's lexeme (ahwe + `sg`, wlad + `pl.noun`); an adjective or participle lists its agreement (kbire:
  kbir + `fs`; `ms`, `pl`); hayde, hiyye, enti still choose gender and number; in both scripts alike. So `iPlusOne`
  is 2. The verb-prefix contrast names verb forms (`forms`), so a noun's first letter stays a typo.

## Biblical Hebrew notes (see docs/adr/0082–0084, 0089)
- courses/hbo is Biblical Hebrew, never Modern: no voice may read its text. Voices read the pinned `tiberian`
  reading (SBL transliteration, acute on non-final stress, final "-" for maqaf-bound words), which
  nabu/audio/tiberian.py turns into phonemes. The voice is Piper's Arabic `ar_JO-kareem-medium` (ADR 0089), given
  IPA (`tiberian.piper`, the scheme's plug-in in nabu/schemes.py): Khan's vowels and stress, Arabic-bent
  consonants (vav [w], alveolar [r], ṭ ṣ as the voice's t̪ s̪, [jj], no aspiration). After a reading changes,
  `nabu audio generate ../courses/hbo` (speech group; minutes; MIT), `nabu audio align ../courses/hbo` (word
  timings), then `pnpm bundles`. It is read, not heard: its `facets` leave out listen and its voice is iffy (ADR 0091:
  no listening exercises; clips still play once a card is answered).
- Text is written pointed (WLC pointing, no accents, no meteg); `reverse` unpointed. The profile's marks set is
  the points only (what "Show vowel marks" hides and a vocalize card asks for); accents and meteg are removed in
  normalization. Write points and escapes in profiles with Python (chr(92)), never a heredoc.
- Every word token pins `readings: {tiberian: …}`, taken from the same pointed form in the Westminster Leningrad
  Codex (stress from its accent): never guess one. A word in pause or with its stress drawn back reads otherwise than
  the same word elsewhere: label it `context: pause` or `context: nesiga` (ADR 0135); a maqaf-bound word's "-" must
  match the maqaf (`reading.bound`). Copy the word with its accents from the WLC and run
  `cd pipeline && uv run nabu tiberian <word>` (nabu/audio/pointing.py); keep a verse's ׃ on its last word (its
  meteg sign is then silluq). The divine name is ʾăḏōnāy (its qere).
- Readings stay SBL's (šāmərû); `tiberian.ipa` says them as Khan, vol. I, describes (ADR 0084: silent shewa after a long
  vowel, the echo vowel, uvular resh, [ɟɟ]). A sound rule changes only with a page of Khan; listed rules are not modelled.
  The voice's Arabic consonants (ADR 0089) are Ben's choice, not Khan's: keep them apart (`arabic=True`).
- References (ADR 0084; notes in nabu/notes/hbo): Khan for sounds, Joüon–Muraoka for forms and stems,
  Holladay for glosses. Contrast sets limited by `forms` (words whose tokens stand in those forms: a part of speech and
  feature values, `FormCondition`) carry the verb's person prefixes and endings and agreement; a noun's first letter
  and an infinitive's -ôṯ stay typos.
- A noun's gender is its lexeme's, stored only where language.yaml's `defaults` (-â, -t feminine) do not give it; its
  token chooses number and state (ADR 0132 amendment): `{Number: Sing}`, `{Number: Plur}`, `{Definite: Cons, Number:
  Sing}`; nouns always plural choose Plur (מַיִם), אֱלֹהִים as God Sing. הִיא, אַתְּ, זֹאת `{Gender: Fem, Number:
  Sing}`; הֵם, אֵלֶּה plural. A new sentence's nouns need them; the agreement contrast (`forms: [{pos: [NOUN, …], feats:
  {Gender: Fem}}, …]`) reaches them.
- Units read a Bible passage (the WLC, public domain) as their story; lessons teach its words. Verbs are lexemes by
  stem (hithallekh beside halakh); prefixes and suffixes are lexemes the token writes (הַ ha in הַשָּׁמַיִם); verb forms
  are feature values by conjugation and person (iPlusOne 2).
- A sentence's `reverse` lists its own order, then the other order of subject and predicate where Biblical Hebrew has
  both and the English translation would be the same (ADR 0084): nominal and participle clauses, plain qatal/yiqtol,
  a distinct jussive. Never a subject before wayyiqtol or weqatal; not identity clauses (קין אחי), the blessing
  formula, a wish in a plain yiqtol, or an order that reads unpointed as a construct chain (בגן האדם). Keep it so.
- Then the forms the English cannot tell apart (ADR 0085): a wayyiqtol's X-qatal (האשה אמרה, והאשה אמרה) or bare
  qatal with or without its pronoun (ברח, הוא ברח, והוא ברח; never וברח), a weqatal's yiqtol, a pronoun before a plain
  qatal/yiqtol; only Codex-attested forms; vav forms only where every English line has its "and".

## Cantonese notes (see docs/adr/0092)
- courses/yue is checked against Matthews & Yip, *Cantonese: A Comprehensive Grammar* (2011); notes in `nabu/notes/yue/`.
  Its text layer's Chinese characters are wrong (read them from page images) and its Yale shows ā ē ī ō ū as A B C D E.
  M&Y write Hong Kong speech (你 léih, the n/l merger): compare tones and changed tones, never the initials.
- Particles: 呀 aa3 (lexeme 呀) softens a question or statement but never makes one; aa4 (àh, lexeme 呀.q) turns a
  statement into a question.
  No 嘅呀 (ge + a is 㗎, outside the script audit); 嗎 is formal (你好嗎). 喇 laa3 a new situation, 啦 laa1 requests.
- 俾 puts the thing first (俾錢你). 好 + adjective is a weak "very": English accept sets keep very/really/so optional.
- Voices (ADR 0094): VoxCPM2 (`voxcpm`, pipeline/runtimes/voxcpm, its own uv project) cloning two designed anchors
  (courses/yue/audio/voices, Apache-2.0) with their transcript. A word card is said after `跟住我讀：` and cut out by
  forced alignment; a sentence is slowed toward `pace` (4.3 syllables/s, ≤1.6×) with Rubber Band (apt rubberband-cli).
  Generate on a GPU (Kaggle): the runtime and the pipeline on CUDA torch, `UV_NO_SYNC=1`, then `nabu audio align`
  for each voice. Never re-cast the anchors without the owner: they are the voices the owner chose.
- The round trip hears yue with a Cantonese Whisper fine-tune (the yue profile's `speech.recognizer`, ADR 0116), never
  Whisper's own (it writes Mandarin), and compares differing characters by reading (homophones free, a tone apart half).
  `nabu audio check <course>` re-runs the check on existing clips.
- Jyutping (ADR 0126): yue's second orthography, yue-Latn/jyutping, Jyutping the text and the characters its ruby
  (scheme `characters`). Never written by hand: after changing a yue sentence, lexicon entry or story line, run
  `cd pipeline && uv run nabu jyutping ../courses/yue` (it lists readings it took from PyCantonese for a person to
  check); the compiler and `--check` (tests) catch a stale one. Tones are never typos there (contrast sets).

## Toki Pona notes (see docs/adr/0086)
- courses/tok is in two orthographies, every sentence pinned in both: tok-Latn/standard (sitelen Lasina) and
  tok-Qaap/sitelen-pona. Qaap is a private-use ISO 15924 code until one is assigned (the proposal asks for Stpn).
- sitelen pona text is UCSUR code points (U+F1900..U+F19FF): words run together, U+3000 between sentences, no ! ? or
  commas, a name as a cartouche whose logographs begin with its letters. Never write it by hand: `cd pipeline &&
  uv run nabu sitelen-pona "mi moku." --name "Sonja=sona olin nasin jan a"`. The compiler checks it against the Latin.
- Typed Latin is graded as logographs in sitelen pona (the `logographs` step), names against their cartouches. Every
  logograph token pins `readings: {lasina: word}` (ruby, char-read; off until chosen, then over every word or new words
  only: `fade: by-facet`, ADR 0131's amendment of 2026-11-23); Latin tokens pin it too: it is what the voices say,
  as eSpeak NG phonemes (nabu/audio/toki_pona.py). After a sentence changes, `nabu audio generate ../courses/tok`.
  The voice is iffy (ADR 0091): no listening exercises, clips only where the text is shown.
- The font (sitelen seli kiwen juniko, OFL) is in packages/ui/src/fonts; its README says how it was subset.
- Toki Pona marks no person: no `persons` tags. English accept sets give I/we, she/he/they/it and the tenses.
- Toki Pona accept sets (ADR 0085; kinds in ADR 0086): mi or mi mute li for we, ona (mute) li for they, jan mije or
  mije, mama or mama meli/mije, X ala X or anu seme, tenpo pini/kama la or none, kule + colour, ali for ale.

## Attic Greek notes (see docs/adr/0087)
- courses/grc is Attic, never Modern Greek: no voice may read its text. Every word token pins `readings: {attic: …}`,
  its spelling with each α, ι, υ outside a diphthong marked long (ᾱ) or short (ᾰ) unless a circumflex or subscript
  settles it; `cd pipeline && uv run nabu attic <reading>` checks one. After a change, `nabu audio generate ../courses/grc`
  (needs piper-tts in the pipeline venv). The voice is Piper's Greek rapunzelina given IPA (`attic.piper`), a stopgap
  rated bad (ADR 0091): its clips (CC-BY-NC-SA-4.0) are heard only in the audio check, never shipped.
- Grave = acute (silent); missing marks are CORRECT_MARKS unless they spell another course word. Write graves and
  enclitic accents as editions do, in every accept-set alternative too. A lexeme's spellings are lemmas (a grave-only
  variant is a dead glossary entry). Units read public-domain passages (Perseus); take only facts from CGCG and the CGL.
- The alphabet track asks a word as its lexeme's Attic reading in Latin, lengths kept (χώρᾱ chōrā, ADR 0133). A lemma
  no sentence spells gets `readings: {attic: …}` on its lexicon entry (ἀγορά: ᾰ̓γορᾱ́), with the lengths its inflected
  tokens show.
- A noun's gender is its lexeme's (stored where language.yaml's `defaults` do not give it; παῖς `chooses: [Gender]`);
  its tokens choose case and number. Adjectives, pronouns and the article choose gender, case and number (ADR 0132
  amendment), every value written: ὁ `{Case: Nom, Gender: Masc, Number: Sing}`, τὴν `{Case: Acc, Gender: Fem, Number:
  Sing}`, τὸ `{Case: 'Acc,Nom,Voc', Gender: Neut, Number: Sing}` (a neuter is one form as subject, object or address).
  A new sentence's tokens need them; ἐγώ, σύ choose case and number only.

## Voice quality notes (see docs/adr/0091)
- A course's `audio.quality` says how far learners may rely on its clips. good (default): everywhere. iffy (a stopgap
  voice: hbo, tok): only where the text is in front of the learner (answered cards, stories, the word list); the
  manifest's `audioQuality` makes `courseExclusions` drop LISTENING (listen-and-repeat too) wherever plans are made.
  bad (grc): the compiler ships no clips; they stay in courses/<id>/audio for the audio check.
- Rate a voice good only when it is a model of that language (apc, es, uz, fa, yue); a voice borrowed from another
  language is iffy at best. Changing the rating regenerates no clips; run `pnpm bundles` after it.
- Rule templates out through `courseExclusions`, never by hand in one caller (lessons, practice, placement, gallery).

## Script tracks notes (see docs/adr/0088, 0133)
- A `script` node with `alphabet: {orthography, lexemes}` teaches an orthography's letters (the unit's `graphemes`, by
  their forms: letters, diphthongs, marks); the compiler adds the letters each lexeme credits and its reading in Latin
  (ADR 0133): the profile's `scriptTrack: {reading}` names the scheme, the scheme's `latin` its Latin orthography. A word
  is its lexeme's pinned reading (the word card's), through the scheme's `latin` plug-in where its text is not Latin
  (Attic: nabu/greek_translit.py); a letter is the plug-in's rendering, or its grapheme's form in that orthography (chg).
  Never a romanization of the spelling. `script.untaught-letter` stops a word with untaught letters.
- Its four templates (letter-read, letter-pairs, word-read, word-write; @nabu/core/lesson/script.ts) are built only
  for script nodes: never add them to SENTENCE_TEMPLATES (every course's lessons and goldens would change).
- The row (`scriptPathOf`) sits above the units and never gates them; a script node is planned as `{mode: "lesson"}`.
  Letters (`grapheme:`) are not glossary entries. Convert nodes (uz, apc) still do not run.
- A script track's letters and marks come from the profile (core-cli `letters` and `unicode-set`), never a list in code;
  a form with no letter is `script.no-letter` (ADR 0124). A word no sentence spells needs its lexicon entry's
  `readings` (`script.missing-reading`): an entry may give the reading of a spelling no token spells (ADR 0133).

## Chaghatay notes (see docs/adr/0128-0129)
- courses/chg is Chaghatay (literary Turki), read and written only (no audio; the script facets are its alphabet track's). One
  orthography, chg-Arab/standard, set in Nastaliq (Noto Nastaliq Urdu). Every word token pins `readings: {schluessel:
  …}`, Schluessel's transliteration (2018), shown as ruby over the whole word (the scheme's `ruby: word`), over new words until the learner chooses, and asked by
  char-read cards whose wrong options trade a vowel the script leaves open (the scheme's statement, REVIEW), then typed
  (transcribe, `typedByProfile`: graded by chg-Latn/schluessel) once a choice card has shown it (ADR 0131): a vowel's
  marks are `required` there (ä ö ü ā ī ū ē à: left out or moved, wrong) and so are those of š ž ḫ ǧ
  (`requiredLetters`: s for š is another sound; the letter traded for another is still a slip), another consonant's
  noted (ADR 0134 and its amendment);
  every lexeme pins its own in the lexicon (a verb's stem never stands alone). Never a second, Latin orthography (ADR
  0129).
  A line's readings stand level, a gap over its tallest word's ink, inside their box (ruby-lift.ts, ADR 0131 amendments).
- Arabic as Schluessel's typescript spells it: ک ی, ŋ as نک, the copula -dur after a ZWNJ (\u200c), other suffixes
  joined, a ZWNJ after a final vowel ه; Persian punctuation added. The Latin is his reading, not letter for letter.
- A lexeme's form is Schluessel's reading (the owner, 2026-11-28), with signs for what only the Arabic writes (a vowel
  written or not where the default says otherwise, آ, a twin letter, a letter written and not said, a shadda, a damma;
  · for the ZWNJ, in the readings too: širin·dur) and suffixes in archiphonemes (A U D G K Ğ); chg-Arab/standard's and
  chg-Latn/schluessel's `spell` give the Arabic and the reading from it (docs/rules/chg.md, the table; all REVIEW). The
  compiler checks a token's reading against its form (`form.reading`). conformance/realise-chg.json and spell-chg.json
  are written by packages/core-cli/scripts/chg-vectors.ts: after a change, run it and read the diff.
- Suffixes are affix lexemes (`realises` a feature value, `allomorphs` by spelling: dat, past, pres, mis …) in a
  token's `lexemes`, one per morpheme: bardim is bar- + past -di + pp1s -m (ADR 0128 amendment; the past and the
  conditional take the possessive-type person endings pp1s pp2s pp2 pp1p pp2pl, the present -män … p1s …; -lar is p3pl); verbs are cited as stems with a hyphen (bar-). Homographs take a suffix (bar.go, at.name,
  kim.that, yuz.face). A derived word is a lexeme of its own (the owner, 2026-11-28: its meaning is not wholly its
  parts'): qoychi, never qoy + ci; its entry names its `base` and `pattern`, its form is the rules' for them
  (docs/rules/chg.md).
- chg merges (2026-11-28, docs/rules/chg.md): its suffixes say what they merge onto (`on`, `lacks` for the order: stem +
  plural + possessive + case, S 3.4), a noun, name or pronoun requires a case, a verb a form, a finite tense a person;
  the unmarked cells are zeros a token lists with no surface (`nom`, `p3`, `imp.sg`), folded into the base's values
  and never a part. The present's -dur is the verb's person (`p3.dur`); a predicate's person is the copula's, a word of
  its own (`dur`, `cop.1s` …, `cop.3pl` -durlar); -iŋizlar is `poss2pl`. A new chg token lists its zeros. Its labels
  (language.yaml) name every paradigm cell: a new cell needs one.
- Schluessel's book is CC BY-NC-ND: take facts from it (letters, suffixes, spellings, glosses), never his example
  sentences or the documents he composed (ch. 7). Stories are public-domain passages (Babur, the Tadhkira, Abu
  'l-Ghazi, Navai, Qasim Beg, the Prophets, a risāla) as he types them, in the source's spellings (فادشاه, پز, tep),
  with his reading in the Latin. PDF page = book page + 35; check Arabic on page images. Notes in `nabu/notes/chg/`.
- "You": sän tagged to one person, sizlär to several, siz (polite or plural) untagged; accept sets take the forms
  that fit. No gender: he/she in English accept sets.
- Where Schluessel reads a scribe's spelling otherwise than its letters give (موغالستان Moǧulistān, شهریکه šahargä,
  صندوقدا ṣandūqta), the scheme lists it word by word, free, under REVIEW (as tiberian lists its qeres), and the
  reading stays his; a lexeme is spelled as his glossary spells it (موغولستان). An ezafe after a final ه is read as he
  writes it (شجرهٔ šajarah-i).
- The Arabic alphabet track (units/abc.yaml) asks a word as its lexeme's pinned Schluessel reading, a letter as its
  grapheme's chg-Latn/schluessel form (the scheme's `latin`, ADR 0133; that profile is the track's Latin side, not a
  course orthography); no verb stems (their hyphen).

## Slovak notes (see docs/adr/0155)
- courses/sk is standard Slovak for English speakers, A1 to early B1 in twenty units: forms from Mistrík (1988), the
  order from Krížom-krážom A1 (2009) and Naughton (2012); notes in `nabu/notes/sk/`; the brief is courses/sk/README.md.
  Everyday scenes in Žilina with people of its own (Lucka, Tereza, Dominik, Simona, Rudo, Samko, babka, Liam).
- Marks are spelling: a missing acute is length, a missing caron another consonant, both wrong (as es, ADR 0148).
  d' for ď is a missing caron, never folded (the owner). The profile states i/y, soft d t n l before e and i, ä,
  voicing and v said as u as sound-alike spellings (REVIEW); d t n l that stay hard before e or i (teraz, ten) are its cost.
- Lexemes as es's: aspect partners are two lexemes, each storing `Aspect` (robiť / urobiť); a perfective's present
  says the future (its label's note); reflexives cited with their clitic (`volať-sa`, spelled `volať sa`); a
  pronoun is one lexeme with every form (ja: mňa, ma, mi, mne, mnou); vocalized prepositions are spelled variants
  (v, vo). A masculine noun stores its animacy (no ending gives it); animals decline as things in the plural.
- Tokens choose as es's do: a noun case and number; an agreeing word gender, case, number and, in the masculine,
  animacy. Comparatives and superlatives are the adjective's (or adverb's) forms (`Degree`); the passive
  participle is its verb's, declined (`VerbForm: Part, Voice: Pass` with the agreement); `by` is AUX
  `{Mood: Cnd}`, the -l form beside it keeps `Tense: Past` (UD's way). Accept sets keep the clitics second.
- The voice is Piper's `sk_SK-lili-medium` (CC-BY-4.0, one woman's voice for every line). After a sentence changes,
  `cd pipeline && uv run nabu audio generate ../courses/sk`, then `pnpm bundles`. No listener has heard it yet;
  the round trip failed 353 clips (275 lone words), held back until a listener passes them.
- Unit 17's story is the start of Dobšinský's *Ako šlo vajce na vandrovku* (1881, public domain): the page's
  words in today's spelling, each change in the unit's header. The tale's *kde* (where to) and *rečie* stay; the
  lessons teach *kam*. Kozliatka and the twelve months were too dialectal; a new passage only from a page image.
- The units and lexicon were first written by a generator (library: `nabu/notes/sk/generator`); they are sources
  now, edited directly. Draft sentences: every case form a reviewer should check is on the Data page.

## South Tyrolean notes (see docs/adr/0156)
- courses/bar is the South Tyrolean dialect (bar-Latn-IT), never Standard German, for English speakers, A1 to early A2
  in ten units; the brief is courses/bar/README.md. Spelling and the words Standard German lacks from Moser's
  *Wörterbuch der Südtiroler Mundarten* (2015; notes in `nabu/notes/bar/`); Weiß (1998) is Central Bavarian: only
  rules he states for Bavarian as a whole. Every form Moser does not attest is Claude's (REVIEW).
- No norm: one spelling per word, Moser's without his stress marks; long a and the dark short a both o (Tog, Wosser:
  the voice reads å as o, ADR 0156); å typed is read as o (normalize). The everyday variants are free correspondences
  in bar-Latn.moser.yaml (-n/-en, ia/ie, ß/ss, -sch/-scht), never accept-set alternatives; oa/ua is left out (it would
  take Boa for Bua). A new free variant needs vectors and a check that no two course words newly compare alike.
- Central forms canonical (koan, isch, kemmen, gian, nit); other valleys' are notes. Standard German answers are wrong.
- Nouns store gender (no defaults); tokens choose case and number, a noun's case its phrase's. Predicative adjectives
  carry no features. Fused forms are one token writing two lexemes: geat's, gip's (verb + 's), afn, mitn (preposition +
  the article written as n). The past is the perfect; wor is sein's past; tat + infinitive is `rule:tian-would`.
- Voices: OmniVoice cloning two VinKo Corpus speakers (CC BY-NC-SA 4.0: U0430 Bozen, U1810 Meran), `language: de`;
  clips CC-BY-NC-SA-4.0, good (the owner's rating, 2026-11-24, over ADR 0091's iffy for a borrowed model). Generate
  with `--no-check` (Whisper writes Standard German and fails every dialect clip).
- The units and lexicon were first written by a generator (library: `nabu/notes/bar/generator`); edit the YAML now.

## Word parts notes (see docs/adr/0152)
- Two cards ask a word by its parts: `parts-whole` (the sentence with the word left out, its own word and its forms
  given; typed) and `whole-parts` (the word marked in its sentence, its parts picked among others in any order). A
  course switches them on with `wordParts: true` (course.yaml; on in apc, chg, es, fa, grc, hbo, sk, uz; yue has one form,
  nothing to tell it from); elsewhere `courseExclusions` leaves them out.
- A part is the word's own lexeme (its first spelling), another lexeme its token writes (a clitic, an article; an
  ending or suffixed pronoun no orthography spells, `bound`, is named by its gloss) or its form (`formPart`: the
  language's label for the token's feature values, `labelOf`, unless the word has them of itself: `ownFormsOf`, the
  values its tokens choose where it is written as its lemma). Parts come from tokens (`wordPartsOf`,
  lesson/templates.ts) and a form's name from its label in language.yaml: never a list of forms, endings or genders in
  code.
- The cards ask and credit forms only (`formsOf`: bound lexemes, and the feature values a named form chooses that the
  sentence teaches; `askedParts`); a word the card shows is given. A word with no form gets no card. Never credit a part
  whose text the card shows, and never make a built word the card hands over (its own word typed as shown and accepted:
  fa's unwritten ezafe).
- Other parts offered (`otherParts`): from the unit or earlier, at least one a form, never a form whose label overlaps
  the one the word stands in (`overlapping`: feminine beside feminine plural; REVIEW). What the sentence means shows
  only once answered.
- A built word is read first (each form recognized right, the fold's `shown`), never takes a sentence's typing slot
  (ADR 0101: it waits while a sentence could still take one) and has a slot of its own where the session can afford it
  (planner `builds`). One of each card a session. Their `prior`s are guesses (REVIEW on real logs).

## Data page notes
- Debug mode links each course's Data page (`#/<course>/<orth>/data`, apps/web/src/Data.tsx): its words, forms and
  patterns, letters and sentences, to read and search. It is @nabu/core/lesson `courseData` (every word with the ways
  its sentences write it and what each token carries: `tokenParts`, a form the word has of itself marked; every form
  with the words that carry it; every sentence with its words, tags and accept sets) shown by @nabu/ui/data
  `DataBrowser`. It reads the bundle the lessons read and records nothing.
- What the page shows is laid out in core (`courseData`: tags, readings as text of their own), never taken apart in UI
  code (`nabu/no-manual-tagged-text`); ids and tags are code, in the interface's own face, left to right.
- One search matcher: @nabu/core/lesson `textMatcher` (letters as the profile compares them, readings with or without
  tones, support text in its own language, ids). The word list's `wordMatcher` and the Data page's `dataMatcher` call
  it; never write another. A sentence is also found by a part it lists (feature:Case=Dat, lexeme:dat).
- Its Lexicon view (`lexiconData`) lists every lexeme of the lexicon, bound ones too, each opening to its entry as
  lexemes.yaml has it, its bundle lexeme (features marked stored or given by a default) and what the course does with
  it; its Language view shows language.yaml. The files come from lexicon-source/<course>.json beside the app
  (apps/web/lexicon-source.ts: a Vite plugin in dev and preview, written for Pages), never from a bundle.
- The Lexicon view is filtered on top of the search by facets core reads off the lexicon (`lexiconFacets`,
  `lexiconFilter`; LexiconFilters in @nabu/ui/data): part of speech (or `realises`), free or bound, taught, untaught or
  only in the file, the features it has a value for (VerbForm, whatever the value), feature values, the keys an entry stores or lacks. A facet a lexeme has one value of takes any chosen,
  one it has several of takes all (`FACET_COMBINE`); a value every lexeme has is not offered. Never a list in UI code.
- Records are `DataNode` trees laid out in core, every key of a record shown, a key no one has named as text of `und`
  (lexicon-data.test.ts checks every key of every fixture lexeme): name a new field's kind there, never in UI code.

## Rules explorer notes
- Debug mode links each course's rules explorer (`#/<course>/<orth>/rules[/<request>]`, apps/web/src/Rules.tsx, its own
  lazy chunk): pick a base lexeme (the lexicon browsed, searched and filtered by the Lexicon view's facets: part of
  speech, inflection class, free or bound, …; it opens in its citation cell, `ExplorerLexeme.citation`), set its cell's
  values (a value set drops the others no known cell combines it with: core `fitCell`, es VerbForm=Fin drops Gender; a lexical
  feature the lexeme does not `choose`, a noun's own gender, is never offered), write other lexemes before or after it (as a token lists them:
  only bound lexemes and those the course writes on that side, `attachable`),
  set the next word and how blocking runs, and see live the lexical form, status, every `{rule, branch}` taken and each
  orthography's spelling (and marked layer) with its free alternatives; then how the course's tokens write the lexeme,
  each with the token check's verdict (a way loads into the explorer), and its paradigm over the bundle's cells.
- It reads lexicon-source/<course>.json (the lexicon's files and, since the explorer, the course's profiles with their
  `spell`), and runs core's own functions (@nabu/core/lesson `rulesExplorer`, `explore`, `waysOf`, `explorerParadigm`
  over `realiseToken` and `spell`): the one place a device realises or spells, debug only. Lessons and grading never
  do (Rules notes). "Read the files again" picks up an edit to the rules in the dev server. The request is in the
  address (`encodeExplore`); nothing is recorded.

## Lexical model notes (see docs/migration-design.md, ADRs 0145–0151)
- There are no KCs. The units are the lexeme (`lexeme:tener`: a stem, a clitic and an affix alike), the feature value
  (`feature:Tense=Past`, what a `form:` KC was), the rule (`rule:used-to`, what a `construction:` KC was), the letter
  (`grapheme:α`), the part (any of these, or something of a lexeme: `lexeme:mano|Gender`, which no card asks yet: always
  given), the label (what a form is called: `labelOf`, the most specific whose values the form has) and the form key
  (`lexeme:ra7|form:Aspect=Part;Gender=Masc;Number=Sing`, several lexemes joined by `+`: a form's clip).
- Lexemes are in lexicons/<lang>/lexemes.yaml (schemas/lexicon.schema.json: `pos` or `realises`; `feats` only where no
  default gives them; `chooses`; `spelled` per orthography, the first shown; `forms` no rule gives yet, `listed` with its
  `statement` or `pinned`, never a learner's part; `allomorphs`; `readings`). A language's dimensions, lexical features,
  `citation` and `bare` cells, features, `defaults`, `labels` and `rules` are in lexicons/<lang>/language.yaml
  (schemas/language.schema.json; a category is a UD tag). Letters are a unit's `graphemes`; a sentence names the rules
  it is an example of in `uses`. A token names the `lexeme` it writes and the `feats` chosen there, or its `lexemes`
  (each with `surface`, `base`, `feats`), with `n`, `head`, `rel` where agreement or government matters.
- A lexeme, a rule or a letter is known by the facets' skills; a feature value by `read-off` (credited by a recognize or
  listen card) and `choose` (a produce or speak card). A read-script or write-script card gives a feature value no
  credit. A card key is "part|skill", a script skill's with its orthography (Phase 4 notes).
- A node's `introduces` holds lexemes, feature values, rules and letters. A feature value is introduced by the first
  node whose own sentences choose it on a token (a noun's own gender is no token's choice). The compiler lists a
  sentence's `parts`: its lexemes, the feature values its node has taught by then, its `uses`, a lexeme's own part where
  an agreeing token shows it (la mano). `iPlusOne` counts new lexemes, feature values and rules.
- The lexicon is flat (the owner): one list a language, sorted by id. No entry names a unit; a unit's nodes point at it
  and the unit defines nothing but its script track's `graphemes`. Words follow the order nodes introduce them
  (`lexemesInOrder`), never the lexicon's.
- Lexicons and units are sources, edited directly. The converter is gone: docs/migration/plans/<id>.yaml (its plans) and
  docs/migration/<id>.md (its last reports, what a reviewer should look at) are a record, never regenerated.
- Events are schema 2 (`exercise.parts`; `outcome.parts`, each with its skill; `outcome.labels`). `upgrade(event,
  aliases)` (packages/core/src/learner/upgrade.ts) is the one reader of schema 1: the device rewrites its log once
  (apps/web/src/upgrade-log.ts), the server its rows (apps/api/src/upgrade.ts), a download of the old shape is restored
  through it. The fold, the game's replay and the server's projections read schema 2 alone.
- courses/<id>/aliases.yaml (schemas/aliases.schema.json) is the kept record of what each old KC id became. The
  compiler ships it (file role `aliases`); only `upgrade` reads it. Renaming or removing a lexeme, rule or taught
  feature value changes the table's right-hand sides with it (pipeline/tests/test_aliases.py).
- Old events are the `…V1` types of schemas/learner-event.v1.schema.json, which only `upgrade` and the restore of an
  old download read. `outcome.labels` and `outcome.correspondences` come from the grade (Losses and labels notes).
  Seen is logged (ADR 0146): `exercise_presented.displayed` is what a card shows before its answer,
  `answer_submitted.displayed` what the answer adds, and `story_line_read` is logged once per line as it joins the
  transcript; core `displayedBefore`/`displayedWith` (lesson/displayed.ts) say what, never the UI. The fold's `seen` keeps
  each lexeme's forms seen (`lexemeFormKey`, first local date); read it with `seenIn` and `formsSeen`. It is exposure,
  never a card, and nothing logged before 2026-11-22 counts. A lemma shown as the lexicon spells it is logged with no
  `feats` (the bundle does not say which cell a lemma is).
- A token of letters is of kind `lexical` (beside `punct`, `space`, `number`, `symbol`); the UI writes it as
  `data-kind`. A bundle's `formatVersion` is 5 (`BUNDLE_FORMAT` in core, `FORMAT_VERSION` in the compiler): raise both
  when a bundle's shape or a token's changes, so a device refuses a cached bundle it cannot read and fetches the new
  one. A session kept part-way is tied to its bundle and starts afresh.
- Tags, features and relations are Universal Dependencies' and a gloss's abbreviations the Leipzig Glossing Rules'
  (the owner, 2026-11-21: "ideally we use UD/Leipzig, unless we run into trouble"); a departure is stated where it is
  made (apc `Aspect=Part`). A lexeme takes one tag, where UD tags a word in its sentence: the one whose dimensions it
  inflects for, else the one its distribution in its own language gives; never its English gloss's. The drafted tags
  of es, apc and hbo were gone over with it on 2026-11-22 (docs/migration/retag-2026-11-22.md, REVIEW): a participle is
  its verb's form (apc khayef, hbo barukh: VERB), Spanish quantifiers that agree are DET, an imperative formula that
  inflects is VERB (apc tfaddal). Toki Pona's content words keep their drafted tags until the owner names their one tag.
  A language's `dimensions` lists every feature its tokens choose (read only by the Data page).
- Nothing inside is a "word" (the owner): the units are lexeme, form, feature, part and token. A token lists the
  `lexemes` it writes, stems, clitics and affixes alike; never add a level between a token and a lexeme. "Word" is for
  what a learner is shown (messages, card and page names).
- Schema files are written compactly by hand: add a definition as text. Re-dumping a file with a JSON library rewrites
  every line. Examples live in schemas/examples/<dir>/{valid,invalid} and are listed in `EXAMPLES`
  (packages/schema/test/schemas.test.ts): a new schema gets both kinds.

## Rules notes (see docs/rules-design.md and docs/rules/<lang>.md; every language, stages 1 to 4 of 6)
- A lexeme's lexical form is its `form` in lexicons/<lang>/lexemes.yaml: a string in the language's notation, or a
  verb's radicals (`RadicalForm`: radicals, Form, vowels, `source`, `basis`). language.yaml's `notation` says what the
  signs are (apc: U+065C e, U+065D o, U+06DF a letter written and not said; always escapes, and yamlio writes them so);
  each profile's `spell`, and its vocalized layer's, says how the orthography writes a form. Core runs them
  (@nabu/core/lexicon `compileSpeller`, `spell`; core-cli `spell`; conformance/spell.json): never spell in Python.
- Rules are data in language.yaml: `rootClasses`, `stems`, `realisation` (blocks of exponents), `phonology` (ordered
  rewrites). @nabu/core/lexicon `realise`, `realiseToken`, `paradigm` (core-cli ops of those names;
  conformance/realise.json) give a lexeme's lexical form with each `{rule, branch}` taken: never realise in Python.
  A pattern matches a letter with its marks exactly and names every boundary (`+`, `+?`, `#`). A branch is lower-case
  ASCII and stable: it will enter card keys (the owner, 2026-11-23: a memory per branch). Every apc rule is REVIEW.
- Bundles carry no rule, notation, lexical form or `spell`. They carry what the compiler works out (stage 4, format 5):
  the lexicon's `cells` (per category a rule covers, the cells its tokens choose whose values the course teaches) and
  `principalParts` (language.yaml: apc VERB, the he-present), each inflecting lexeme's `paradigm` (per orthography one
  form a cell: a spelling, `[spelling, marked]`, or null) and `regularised` (only where blocking off differs: a
  learner's over-regularisation). nabu/paradigms.py writes them through core-cli; a lexeme written but never inflected
  has none. A form spelled outside its script, or beginning with a joining carrier, is not shipped
  (`form.spelling-script`). Never realise or spell on the device.
- Grading knows every paradigm spelling (core `paradigmWords` in `spellingsIn`): an unwritten regular form of the
  answer's lexeme is another form, of another lexeme lexical. Only the default spelling ships, so a free variant of an
  unwritten form is still a slip (287 wrong-form slips remain, stage 4's notes).
- A word shown as itself (a lesson's new words, the session end, the word list, the gloss dialog) goes through `Headword`
  with core `principalParts`: never in options, tiles or pairs. The parts shown are logged as seen with their cell
  (`LessonEvent.beside`). The Data page shows an entry's paradigm (`paradigmRows`).
- `form.projection` (a stored form does not spell as the lexicon writes the word) is the review list, with
  `cd pipeline && uv run nabu forms ../courses/apc`. Never change a form, a spelling or a rule to silence one.
- A `spell` rule's `alternatives` are free spellings named by variation, read only by the compiler; grading reads the
  profile's `correspondences`. spell.test.ts pins every alternative that does not compare free: stating a variation
  free (the owner: one at a time) moves its count.
- Every language's lexemes have lexical forms (2026-11-25; docs/rules/<lang>.md says how each was built, what is pinned
  or listed and what waits for the owner). An alphabet's form is its spelling: its notation names no vowel signs and its
  `spell` may have no rules; tok and lzh have no rules (each token stands in its citation cell); yue's form pairs each
  character with its Jyutping; sitelen pona states no `spell` (a logograph is lexical). The engine's keys beyond apc's:
  `stemmed` and a rule's `strip` (a citation form realised by rule), `Exponent.lexeme`, `Condition.own` and `.context`,
  `LexemeForm.free`/`before` and `Allomorph.free` (free forms and free allomorphs: one mechanism each), `accent` rewrites
  over the notation's `prosody`, `spell.decompose` and `spell.boundaries`, `unmarked` (values taught without a node).
  A new language feature extends these; never a second mechanism for the same thing.
- The compiler checks every token of a language with `realisation` or a notation (apc: all 5,470): core-cli `realise-token` with
  `spellings: false` (a form that pins spellings only is passed over; only a pinned or listed form with `form` or
  `stem` accounts for a token), then `spell` per orthography, the marked layer against the vocalization. An
  uninflected word stands in its citation cell (its own `citation` or its category's), given by its form with no
  rule. A miss is `form.unaccounted`, an error: never fix one by bending a rule. `form.pinned-differs` (error),
  `form.redundant` (warning) and `form.rule-debt` (info: apc 25 pinned forms) exist. `nabu forms` prints the report,
  `--paradigm <lexeme>` a lexeme's cells, and `nabu forms prune ../lexicons/<lang>` removes pinned copies the rules
  give: never by hand.
- Clitics (the article, b-, w-, hal) are lexemes with forms, realised from the lexemes each token lists, per
  orthography; a join's sound change is a rewrite naming the boundary. An allomorph's `before` reads the rest of the
  token (`startsIn`) or the next word's base (`pos`, `class`: a teen says its r before a noun); a rewrite may carry
  a `when`. A phrase lexeme's token is one word of it, and the values any of its tokens chooses are the phrase's.
- apc's helping vowel at a word's end is the marked layer's `spell` (the form keeps the cluster: رُحْ+ت), never a
  rewrite; inside a word it is the rewrite `rule:apc-helping-vowel|inside`, which Arabizi may leave out.
- apc-Latn's free spellings are stated in its profile (the owner, 2026-11-23; each REVIEW with its measured cost):
  e/i, i/ee and e/ei before a consonant, o/u (with ou), an initial 2a/2y, and the helping vowel, one line per final
  cluster (a new word ending in another cluster needs its line; clusters ending in t, and 3d, stay out: they would
  merge the past's -t with -et, kent with kenet). Arabizi writes no length, so a short vowel takes the long spelling
  too. Each was proved to merge no two forms the course keeps apart: keep that proof for any new one.
- A typed word no token writes, which the course's forms stand only in other forms of the expected word's part of
  speech, is another form (grammatical), never a free variant (grade.ts `pinnedElsewhere`: sme3teene for sme3teni).
- An article written joined, apart or assimilated is a join (`match.joins` in the profile; match/join.ts): the
  alignment takes one or two typed words as the article and its word only where the accepted answer has the article;
  sun letters, `minRest` and `notBefore` are profile data. Never split words in code, and never list article spellings
  in a new sentence's accept sets (the old `(el|l|il)` groups are kept). Prepositions with the article (3al, bel) are
  not read yet.
- apc follows Kline where the course differed (the owner, 2026-11-23): re7t, er2os, a3zmak, shrab, sefart, be7ki,
  b3at(li), ليكوا; the old spellings are accepted. A verb's lemma is its he-past as the rules give it; a lexeme cited
  in another cell says so (`citation`: 2a3ed, seken, wa2ef, khayef), and `nabu forms` checks lemmas through that cell.
  A lemma whose letters the sentences write as another word takes its marks from vocalization.yaml's `lexemes`.
  apc's clips carry word timings (`nabu audio align`).
- docs/lexical-forms/apc.yaml and apc-review.md are a frozen record.

## Merging lexemes notes (see docs/adr/0158)
- Morphology is merging lexemes (the owner, 2026-11-26): a lexeme has its category and its form, never a switch for
  person, tense or case; every value a word has is brought by a lexeme merged with it (`realises`), zero morphemes
  included (an empty allomorph). A bound lexeme says what it merges onto (`on`: the base's pos, which side it stands, `at`, values the word
  must have, `has`, a value for a feature, `needs`, or every requirement met, counting what it brings itself, `complete`; merged outward from the base
  onto the word as it stands, so these are the order on each side, never slots: core `mergeOrder`; the explorer
  offers only what can merge onto the word now, `addable`), what the word then requires (`requires`: finite-ness requires person and number) and which stem it
  makes the base take (`selects`, the last in the token winning). A language that states `requires` per category
  merges: a token is incomplete while a requirement is unmet (`Realisation.missing`), a lexeme merged where its `on`
  fails is `attach`, a feature brought twice `twice`; a form stored for the merged word covers the lexemes whose
  values it has (a broken plural). Feature values are abstract: learners learn lexemes. The citation form is a
  mnemonic, a named merge. Stage 1 (the engine, conformance/realise-merge.json) is built; apc and chg are converted (below), es next.
- apc merges (2026-11-28, ADR 0159 step 2; docs/rules/apc.md): its tokens list the lexemes that bring a verb's,
  adjective's or noun's values (`{lexeme: ind}, {lexeme: impf-3}, {lexeme: shereb, base: true}, {lexeme: pl.verb}`);
  one merged into its base has no `surface`, nor has a base that writes the whole token. The compiler folds them into
  the base's values (`_fold_merged`: the lexicon's `realises`, no realising in Python) for every step but the token
  check, which realises the lexemes (`Site.merged`); so bundles stayed byte-identical. A cell is realised through the
  lexemes that bring it (core `mergeFor`, `realise` by cell); a cell none inflects (`Realisation.inflected`: writes a
  letter, chooses the stem, or is a zero beside forms it writes elsewhere) is no-rule when strict, unless the
  citation. `on.or` names further hosts (apc -e: an adjective or a noun, a verb only as its participle); a base's
  `requires: []` is a word that never inflects. Pronouns, demonstratives, phrase interjections and the dual's base
  still choose values (REVIEW). A new apc sentence's tokens list lexemes, never `feats` on a verb, adjective or noun.
- What is learned (ADR 0159, the owner, 2026-11-28): lexemes only, zero ones included, never a feature value (values are
  names: labels, groupings, feedback's words); a rule branch is a memory under its lexeme. A card credits a lexeme only
  where the prompt decides it against the lexemes that could stand in its place (those merging onto the same word and
  bringing the same features, from the rules) and the answer could have held one; a zero only beside an audible one.
  Not built yet: the ADR's order of work is apc's tokens, a typed word read back as lexemes, cards from competitors.
- Modern Standard Arabic (lexicons/arb, profiles/arb-Arab.standard.yaml; docs/rules/arb.md) is written in the merge
  model from the start, verbs first, for the owner to check: no course uses it. It opens in the rules explorer from
  Home in debug mode (#/lexicon/arb/rules: core `lexiconCourse`, apps/web lexicon-source.ts serves a lexicon no course
  uses). docs/rules/arb-verbs.md and arb-nominals.md are every cell (scripts/arb-verbs.ts, arb-nominals.ts in packages/core: never by hand);
  conformance/realise-arb.json and spell-arb.json pin 182 tokens (`node scripts/arb-vectors.ts`, after a reviewer
  has checked a change). A stem template may name the word's values (`feats`: the passive's stems); a condition may name
  lexemes the token writes (`with`: the case vowel after the dual). In a merging language a word's own values join its
  cell and no lexeme brings one again.
- Until a language converts, its tokens still choose values; realiseToken reads the base's own choice for blocking
  and the citation, and an exponent whose values the token's lexemes bring is theirs (uz's past), never the rule's.

## Losses and labels notes (see docs/adr/0148, 0153)
- A profile states what its orthography writes of the sound (`sound`, `stress`, `correspondences`; profiles/README.md,
  "The sound statement"): a letter no correspondence names says itself, so `[]` means nothing is lost. `kind: fixed`
  (the norm picks one spelling: another is an orthographic miss, and which one is the word's spelling leftover) or
  `free` (an accepted variant, never where the typed word is another lexeme's form). `rare` names ways the norm keeps
  for few words or never uses (es k; uz-Cyrl йа for я): read as the same sound, never offered, no leftover for a word
  written the usual way. No `sound`: the sound question is never asked (characters, logographs, the support language).
  Every statement is REVIEW; each file says what it left out and why (the table is in docs/migration-design.md).
- A scheme states the reading's side: `of` an orthography and a relation (each piece of the reading with the ways the
  script writes it, `""` where it does not; nothing implied), or, over a script that lists a reading per sign, only the
  sets a reading card may trade within (`loses`: Pinyin's tones, attic's vowel length). A relation may pass over marks
  of the spelling (`ignores`: hbo's points). `sound: {from: reading, scheme}` makes a word's sound its token's pinned
  reading, related to what was typed by that scheme (chg-Arab: schluessel; hbo-Hebr: tiberian; the scribes' letters
  and full or defective spellings are free there).
- Core runs them (@nabu/core `project`: `profile.projection` `read`, `compare`, `spellings`; `readingProjection(id)`
  `spells`, `variants`, `open`; core-cli `sound-*` and `reading-*`). `cd pipeline && uv run nabu projections
  ../courses/<id>` lists words with another spelling of their sound and readings the relation cannot account for; the
  compiler warns of those (`projection.unaccounted`, the review list; each course's are in tests/test_courses.py
  `EXPECTED_WARNINGS`) and writes each bundle lexeme's `leftovers`. Never a list of sound-alike letters or open vowels
  in code, and never the matching in Python.
- A grade carries `labels` (worst first: lexical, grammatical, regularised, scope, order, phonemic, orthographic, slip;
  regularised and scope are defined and never produced yet) and `correspondences`; each pair of its alignment carries
  its own. The order (match/grade.ts): the profile's policies and free correspondences; then the slip, unless the two
  say the same by a fixed correspondence or the typed word is another form of the word or another lexeme's
  (`Spellings.lexemes`: decided by lexeme and form, never by string); then the sound (asked only of an attempt at the
  word) and whose form it is.
- Verdicts are views of the labels: a slip alone is `CORRECT_WITH_TYPO`; `PARTIAL` is only homophone characters;
  `WRONG_WORD` is a miss a slip, the same sounds or its marks explain, and is never the judge's (`judgeable` is
  `WRONG` alone); the rest is `WRONG`. `WRONG_WORD` no longer means "another word": what feedback says follows the
  labels.
- Feedback (@nabu/ui player/Feedback.tsx) lists every label, the worst first, with the words it is about
  (`feedback.label.<label>` and `-pair`, from the alignment pairs that carry it); a profile's note about a pair speaks
  for it (the label's line leaves that pair out), and "another sound" is not said of a pair that is another form or
  another word; "That's a different word." only where the labels include lexical and
  the verdict is WRONG_WORD; lexical, grammatical and order are held while the judge may still accept the answer
  (apps/web/src/judging.ts `judgeMayAccept`). Never tell a learner "another word" and then "right".
- The word list opens a word to what is asked of it (@nabu/core/learner `partsOf`: skills, its own form, spelling and
  reading leftovers, shown or not; the count is of those asked) and lists the rules and forms the learner has met
  (`ruleEntries`, found by `ruleMatcher`). It reads the log; it records nothing.
- Spanish is strict (ADR 0148): accents and the diaeresis are required marks, so tambien is phonemic, bolber and exámen
  orthographic, esta for está lexical and phonemic. grc keeps its notes until the app can put Greek's marks on.
- Credit follows the labels (learner/credit.ts): the right sound with the wrong letter shows the word and misses its
  spelling (`write-script`) where the word has a spelling leftover (ke for que, a `rare` spelling of a word with none,
  counts against its correspondence alone: no card could ask it again); the right lexeme in another form shows the
  lexeme and misses the form; a typed word that is right shows `write-script` where its bundle lexeme's
  `leftovers.spelling` lists the orthography, never where the course's `facets` leave write-script out. The fold
  counts misses per correspondence (`state.letters`, `missedLetters`): counted, never scheduled.
- A new correspondence needs vectors in conformance/projection.json and grade.json (both harnesses), its courses'
  bundles rebuilt and their lessons looked at: a fixed one adds spelling-choice cards and makes a same-sound letter a
  miss; a free one accepts what the accept sets carried by hand.

## Themes notes (see docs/adr/0083)
- Colours come only from tokens (packages/ui/src/tokens.css): light on :root, dark in two blocks that must match
  (`:root[data-theme="dark"]`, and `prefers-color-scheme: dark` when nothing is chosen). A new colour gets a value in
  both themes and, if it carries text, a pairing in packages/ui/test/tokens.test.ts (AA in both). No colours in components.
- The choice (Match the browser, Light, Dark) is per device (`nabu.theme`); index.html applies it before the first paint.
- Pictures are drawn for a light page: dark sets them on `--nabu-color-picture`. Storybook has a Theme switch; every
  story is in the dark pass (tests/visual/theme.spec.ts: LTR, RTL, vertical, axe colour contrast).

## Working in this repo
- Pushing straight to main is always fine here. CI (.github/workflows/ci.yml) must stay green.
- Heavy compute (a course's clips, a voice bench, anything on a GPU or hours long) runs on Kaggle, never for hours
  on a session's CPU (the owner, 2026-11-24). Cloud sessions have the Kaggle API: the proxy adds the credentials and
  the CLI (`uvx --with six kaggle`) takes placeholders (`KAGGLE_USERNAME=iwsfutcmd`, a 32-hex `KAGGLE_KEY`).
  pipeline/kaggle/audio_gpu.py makes a course's clips on a T4; its docstring says how to push it and bring them back.
- Self-hosting: deploy/compose.yaml (deploy/README.md). The images keep the workspace layout (Node runs TS source, never
  from node_modules); `VITE_NABU_API=/` means this origin. CI runs deploy/smoke.sh against it. Locally, build with
  `--network host`, the proxy build args and `--secret id=ca,src=/root/.ccr/ca-bundle.crt`.
- GitHub Pages (pages.yml) publishes Storybook and the web demo on every push to main, under a landing page written
  from the demo's bundles and the UI catalog (apps/web/landing.ts, `landing.*` messages): never hand-edit it; a new
  course appears there by itself.
- ADRs 0013–0143 are Accepted (2026-11-18, the owner), and 0145–0151 (2026-11-20: the lexical model; the older ADRs
  they amend say so in their headers), and 0144, 0152 and 0153 (2026-11-22: the owner's answers to that day's open
  questions; 0144 is not built). 0154 is Proposed. A new ADR is Proposed until the owner accepts it.
  docs/gameplan-errata.md lists where the gameplan was wrong.
- The lexical model follows docs/migration-design.md, which the owner approved on 2026-11-20 with three changes: the
  lexicon is flat (lexicons/<lang>/lexemes.yaml; units point at it, it is never arranged by unit), old events may be
  rewritten (one `upgrade` function; no reader of the old shape is kept), and nothing in the new formats is a "word" (a
  token lists its `lexemes`; "word" is for what a learner is shown). The switch's stages 1 to 4 landed on main on
  2026-11-21, the converter removed. The owner chose to land once the checks were green, before stages 5 and 6
  (Lexical model notes), and without waiting for a real exported log to be put through `upgrade` (28 simulated
  learners' logs were); a device keeps its old events aside in the IndexedDB store `events-before-lexical`, so a fault
  found later can be fixed and the rewrite done again. The names followed the same day (`Next` out of the schemas and
  types, the token kind `lexical`, the bundle format 3). Stages 5 and 6 (losses and labels, ADR 0148; what a learner
  sees) landed on 2026-11-22, the bundle format 4 with them (Losses and labels notes); ADR 0153 lists where
  the build reads ADR 0148 narrowly, and every profile's and scheme's statement awaits the owner's review.
  docs/lexical-forms/ (apc's lexical-form schema, entries and review list; written from the lexicon by
  docs/prototypes/apc-lexical-forms/build.py, never by hand) has the owner's rulings on its six questions (2026-11-20,
  the note's last section); its rules and affix forms are not written, and nothing reads it.
  docs/handoff-lexical-model.md says where each task stands.
- Fresh cloud container setup:
  - `pnpm i`
  - `sudo apt-get install -y libicu-dev pkg-config` (skip `sudo` when root)
  - `sudo apt-get install -y espeak-ng ffmpeg` (audio)
  - `cd pipeline && uv sync --all-groups` (the speech group pulls CPU PyTorch; add `--no-group speech` to skip it)
- For `pnpm test:visual:docker` in a container, start the Docker daemon first:
  `(dockerd > /tmp/dockerd.log 2>&1 &)`
- Agents: shell heredocs can turn a typed `\uXXXX` into the literal character. Build escapes in code (chr(92)),
  then grep for literal invisibles before committing.
