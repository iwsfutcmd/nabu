# Handoff: the lexical model (ADRs 0145–0151), for a new session

You are picking up work the owner and Claude did on 2026-11-19: a new model of what Nabu teaches and stores
(concepts, lexemes, morphemes, forms), written up as seven ADRs, which the owner accepted on 2026-11-20. The
owner will tell you which of the three tasks below to do. Do only that one, and stop to ask where a decision
is theirs.

**Where things stand (2026-11-20).** Task A is done: [the review](review-adr-0145-0151.md). The owner
answered a fifth round of questions that came out of it and a sixth on what the revision proposed
(lexemes.md §16), and accepted all seven ADRs. Each ends with what the owner decided in each round, what was
restored from the notes, and what was accepted as drafted. The older ADRs they amend carry a line saying so
("Decided, not yet built"): until the migration lands, those older ADRs still describe the code.

**Tasks B and C were started the same night, without the owner, who has answered both since:**
- **Task B, apc:** a draft of all three deliverables is in [lexical-forms/](lexical-forms/apc.md): the schema
  note, a worked entry for every KC, and the review list. The owner ruled on its six questions on
  2026-11-20 (the note's last section, with how each answer was read): the three signs stand, long a said e
  is stored on each word, the review list is for a speaker, what was missing was deduced, and the shadda on
  *mara* was a mistake, fixed in the course. The helping vowel was ruled on again on 2026-11-21: no word
  stores it, a rule writes it in every cluster that ends a word, and the rule is what a learner learns; the
  course's vowel marks follow it. No conjugation rule and
  no affix form is written (the note's "What is not done"). Nothing reads it.
- **Task C:** [the design note](migration-design.md) gives the formats, the ids, the event change and the
  order. The owner approved it on 2026-11-20 with three changes, recorded at its end: the lexicon is flat
  (units point at it; it is never arranged by unit), old events may be rewritten and old apps need not keep
  working, and no unit of the new formats is a "word". Deliverables 1 (the schemas) and 2 (the converter) are
  built: the note's "Deliverable 1, as built" and "Deliverable 2, as built". All ten courses are converted
  beside what they are today, each with a report ([migration/](migration/README.md)). **The owner read "For the owner"
  in the note and said "go" on 2026-11-21, taking the default put with each point** (the note lists them).
  The switch, deliverable 3, is the work in hand: one branch, landed whole.
- One ruling of round 6 is built: chg's š, ž, ḫ and ǧ are required ([ADR 0134](adr/0134-required-marks.md)'s
  amendment).

**Where the files are.** Everything is on `main` since 2026-11-20: the accepted ADRs, the notes with all six
rounds, the review and this file. If your checkout's `docs/adr/0145-lexical-model.md` says "Status:
Proposed", it is out of date: fetch `main` and merge it into your working branch before you start.

## Open, found on 2026-11-20 and not ruled on

Found while the notes and the explainer were brought up to the accepted ADRs. None is decided.

**An ADR is contradicted or silent, and the notes could not say what replaces it:**
1. Which UD tag a word made by Arabic's participle pattern takes (كاتِب: `NOUN` or `ADJ`). It follows from
   round 6's "UD tags". [lexeme-model.md](lexeme-model.md) says only that the pattern "takes a verb and makes
   another category".
2. The family object held a label for literal hints ("to do with writing"). The object is gone (families are
   computed) and no ADR gives the label a home.
3. Diagram 2 of the model notes lists *siendo* as a listed morpheme of SER beside the stem *s‑*, which would
   give it by rule. No ADR mentions it; it was left.
4. Two statements were left as they stood: that order variants in accept sets are generated (hbo, ADR 0084),
   as a future payoff, and that *‑ra* is the norm in Cuba.

**Decisions the notes record that no ADR states** (beyond the review's section D):
- the citation form per language, and naming one stem as "elsewhere" where none is the default;
- a plural with a sense of its own is a separate morpheme (اخبار);
- bound stems with a meaning are morphemes (Indonesian *ajar*, Bantu *‑swahili*);
- a coinage on a root with no verb is a listed morpheme;
- data for a word form (a clip, a homograph mark) is keyed by its content;
- Thai and Lao visual order is the projection's job;
- the verdicts on *tayyora* / *samolyot* and 佢 / 他.

**The owner on tags, 2026-11-21: "ideally we use UD/Leipzig, unless we run into trouble".** Universal
Dependencies for parts of speech, features and relations, the Leipzig Glossing Rules for a gloss's
abbreviations, and a stated departure where either does not fit. It answers the reading below, which the
owner had asked for; the tagging rule proposed with it is the working rule for giving a lexeme its one tag,
and apc's pseudo-verbs keep their tags under it (*badd* and *fi* are only ever predicates: `VERB`; *3end* is
also the preposition: `ADP`).

**The owner's "let's just use UD tags" was read as:**
- **What it settles:** a lexeme's part of speech is one of UD's seventeen universal tags, and no language
  declares categories of its own. It answered the draft's categories with subclasses and a mapping to UD,
  and nothing wider.
- **One tag a lexeme, where UD tags a word in its sentence.** Uzbek *yaxshi* is `ADJ` wherever it stands.
  That keeps the rule against a distinction a language does not make, and it is where this departs from
  UD's own practice.
- **UD's notation, not UD's analyses.** Features and relations are written as UD writes them, by other
  rulings. Where the owner ruled an analysis UD does not make, the ruling stands and takes a value of our
  own: apc's participle is `Aspect=Part`, where UD has `VerbForm=Part`.
- **A tag is not a class.** What a category's members share beyond the tag is said by features
  (`NounType=Clf`, `PronType=Dem`) and by stated classes, never by a declared subcategory.
- **Proposed with the reading, not the owner's:** a lexeme takes the tag whose dimensions it inflects for;
  where nothing inflects, the tag its distribution in its own language gives, never its English gloss's.
  - By it es *mucho* is `DET`: the course says `ADV`, and the converter found a gender on 34 of its tokens.
  - Item 1 above has an answer: the participle is a form of its verb and has the verb's tag; the agentive
    noun is `NOUN`.
  - Toki Pona's content words, which the course tags `NOUN`, `VERB` and `ADJ` by their glosses, are one
    class.
  - Without such a rule the drafted tags follow the gloss. Spanish's quantifiers are tagged three ways
    (*mucho* `ADV`, *poco* and *otro* `PRON`, *todo* `DET`), and apc's pseudo-verbs two (*badd* and *fi*
    `VERB`, *3end* `ADP`): those are a class of the language's own that UD has no tag for.
