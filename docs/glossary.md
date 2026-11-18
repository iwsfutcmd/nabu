# Glossary

The terms used in Nabu's code, course files, docs and reviews. Each entry says what the term
means here and where to read more. "§7.1" is a section of [gameplan.md](gameplan.md). "ADR 0061"
is a file in [adr/](adr/).

## Project and process

- **ADR** (architecture decision record): a short file in `docs/adr/` recording one decision that
  has been made, with its context and consequences.
  - ADRs are numbered in order. 0001–0012 are the decisions in gameplan §1; new ones start at 0013.
  - Status: *Proposed* until the project owner accepts it. Later changes are amendments, or a new
    ADR that supersedes it.
  - A proposal that still has open questions is a plan, not an ADR. Plans live in
    `docs/next-steps.md` and `docs/sources-of-truth.md`; their decisions become ADRs when made.
- **Gameplan**: `docs/gameplan.md`, the original architecture and roadmap (Phases 0–10).
  `docs/gameplan-errata.md` lists where it turned out wrong ("erratum 46").
- **Phase**: a roadmap step with acceptance criteria. Phases 0–10 are in gameplan §16, 11–16 in
  `docs/next-steps.md`.
- **The owner**: the project owner, Ben, who decides linguistic policy and accepts ADRs.
- **REVIEW**: a marker on a linguistic policy (a profile's contrast sets, speech tiers, a KC's
  features). It means "drafted, awaiting the owner's sign-off".
- **Review codes** (D6, P2, W3, R3, C14 …): ids from the November 2026 review,
  `docs/review-2026-11-12.html`.
  - D + a number is a decision the owner made there: D6 is "a backlog never blocks anything".
  - The other letters are its findings.
  - Search the file for an id.
- **Fixture courses**: every course in `courses/` (fa, yue, uz, apc, lzh, es, hbo, tok, grc, chg).
  Every change must keep them green.
- **Provenance**: who made a content item, and its status.
  - `author` is `human:<id>` or `llm:<model>@<prompt-hash>`.
  - `status` is `draft`, `reviewed` or `published`, with `reviewedBy` and `reviewedAt`.
  - Every content item and asset carries one, plus an SPDX license.
- **Draft**: content no reviewer has checked yet. Everything an LLM drafts starts as a draft.
- **SPDX**: standard license identifiers (CC-BY-SA-4.0, CC0-1.0, Apache-2.0). Content defaults to
  CC BY-SA 4.0. Code is MIT OR Apache-2.0.
- **Sign-off**: a reviewer marks a sentence, story or unit as reviewed.
  `nabu review apply` writes that into the source, with a hash of the text signed (ADR 0072).
- **Release build**: `nabu build --release`, a bundle with only reviewed content (ADR 0073). The
  committed bundles and the demo are full builds.
- **Reference library**: grammars and dictionaries in the owner's private Drive, reached through a
  relay (`nabu refs`, ADR 0079). Courses take facts from them, never their text.
- **Conventional commits**: commit messages of the form `type(scope): summary`, such as
  `feat(core): …` or `docs(adr): …`.

## Languages, scripts and text

- **Target language**: the language a course teaches.
- **Support language**: the language of glosses, translations and notes. Today that is English in
  every course.
- **UI locale**: the language of the app's own text (chrome). Every rendered element knows which
  of these three languages it shows. `lang` and `dir` are never inherited across them.
- **L1 / L2**: the learner's own language and the one being learned.
  - `l1-l2` prompts in L1 and expects the target (production).
  - `l2-l1` is the other way round.
- **BCP 47 tag**: a language tag that includes its script (`fa-Arab-IR`, `yue-Hant-HK`,
  `uz-Latn`). Direction and fonts come from the script subtag, never from the language name.
- **Orthography**: one way a course writes its language, spelled `lang-Script/name`
  (`uz-Cyrl/standard`, `apc-Latn/arabizi`, `tok-Qaap/sitelen-pona`). A course may have several, and
  every sentence is given in each.
- **Orthography profile**: `profiles/<orthography>.yaml`, which says how an orthography is
  normalized, segmented, matched, typed, annotated and laid out (§6.3). Writing systems are data:
  a new script is a new profile, not new code.
- **TaggedText**: language data as a language tag plus tokens, never a bare string (§1, decision 3).
- **Token**: one unit of TaggedText.
  - Its kind is word, punct, space, number or symbol.
  - It can carry a sense, a form, readings and morphs.
