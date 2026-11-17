# 0132. A choice asks one thing: which word, or which form

- Status: Proposed
- Date: 2026-11-17
- Amends: gameplan §8.2 (gap-fill), §8.5 (credit assignment); [ADR 0043](0043-stories.md) (story `complete`
  questions); the Phase 6 rule on `complete` distractors (CLAUDE.md)

## Context

The project owner found a Chaghatay story question where more than one option fitted the line. A fix
(2fb07d45) chose wrong options that make the line ungrammatical or absurd. The owner then saw the wider
problem:

> a question should only be asking one thing. In other words, if we have multiple choices, we should be
> asking "which word fits here (semantically)?" or "which word fits here (grammatically)?" asking both at
> the same time means we don't know what cued the learner, giving the learner too much advantage.

Two kinds of card ask for a word in a gap, and both mix the two questions.

**Lesson gap-fill** (`makeGapFill`). It shows the sentence's translation above the gap. Its two wrong
options are the answer's own word in other forms where the course has them (هستم / هستی / هستند), and
otherwise any other word of the unit or earlier, in whatever form it had in its own sentence. One card
often has one of each. The learner rules out the other word by meaning (the translation says what the
gap means) and the other form by grammar. A card can also be passed on grammar alone: the other words
are a verb and a postposition where the gap wants a noun.

**Story `complete`** (`story.ts`). The answer is the gap's word as written; the wrong options are the
first forms (lemmas) of the KCs the author listed. Where the gap is inflected, its suffix alone picks it
out among bare lemmas. Where it is not, an option of another part of speech is ruled out by grammar. The
fix above made this worse in places. chg's "He was a very great ___" offers *adi* "giant", *keyin*
"after" and *bila* "with": only one is a noun, so the card asks nothing about meaning.

**Credit** (`askedKcs`, credit.ts). A gap-fill or story answer is credited to every KC of the answer's
token: its sense and its morphs (or pinned `form`). A learner who knew the ending but not the word gets
the same credit as one who knew both, and a miss is laid on both. Known words (ADR 0100), due words and
the planner's targets (ADR 0101) read these credits, so they are measuring a mix too.

A three-way choice that one cue reduces to two, or to one, is also easier than it looks. The calibration
(85% first-try right) then holds only because some cards ask less than they seem to.

## Decision

**Every multiple-choice fill-in asks one of two questions and says which.** The exercise carries
`asks: "word" | "form"`; the player shows a different instruction for each.

### Which word

- **Every option has the answer's form.** Its form signature is the same: the token's morph KCs other
  than its sense, and its pinned `form` (es, grc, hbo). A dative takes datives; a first person past
  takes first person pasts; a bare word takes bare words.
- **Every option has the answer's part of speech.** KCs get an optional `pos`, a Universal Dependencies
  UPOS tag (NOUN, PROPN, VERB, AUX, ADJ, ADV, ADP, PRON, DET, NUM, PART, CCONJ, SCONJ, INTJ): a standard
  that already covers every language the project teaches. Classifiers are an open question (below).
  Where the answer's KC has one, a candidate must have the same. Where it has none, the form signature
  alone decides, which is enough only for inflected words: bare words of every class match each other.
  So `pos` is needed most where words are bare (lzh, tok, and the uninflected words of every course).
- **Only meaning tells them apart.** In a lesson, a wrong option is never one the translation could
  also mean. Two checks:
  - a candidate whose sentence, with it in the gap, is in the item's accept set (`producible`) is right
    too, so it is never offered (ADR 0085: what the prompt leaves open, the learner may choose);
  - a candidate whose gloss shares a meaning with the answer's (ay- and de- "say") is not offered.

  In a story, the context decides, and the Phase 6 rule stays: a wrong option makes the line false or
  absurd, never another sensible line.
- **Credit goes to the sense only.** Every option had the gap's form, so the form was given.

### Which form

- **Every option is the answer's own word** (the same sense), in another form the course attests: a
  token in the item's unit or earlier (ADR 0050) with that sense and another form signature. Never a
  form the course does not write somewhere; a learner must not meet a made-up form in a choice.
- **Only grammar tells them apart:** agreement with the rest of the line, the translation (I, you, we),
  the persons tags (ADR 0056). The same two checks apply: a form the item's accept set would take is
  never a wrong option (English "you" for sän and siz, "he/she" where the language marks no gender).
- **Credit goes to the form KCs only** (the morph KCs other than the sense, and the pinned `form`). The
  word was given.
- **Feedback says what each form is.** A wrong choice shows the chosen form's form-KC glosses beside the
  right one's ("-dim: I (past)", "-di: he, she (past)"), not the word's meaning, which is the same.

