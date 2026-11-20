# 0152. A word and its parts: built, and taken apart

- Status: Proposed
- Date: 2026-11-20
- Builds on: [0061](0061-lemmas-and-morphs.md) (a word is its lemma and its morphs),
  [0132](0132-a-choice-asks-one-thing.md) (a card asks one thing; pinned forms), [0100](0100-known-words.md)
  and [0101](0101-skill-targets.md) (what a word is known by; typing slots),
  [0050](0050-ten-unit-courses.md) (options from the unit or earlier),
  [0125](0125-one-lesson-builder.md) (every session is the planner's)
- Relates to: [0146](0146-what-is-learned.md) (accepted 2026-11-20, not yet built), whose building cards
  these are a first version of, on today's data. Nothing here waits for ADRs 0145–0151.

## Context

The owner asked for two cards: from a word's parts to the word, and from the word to its parts.

The courses already say what their words are made of. A token carries its morphs (uz, fa, chg, hbo and apc:
endings, prefixes, clitics, each a KC with a glossary entry), or the form its source pins it as (es, grc,
hbo, apc: tense and person; gender, number, case, state), or both. Until now that fed three things: the
gloss of a tapped word, credit, and the gap-fill that asks which form (ADR 0132).

No card asked the form itself. A form was chosen among a word's other forms inside a sentence, or typed as
one word of a whole sentence or of a blank whose word the learner had to recall as well. Nothing said "here
is the word and here is the form: write it", and nothing asked what a word in front of the learner is made
of.

ADR 0146 describes building, extraction and decoding cards on the lexical model of ADR 0145. That model is
decided and not yet in the code. These two cards are what today's tokens can carry.

## Decision

### Two cards

**`parts-whole`: a word built from its parts** (produce; typed).
- The card shows what the sentence means, the sentence with one word left out, and that word's parts in the
  word's own order, in the target's direction: its own word with its meaning, then each form by its name.
- The learner types the word. It is graded as a typed blank is: the word as the sentence writes it and the
  spellings the course accepts for it, by the orthography's profile (typos, marks, the course's other words).

**`whole-parts`: a word taken apart** (recognize; tiles).
- The card shows the sentence with one word marked, and parts to pick: the word's own among others.
- The learner picks every part of the word, in any order. Right is exactly the word's parts: none left
  out, none added.
- What the sentence means shows once the card is answered, in room kept for it. Before that it would name
  the parts ("my family").
- Once answered, the word's parts are marked on their tiles, and any other part the learner picked.

### What a part is

A word's parts are read off its token, in the word's order:
- **its own word:** its sense's first form, the lemma, as the word list and word cards show it;
- **each morph the course marks on it:** a form (an ending, a prefix: -(i)m "my", mi- "present") or another
  word written with it (a clitic, an article: hbo's וְ and הַ, apc's el);
- **the form its source pins it as** (es `form:pres-1s`, grc `form:gen`, hbo `form:f-pl`), next after its
  own word, unless the word has that form of itself: the course pins it on the word where the word is
  written as its lemma. *casa* is feminine as it stands, so its gender is no part of *casa*; the feminine
  plural is a part of *casas*. hbo's אֶרֶץ is feminine as it stands, so אַרְצְךָ is "earth" and "your", in
  whatever shape the suffix leaves the word. This is read off the course's sentences: no list of genders
  is written anywhere.

A word is shown as the course writes it, with its meaning cut for a card (`cardGloss`). A form is shown by
its glossary entry, whole: that entry is what names it ("-(i)m: my", "present tense: I (yo)").

No list of forms, endings or clitics is written into code. `wordPartsOf` reads tokens; labels come from
the course's glossary.

### What is asked, and what is credited

**The cards ask forms, and are credited to forms only.**
- A word shown on the card is given: the card writes it out with its meaning, so an answer says nothing of
  it. That holds for the word's own word and for a clitic or an article beside it.
- A built word is credited to each form the word carries, as produced. A word taken apart is credited to
  each form it carries, as recognized.
- **A word with no form gets no card.** hbo's וְהָאָרֶץ is three words written as one (and, the, earth):
  nothing in it could be credited, so neither card is made of it. וְ still appears as a part of a word that
  has a form (וְהָעֵצִים: and, the, tree, plural), where it is given.
- Credit is for the whole card: right or wrong. A word taken apart with the wrong lemma and the right forms
  is wrong, and its forms are debited. Credit per part needs the response, which `creditOf` does not see;
  it is left for later.