- **`<T>`**: the only component that renders TaggedText. It sets `lang`, `dir`, fonts and ruby,
  and makes words tappable.
- **Grapheme**: a character as a reader sees it, such as a letter with its marks. Never index,
  slice or count text by UTF-16 unit or code point; use `@nabu/core/text`.
- **NFC / NFKC**: Unicode normalization forms. Text is NFC at every boundary. NFKC is used only as
  a named step in a profile.
- **Case folding**: comparing text regardless of case. It needs a locale (Turkish ı and İ) or the
  profile's own folding, never a bare `toLowerCase()`.
- **ZWNJ**: the zero-width non-joiner (U+200C), part of Persian spelling. Invisible characters are
  written as `\u` escapes in source, never literally.
- **Bidi**: bidirectional text, where right-to-left and left-to-right runs mix. Each run is
  isolated (`dir` on each `<T>`; `<bdi>` around names people choose).
- **Logical properties**: CSS such as `margin-inline-start` and `inline-size` instead of
  left/right/width. Layouts then mirror for RTL and turn for vertical text. Stylelint enforces this.
- **Vertical text**: `vertical-rl` writing for yue and lzh prompts, word banks and stories (the
  profile's `layout`). The app's chrome stays horizontal.
- **IME** (input method editor): how Han and many other scripts are typed. While an IME is
  composing, the app never submits, normalizes or resets the field.
- **`keyboardHint`**: attributes a text field spreads so the Android app switches to the right
  keyboard (ADR 0143).
- **CLDR**: Unicode's locale data (plural rules, scripts, numbers, exemplars). It is pinned, and
  generated into `packages/i18n`.
- **RBNF**: CLDR's rules for spelling out numbers.
- **Exemplars**: CLDR's lists of the characters a language uses. The script audit checks course
  text against them; a profile's `exemplarsExtra` fills the gaps.
- **Confusables**: characters that look alike (UTS #39). They are checked in usernames and course
  text.
- **MF2 / catalog**: MessageFormat 2. The app's text is MF2 messages in
  `packages/i18n/messages/<locale>.json`, never string literals in code.
- **Pseudo-locale**: `en-XA` (accented, lengthened English) and `ar-XB` (mirrored, right to left).
  They test layout without real translations.
- **Ruby**: a small reading set over the base text, such as Jyutping over characters.
- **Reading**: how a word is said, in some reading scheme.
- **Reading scheme**: `profiles/schemes/<id>.yaml`. Jyutping, Pinyin, Baxter, Tiberian, Attic,
  Schluessel and lasina are schemes.
- **Layer**: an annotation a profile can show or hide, such as readings or vowel marks.
- **Tradition**: one of several reading schemes for the same script. The learner picks one (lzh:
  Pinyin, Jyutping or Baxter; ADR 0138).
- **Marks / vocalization**: vowel points and harakat. Courses keep text as written, and a
  `vocalization:` file gives words their marks (ADR 0053). Grading compares letters, not marks,
  unless a profile says otherwise.
- **Homograph**: one spelling with several readings in a course (ADR 0140).
- **Sound-alike**: letters that sound the same, such as Persian ت and ط (ADR 0142).
- **UD / UPOS**: Universal Dependencies' part-of-speech tags (NOUN, VERB …) and features
  (`PronType: Prs`). They are used for a KC's `pos` and `features` (ADR 0132).

## Course content

- **Course**: `courses/<id>/`: `course.yaml`, `units/*.yaml`, and its audio and side files.
- **Unit**: one `units/*.yaml` file, with its KCs, nodes, sentences, stories and scenarios, at one
  CEFR level.
- **Node** (path node): one step on the path.
  - Its kind is lesson, practice, story, review, challenge or script.
  - `introduces` lists the KCs it teaches.
- **Path**: the course's nodes in order.
- **KC** (knowledge component): one thing a learner can know. It is the unit the learner model
  tracks (§7.1). There are seven kinds:
  - `sense`: a word in one meaning (`sense:hablar`);
  - `form`: an inflection (`form:pres-1s`);
  - `construction`: a pattern bigger than a word (`construction:ezafe`);
  - `grapheme`: a letter;
  - `reading`, `phone` and `tone`.

  Senses spelled alike get a suffix (`sense:呀` and `sense:呀.q`).
- **Sense**: a word in one meaning. Each word token names its sense.
- **Lemma**: a KC's first form, which is what word cards show (ADR 0061).
- **Form**: a word with several uses here. Read it by context:
  - a sentence's text in one orthography (`forms:` on a sentence);
  - how a KC is written (`forms:` on a KC: its lemma and variants);
  - a form KC (`form:pret-3s`);
  - the form KC a token is pinned to (`form:` on a token).
- **Morph**: a meaningful part of a word, with its own surface and KC (uz *bor + a + man*).
- **Unwritten morph**: a morph with an empty surface, such as the ezafe (ADR 0136).
- **Form signature**: a word's form KCs and other morphs, besides its sense. Gap-fill and story
  questions use it to find a word's other forms (ADR 0132).
- **Gloss**: a KC's short meaning in the support language.
- **Glossary**: every KC's forms, used by tap-to-gloss.
- **Lexicon**: every word the course writes. The grader uses it to tell a typo from another real
  word.
- **Sentence**: a course item with a form per orthography, its translations, and `reverse`.
- **Accept set**: every accepted answer, one per line, in accept-set notation: `(a|b)` for
  alternatives, `[x]` for an optional part (§7.4).
  - `translations` are the accept sets for L2 → L1.
  - `reverse` is the accept set for L1 → L2.
  - Whatever the prompt does not decide, the learner may choose (ADR 0085).
- **Persons**: on a sentence, who speaks and who is spoken to (m or f; one, two or several),
  shown as tags on the prompt (ADR 0056).
- **Register**: formal, neutral or colloquial.
- **Story**: a dialogue or passage on a story node, read with questions along the way (ADR 0043).
- **Passage**: an authentic text used as a story (ADR 0144).
- **Scenario**: a roleplay card for the AI conversation.
- **Script track**: a row of nodes that teaches an orthography's letters (ADR 0088, 0133).
- **i+1**: at most *k* new KCs per sentence (`iPlusOne` in `course.yaml`).
- **CEFR**: the A1–C2 proficiency levels.
- **Contrast set**: a profile's `typo.contrasts`, the endings and words that carry meaning. A slip
  from one member to another is WRONG_WORD, not a typo (ADR 0066).
- **Pinned reading**: a reading written on a token in the source. It always wins over an
  analyzer's. With `consistentReadings`, a word must read alike everywhere (ADR 0135).
- **Drill**: generated items, such as numbers spelled out by RBNF.

## Compiler and bundles

- **Compiler**: `nabu build` in `pipeline/`, which turns course YAML into a bundle.
- **Stage**: one step of the compiler.
- **Lint**: a check with an id (`kc.inflected-form`) and a severity: error, warning or info.
  - A **diagnostic** is one firing of a lint, with its file and line.
  - Every lint has a **fixture**, a small course that makes it fire.
  - `clean.yaml` must fire none.
- **Bundle**: a compiled course in `apps/web/public/bundles/<id>/`: a **manifest** plus
  content-addressed files (units, profiles, tables, keyboards, images, audio).
  - Bundles are byte-for-byte deterministic and committed.
  - `pnpm bundles` rebuilds them, and CI fails if they are stale.
- **Codegen**: `pnpm codegen` turns `schemas/` into TypeScript types and Pydantic models. Generated
  files are never edited by hand.
- **core-cli**: the JSON-lines bridge the Python pipeline uses to call the TypeScript core.
- **Conformance vectors**: test cases in `conformance/*.json`. Both the TypeScript and the Python
  harnesses must pass them. Every new normalization or matching behaviour needs some.
- **Golden files**: committed expected outputs, such as planned lessons. Run with
  `UPDATE_GOLDEN=1` after a deliberate change.

## Exercises and grading

- **Template**: a kind of exercise (`gap-fill`, `translate-type.l1-l2`, `char-read` …), each
  practising one facet.
- **Exercise**: one question in a session. Also called a **card**.
- **Card key**: `kc|facet`, plus the orthography for read-script and write-script
  (`kc|facet|orthography`). It is what the memory model schedules.
- **Facet**: one skill on a KC: recognize, produce, listen, speak, read-script or write-script.
- **Distractor**: a wrong option. A choice asks one thing: which word, or which form (ADR 0132).
- **Word bank / tiles**: answering by tapping words in order.
- **Grading cascade** (§8.3), in order:
  1. normalize;
  2. match against the accept set's **lattice** (the accept set expanded into a graph);
  3. apply the typo model;
  4. the judge;
  5. human review.
- **Outcome** (the verdict):

  | Verdict | Means |
  |---|---|
  | CORRECT | the canonical answer |
  | CORRECT_ALT | another accepted answer |
  | CORRECT_MARKS | right but for marks or accents |
  | CORRECT_VARIANT | a variant spelling |
  | CORRECT_WITH_TYPO | right with a slip |
  | CORRECT_PROVISIONAL | accepted by the judge |
  | PARTIAL | part credit, such as an IME homophone |
  | WRONG_WORD | another real word: often an ending that changes the meaning |
  | WRONG | wrong |
  | SKIPPED | skipped |

- **Policy**: what a profile does with one kind of difference: ignore, accept, accept-with-note,
  partial-credit, reject-with-note or reject.
- **Typo model**: how slips are measured for an input method: keyboard, marks or IME homophone.
- **Judge**: an LLM's second check on typed answers graded WRONG (ADR 0045).
  - It runs only behind per-language **gates**, measured on golden sets.
  - Its accept is a revision of the answer.
- **Claim**: the learner's own "this should have been accepted" or "this should have been wrong"
  (ADR 0052).
- **Report**: a claim or a correction, sent for review.
- **Correction**: a learner's fix to a sentence or story line, a `sentence_reported` event
  (ADR 0051).
- **Credit**: an answer's result for each KC: right, wrong or given.

## Learner model and planning

- **Event**: one fact in the learner's log, such as `answer_submitted` or `session_started`
  (`schemas/learner-event.schema.json`).
- **Event log**: kept in IndexedDB on the device, and on the server too if the learner syncs.
- **Projection / fold / replay**: learner state computed from the log (`replay(events)`). It is
  never stored: to change state, change the fold.
- **Revision**: an event that changes an earlier answer's outcome (the judge, a claim).
- **FSRS**: the spaced-repetition memory model (FSRS-6), one per card key.
- **Retention target**: the chance of recall the planner aims for.
- **Due**: a facet whose predicted recall has fallen below the target.
- **Known word**: a word the learner has shown right, at the first try, in every skill asked of
  it, on a later day than they met it (ADR 0100). The fold's `met`, `shown` and `missed` records
  track this.
- **Elo**: the performance model, which predicts whether an answer will be right (§9.3).
- **Planner**: the pure function that chooses a session's cards, from the request, the learner's
  state, the bundle, the time and a seed.
- **Session**: one sitting: lesson, review, mistakes, placement or story.
- **Seed**: the random seed. The core never uses `Math.random()` or `Date.now()`; the clock and a
  seeded RNG are passed in.
- **Pace band**: consolidate, steady or accelerate, read from recent answers (ADR 0105).
- **Placement**: the adaptive test that places a learner on the path (ADR 0077).
- **Mistakes**: wrong answers still open, which the learner can practise.
- **Simulation**: simulated learners that check the planner keeps success near 85%.

## Audio and speech

- **Clip**: a synthesized or recorded audio file for an item, in `courses/<id>/audio/`.
- **Voice**: a speech-synthesis setup in `course.yaml`. A course's **cast** is its voices.
- **Round trip**: speech recognition run on a clip to check it says the text. A clip that fails
  is **held back** until a person reviews it.
- **Audio check**: a page listing every clip, where a listener marks each right or wrong
  (ADR 0060).
- **Word timings**: where each word falls in a clip, found by **alignment**. Karaoke uses them.
- **Audio quality** (ADR 0091):
  - good: clips play everywhere;
  - iffy: only where the text is shown;
  - bad: never shipped.
- **Speech tiers**:
  - tier 0 is self-rated;
  - tiers 1–2 are scored on a speech server;
  - tier 3 is tone scoring on the device, which is turned off (ADR 0046, 0093).

## App, server and tests

- **Outbox**: events waiting to be uploaded.
- **Sync**: the optional upload of the event log to an API server.
- **Gate**: an optional hearts or energy limit on lessons. It is off by default.
- **Streak, quests, leagues, XP**: the game state. Like the learner state, it is a projection of
  the log (ADR 0044).
- **Offline download**: a unit's audio and pictures kept on the device (ADR 0047).
- **Debug mode**: turned on with `?debug=1` or in Preferences. It shows reviewer tools.
- **Review workspace**: `#/review`, the reviewers' pages (ADR 0074).
- **PGlite**: Postgres compiled to WebAssembly, the API's default database.
- **Storybook**: the gallery of UI components (`pnpm storybook`).
- **Visual matrix**: screenshot tests of the components in LTR, RTL and vertical text, light and
  dark, taken in a pinned container.
- **e2e**: Playwright tests that drive the whole app, by keyboard and by touch.
