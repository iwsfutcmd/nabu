# 0159. Learning merged lexemes: lexemes only, each by contrast

- Status: Proposed
- Date: 2026-11-28
- Builds on [0158](0158-morphology-is-merging-lexemes.md) (morphology is merging lexemes). Amends, once accepted:
  [0146](0146-what-is-learned.md) (a feature value as a part, its `read-off` and `choose` skills),
  [0132](0132-a-choice-asks-one-thing.md) (what a choice card credits), [0152](0152-a-word-and-its-parts.md) (a
  word's parts) and the credit rules of [0148](0148-projections-and-misses.md).
- The owner, 2026-11-28: "Lexemes only, btw. One can only learn a lexeme for a language, not some abstract
  feature." And: "zero lexeme by contrast. Honestly, all lexemes by contrast? That makes sense to me."

## Context

ADR 0158 made every value a word has the gift of a lexeme merged with it: arb's -tu brings the perfect, first person
and the singular at once; ms ∅ brings the masculine singular by being nothing. The learning side still counts what
the token-choice model counted: lexemes, and feature values (`feature:Tense=Past`, with the skills `read-off` and
`choose`). With lexemes doing all the work, a feature value no longer names anything a learner could meet: it is a
property several lexemes share. And a zero lexeme cannot be read off a word at all: ms ∅ is seen only beside -ū and
-ī.

## Decision (proposed)

### 1. Lexemes only

A learner learns lexemes: stems, clitics and affixes alike, zero ones included. Feature values stop being parts: no
card credits one, the fold keeps no memory of one, and `iPlusOne` counts lexemes (and rules) only. They stay as
names: a form's label ("past: I"), the word list's grouping, the words of feedback, the Data page. A rule branch an
affix takes (arb `ind`'s -na after -ū) is a memory under its lexeme (`lexeme:ind|<branch>`: the owner, 2026-11-23, a
memory per branch).

### 2. Every lexeme by contrast

A card credits a lexeme only where **the prompt decides it against the lexemes that could stand in its place, and the
answer could have held one of them.**

- Its **competitors** are the lexemes that merge onto the same word and bring the same features (arb `perf-3ms`
  beside `perf-3fs`, `perf-2ms` …; ms ∅ beside -ū, -ī, -ā, -na; a verb stem beside the other verbs). They come from
  the rules (`on`, `realises`), never from a list in code.
- **Typed answers** always contrast (the learner could have typed anything); a lexeme is credited where the prompt
  decides it. English "you wrote" does not decide -ta against -ti, so neither is credited: ADR 0085 seen from the
  other side (what the prompt does not decide, the learner may choose, and it is not credited).
- **Choice cards** credit only what their options tell apart (ADR 0132's one thing, stated as credit): an ending no
  option varies was not asked.
- **A zero lexeme** is credited only where the prompt sets it against an audible competitor (ms ∅ for "he writes"
  where "they write" is the alternative). Elsewhere it is given.
- A miss counts against the lexeme the answer put in its competitor's place, and against nothing it got right (the
  prefix and stem of a word whose ending was wrong).

### 3. What this needs (the order of work)

1. **arb's open questions that touch the model**, first the possessive suffix bringing `Definite=Cons` itself
   (docs/rules/arb.md, question 7), which also refuses al- with a possessive (`twice`).
2. **apc's tokens list lexemes** (ADR 0158 E): a converter from today's chosen values to the lexemes that bring them,
   each token proven by `realiseToken` to give the same form; the compiler derives values; the bundle format rises.
   An old event's `feature:` parts map, through aliases.yaml, to the lexemes its own token wrote where that is known;
   the rest is re-learned.
3. **A typed word read back as lexemes**: the bundle's paradigm keyed by the lexemes merged, not by cell, so the
   device looks a word up and never realises (Rules notes). Credit and misses per lexeme; feedback names the lexeme
   that stood in another's place, and a word that breaks an `on` condition says which.
4. **Cards from competitors**: a gap-fill asks which lexeme goes in a place, its distractors that place's
   competitors; the word-parts cards pick and build lexemes. The gloss dialog shows a word's lexemes, ∅ where a zero
   stands, and can give a Leipzig line from their glosses.
5. **The planner and the simulation re-tuned**: affixes are in nearly every sentence and will dominate exposure and
   what is due unless the review weighs it (`CALIBRATION_WEIGHT`, the golden files, against test/simulation.test.ts).
   Then es the same way.

## Consequences

- What a card credits becomes exact: a word typed with the right stem and the wrong ending credits the stem and
  misses only the ending; a learner who never met -ūna gets no credit for ms ∅.
- The learner's record is per lexeme and per branch, as the rules are; there is no second, abstract account to keep
  in step.
- Competitors must be computable for every place a lexeme stands. Where the rules are incomplete (a language not yet
  converted), nothing is credited by contrast until they are, and today's credit stands.
- Logs from before the switch lose what cannot be mapped to a lexeme; with no real learners yet, that is cheap now
  and dear later.