- A mistake keeps its word (`Mistake.ask`: the word's forms). The card comes back about that word, and
  only an answer about it closes the mistake, as ADR 0037's amendment has it for a blank.

Form KCs are words in ADR 0100's sense (`WORD_KINDS`): a form is known once it is recognized and produced.
A built word is the one card that asks a form's production of the form alone.

### What the cards do not give away

**A built word:**
- No card is made of a word the card would hand over: one whose own word, or a word beside it, typed as
  the card shows it, would be accepted for it. fa's کتابِ with its unwritten ezafe is typed کتاب.
- The form's name may give its shape: "-(i)m: my" says the ending. What is left to the learner is to put
  it on the word (uz *uka* + -(i)m is *ukam*, not *ukaim*). Where the entry names the form without its
  shape (es, grc, hbo: "present tense: he, she, it"), the learner recalls the form (*ser*: *es*).

**A word taken apart:**
- The other parts come from the word's unit or an earlier one (ADR 0050).
- Up to two other words of the word's kind (ADR 0132's `sameKind`), those that begin most like its own
  first; never one whose meaning its own shares, or that the course writes as this word.
- Up to three other forms: those this very word takes elsewhere first, then those of words of its kind,
  then any.
- **Never a form that may be true of the word too.** Forms carry no feature values yet (ADR 0145), so
  their names decide: a form whose name is made of parts of a name the word carries, or the reverse, is
  never offered (feminine beside feminine plural; plural beside plural construct). REVIEW with each
  course's form names.
- **At least one other form is offered.** A form offered alone would say it is the word's.
- Where a tile's entry begins with the form's shape, the form can be found by its letters. That is a
  limit of today's glossary entries, which name a form and describe it in one text. It goes when forms
  have names of their own (ADR 0145).

### Where the cards are planned

**A course switches them on:** `wordParts: true` in course.yaml, carried in the manifest. On in apc, chg,
es, fa, grc, hbo and uz. Off elsewhere, where `courseExclusions` leaves both cards out of every plan, the
card gallery and practice.
- yue stays off: its words carry one form, the pronouns' plural 哋, with no other form to tell it from.
- lzh and tok have no forms.

**At most one of each a session.**

**A word taken apart competes as any card does.** In a simulated month it is planned in 35 to 54 of
some 60 sessions.

**A built word is typed, and never takes a sentence's place.**
- Only a typed sentence shows that its words can be produced (ADR 0100). A built word shows that of a
  form. So it takes none of the sentences' typing slots (ADR 0101) and counts toward none.
