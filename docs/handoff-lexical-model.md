# Handoff: the lexical model (ADRs 0145–0151), for a new session

You are picking up work the owner and Claude did on 2026-11-19: a new model of what Nabu teaches and stores
(concepts, lexemes, morphemes, forms), written up as seven ADRs, which the owner accepted on 2026-11-20. The
owner will tell you which of the three tasks below to do. Do only that one, and stop to ask where a decision
is theirs.

**Where things stand (2026-11-20).** Task A is done: [the review](review-adr-0145-0151.md). The owner
answered a fifth round of questions that came out of it and a sixth on what the revision proposed
(lexemes.md §16), and accepted all seven ADRs. Each ends with what the owner decided in each round, what was
restored from the notes, and what was accepted as drafted. Tasks B and C are not started. The older ADRs they
amend carry a line saying so ("Decided, not yet built"): until the migration lands, those older ADRs still
describe the code.

**Where the files are.** The ADRs as first written, the notes and the review are on `main`. The revision of
2026-11-20 (the accepted ADRs, the notes' rounds 5 and 6, this file) is on the branch `ccr-aebe970e-q9o4q4`
until the owner takes it to main. If your checkout's `docs/adr/0145-lexical-model.md` says "Status: Proposed",
fetch that branch and merge it into your working branch before you start.

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

## How to work

- Conventional commits; small commits on a branch, landed together when a deliverable is done.
- New data that needs a linguist's sign-off is marked REVIEW and carries `llm:` provenance while it is a draft.
- Shell heredocs can turn `\uXXXX` into the literal character: build escapes in code, then grep for literal
  invisibles before committing.
- When you stop, say what is done, what isn't, and what you need from the owner, in that order.
