# 0158. Morphology is merging lexemes

- Status: Proposed
- Date: 2026-11-26
- Supersedes, once accepted: [0145](0145-lexical-model.md)'s realisation by cell (a lexeme realised "in a cell", a
  token choosing feature values on its lexeme) and the `realisation` blocks of [rules-design.md](../rules-design.md)
  §§3–4; amends [0146](0146-what-is-learned.md) (what a feature value is as a part) and
  [0152](0152-a-word-and-its-parts.md) (a word's parts).
- The owner, 2026-11-26, on the rules explorer: "It doesn't actually make sense for a lexeme to have switches for, say,
  person, or tense, or case. The *only* thing that can happen with rules is a lexeme can be merged with another
  lexeme." Then: "merging lexemes is the whole of morphology. And the base lexeme (say, a verb) should have *no*
  features like person, aspect, etc. It only has the feature 'verb', which lets it merge with, say, a lexeme that
  could provide it with one of those features. You could even say that a lexeme could not be outputted until all of
  those features are properly set. This could get tricky because, for example, an infinitive doesn't take person or
  tense in Spanish. but you could always say that 'finite-ness' gives the output a further requirement of person and
  tense."

## Context

What is built (stages 1 to 4 of rules-design.md, every language by 2026-11-25) is a paradigm model. A token names
its lexeme and **chooses feature values on it** (es *tengo*: `tener` with `{Mood: Ind, Number: Sing, Person: '1',
Tense: Pres, VerbForm: Fin}`); `language.yaml`'s `realisation` rules are **keyed by those values** (apc's
`rule:apc-perfect`: when `Aspect=Perf`, and `Person=1, Number=Sing`, add ت); the compiler ships a paradigm per
lexeme over `cells`, and the rules explorer offers each feature as a switch. A cell goes in, a form comes out.

The owner's model has no cells. A lexeme carries its category and nothing about its form; every feature value a
word has was brought by a lexeme merged with it; a rule is what happens where two lexemes meet. The features are
not inputs: they are what the merged lexemes add up to.

Some of the repo is already there. uz and chg write their suffixes as lexemes (`bar-` + `past` + `pp1s`: *bardim*),
fa its person endings and the ezafe, and `phonology` rewrites already fire at boundaries (`+`). What is not:
`realisation` blocks (adding text by feature value), and every token that chooses values on its base.

| course | tokens | tokens choosing values | tokens of several lexemes | realisation branches | rewrites | affix lexemes |
|---|---:|---:|---:|---:|---:|---:|
| apc | 11,447 | 5,095 | 1,552 | 31 | 29 | 1 |
| es | 11,204 | 6,493 | 26 | 161 | 47 | 0 |
| hbo | 4,573 | 2,438 | 1,004 | 55 | 38 | 1 |
| sk | 2,873 | 2,109 | 0 | 340 | 71 | 0 |
| bar | 2,149 | 1,546 | 39 | 42 | 17 | 0 |
| grc | 1,282 | 943 | 0 | 298 | 88 | 0 |
| fa | 2,585 | 398 | 385 | 1 | 10 | 13 |
| uz | 5,040 | 0 | 1,050 | 29 | 3 | 25 |
| chg | 5,616 | 0 | 1,264 | 0 | 1 | 45 |
| yue, lzh, tok | 11,436 | 0 | 210 | 0 | 0 | 1 |

(Counted on main, 2026-11-26; "tokens" counts every annotated token in units and stories, all orthographies.)

## Decision (proposed)

### 1. A lexeme is its category and its form

A free lexeme has a `pos` and a lexical form, nothing else that inflection could change. No `feats` that a merge
would set: no person, tense, aspect, case or number on a verb or noun. **What stays on a lexeme** is what belongs
to it and no merge changes (question A): a noun's gender (قهوة is feminine), an sk verb's aspect partner, a
class (`classes`) that says which allomorphs it takes.

### 2. An affix is a lexeme that brings values and requirements

A bound lexeme (`realises`, already in the schema) states:

- **what it attaches to**: a category, and the values the stem must already have or must lack (`on`: es `-o` on
  `VERB` with `VerbForm=Fin, Mood=Ind, Tense=Pres` set and `Person` unset);
- **what it brings** (`realises`: `Person=1, Number=Sing`), one value or several (a portmanteau: es `-o`);
- **what it requires next** (`requires`): the owner's "finite-ness gives the output a further requirement of
  person and tense". es `fin` brings `VerbForm=Fin` and requires `Mood`; `ind` brings `Mood=Ind` and requires
  `Tense, Person, Number`; `inf` (*-r*) brings `VerbForm=Inf` and requires nothing;
