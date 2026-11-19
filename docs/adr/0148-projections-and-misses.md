# 0148. Projections as rules, and what a miss is

- Status: Proposed
- Date: 2026-11-19
- Amends: [ADR 0142](0142-sound-alike-spelling.md) (`soundAlike`), [ADR 0131](0131-readings-on-new-words.md)
  (a scheme's `variants`), [ADR 0066](0066-meaningful-endings.md) (contrast sets), [ADR
  0054](0054-pronunciation-exercises.md), [ADR 0098](0098-pronunciation-by-choice.md) and [ADR
  0139](0139-feature-cards.md) (where their options come from); the marks policies of the es and grc profiles
- Builds on: [ADR 0145](0145-lexical-model.md) (one lexical form, projected), [ADR 0146](0146-what-is-learned.md)
  (credit per node)

## Context

A morpheme stores one lexical form, and every orthography and phonemic form is a projection of it (ADR 0145).
Several mechanisms already say, piecemeal, what a projection loses: fa's `soundAlike` sets (those letters are
one sound, so which a word takes is learned per word), a profile's marks set (the vowels the script leaves
out), a scheme's `variants` (chg's vowels written alike), attested tones. Each drives its own cards and its own
grading. And the grader decides a miss by mechanism (a keyboard typo, a mark, a contrast, another course
word), so ✗*havlar* is a typo and *esta* for *está* is "accepted with a note".

## Decision

### What rules read

- **A rule's conditions may read** its base's lexical form (uz ‑qa after q), its lexical features (*pensar*'s
  e→ie class; a verb's imperfective vowel choosing مَفْعَل or مَفْعِل; a noun's gender), the combination's
  features, its neighbours, its scope, and computed prosody (e→ie only under stress: *pienso*, *pensamos*).
- **Two guards:** a class must cover at least two lexemes (a one-member class is a list; *ser* is listed), a
  threshold to raise if it proves too low; and no feature the form already gives (Spanish conjugation class
  from the infinitive, Arabic root class from the radicals).

### Projections are rules, and the profile states them

- **The projections (lexical form to each spelling, lexical form to phonemes) are rules,** so a word's spelling
  and reading are learned only for what no projection gives (ADR 0146).
