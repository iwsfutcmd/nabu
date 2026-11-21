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
  beside what they are today, each with a report ([migration/](migration/README.md)). **The switch,
  deliverable 3, is next and should not start before the owner has read "For the owner" in the note:** it
  lists what was settled while building the converter and what the reports found. Two things read into the
  owner's answers also still wait, marked "for the owner" in the note.
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

**The owner's "let's just use UD tags" was read as** (the owner asked for the reading on 2026-11-20 and
has not confirmed it):
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

## How to work

- Conventional commits; small commits on a branch, landed together when a deliverable is done.
- New data that needs a linguist's sign-off is marked REVIEW and carries `llm:` provenance while it is a draft.
- Shell heredocs can turn `\uXXXX` into the literal character: build escapes in code, then grep for literal
  invisibles before committing.
- When you stop, say what is done, what isn't, and what you need from the owner, in that order.