- **its form** at the join (its allomorphs, as today, chosen by `before`, `startsIn`, the stem's class).

### 3. A category says what an output needs

`language.yaml` gives each category its first requirement (es `VERB: [VerbForm]`, apc `VERB: [Aspect]`, sk
`NOUN: [Case, Number]`). A word is complete, and can be spelled, when every requirement its lexemes have raised is
met. An incomplete word is not an error to the explorer: it says what is still needed ("needs Person, Number").
The compiler checks every token is complete (a new `form.incomplete`, an error) and that no value is brought twice.

### 4. A rule fires where two lexemes meet

What a `realisation` branch did by feature value, a merge does by lexeme:

- **adding text** is the affix's own form (es `-o`, apc ـت);
- **a stem alternant** (es *tuv-* before the preterite, apc's perfect and imperfect stems, hbo's binyan
  patterns) is a rule conditioned on the lexeme that joins: `when: {joins: lexeme:pret}` chooses tener's stem
  `tuv` (question C);
- **sound change at the join** stays `phonology`, as now.

Listed forms (blocking, ADR 0145) are keyed by the lexemes merged, not by a cell: *fue* is `ser + pret + 3sg`
listed.

### 5. Morphemes with no sound are lexemes with no surface

apc's 3ms perfect *shereb*, es 3sg *tiene*: the requirement for `Person` is met by a lexeme with an empty form
(`3sg`, as fa's ezafe already is), so every value a word has comes from a lexeme and "the only thing that can happen
is a merge" holds with no exception (question B).

### 6. Features are derived, everywhere downstream

A token no longer writes `feats`; the compiler derives them from its lexemes' `realises` (as `token_cell` does for uz
today) and ships them as now, so what reads a token's features (labels, gap-fill's `asks: form`, contrast sets'
`forms`, word-parts cards, the paradigm a dialog shows) changes little. Whether a feature value stays a *part* a
learner is credited for, or the affix lexeme takes its place, is question D.

### 7. The rules explorer becomes base + lexemes

Pick a base; add lexemes before and after it. No switches. It shows the features the merge has so far, what is
still required, and the rules that fired at each join; a word is spelled once complete (and shown incomplete
before). What to add is offered by what attaches: only affixes whose `on` the word satisfies now.

## Worked examples

**es *tengo***. Today: `{lexeme: tener, feats: {Mood: Ind, Number: Sing, Person: '1', Tense: Pres, VerbForm: Fin}}`.
Proposed: `tener` (VERB; requires `VerbForm`) + `fin` (∅; brings `VerbForm=Fin`, requires `Mood`) + `ind` (∅;
`Mood=Ind`, requires `Tense, Person, Number`) + `pres` (∅; `Tense=Pres`) + `-o` (`Person=1, Number=Sing`, on
`Tense=Pres`). The rule `e-ie`'s boot alternation and *teng-* before `-o` fire at the join with `-o`. Whether `fin`,
`ind` and `pres` are three empty lexemes or one (`pres-ind`) is a choice per language: one lexeme per thing a learner
learns is the test. The infinitive *tener* is `tener` + `inf` (*-r*), complete with no Person or Tense.

**apc *btishrabi*** (you, a woman, drink). Today: `shereb` with `{Aspect: Imp, Mood: Ind, Person: '2', Gender: Fem,
Number: Sing}`. Proposed: `b-` (`Mood=Ind`, on `Aspect=Imp`) + `t-` (2nd person prefix) + `shereb` + `impf`
(∅; `Aspect=Imp`: the imperfect stem *-shrab-* is the rule at this join) + `-i` (`Gender=Fem, Number=Sing`).

**uz *bordim*** is already this: `bormoq` + `past` + `past-1sg`; its `realisation` branches that only choose which
affix lexeme to attach go away, the lexemes themselves carrying `on` and `requires`.

## Consequences

- **The conversion is mechanical in the main.** Every `realisation` branch today (957 over eight languages) already
  pairs feature values with text: each becomes an affix lexeme (or a stem rule), and each token's lexemes are the
  branches the realiser reports for it now (`{rule, branch}`, the token check). A converter (Python, run once, then
  deleted, as the lexical-model converter was) writes lexicons and units; `nabu forms` must come back with no
  `form.unaccounted`. sk and grc (340 and 298 branches: case endings by declension class) are the largest.
- **Units change**: 20,000 tokens across seven courses gain lexemes and lose `feats`. Surfaces per affix are the
  realiser's, so tokens need not spell them by hand (a token may list affixes without `surface`).
- **Learners' state**: card keys of feature-value parts change if question D moves credit to affix lexemes; old
  events go through `upgrade` with an aliases table, as the lexical model's did.
- **Bundles**: format 6. `cells` and `paradigm` stay as a view the compiler works out (every complete combination of
  the category's affixes, cut to what the course teaches), so the dialog's forms and grading's "another form" keep
  their data.
- **What is learned as a rule** (ADR 0146) is unchanged: a `{rule, branch}` taken at a join is still a part.

## Questions for the owner

- **A.** May a lexeme keep what is its own and never merged in: a noun's gender, sk's aspect partners (robiť /
  urobiť), a stem class? (Proposed: yes, as lexical values, never switches.)
- **B.** Zero morphemes: lexemes with no surface (proposed), or does an unmet requirement take a stated default?
- **C.** Stem alternants and templatic patterns (es *tuv-*, apc's stems, hbo's binyanim): a rule at the join with
  the lexeme that triggers it (proposed), or a pattern lexeme merged with a root?
- **D.** Credit: does a learner learn the affix lexeme (es `-o`, apc ـت) in place of the feature value
  (`feature:Person=1`), or both?
- **E.** Order of work: apc first (as the rules were), then es; the explorer rebuilt against apc as soon as apc
  converts.