- **In the ten converted courses** every lexeme's tag is one of the seventeen and every feature name is
  UD's. The values outside UD's universal list are `Aspect=Part` (apc), `VerbForm=InfAbs` (hbo) and UD's
  own language-specific `NounType` and `PartType`.

## Read first

1. `CLAUDE.md`: the project's rules. Its non-negotiables bind you (TaggedText, logical CSS, no user-facing
   literals, grapheme utilities, NFC, provenance and SPDX licences, conformance vectors in both harnesses,
   never hand-editing generated code, the fixture courses green).
2. The ADRs, in order: [0145](adr/0145-lexical-model.md) (the lexical model), [0146](adr/0146-what-is-learned.md)
   (what is learned), [0147](adr/0147-underspecification.md) (underspecification),
   [0148](adr/0148-projections-and-misses.md) (projections and misses), [0149](adr/0149-script-first.md) (script
   first), [0150](adr/0150-pattern-display.md) (pattern display), [0151](adr/0151-fonts-build-step.md) (fonts).
   Also [0144](adr/0144-read-first-then-write.md) (Proposed, from another session) and the accepted ADRs they
   amend, which each ADR's header lists.
3. The working notes, for the reasons behind each decision: [lexemes.md](lexemes.md) (the discussion and six
   rounds of the owner's answers, at the end of §16) and [lexeme-model.md](lexeme-model.md) (the model,
   diagrammed), and [the review](review-adr-0145-0151.md), for what was wrong with the first version and why
   each revision was made. **The ADRs are the decisions; the notes are why.** Every decision is in an ADR; the notes grew
   over one long day, so where they disagree with an ADR (a passage since superseded, often marked so), the
   ADR is the current one. Tell the owner if you find a decision in the notes that no ADR states.
4. What isn't prose: [the explainer](explainers/inflection-or-derivation.html) (open it in a browser: the
   inflection-or-derivation question with UI mockups and borderline cases) and
   [the prototypes](prototypes/README.md): the pattern-slot colour-font builder (ADRs 0150 and 0151) and the
   lzh Qieyun comparison, each with its pinned inputs and findings.

## The owner

A linguist and programmer who works on writing systems and Unicode. Everything must be multilingual and
multiscript from the ground up, RTL and vertical text included. They want to be pushed back on, not agreed
with: say so when something is wrong, and say what you would do instead. Their standing principles:
- **Only synchronic relations are formalised.** No etymology, folk or real, as a link; a memory aid at most,
  with a source.
- **A language's own categories, never English's** (Uzbek *yaxshi* is one lexeme, not an adjective and an
  adverb). Inserting a distinction a language doesn't make is Anglicization. Since round 6 a lexeme's part of
  speech is written as a UD tag, one per lexeme, and no category system is declared per language.
- **Learn what can't be derived; derive the rest.** It decides what is stored, what is learned, what a miss
  is.
- **Nothing half-done.** A change lands whole, with its definition of done met, or not at all.

ADRs 0145 to 0151 are Accepted (2026-11-20). ADR 0144 and ADR 0152 are still Proposed: don't treat those as
settled, and never mark an ADR Accepted yourself.

## Task A: an independent review of ADRs 0145–0151

Done on 2026-11-20: [review-adr-0145-0151.md](review-adr-0145-0151.md). The brief stays here as the record of
what was asked.

The ADRs were written by the session that held the conversation, so they share its blind spots. You are the
reviewer who didn't. Read the ADRs and the code first, the notes after, so your reading isn't anchored on
theirs.

Look for:
- **Contradictions** among the seven, with ADR 0144, or with accepted ADRs they don't list as amended.
- **Claims about the code that aren't true.** Check them in the repo: the KC prefixes, the grader's verdicts
  (`packages/core/src/match/grade.ts`), the fold's maps (`packages/core/src/learner`), profile fields
  (`profiles/`, `schemas/`), what a sign-off hashes (`packages/core/src/corrections/signoff.ts`), how script
  tracks gate (ADR 0088).
- **Gaps an implementer would have to guess:** what the schemas hold, how a token names lexemes and features,
  how the event migration works, what "never shown in that form" means against the log.
- **Linguistic errors in the examples** (Arabic, Hebrew, Greek, Spanish, Persian, Uzbek, Cantonese, Russian,
  Korean, Javanese): forms, glosses, claims about grammars. Say how sure you are and where you checked.
