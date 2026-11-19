# Handoff: the lexical model (ADRs 0145–0151), for a new session

You are picking up work the owner and Claude did on 2026-11-19: a new model of what Nabu teaches and stores
(concepts, lexemes, morphemes, forms), written up as seven Proposed ADRs. The owner will tell you which of the
three tasks below to do. Do only that one, and stop to ask where a decision is theirs.

**Where the files are.** Everything this file names is on the branch `claude/nabu-morpheme-learning-p9jzs0`
(ADRs 0145–0151, `docs/lexeme-model.md`, `docs/lexemes.md`, this file). If your checkout lacks
`docs/adr/0145-lexical-model.md`, run `git fetch origin claude/nabu-morpheme-learning-p9jzs0` and merge it into
your working branch before you start.

## Read first

1. `CLAUDE.md`: the project's rules. Its non-negotiables bind you (TaggedText, logical CSS, no user-facing
   literals, grapheme utilities, NFC, provenance and SPDX licences, conformance vectors in both harnesses,
   never hand-editing generated code, the fixture courses green).
2. The ADRs, in order: [0145](adr/0145-lexical-model.md) (the lexical model), [0146](adr/0146-what-is-learned.md)
   (what is learned), [0147](adr/0147-underspecification.md) (underspecification),
   [0148](adr/0148-projections-and-misses.md) (projections and misses), [0149](adr/0149-script-first.md) (script
   first), [0150](adr/0150-pattern-display.md) (pattern display), [0151](adr/0151-fonts-build-step.md) (fonts).
   Also [0144](adr/0144-read-first-then-write.md) (Proposed, from another session) and the accepted ADRs they
   amend (0061, 0066, 0085, 0088, 0100, 0131, 0132, 0142).
3. The working notes, for the reasons behind each decision: [lexemes.md](lexemes.md) (the discussion and four
   rounds of the owner's answers, at the end of §16) and [lexeme-model.md](lexeme-model.md) (the model,
   diagrammed). They grew over one long day: where they disagree with an ADR, the ADR wins, and some of their
   sections are marked superseded.

## The owner

A linguist and programmer who works on writing systems and Unicode. Everything must be multilingual and
multiscript from the ground up, RTL and vertical text included. They want to be pushed back on, not agreed
with: say so when something is wrong, and say what you would do instead. Their standing principles:
- **Only synchronic relations are formalised.** No etymology, folk or real, as a link; a memory aid at most,
  with a source.
- **A language's own categories, never English's** (Uzbek *yaxshi* is one lexeme, not an adjective and an
  adverb). Inserting a distinction a language doesn't make is Anglicization.
- **Learn what can't be derived; derive the rest.** It decides what is stored, what is learned, what a miss
  is.
- **Nothing half-done.** A change lands whole, with its definition of done met, or not at all.

The ADRs are Proposed until the owner accepts them. Don't treat them as settled code requirements before
then, and don't mark them Accepted yourself.

## Task A: an independent review of ADRs 0145–0151

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
  literal invisibles).

Deliver:
1. the schema and its conventions, as a note the owner can read (`docs/lexical-forms/apc.md`);
2. the projections, as tables: lexical form → apc-Arab/standard (the course's Arabic), → apc-Latn/arabizi,
   → the vowel-marked text the voices read, → phonemes;
3. worked entries for every apc KC form, in a data file beside the note, and a list of every pinned form in
   `courses/apc` the projections don't reproduce, with why. That list is the review list: don't change
   course text to make it shorter.

Facts come from references, never invented: Kline (2022) is the apc grammar (CLAUDE.md, "Reference library":
find it with `cd pipeline && uv run nabu refs find kline lebanese`; notes in the library's `nabu/notes/apc/`).
References are copyrighted: never put their text in the repo, and check every Arabic spelling on a page image,
not the PDF's text layer. Where a form needs a native speaker's judgement, flag it for the owner; don't decide
it.

## Task C: the migration (only once the owner has accepted the ADRs)

The owner's order: schemas first; a one-time converter in the pipeline that writes the new course sources;
the lexical-form schemas (Task B's); prompt tags (ADR 0147); script tracks (ADR 0149). Each is one deliverable
that lands whole on its own branch, never half-switched; ADR 0148's "Done in one go" is the model for every
definition of done.

What must survive untouched, and what you must check did:
- **Every sentence, story line and translation as displayed.** Sign-offs hash only the compiled text and
  the translations (`signoffText`): 148 reviewed items today (apc 82, fa 37, uz 29). A migration that changes
  none of that text keeps every sign-off valid; verify it.
- **The audio:** about 8,000 clips, some made on a GPU. Nothing you change may make a clip stale
  (`audio.stale`); if a projection's reading differs from a pinned one, that is a finding, not a regeneration.
- **The learner's log:** the KC rename and the per-part credit (ADR 0146) migrate in the fold, with
  `packages/core/test/fold-before-r2.ts` mirrored and the simulation and golden files rerun.

Before calling a deliverable done: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm conformance`,
`pnpm courses`, `pnpm bundles` (committed), and for UI changes the visual matrix (`pnpm test:visual:docker`,
baselines only from the pinned container). The converter's own test is the strongest one available: every
course comes through with no unexplained derivability findings, and each finding left is a question for the
owner.

## How to work

- Conventional commits; small commits on a branch, landed together when a deliverable is done.
- New data that needs a linguist's sign-off is marked REVIEW and carries `llm:` provenance while it is a draft.
- Shell heredocs can turn `\uXXXX` into the literal character: build escapes in code, then grep for literal
  invisibles before committing.
- When you stop, say what is done, what isn't, and what you need from the owner, in that order.
