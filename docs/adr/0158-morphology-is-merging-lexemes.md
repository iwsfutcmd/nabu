# 0158. Morphology is merging lexemes

- Status: Accepted (2026-11-26, the owner: "are we good? Can we get started?")
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
  tense." And: "a lexeme's citation form is actually meaningless, it's just a mnemonic for a learner, really. a
  written form only makes sense if the lexeme is fully realized, via merging with enough lexemes that the feature
  slots are filled. some lexemes already have their feature slots filled so their written form happens to be their
  citation form. 0-morphemes can exist, though." Then, on the questions below (A, C, D, E), the same day.

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
to it and no merge changes (the owner, A: yes): a class (`classes`) that says which allomorphs it takes, an sk
verb's aspect partner, and gender where it is inherent.

**Gender** (the owner): nearly every noun has an inherent gender (قهوة is feminine, es *casa*). Every adjective is
underspecified for it, and so needs a gender lexeme (which may be zero) to be realizable. A noun that can change
gender (es *amigo*/*amiga*, apc *m3allem*/*m3allme*) is underspecified like an adjective, and takes the same gender
lexemes. Today's `chooses: [Gender]` (es tío) is that underspecification, stated.

**A lexeme has no written form of its own.** Its lexical form is what rules work on; a written form exists only for
a complete word (§3). A lexeme whose category raises no requirement (a particle, an adverb, a preposition, apc
*marHaba*) is complete alone, so its written form happens to be its citation form; a verb or an inflecting noun is
never written bare.

### 2. An affix is a lexeme that brings values and requirements

A bound lexeme (`realises`, already in the schema) states:

- **what it attaches to**: a category, and the values the stem must already have or must lack (`on`: es `-o` on
  `VERB` with `VerbForm=Fin, Mood=Ind, Tense=Pres` set and `Person` unset);