- **A correspondence covering many words is a rule** (a letter, a digraph, a mark, Spanish *c* before *e* and
  *i*); one per morpheme is listing (a Chinese character's reading, a sitelen pona glyph); a statistical
  tendency is neither (a character's phonetic component, a phonaestheme).
- **The rules are what the orthography profile states**, as data, with contexts, marked REVIEW; whatever they
  don't produce is per word. Not a count threshold, which would let added words change what is a rule.
- **Reading and writing are two directions, each with its own leftovers.** Writing needs what the phonemic
  projection loses (es b/v, h, Cuban s/c/z, ll/y; fa which of س / ص / ث); reading needs what the orthographic
  one loses (fa's vowels and خواهر's silent و; *México*'s x; hbo's qamets gadol or qatan and vocal shewa).
- **Leftovers depend on the variety:** Cuban *casa* / *caza* are a spelling leftover, Madrid's aren't; a Dari
  profile, leaving ق / غ out of its sound-alike letters, makes that pair derivable.
- **One statement in the schema** says what each direction loses, in the profile and scheme schemas. It
  replaces `soundAlike` and a scheme's `variants`, which are removed; matching policy (`match.marks`) stays.
- **The compiler lists each word's leftovers per direction**, and lints any pinned form the stated rules
  can't account for: the per-word parts to teach, and a review list.
- **A projection may be code, but it is part of the language's data**, kept with it rather than in the
  pipeline's audio modules (tiberian, attic, toki_pona, greek_translit). A conformance check confirms the code
  and the profile agree: where the profile says a reading follows from the spelling, the code must get it
  from the spelling alone. **A standing goal: every transformation as pure data**, so it can be analysed and
  run backwards (ordered rewrite rules compile to invertible transducers: Kaplan & Kay 1994).

### What a miss is

- **An orthographic miss: a spelling the target's phonemic form also allows.** The test runs on the whole
  form, under the profile's stated rules: es ✗*havlar*, ✗*aser* (h and c both), *ké tal* (the profile states
  *k* as a spelling of /k/, as in *kilo*), fa سد for صد, uz сирк for цирк, yue 唔洗 for 唔使 (a homophone
  character is a possible spelling of its syllable). Never a typo.
- **A phonemic miss: a form that spells another phonemic form.** *esta* for *está* says /ˈesta/. So **a mark
  that carries sound is never excused as a mark**: Spanish stress accents and ü (*pinguino* says /ɡi/), Greek
  accents and the rough breathing. Marks an orthography leaves out (fa's vowels) are no miss: the unmarked
  form is a possible spelling, the usual one. Which marks carry sound falls out of the projection.
- **Every miss is labelled, and may carry several labels,** each from one question:

  | Question | Label | Example |
  |---|---|---|
  | Is the sound right? | **orthographic**: yes, not the spelling | *caza*, *ké tal* for *casa*, *qué tal* |
  | | **phonemic**: no | *esta*, ✗*cafe* for *está*, *café* |
  | Whose form is it? | **grammatical**: the right lexeme, another form | *hablas* for *hablo* |
  | | **lexical**: another lexeme | *gato* for *perro*; *caza*; *esta* |
  | | **scope**: the right concept, a variety or register the prompt ruled out (ADR 0147) | *tú* under "(to your boss)" |
  | How did it happen? | **slip**: keyboard or IME neighbours, a transposition | ✗*nesa* for *mesa*; *cada* for *casa* |
  | (sentences) | **order**: the right words, in an order the language doesn't allow | |

  *caza* is orthographic + lexical; *esta* phonemic + lexical; *hablas* phonemic + grammatical; *cada* phonemic
  + lexical + slip; ✗*ke tal* orthographic (*k*) + phonemic (the unstressed *que*).
- **The outcome comes from the set:** a slip alone is a typo, accepted (`CORRECT_WITH_TYPO`); any other label
  is not accepted. `CORRECT_MARKS`, `WRONG_WORD` and `WRONG` become views of the set. Strict in es and grc
  alike: a missing stress accent, Greek accent or rough breathing is wrong.
- **Credit follows the labels, per node** (ADR 0146): a label is a miss on one part and the rest of what the
  card made the learner supply is shown. *caza* for "house" shows the sound and misses the spelling, and its
  lexical label counts against telling *casa* from *caza*, which then gets a spelling-choice card. A lexical
  label is always recorded; *gato* for *perro* misses the target's recall.
- **Feedback names every label** (an MF2 note each), the worst first: "right sound, wrong letter", "right verb,
  wrong person", "another word: *caza* is 'hunt'", "that's the word in Spain".
- Not labels of their own: Latin typed for Cyrillic is orthographic with a note; a missing or extra word is
  lexical or grammatical by what it is.

### Cards

- **Spelling-choice, vocalize, vocalize-build, reading-feature and char-read options come from the leftovers**,
  in every course, with no per-course path: a card's options differ from the answer only where the
  direction it asks loses something.

### Done in one go

The stages are build order on one branch, landed together, never half-switched. Done means:
1. one statement of each direction's losses in the profile and scheme schemas; `soundAlike` and `variants`
   removed;
2. every profile and scheme states its losses, marked REVIEW;
3. the compiler reports leftovers per word and direction, and every pinned form in every course is accounted
   for;
4. those cards and the miss labels come from the leftovers in every course;
5. the fold counts leftovers shown (`test/fold-before-r2.ts` mirrored, the simulation and golden files rerun);
6. conformance vectors in both harnesses, for the projections and for the label sets; the fixture courses
   green; profiles/README and CLAUDE.md updated.

## Consequences

- **Grading gets stricter in es and grc:** b/v, h and s/c/z swaps, and missing accents, are wrong with a note
  where they were typos or accepted. Heritage speakers of Spanish are the audience for whom that is the point.
- **The grade carries labels**, not one verdict; the feedback panel and the learner-event schema change with
  it, under the KC-rename migration (ADR 0145).
- **The voices keep their code;** what changes is where it lives and the check that ties it to the profile.
- **Every profile gains a reviewed statement of its losses**, about twenty, most of them short lists.