- **Decisions an ADR states that the notes don't record as the owner's,** or the reverse.

Write the findings to `docs/review-adr-0145-0151.md`: each with the ADR and section, what is wrong, why, how
sure you are, and a proposed fix, most serious first. Don't edit the ADRs; the owner decides which fixes to
take. End with the three findings you think matter most.

## Task B: a lexical-form schema, apc first

Drafted on 2026-11-20 for apc: [lexical-forms/apc.md](lexical-forms/apc.md); the owner ruled on its six
questions the same day (the note's last section). The brief stays as the record of what was asked; pick the
task up from the note's "What is not done".

ADR 0145: each morpheme stores one lexical form, in its own script, fully specified, and every orthography and
phonemic form is projected from it; where the script can't say something, invent an in-script convention,
never a pair of forms side by side. apc (North Levantine Arabic, Beirut) has none yet and comes first. Then, if
the owner asks: hbo's extension (qamets qatan, vocal shewa, stress), stress for fa and uz, uz's Latin-based
form from which the Cyrillic is derived (Russian loans: цирк / *sirk*), lzh's Qieyun positions with overrides.

For apc, the schema must say:
- the Levantine vowels the Arabic script doesn't write (e and o beside a, i, u; length), and where the
  stress falls if anything needs it;
- the consonants whose letter and sound part ways (ق said ʔ; ث, ذ, ظ said t or s, d or z, ḍ or ẓ), so that both
  the Arabic spelling and the sound come out right;
- the course's spelling conventions it must reproduce (CLAUDE.md, "apc twenty units": ـه / ـها for -o / -a
  as Kline writes them; a damma before ـه; ج marked as a sun letter in new vocalizations);
- which existing Unicode marks it uses before inventing any (Unicode's Arabic block has vowel signs some
  orthographies use for e and o, U+065A–065C), and how invented marks are written in source (as `\u` escapes, never
  literal invisibles);