- **which side of its base it stands** (`on.at`: `before` or `after`; the owner, 2026-11-26: "an affix should contain
  within it where it attaches"): a prefix or proclitic before, a suffix, ending or zero morpheme after. Merged on
  the other side it is an `attach` error, and the explorer never asks;
- **onto which hosts**, where they differ (`on.or`: further hosts, each with its own conditions, on the same side;
  apc's -e onto an adjective or a noun, or onto a verb only as its participle);
- **what the word must have when it merges** (`on.has` values, `on.needs` a value for a feature whatever it is,
  `on.complete` every requirement met, by the word or by what the lexeme brings itself). Merging runs outward from the base, each lexeme onto the word as it stands
  (the owner, 2026-11-26: "ʾaktab- simply cannot take a pronominal suffix, but ʾaktabu *can*"), so these conditions
  are the order on each side: nearer the base is merged earlier, and no slots are declared. Between the two sides
  the order does not matter (ʾa- + katab + -u is ʾaktabu either way). A token written in an order no merge allows is
  an `attach` error; the explorer writes picked lexemes in the order they merge in (`mergeOrder`), and two on one
  side that could both merge at once (arb wa- and sa-, both onto a complete word) as they were picked;
- **what it brings** (`realises`: `Person=1, Number=Sing`), one value or several (a portmanteau: es `-o`);
- **what it requires next** (`requires`): the owner's "finite-ness gives the output a further requirement of
  person and tense". es `fin` brings `VerbForm=Fin` and requires `Mood`; `ind` brings `Mood=Ind` and requires
  `Tense, Person, Number`; `inf` (*-r*) brings `VerbForm=Inf` and requires nothing;
- **its form** at the join (its allomorphs, as today, chosen by `before`, `startsIn`, the stem's class).

### 3. A category says what an output needs

A base that never inflects states its own (`requires: []`: apc badd, 3am): it replaces its category's.

`language.yaml` gives each category its first requirement (es `VERB: [VerbForm]`, apc `VERB: [Aspect]`, sk
`NOUN: [Case, Number]`). A word is complete, and can be spelled, when every requirement its lexemes have raised is
met. An incomplete word is not an error to the explorer: it says what is still needed ("needs Person, Number").
The compiler checks every token is complete (a new `form.incomplete`, an error) and that no value is brought twice.

### 4. A rule fires where two lexemes meet

What a `realisation` branch did by feature value, a merge does by lexeme:

- **adding text** is the affix's own form (es `-o`, apc ـت);
- **a pattern** (apc's measures and participle, hbo's binyanim) is a lexeme already (ADR 0145: "a pattern is a
  head … its allomorphs are templates"; ADR 0150 shows one): a pattern lexeme merged with a root, the root's radicals
  filling its slots. apc's perfect and imperfect stems are a pattern's allomorphs, chosen by the aspect lexeme it
  merges with;
- **a stem alternant** that is no pattern (es *tuv-* in the preterite, *teng-* before 1sg *-o*) is the lexeme's own
  allomorph, chosen by the lexeme it merges with (an allomorph's `before` naming a lexeme, as today it names a
  part of speech or a class), never a rule changing letters;
- **sound change at the join** stays `phonology`, as now.

Listed forms (blocking, ADR 0145) are keyed by the lexemes merged, not by a cell: *fue* is `ser + pret + 3sg`
listed.

### 5. Morphemes with no sound are lexemes with no surface

apc's 3ms perfect *shereb*, es 3sg *tiene*: the requirement for `Person` is met by a lexeme with an empty form
(`3sg`, as fa's ezafe already is), so every value a word has comes from a lexeme and "the only thing that can happen
is a merge" holds with no exception (the owner: "0-morphemes can exist").

### 5a. The citation form is a mnemonic

What a word card shows as a lexeme's name (es *tener*, apc *shereb*, grc *λύω*) is not part of the morphology: it is
a mnemonic for the learner, and it is a complete word like any other, the lexeme merged with the lexemes the language
names for it. `language.yaml`'s `citation` changes from a cell to those lexemes (es VERB: `[inf]`; apc VERB:
`[perf, 3, m, sg]`; grc VERB: `[pres, ind, act, 1sg]`); a lexeme's own `citation` (apc *khayef*, cited as its
participle) does the same. The compiler realises it and ships it as the lemma; the lexicon's first `spelled` form,
today the lemma by hand, becomes a check against that (or goes). A lexeme complete alone is cited as itself.
`principalParts` are the same kind of thing: further named merges shown beside the citation, mnemonics too.

### 6. Features are abstract and derived; learners learn lexemes

A token no longer writes `feats`; the compiler derives them from its lexemes' `realises` (as `token_cell` does for uz
today). They are abstract (the owner, D: "feature values are abstract. learners learn lexemes"): they decide what can
merge with what and whether a word is complete, and the compiler may still use them to group and name forms (labels,
gap-fill's `asks: form`, contrast sets' `forms`). They are never a part: `feature:Tense=Past` and its `read-off` and
`choose` skills go, and what a learner is credited for is the lexeme that brought the value (es's preterite and its
1sg ending, apc ـت). A node introduces those lexemes; `iPlusOne` counts them.

### 7. The rules explorer becomes base + lexemes

Pick a base; add lexemes before and after it. No switches. It shows the features the merge has so far, what is
still required, and the rules that fired at each join; a word is spelled once complete (and shown incomplete
before). What to add is offered by what attaches: only affixes whose `on` the word satisfies now, each written on
the side its `on.at` names (no side to choose).

## Worked examples

**es *tengo***. Today: `{lexeme: tener, feats: {Mood: Ind, Number: Sing, Person: '1', Tense: Pres, VerbForm: Fin}}`.
Proposed: `tener` (VERB; requires `VerbForm`) + `fin` (∅; brings `VerbForm=Fin`, requires `Mood`) + `ind` (∅;
`Mood=Ind`, requires `Tense, Person, Number`) + `pres` (∅; `Tense=Pres`) + `-o` (`Person=1, Number=Sing`, on
`Tense=Pres`). The rule `e-ie`'s boot alternation and *teng-* before `-o` fire at the join with `-o`. Whether `fin`,
`ind` and `pres` are three empty lexemes or one (`pres-ind`) is a choice per language: one lexeme per thing a learner
learns is the test. The infinitive *tener* is `tener` + `inf` (*-r*), complete with no Person or Tense.

**apc *btishrabi*** (you, a woman, drink). Today: `shereb` with `{Aspect: Imp, Mood: Ind, Person: '2', Gender: Fem,
Number: Sing}`. Proposed: the root *sh-r-b* merged with the form I pattern, whose imperfect allomorph (*-CCaC-*,
the vowel the verb's class) the aspect lexeme `impf` (∅; `Aspect=Imp`) chooses; then `b-` (`Mood=Ind`, on
`Aspect=Imp`), `t-` (the second person's prefix) and `-i` (`Gender=Fem, Number=Sing`). Whether the verb lexeme is the
root with its pattern stored (as `RadicalForm` stores radicals and Form today) or the root and pattern are two
lexemes on the token is for the conversion to settle with the owner, on apc's data.

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
- **Learners' state**: every `feature:` part goes (D). Old events go through `upgrade` with an aliases table, as the
  lexical model's did: a feature value's cards become the card of the lexeme that brings it, where one lexeme does
  (es `Tense=Past` → the preterite lexeme); where several do (`Person=1` → es `-o`, `-é`, apc ـت …), the old card is
  dropped rather than guessed at, and the fold's next answers rebuild it.
- **Lemmas and word cards**: every lemma becomes a realisation of the citation merges; where one differs from today's
  hand-written first spelling, the compiler lists it for review (apc's verb lemmas already went this way, ADR 0154).
- **Bundles**: format 6. `cells` and `paradigm` stay as a view the compiler works out (every complete combination of
  the category's affixes, cut to what the course teaches), so the dialog's forms and grading's "another form" keep
  their data.
- **What is learned as a rule** (ADR 0146) is unchanged: a `{rule, branch}` taken at a join is still a part.

## The owner's answers (2026-11-26)

- **A.** Yes: a lexeme keeps what is its own. Nearly all nouns have an inherent gender; adjectives are
  underspecified and need a gender lexeme (possibly zero); a noun that changes gender (*amigo*/*amiga*) is
  underspecified like them (§1).
- **B.** Zero morphemes exist, as lexemes with no surface (§5).
- **C.** Patterns were settled by ADR 0145 and 0150: a pattern is a lexeme, a head whose allomorphs are templates
  (§4). A stem alternant that is no pattern is proposed as the lexeme's allomorph chosen by the lexeme it merges
  with (§4): to confirm.
- **D.** Feature values are abstract; learners learn lexemes (§6).
- **E.** apc first, then es; the explorer rebuilt against apc as soon as apc converts.
- **Later (2026-11-26/27).** "For verbs at least, the null morpheme is imperative": a null lexeme stands where the
  language has a gap (arb's imperative: no prefix where the imperfect has one), never for a tense or aspect that
  other morphemes already mark. arb's perfect endings and imperfect prefixes bring their aspect themselves; `perf`
  and `impf` are gone. A zero for an unmarked value beside marked ones stays (yaktubu's ms beside -ūna, -ī), as does a
  pattern with no sound of its own (`ptcp`).