### Which one a card asks

- **A lesson card asks what made the planner blank that word.** `blankIndex` picks the gap by a KC
  being asked again, in focus, or new. If that KC is a sense, the card asks *word*; if a form KC or a
  morph's, *form*. A gap picked by default (the last word) asks *word*, or *form* where only that can
  be built.
- **A mistake is asked again as the same question.** `Mistake.ask` (ADR 0037) records the kind with
  the KCs, and only an answer to that kind closes it.
- **No card where the question cannot be built.** A word question needs two wrong options with the
  answer's form and part of speech; a form question needs two other attested forms. Lacking both, no
  gap-fill is made for that sentence; the planner's other candidates fill the slot, as they do today
  when `makeGapFill` returns nothing.

### Story questions

- A `complete` line gets `asks: word | form` in schemas/course-source (default `word`).
- **word:** `distractors` stay KC ids. The compiler shows each in the gap's form: it finds a token the
  course attests with that sense and the gap's form signature (its unit or earlier) and bundles its
  surface. None found is a diagnostic, `story.distractor-form`. Two KCs of another part of speech than
  the gap's (where both have `pos`) is `story.distractor-pos`.
- **form:** `distractors` are form KC ids (`form:past-1s`), or left out for the compiler to choose two
  attested forms of the gap's sense. A form the course does not attest is `story.distractor-form`.
- Both diagnostics start as warnings, listing every step that fails, and become errors once the courses
  are clean.
- The Phase 6 note in CLAUDE.md is rewritten to say this: a story question asks one thing, and its wrong
  options fail for that reason only.

### What this covers

Only the fill-ins mix two questions today. The other choice cards already ask one: match-pairs and
listen-select ask meaning or what was heard; char-read, vocalize and minimal pairs ask a reading;
story-choose asks comprehension. A new choice template states what it asks, and its options differ in
that alone. Word banks (translate-tap, story-arrange) ask for a whole sentence and are credited as one;
their distractor tiles are not covered here. Typed blanks (complete-translation) ask the learner to
produce the whole word, so crediting sense and form together is honest there.

## Consequences

- A right answer says what the learner knew: the word, or the form. Known words, due words and the
  planner's targets read cleaner credit, and form KCs (person endings, cases, tenses) get credit of
  their own from choices for the first time.
- Word questions are harder than today's mixed cards, form questions too; the simulation must stay
  within ±5pp of 85% (CALIBRATION_WEIGHT), and every course's golden plans change (UPDATE_GOLDEN=1).
  Gap-fill and story-complete screens change in the visual matrix (the instruction text).
- Two new messages each for gap-fill and story-complete instructions (new keys, ADR 0070: the meaning
  changed), and one for form feedback. The drafted catalogs need them translated.
- Every course's story `complete` steps are reviewed: apc 20, chg 19, es 57, fa 10, grc 10, hbo 36,
  lzh 18, tok 10, uz 10, yue 10 (200). chg's were chosen under the Phase 6 rule (2fb07d45) and mix part
  of speech in places (u13's keyin, bila for a noun); they are redone first.
- `pos` must be drafted for every course's KCs (an LLM draft marked REVIEW, as glosses are), starting
  with the KCs that story gaps and lesson blanks use. Until a course has it, its bare words can still
  be offered across parts of speech.
- Courses with little morphology modelled (lzh and tok have none; es and grc pin only verb forms) get
  few form questions; that is right, since a choice there cannot ask about a form the data does not mark.

## Order of work

1. Schemas: `pos` on KCs, `asks` on story lines and on gap-fill and story-complete exercises; codegen.
2. Core: `makeGapFill` builds a word or a form question; `askedKcs` credits the sense or the form KCs;
   `Mistake.ask` keeps the kind; feedback for form questions; messages; goldens; simulation.
3. Compiler: story distractors resolved to attested forms; `story.distractor-form` and
   `story.distractor-pos` (warnings) with lint fixtures.
4. Courses: chg's 19 steps, then the other nine courses; `pos` drafted per course; the diagnostics
   become errors.
5. Visual baselines from the pinned container.

## Open questions

- **yue classifiers and sentence particles.** UPOS has no classifier tag; Universal Dependencies tags
  Cantonese classifiers NOUN with a feature (`NounType=Clf`). A choice among 本, 隻, 個 asks which word,
  and a classifier must only stand against classifiers. Proposed: an optional `class` beside `pos` (here
  `classifier`), matched like `pos` where the answer has one.
- **Story distractors the course does not attest.** A story may want a wrong option in a form no
  sentence writes. Proposed: not allowed at first; the author adds a sentence that teaches it, or picks
  another option. Revisit if many steps cannot be built.