- **the shape of a verb's form:** its radicals, stored (a hollow verb's middle radical shows only in some of
  its forms), its Form and its stem vowels, with the root class derived from the radicals (ADR 0145, "The
  lexicon and the lexical form", "Roots and families"). A lexical form is not always one string;
- **a pattern's template:** its slots, its own letters and vowels, and a template per root class. Kline forms
  the participle so, by the verb's form and type (2022, ch. 17). ADR 0145's first migration, apc's
  participles folding into their verbs, can't be done without this;
- **the participle's two heads** (the owner, round 5): the participle, a value of aspect, and the agentive
  noun, a function head on the same pattern. The form must be able to tell them apart where their vowels
  differ (Kline: a woman writing, *ketbe*; a woman who is a writer, *ketibe*) and give a listed agentive noun
  its plural;
- **which correspondences Lebanese spelling leaves free** in each script, and which it fixes word by word
  (ADR 0148): Kline says neither script has a codified spelling (ch. 2).

Deliver:
1. the schema and its conventions, as a note the owner can read (`docs/lexical-forms/apc.md`);
2. the projections, as tables: lexical form → apc-Arab/standard (the course's Arabic), → apc-Latn/arabizi,
   → the vowel-marked text the voices read, → phonemes;
3. worked entries for every apc KC form, in a data file beside the note, each verb with its radicals, and
   each participle KC with which of the two heads it is (`sense:raye7`, `seken`, `2a3ed`, `wa2ef`;
   `sense:m3allem`); and a list of everything `courses/apc` pins (a KC form, a reading, a vocalization) that
   the projections don't reproduce, with why. That list is the review list: don't change course text to make
   it shorter.

Facts come from references, never invented: Kline (2022) is the apc grammar (CLAUDE.md, "Reference library":
find it with `cd pipeline && uv run nabu refs find kline lebanese`; notes in the library's `nabu/notes/apc/`).
References are copyrighted: never put their text in the repo, and check every Arabic spelling on a page image,
not the PDF's text layer. Where a form needs a native speaker's judgement, flag it for the owner; don't decide
it.

## Task C: the migration (the ADRs are accepted; it starts with a design note for the owner's approval)

The design note is written and approved with changes (2026-11-20): [migration-design.md](migration-design.md).
Build its deliverables in its order, each whole. Deliverables 1 and 2 are built; the next is the switch.

**If you pick up the converter** (`pipeline/src/nabu/migrate/`): it applies a conversion plan per course
(`plans/<id>.yaml`) and decides nothing itself. To change what a course becomes, change its plan or the
course and run `pnpm migrate`; never edit `lexicons/`, `courses/<id>/next/`, `aliases.yaml` or
`docs/migration/` by hand. `pipeline/tests/test_migrate.py` pins each behaviour on a small course and
fails where a committed file is out of date.

The owner's order: schemas first; a one-time converter in the pipeline that writes the new course sources;
the lexical-form schemas (Task B's); prompt tags (ADR 0147); script tracks (ADR 0149). Each is one deliverable
that lands whole on its own branch, never half-switched; ADR 0148's "Done in one go" is the model for every
definition of done.

**Propose the formats before building them.** The ADRs decide what is stored and how it behaves, not the file
shapes. Write a short design note for the owner's approval first, covering: the per-language lexicon file
(lexemes, morphemes with features, parts and scope, lexical forms, and the mark that a form the rules don't
reach is pinned or listed), where it lives and how an entry is signed off; each language's dimensions,
classes and defaults (a part of speech is a UD tag); how a token names its lexemes and feature values, and
its UD head and relation where it agrees or is governed; each profile's executable statement of what reading
and writing lose, fixed and free; prompt tags; the
learner-event change (credit per part, the words a card displayed, the story lines read) and the migration
from today's KC ids, which ADR 0145's Consequences list point by point; how each existing `form:` and
`construction:` KC converts; the MF2 message ids for the miss labels; and the UI for a lexeme's parts and for
labelled feedback (the explainer's mockups are a starting point, not a design).

What must survive untouched, and what you must check did:
- **Every sentence, story line and translation as displayed.** Sign-offs hash the compiled text and the
  translations (`signoffText`), and by ADR 0147 they will hash a sentence's tags too (not built). No
  sentence, story or unit in any course has a sign-off today: every one is `status: draft`. So there is no
  sign-off to keep valid yet, and the text itself is what to check: it must come through unchanged.
- **The reviewed clips.** The 148 reviewed items (apc 82, fa 37, uz 29) are audio clips a listener marked
  right in the audio check (courses/{apc,fa,uz}/audio/index.yaml), not sentences. A reviewed clip depends on
  its item id, its voice, and the exact text or reading its voice was given: verify that each keeps all
  three, byte for byte. 34 of fa's are word clips whose item is a KC id; apc's 82 are read from the
  vowel-marked text, which Task B's projection will produce.
- **The audio:** 7,696 clips, some made on a GPU. Nothing you change may make a clip stale (`audio.stale`); if
  a projection's reading differs from a pinned one, that is a finding, not a regeneration. 2,193 clips are
  keyed by a KC id, and an item's voice is drawn from a seed of its id: a renamed id keeps its clip and its
  voice only through an alias or a pinned assignment (in the two-voice casts, apc, es and yue, about half the
  1,335 word clips would otherwise change voice).
- **The learner's log:** the KC rename and the per-part credit (ADR 0146) can't migrate in the fold alone,
  which sees no course. ADR 0145's Consequences list what the migration has to settle; design it in the note
  above, with `packages/core/test/fold-before-r2.ts` mirrored, the simulation and golden files rerun, and a
  test on real exported logs.

Before calling a deliverable done: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm conformance`,
`pnpm courses`, `pnpm bundles` (committed), and for UI changes the visual matrix (`pnpm test:visual:docker`,
baselines only from the pinned container). The converter's own test is the strongest one available: every
course comes through with no unexplained derivability findings, and each finding left is a question for the
owner.

## The switch (deliverable 3): where it stands, and how to carry on

The owner said "go" on 2026-11-21. It is built on the branch `ccr-aebe970e-q9o4q4`, and nothing of it is on
the main branch: it lands whole or not at all. [migration-design.md](migration-design.md), "Deliverable 3",
has the build order, how the branch does it and what each stage found. This section is the short version for
whoever continues, a person or a model with no memory of the work.

**How the branch is laid out**
- **The courses are flipped by a script** (`cd pipeline && uv run nabu flip`): `courses/<id>/course.yaml` and
  `units/` are in the new shape, `lexicons/<lang>/` holds the lexicon, the audio index names each word clip
  by its lexeme. They are written from the main branch's courses and must be exactly what the flip writes
  (a test says so). **Never edit `courses/`, `lexicons/` or `docs/migration/` by hand on this branch.** A
  course is changed on the main branch, in the old shape; then merge and run the flip.
- **The converter** (`pipeline/src/nabu/migrate/`) stays until the last stage: the flip runs it.
- **One of everything.** The compiler, core and the app are changed in place. What runs today is the main
  branch's, and each stage is checked against it.

**Done**
1. Stage 1: `schemas/bundle.next.schema.json` (format version 2), `WrittenLexeme` on a token, a form's key,
   a language's named rules, a one-file course's `own` lexicon.
2. Stage 2, the compiler (`pipeline/src/nabu/compiler/`, `nabu/lexicon.py`, `nabu/items.py`,
   `nabu/formkey.py`): all ten courses compile with the main branch's diagnostics and no other, and
   `docs/prototypes/switch-check/compare.py` finds every sentence, accept set, translation, story line,
   question and option the same as in the main branch's bundles.

**Not done** (in this order)
1. Stage 2's rest: the pipeline's tests and the tools that read or write course files. Done: the lint
   fixtures, `test_lints.py`, `test_cast.py`, `test_audio.py`. Part-way: `nabu/jyutping.py` (its tests fail).
   Not started: the other compiler tests, the other audio tests, corrections, review, reports promote, the
   LLM drafting (`ai/author.py`), the LibreLingo importer. `uv run pytest` and `pyright` say what is left.
   The yue course prints an `info` line per sentence until `jyutping.latin_form` writes the new tokens.
2. Stages 3 and 4, core: started in a second working tree (branch `switch-core`), where the token schema has
   lost `sense`, `form` and `morphs` and `@nabu/schema` gives the new shapes their final names, so `tsc`
   lists every place that still assumes a KC. `packages/core/src/lesson/lexemes.ts` is written; the rest is
   not.
3. Stages 5 to 7.

**The shapes, in one place** (the schemas are the authority)
- A lexeme is `lexeme:<name>`; a feature value `feature:Tense=Past`; a rule `rule:<name>`; a letter
  `grapheme:<name>`. A part is one of these, or a lexeme and what of it (`lexeme:mano|Gender`).
- A source token names its one lexeme (`lexeme: tener`, `feats: {…}`) or lists several (`lexemes: [{lexeme,
  surface, base, feats}]`). A compiled token always lists them, with full ids (`lexemes: [{lexeme:
  "lexeme:tener", feats}]`). Its base is the one marked, or its only one.
- A unit has no `kcs`. Its nodes `introduces` lexemes, feature values, rules and letters; it lists only its
  script track's `graphemes`. A sentence has `uses` (rules) and `tags` (persons, register) in the source, and
  `parts` and `tags` in a bundle. A story line's `gap` is a lexeme and its `asks` is `lexeme` or `form`.
- A bundle has one lexicon file (`BundleLexicon`: lexemes, labels, rules). A lexeme's `feats` there are
  every lexical feature it has; its `parts` are what it has to learn beyond itself.
- A course kept in one file (a test's) carries its lexicon in `own: {lexicon, language}`, as
  `pipeline/tests/fixtures/clean.yaml` does. Tests build compiled content with `pipeline/tests/units.py`.
- Lints that changed name: `curriculum.unknown` (was `-kc`), `curriculum.unused`, `lexeme.inflected-form`,
  `lexeme.reading`. New: `parse.token-lexemes`, `parse.token-relation`, `lexicon.kind`, `lexicon.form`,
  `lexicon.undeclared`, `lexicon.order`. Gone: `curriculum.cycle`, `curriculum.order` (no prerequisites).

**Decided while building, for the owner to overrule** (each is in the design note)
- A feature value is taught from the node that introduces it: before that, a token that has it only shows it.
- A form, for a choice that asks one thing, is everything a token has: the values chosen on it and those its
  lexeme has of itself, so a feminine noun stands with feminine nouns however each is feminine.
- An ending, and a clitic a script only writes joined, has no spelling of its own in a bundle: no card and no
  glossary entry, as before.
- The eight clips of words that are forms now are kept in the course under a form's key and are in no
  bundle: no card says a form alone. My advice is to drop them; none was checked by a person.
- A stored gender (`lexeme:mano|Gender`) is listed as a part and credited by nothing until grading has
  labels (stage 5).

## How to work

- Conventional commits; small commits on a branch, landed together when a deliverable is done.
- New data that needs a linguist's sign-off is marked REVIEW and carries `llm:` provenance while it is a draft.
- Shell heredocs can turn `\uXXXX` into the literal character: build escapes in code, then grep for literal
  invisibles before committing.
- When you stop, say what is done, what isn't, and what you need from the owner, in that order.

## The switch, second session (2026-11-21): where it stands

**Superseded by "The switch on main" at the end of this file.** Kept for what it lists as done,
checked and decided while building; its "Not done" list is no longer the state of things.

### Done

- **Stage 2 (compiler):** finished. The pipeline's tools (Jyutping, corrections, sign-offs, the
  authoring assistant, the LibreLingo importer) and every pipeline test read the new shape. The
  whole pipeline suite passed (1,390) before the merge below; it has not been rerun since.
- **Stage 3 (core):** every source module of `packages/core` is on lexemes, feature values, rules
  and labels. Old against new, a walked path of each course plans card-for-card identical sessions
  until one of two meant differences shows (below). `packages/ui` is ported (152 tests, lint clean).
- **Stage 4 (the log):** events are schema 2 (`exercise.parts`, `outcome.parts` with a skill each,
  `outcome.labels: []`). `packages/core/src/learner/upgrade.ts` is the one reader of schema 1
  (`upgrade`, `upgradeLog`), with tests and a real old log as a fixture
  (`test/golden/es-old-log.jsonl`, and what the old fold said of it). The fold's oracle
  (`test/fold-before-r2.ts`) folds parts. The API takes schema 2 only, rewrites its stored rows at
  startup (`apps/api/src/upgrade.ts`) and exports every row (109 tests). The web app rewrites the
  device's log before anything reads it (`apps/web/src/upgrade-log.ts`), keeps the old events
  aside, restores a file of the old shape, never uploads an old event, and refuses a bundle of
  another format (`BUNDLE_FORMAT`).
- **Conformance:** grade vectors name forms as part of speech and feature values; new `form-key`
  vectors (TS 630, Python 645 pass); glossary entries are keyed `id`.

### Checked on logs

28 simulated learners (a month each, every course and script) logged by the old tree, upgraded and
folded by the new one: every upgraded event is valid schema 2; the fold equals its oracle; lessons
done, XP and open mistakes are identical. In chg, lzh, tok, uz and yue every word, known or
learning, due flag and card is identical. In es, grc and hbo the words are identical and form cards
merge into feature values (fewer cards). In apc six words and in fa two merge into the lexeme they
are a form of, and fa's *hast* "there is" is listed. A due flag flips for 0 to 3 words a learner in
courses with forms, because an answer's pace is per unit of length and a sentence's parts are not
its KCs. **No real exported log has been checked: the owner's is needed.**

### Decided while building (for the owner to overrule)

- A feature value is a part by two skills: `read-off` on a card that is read or heard, `choose` on
  one that is typed, said or written. A read-script or write-script card gives it no credit.
- An old form KC's credit goes, sentence by sentence, to the feature values the form chose there
  that the course teaches (`byItem` in the alias table); elsewhere to nothing. This replaces
  deliverable 2's "old credits for a form KC have nowhere to go": with that, a learner's forms
  would all have looked unseen and their sentences would have left review.
- An alias says what a placement seeds (`seeds`).
- A form is named by the most specific label whose values it has (the language schema's rule); the
  converter adds a label where a token states more than its KC named (10 labels).
- The grader's `inflected` words: tokens of a lexeme some token writes outside its part of
  speech's bare cell (`bare` in language.yaml and the bundle's lexicon).
- Words follow the order nodes introduce them (the lexicon is flat): seeded picks differ from
  before in places. A form's memory is per feature value: *hablo* and *habla* are both the present.
- The device's and the server's rewrite keep nothing readable in the old shape; a course whose
  alias table cannot be fetched is rewritten by name and done again when the table is in reach.

### Not done, in order

1. **Every check on the merged tree, once more, together:** `pnpm lint`, `pnpm typecheck`, `pnpm test`,
   `pnpm conformance`, `pnpm courses`, the pipeline's pytest, ruff and pyright, `pnpm test:e2e`,
   `pnpm license-check`, `pnpm check:catalogs`. Where each stood when this was written is under
   "Third session" below.
2. **The visual matrix in Docker** has not been run on the branch. Baselines will change where word
   order did (a card's other options): review every changed PNG.
3. **A real exported log** through `upgrade`: the owner's. Stage 4 is not done without it.
4. **Stage 7, the flip:** the old schemas and the converter go (with `pnpm migrate`, `nabu flip` and the
   test that holds the courses to what the flip writes from main), `Next` leaves the names (about 30
   source files, mostly the compiler), the token kind `word` becomes `lexical` (about 460 lines in 76
   files: courses, bundles, conformance vectors, core, UI, Python), the mobile build, and CLAUDE.md,
   which still speaks of KCs. `upgrade` and the old event schema stay: they are the rewrite. Then land
   on main, whole.
5. **Small leftovers:** the authoring assistant's output still calls a token's id `kc`
   (`schemas/ai.schema.json`, `prompts/author.md`, whose example says `sense:`); no e2e test seeds an
   old log and watches the app rewrite it (the unit tests do, on fake IndexedDB).
6. **Stages 5 and 6** (losses and labels; what a learner sees) are not started. My advice stands:
   land 1 to 4 and 7 as the switch, and 5 with 6 after.

### How to work on it

`packages/core/test/planned.ts` walks a course; `/tmp` scratch files are gone with the container.
`docs/prototypes/switch-check/compare.py` compares old and new bundles. The old tree is `origin/main`.

## The switch on main (2026-11-21): what landed, what follows

Asked when the switch should reach main, the owner chose **"Land when green"** (once every check
passes; the renames of stage 7 and stages 5 and 6 follow on main), and **"Land without it"** (not
waiting for a real exported log through `upgrade`). `docs/migration-design.md`, "The landing", is
the record; this section says where to carry on.

### Done, and on main

- **Stages 1 to 4:** the bundle's shape, the compiler, core, the log. The app, the API and every
  tool run on lexemes, feature values, rules and labels; events are schema 2; old logs are rewritten
  once, on the device and on the server, by `upgrade`.
- **The converter is gone** (`pipeline/src/nabu/migrate`, its tests, `nabu migrate`, `nabu flip`,
  `pnpm migrate`): it read the courses in the old shape. Its plans are in `docs/migration/plans/`,
  its last reports in `docs/migration/`. Lexicons, units and alias tables are sources now.
  `pipeline/tests/test_aliases.py` holds each alias table to its schema and to what its course has.
- **CLAUDE.md** describes the model as it is ("Lexical model notes"); `deploy/README.md` says the
  one upgrade that rewrites stored events in place.

### The checks, on the tree that landed

`pnpm lint`, `pnpm typecheck`, `pnpm codegen:check`, `pnpm license-check`, `pnpm check:catalogs`,
`pnpm courses` and the bundles' stale check pass. `pnpm test` as CI runs it: core 722 (the simulation
among them), pipeline 1,360, i18n 1,067, core-cli 701, schema 310, ui 152, api 109 (on PGlite, and on
Postgres 16 beside it), web 78, references 48, lint 11. Conformance: 630 vectors in TypeScript, 631
in Python. The e2e suite: 207 passed. The visual matrix in the pinned container: 778 passed, after
136 baselines were rewritten there (what each shows is in the design note, "The landing").

Three things were changed to get there, each stated where it was made: three simulation checks rest
on three learners instead of one (`packages/core/test/simulation.test.ts`; nothing was retuned);
sixteen glosses and notes of the apc and chg lexicons say a change in a word instead of with an
arrow, which the interface font lacks; three pipeline tests read the bundle in the new shape.

**Not run here:** the deploy job's compose build and the Android build; CI runs both on main. The
smoke test's API calls (sign up, upload, read back, export, delete) were replayed against a local
API and pass; its event said schema 1 and was corrected. The Pages workflow's landing page and audio
check were run by hand and write their pages. CI could not be started on the branch from this
session (the integration may not dispatch workflows), so main's own run is the first of the whole
workflow.

### After the landing, the same day

The owner asked for the rest ("Fix the remaining stuff?"). Done, each as a commit of its own on main:

- **`Next` left the names.** `schemas/{course-source,bundle,learner-event}.schema.json` are the lexical
  model's; the event shape of before is `schemas/learner-event.v1.schema.json` (types `…V1`), read by
  `upgrade` and by the restore of an old download. No data changed.
- **The token kind `word` is `lexical`, and the bundle format is 3.** A device refuses a cached bundle of
  format 2 and fetches the new one. No log was touched: no event carries a token.
- **The documents an author reads** (the Spanish course's brief, the courses' README, the review list, the
  choice doubts, the glossary, the sources-of-truth note) say how a lexeme, a token and a label are
  written; the lints' texts and the schemas' descriptions no longer say KC.
- **`docs/prototypes/apc-lexical-forms`** reads the lexicon and the units again, and rebuilt
  `docs/lexical-forms/`. Its numbers for what comes back from a lexical form are what they were.
- **An e2e test of the rewrite** (`apps/web/tests/e2e/old-log.spec.ts`): a database of version 3 with a
  real old log, opened by the app as it is.
- **hbo:** *regel* "foot" and *ayin* "eye", written only in the dual, store `Gender: Fem`. The old form
  tag for a dual named no gender, so the converter had nothing to store and the default made them
  masculine.

Read into the design note's "What 'word' still names", for the owner to overrule (the note's "After the
landing: the names" has the reasons): a correction still addresses a token by its index among a form's
lexical tokens, and the functions that serve the word list and the cards keep "word" in their names.

### What follows

1. **Stages 5 and 6** (losses and labels, ADR 0148; what a learner sees). The largest piece: 22
   profiles and 8 schemes each need a reviewed statement of their correspondences. It changes grading, so
   it wants the owner's go and is not something to slip in beside other work.
2. **A real log.** When the owner next opens the app, their device rewrites its log. If anything looks
   wrong in Your progress or the word list, the old events are in the IndexedDB store
   `events-before-lexical` on that device: export them before anything else.
3. **Other sessions** working on this repo need to merge main before they go on: the bundle format, the
   token kind and the schemas' names changed under them.

### Smaller things found and left

- **chg's ezafe** is still said in the reading alone (*malik-i*): ADR 0136 left an ezafe lexeme for chg
  to whoever edits those units. It needs a decision on where the course introduces it.
- **The apc prototype's participle check** covers nine forms where it covered thirteen: *raye7* is
  *ra7*'s participle now and the script takes a participle's analysis from an entry of its own. Hanging
  it on a verb's `Aspect=Part` forms is not built. Two notes in its `authored.yaml` still say "KC".
- **The eight words that are forms of another lexeme now** (apc *kifak*, *esmak*, *esmi*, *baddi*,
  *baddak*, *raye7*; fa *nist*, *bud*) are glossed part by part where they were glossed whole ("how"
  and "your", not "how are you?"); the sentence's translation still says the whole. The owner has not
  ruled on their eight clips (my advice: drop them, a sentence's clip says each).
- **Stale by the way, not from the switch:** the "Used for" table of `courses/images/README.md`;
  `courses/README.md` speaks of "these four" courses and of real courses living in other repositories.
- `docs/prototypes/switch-check/compare.py` compares two directories of bundles; the old ones are at
  commit `1e1e7d65`, and they are format 1.
- For the owner to overrule, as before: everything under "Decided while building" above, and the
  three-learner checks in the simulation.

## Stages 5 and 6 (2026-11-22): what is built, and what is the owner's

The owner said "Do stages 5-6" on 2026-11-21. Both are built and on main: docs/migration-design.md has
the design they were built against ("Stages 5 and 6: the design") and what was built ("Stages 5 and 6, as
built"), with the table of what each profile and scheme states. CLAUDE.md has "Losses and labels notes".

### Done

- **One statement of what an orthography writes of the sound** (ADR 0148), in every profile and scheme, run
  by @nabu/core: 22 profiles and 8 schemes, every one marked REVIEW. `soundAlike` and a scheme's `variants`
  are gone.
- **A miss is a set of labels**, decided in ADR 0148's order; the outcome is read off the set; the answer
  event carries the labels and the correspondences an orthographic miss was against.
- **Spanish is strict:** accents, the diaeresis and letters that sound the same.
- **Credit follows the labels;** the fold counts misses per correspondence; the compiler writes each
  lexeme's leftovers and lists the readings a scheme's relation cannot account for.
- **Spelling cards in every course that states a fixed correspondence** (Spanish gains them); reading cards
  and minimal ruby by the word's own letters.
- **What a learner sees:** feedback names every label with its words; the word list opens a word to what is
  asked of it and lists the rules and forms met.
- **The bundle format is 4.** Old cached bundles are refused and fetched again.

### The checks, on the tree that landed

- `pnpm codegen` changes nothing; `pnpm lint` 13 of 13; `pnpm typecheck` 11 of 11.
- `pnpm test` (with `NABU_REQUIRE_TOOLS=1`) 10 of 10: core 777, core-cli 947, ui 172, web 81, api 109, schema
  335, i18n 1092, references 48, lint 12; the pipeline 1609 passed, 9 skipped.
- `pnpm conformance`: 873 vectors in TypeScript, 874 in Python.
- `pnpm courses` and `pnpm bundles`: every course compiles; chg has 13 warnings (its five readings on the
  review list and the eight it had), yue its 186, the rest none.
- `pnpm license-check` and `pnpm check:catalogs` pass (the drafts' three warnings each are older).
- `pnpm test:perf`: the worst p95 is 3.2 ms (fa), the budget 5.
- `pnpm test:e2e`: 210 passed.
- The visual matrix in its container: 793 passed, 133 skipped. 24 baselines are new (the five new stories:
  feedback with one label, several, and held ones; a word's entry opened; the rules and forms) and 98
  changed (the label line in the player's and the word-part card's wrong answer; the word list's entries,
  which have more below them now; their dark twins). I looked at each kind in LTR, RTL and dark, side by
  side with the old picture, not at all 122 files.
- The simulation stayed in its bands with nothing retuned; one test of how often word-part cards come
  along the path rests on three learners now (a Spanish lesson has a spelling card too, and one seed's
  walk moved).
- `workflow_dispatch` is still closed to this integration, so CI ran on main only.

### Not done

- **regularised** and **scope** are labels no answer gets: the first waits for rules in a lexicon, the
  second for ADR 0147's prompt tags.
- **Nothing reopens a script track** when a correspondence keeps being missed (ADR 0149 is not built); the
  counts are kept, and no page shows them.
- **`story_line_read` and `displayed`** are still never emitted.
- **grc's marks** stay notes until the app can put them on from buttons (ADR 0148).
- **yue's homophone characters** give its spelling cards as before and are not counted as leftovers in the
  bundle, so the word list shows no spelling part for a yue word.
- **The draft catalogs** have the new label messages; the notes they never had (sound-alike and the rest)
  still show in English there.

### For the owner

1. **ADR 0153 (Proposed)** lists where the build reads ADR 0148 narrowly: no phonemic form in the bundle;
   a leftover is the lexeme by `write-script` or `read-script`, no part id; verdicts as views of the labels;
   the sound asked only of an attempt at the word; `rare` spellings. Accept it or say what to change.
2. **Every statement is yours to review.** The ones that change what is accepted, first:
   - apc-Latn: e or i free. Answers the accept sets did not list are accepted now (*3indi* for *3endi*).
   - chg-Arab: the scribes' letters, a vowel's letter written or left out, and a doubled consonant are free.
   - hbo: full and defective spellings are free (קל for קול).
   - es: what counts as the same sound (seseo, yeísmo, b/v, h, g/j), and an unmarked monosyllable read as
     unstressed, so ✗*fé* for *fe* is called phonemic.
   - uz-Cyrl: йа for я and its like, and с for ц at a word's start, are the right sound in the wrong letter.
   - Left out on purpose, each with its reason in the file: apc o/u and its diphthongs, apc-Arab ث ذ ظ ق,
     uz x/h, chg ف for p.
3. **The review lists:** chg has five readings its relation does not account for (*Moǧulistān* written with
   ا for u, three times; *šahargä*; *ṣandūqta*): a spelling, a reading or the relation is off in each. hbo has
   none: I stated its two perpetual qeres word by word (the divine name read *ʾăḏōnāy*; the Pentateuch's הוא
   read *hîʾ*), which is yours to overrule.
4. **Wording:** the label messages are drafts ("Right sound, wrong letter: {expected}, not {answer}.", "That
   spells another sound.", "Right word, another form.", "Another word.", "The right words, in another
   order."), and so are "What it asks" and "3 of 5" in the word list.
5. **Judgments of mine to overrule:** a missing diaeresis (*pinguino*) is never sent to the AI judge, since
   the judge would excuse it (the brief I gave the grader said otherwise and I changed it); and feedback
   does not say "That spells another sound" of a word that is another form or another word (*Aziz* for
   *Azizman*, *esta* for *está*), where ADR 0148 names every label: it goes without saying there.
6. Still open from before: the eight form clips; the device's log rewrite on a real log; ADR 0144 and 0152.

## The owner's answers (2026-11-22), and what follows from them

A page of open questions went to the owner on 2026-11-22: seven decisions with a breakdown each, seven
small jobs to be done unless refused, and twenty points that stand as built unless objected to. The owner
answered all seven with the recommended option, wrote no note, and left the rest alone, so each pick there
stands. "Stands as built" is not "reviewed": every profile's and scheme's statement is still REVIEW.

### Decided

1. **Due only for what a review can ask, and reviews aim at it.** A facet makes a word due only where the
   course can make a card that credits it for that word; a review's card for a due word is chosen among
   the cards that credit its due facet. (Measured before: after sixteen perfect reviews in a day Spanish
   kept 6 of 48 words due and Persian 7 of 24, and the sessions repeated themselves.)
2. **A spelling card may have two options,** where a word has one other spelling of its sound (242 Spanish
   lexemes, 58 Persian). ADR 0142 is amended.
3. **ADR 0153 is Accepted,** with no change.
4. **ADR 0152 is Accepted;** its wording was brought to the lexical model under a dated note.
5. **ADR 0144 is Accepted as proposed,** restated in the lexical model's terms under a dated note. Not
   built; one point is left for the owner when it is (may grammar come in through a passage).
6. **The tagging rule is adopted and the drafted tags are gone over with it,** where inflection decides
   (about a dozen lexemes in es, apc and hbo), and the language files' dimension lists are completed.
   **Toki Pona is left alone:** its 97 content words are one class, the owner has not said which one tag it
   takes, and nothing is touched there until they do.
7. **Next: rules in a lexicon, apc first,** with ADR 0146's "seen is logged" as its opening step.

### The seven jobs (go, by silence)

The three Chaghatay readings checked against Schluessel and fixed on whichever side is off; an ezafe
lexeme for Chaghatay; Cantonese's homophone characters counted as a spelling leftover; the eight clips of
words that are forms now dropped; the seven decisions only the model notes record written into an ADR
(Proposed); *siendo* out of the notes' second diagram; the stale READMEs and the apc prototype's notes and
participle check repaired.

### Where each stands

Kept current in this section as each lands; the task list of the session that did them is the same order:
the records (done with this note), two-option spelling cards and Cantonese's leftover, what is due and
what reviews ask, the retag, Chaghatay, the small jobs, seen-logging, then rules in a lexicon (a design
note first).