- **Read first, then written.** A word is built only once each form asked was recognized right (the
  fold's `shown`), as a reading is typed after it was chosen (ADR 0131).
- It waits while the session owes a typing slot that a sentence left in the pool could still take.
  Picked early, as any new card is, it left weak learners' sessions unable to afford the sentence: in a
  simulated month of Uzbek, 21 typed sentences fell to 3.
- **Then it has a slot of its own:** one a session, where a form met before today has yet to be produced
  and the session can afford the card, as it affords a typed sentence. Without a slot the calibration
  rarely picked it: a form never produced is predicted at about one chance in two.
- A mistakes session owes no slots and waits for nothing: a missed card comes back there like any other.

**How hard they are taken to be** (`prior`, until answers say otherwise; REVIEW on real logs):
- a built word: midway between a blank chosen and a blank typed (0.2). Its own word is given and its
  forms are named; what is typed is one word;
- a word taken apart: as hard as a sentence arranged from tiles (0.0). Several picks among a few.

### The views

- A built word: the parts are a list of chips in the target's direction, so a right-to-left word's parts
  read right to left under a left-to-right interface. The typed field is the blank's, described by the
  hint, the sentence and the parts, so a screen reader hears the parts as focus lands on it. It spreads
  `keyboardHint` and is IME-safe, as every typed field is.
- A word taken apart: toggle buttons (`aria-pressed`), in the tile bank's layout. A number key toggles a
  tile; Backspace takes the last pick back; Check and Enter are the shell's.
- Marking after the answer is by colour and by border style (a dashed border for a part wrongly
  picked), from the theme's tokens. Colour is never the only sign: the feedback of a word taken apart
  wrongly lists its parts, in the word's order, and so does the end of the session.
- Messages: `player.instruction.parts-whole`, `player.instruction.whole-parts`, `player.parts.label`,
  `player.parts.options`.

## Consequences

- **What the courses make** (sentences that make each card, of all the course's sentences):

  | Course | Sentences | Built | Taken apart |
  |---|---|---|---|
  | apc (Arabic script) | 685 | 386 | 386 |
  | apc (Arabizi) | 685 | 389 | 389 |
  | chg | 679 | 518 | 517 |
  | es | 1062 | 1019 | 1019 |
  | fa | 338 | 194 | 242 |
  | grc | 376 | 291 | 291 |
  | hbo | 696 | 427 | 419 |
  | uz (either script) | 325 | 261 | 266 |

- **The glossary entries of forms are now on cards.** They were written to be read on a tap. Each
  course's need a reader's eye for this use (REVIEW in each course.yaml).
  - An entry that writes the ending writes it once, in Latin letters: uz's for its Cyrillic
    orthography too, and fa's, apc's and chg's as a transliteration beside words in Arabic script.
  - An entry is one text per support language, so an ending cannot be shown in the script being
    learned until forms carry their shapes per orthography (ADR 0145).
- **A word never written as its lemma keeps a form it has of itself as a part.** One was found: hbo
  lists מוֹרִיָּה with a vav its passage does not write (הַמֹּרִיָּה), so its cards ask for a feminine
  that is nothing added. The fix is in the course (REVIEW), not in the rule.
- **No new grading behaviour.** A built word is graded by the grader on an accept set, as a typed blank
  is. A word taken apart compares two sets of tile indices. No conformance vectors are added.
- **Plans change in the seven courses.** The projection golden file changes only in its bundle id (fa's
  first lesson and day-3 review are planned as before).
- **The simulation's acceptance runs pass** (28 of 28). Over five seeds of the weakest learner (θ* = 1.0)
  in each of six courses, a month with the cards against a month without:

  | Course | Success without | Success with | Sentences typed | Built | Taken apart |
  |---|---|---|---|---|---|
  | hbo | 82.5% | 82.5% | 21, then 25 | 9 | 50 |
  | grc | 83.1% | 82.9% | 35, then 36 | 12 | 54 |
  | uz | 82.0% | 81.5% | 22, then 27 | 11 | 50 |
  | es | 83.2% | 82.8% | 34, then 39 | 15 | 46 |
  | apc (Arabizi) | 81.0% | 81.7% | 19, then 21 | 8 | 35 |
  | fa | 81.7% | 81.5% | 29, then 34 | 10 | 37 |

  The cards cost these learners a tenth of a point on average, and no typed sentence.
- **One seed swings a point and a half either way,** with the cards or without: of the thirty months
  without them, four fall under the 80% floor (uz 79.4%; apc 78.0%, 79.3%, 79.9%). The acceptance
  suite's six weak-learner runs are one seed each, so a change to what lessons hold can tip one by luck.
  Two earlier settings of the built word failed hbo's run by a quarter of a point or less (79.8%, 79.9%);
  the first, over the same five seeds, averaged 0.2 points under a month without the cards across the six
  courses (0.8 in hbo). The pacing check already averages three seeds for this reason; whether the
  acceptance runs should is the owner's to decide, and nothing here changes them.
- **The difficulties are guesses.** The simulator's truth for the two cards (0.6 and 0.4) is set by the
  same analogies as their priors, not measured. A built word's first try at a form never produced is
  simulated at about one chance in three for the weakest learner, which is likely too hard for a card
  that gives the word and names the form. Re-tune on real logs.
- **Planning a lesson takes a little longer:** 6 to 11 ms more where the cards are on (es 34 to 43 ms, hbo
  61 to 72, uz 25 to 31, on a busy machine).
- **Tests.** `packages/core/test/parts.test.ts` makes both cards of every sentence of every fixture
  course and orthography and checks them; the path walk (`test/planned.ts`) and the mistakes tests cover
  them as planned cards.
- **Visual and e2e coverage.** Stories under Player/Parts; `tests/visual/parts.spec.ts` checks fa, uz and
  apc under each UI locale, light and dark. No vertically written orthography plans the cards yet, so
  there is no vertical cell; the views use logical properties only. The e2e solver answers both, and
  `tests/e2e/parts.spec.ts` plays both in the built app, by keyboard and by touch, in uz and fa.
- **Translated catalogs.** The four messages are new keys; draft catalogs lack them until translated.

## Not in this ADR

Each of these waits for the lexical model (ADR 0145, 0146) or for the owner:

- **A form the course never writes** (*cantamos* from *cantar*). A built word asks only a word some
  sentence of the course writes, in that sentence.
- **Credit per part,** and with it a wrong lemma that leaves the forms alone.
- **How two words join** (hbo לְ + הַ gives לַ; apc *3a* + *el* gives *3al*). No KC stands for the rule
  today, so a card on it would credit nothing.
- **A form's name without its shape** on a tile, so that a word taken apart is never matched by letters.
- **Patterns and radicals** (a root and a pattern to a word, a word to its root): the handoff's task B.
- **A tile for a part's place in the word** (dragging a boundary, ordering the parts). Parts are picked,
  not ordered.
