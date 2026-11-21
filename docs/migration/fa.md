# Converting `courses/fa` to the lexical model

Written by `nabu migrate ../courses/fa`; do not edit by hand. It belongs to
[the migration's design note](../migration-design.md), deliverable 2. Nothing here is
decided: the converter applies the course's conversion plan
(`pipeline/src/nabu/migrate/plans/fa.yaml`, drafted, REVIEW) and lists what it found.

## What was converted

|  | Count |
|---|---|
| Sense KCs | 237 |
| `form:` KCs | 15 |
| `construction:` KCs | 5 |
| `grapheme:` KCs | 2 |
| Sentences and story lines | 426 |
| Tokens | 1700 |
| Lexemes in `lexicons/fa/lexemes.yaml` | 253 |
| Pinned forms (rule debt, ADR 0145) | 2 |
| Listed forms | 0: no statement that a form has no rule is drafted yet |

**Checks** (docs/migration-design.md, "What must not change"):

- every sentence and story line as displayed: text, tokens, readings, accept sets and translations are unchanged, item by item;
- no two annotations of the course became one;
- every lexeme a token writes is written as its entry, or as a form or allomorph the lexicon has;
- every name points at something, and every file fits its schema.

## What each KC id became

| Kind | KCs |
|---|---|
| a construction written as a morph: a lexeme | 3 |
| a construction: a rule, not written yet | 2 |
| a form written as a morph: a lexeme | 15 |
| a letter of a script track: unchanged | 2 |
| a sense that is a form of another lexeme | 2 |
| a sense: the lexeme of its name | 235 |

**Senses that are no lexeme of their own now** (the plan's statements):

| KC | Gloss | Became | Why |
|---|---|---|---|
| `sense:bud` | was, were (past of 'to be', stem بود-) | a form of `lexeme:budan` (Tense=Past) | the past stem of بودن |
| `sense:nist` | is not; am not, are not | a form of `lexeme:budan` (Polarity=Neg) | the negative of است, written as one word |

**`form:` and `construction:` KCs** (the plan's statements, REVIEW):

| KC | Gloss | Becomes | Note |
|---|---|---|---|
| `form:1sg-am` | -am: I (verb ending) | `lexeme:1sg` (realises Number=Sing, Person=1) |  |
| `form:2sg-i` | -i: you, one person (verb ending) | `lexeme:2sg` (realises Number=Sing, Person=2) |  |
| `form:3sg-ad` | -ad: he, she, it (verb ending) | `lexeme:3sg` (realises Number=Sing, Person=3) |  |
| `form:1pl-im` | -im: we (verb ending; هستیم: we are) | `lexeme:1pl` (realises Number=Plur, Person=1) |  |
| `form:2pl-id` | -id: you, polite or more than one (verb ending) | `lexeme:2pl` (realises Number=Plur, Person=2) |  |
| `form:3pl-and` | -and: they (verb ending) | `lexeme:3pl` (realises Number=Plur, Person=3) |  |
| `form:neg-na` | na-, ne-: not (verb prefix) | `lexeme:neg` (realises Polarity=Neg) |  |
| `form:mi-present` | mi-: present tense (verb prefix) | `lexeme:mi` (realises Aspect=Imp) | the course teaches it as the present's prefix; it is the durative, which the past takes too (mi-raftam): REVIEW |
| `form:subj-be` | be-: imperative and subjunctive (verb prefix) | `lexeme:subj` (realises Mood=Sub) | the imperative takes it too |
| `form:plural-ha` | -hā: plural | `lexeme:pl` (realises Number=Plur) |  |
| `form:plural-an` | -ān: plural (people and living things) | `lexeme:pl-an` (realises Number=Plur) | the plural of people and living things: the same value as pl in another shape, chosen by the noun |
| `form:indef-i` | -i: a, some, any (indefinite ending) | `lexeme:indef` (realises Definite=Ind) |  |
| `form:comparative-tar` | -tar: -er, more (comparative) | `lexeme:comp` (realises Degree=Cmp) |  |
| `form:poss-1sg` | -am: my (joined to a noun) | `lexeme:poss-1sg` (PRON) |  |
| `form:poss-2sg` | -at: your (one person, familiar; joined to a noun) | `lexeme:poss-2sg` (PRON) |  |
| `construction:ezafe` | ezafe: the -e that links a noun to what describes or owns it | `lexeme:ezafe` (PART) |  |
| `construction:doost-dashtan` | دوست داشتن: to like, to love | `lexeme:doost-dashtan` (VERB) | a listed item: دوست and داشتن, of which داشتن inflects |
| `construction:existential-hast` | هست: there is, there are | `lexeme:existential-hast` (AUX) | هست on its own says "there is": a use of بودن, kept as the entry the course has; no token names it |
| `construction:subjunctive` | the subjunctive: be- + present stem + ending after 'want' and 'can' | `rule:subjunctive`, not written | a rule: be-, the present stem and an ending, after a verb of wanting or being able |
| `construction:past` | the simple past: past stem + ending (رفتم, I went) | `rule:past`, not written | a rule: the past stem and an ending |

**Constructions, each with its sentences** (ADR 0145: a rule where its meaning is its
parts', a listed item with slots where it is not; decided per construction with its
course). None is decided here: the last column is the plan's drafter's reading.

| KC | Sentences that name it | Keeps | Reading |
|---|---|---|---|
| `construction:ezafe` | 2 (s.time.31, s.time.32…) | `lexeme:ezafe` |  |
| `construction:doost-dashtan` | 14 (s.food.8, s.food.9, s.food.10…) | `lexeme:doost-dashtan` | a listed item: دوست and داشتن, of which داشتن inflects |
| `construction:existential-hast` | 4 (s.home.27, s.home.28, s.home.29…) | `lexeme:existential-hast` | هست on its own says "there is": a use of بودن, kept as the entry the course has; no token names it |
| `construction:subjunctive` | 5 (s.shopping.10, s.shopping.11, s.shopping.12…) | `rule:subjunctive` | a rule: be-, the present stem and an ending, after a verb of wanting or being able |
| `construction:past` | 16 (s.past.4, s.past.5, s.past.6…) | `rule:past` | a rule: the past stem and an ending |

## What the lexicon holds

Counts of what the converter wrote into the entries, beyond one entry a lexeme.

|  | Count |
|---|---|
| lexemes no token writes | 2 |
| pinned forms | 2 |
| second forms: a built word, now its lexemes | 1 |
| second forms: a variant spelling | 6 |
| stems: the entry less its citation ending | 7 |
| written otherwise than the entry | 15 |

## Dimensions

What every member of a category must choose (ADR 0145), as the plan declares it, and
how many tokens say a value of each: on themselves, or by an ending written on them.
A token that leaves one unsaid is the unmarked form, or one the course's annotation
has no name for.

| Category | Dimension | Tokens that say it | Tokens that do not |
|---|---|---|---|
| NOUN | Number | 13 | 442 |
| VERB | Tense | 0 | 191 |
| VERB | Person | 183 | 8 |
| VERB | Number | 183 | 8 |

**Values no dimension declares:** tokens carry them all the same. A category whose
members do not all inflect (a pronoun, a set phrase said to a woman), or a lexeme
tagged as another category than it behaves as.

| Category | Feature | Tokens | Lexemes, the commonest first |
|---|---|---|---|
| AUX | Polarity | 3 | budan |
| AUX | Tense | 11 | budan |

## Clips

The audio index is not rewritten: the compiler still reads it. A word's clip is keyed
by its KC id; these are the clips whose item has one name in the new shape, which the
switch renames and changes nothing else of. In a cast of several voices the voice
each has today is pinned (`courses/fa/next/audio/assignment.yaml`), since a voice
is drawn by the item's id (ADR 0078).

|  | Clips |
|---|---|
| checked clips renamed with their item | 34 |
| clips | 674 |
| clips a person checked | 37 |
| clips keyed by a KC | 238 |
| clips renamed with their item | 236 |
| clips whose item is no lexeme of its own now | 2 |

## Written otherwise than the entry (15)

A token names the lexeme, no feature value tells it from the entry's own form, and it is spelled differently: an allomorph by context (gran before a noun), or a form the course's annotation has no name for. Kept as an allomorph of the entry.

| Where | What |
|---|---|
| `lexeme:budan` | written هست (39×, first in s.12): an allomorph, or a form no value names |
| `lexeme:budan` | joined to another lexeme, written ست (14×, first in s.home.13) |
| `lexeme:dashtan` | joined to another lexeme, written دار (70×, first in s.numbers.2) |
| `lexeme:kardan` | joined to another lexeme, written کن (12×, first in s.day.3) |
| `lexeme:raftan` | joined to another lexeme, written رو (21×, first in s.day.8) |
| `lexeme:amadan` | joined to another lexeme, written آی (11×, first in s.day.11) |
| `lexeme:khordan` | joined to another lexeme, written خور (12×, first in s.day.14) |
| `lexeme:khandan` | joined to another lexeme, written خوان (8×, first in s.day.20) |
| `lexeme:khabidan` | joined to another lexeme, written خواب (4×, first in s.day.22) |
| `lexeme:pichidan` | joined to another lexeme, written پیچ (5×, first in s.city.24) |
| `lexeme:khastan` | joined to another lexeme, written خواه (13×, first in s.shopping.1) |
| `lexeme:kharidan` | joined to another lexeme, written خر (6×, first in s.shopping.8) |
| `lexeme:didan` | joined to another lexeme, written بین (3×, first in s.shopping.22) |
| `lexeme:tavanestan` | joined to another lexeme, written توان (1×, first in s.shopping.23) |
| `lexeme:dadan` | joined to another lexeme, written ده (4×, first in s.shopping.27) |

## Lexemes no sentence writes (2)

An entry of the lexicon with no token: a word taught only by its card, or left over.

| Where | What |
|---|---|
| `lexeme:doost-dashtan` | no sentence or story line writes it |
| `lexeme:existential-hast` | no sentence or story line writes it |

## Clips of a word that is no lexeme of its own now (2)

The clip says the word; the word is a form of another lexeme now, or built of several. It stays in the index under its old item until the switch says what keys a form's clip.

| Where | What |
|---|---|
| `sense:bud` | its clip says a word that is a form of another lexeme, or built of several, now: no item of the new shape has that name |
| `sense:nist` | its clip says a word that is a form of another lexeme, or built of several, now: no item of the new shape has that name |

## Left for a reviewer by the plan

What the plan's drafter saw and did not decide.

- A verb's present stem is its own (دار of داشتن, بین of دیدن): the report lists each as written otherwise. By ADR 0145 it is a listed stem of its lexeme (the note's own example is rav-); no statement that it is listed is drafted yet.
- می is drafted as the durative (Aspect=Imp), which the past takes too; the course teaches it as the present's prefix.
- بود (was) and نیست (is not) are folded into بودن. چیست and کیست (what is, who is) stay entries: the course has no lexeme for کی to build کیست of.
- The two plurals (ـها, and ـان of people) are kept as the course's two endings with one value.
- هست on its own, there is, is kept as the entry the course has (it has a spelling and a clip); no token names it.

## What no finding above covers

- **Projections:** no orthography of this course has a stated projection yet, so every
  spelling and reading stays pinned as it is; there is nothing to compare them with
  (ADR 0148).
- **Credits by sentence:** an old credit for a `form:` KC that is feature values now goes,
  sentence by sentence, to the values the form chose there that the course teaches (the
  sentence's parts). Where the sentence is not known it goes nowhere, and nothing old
  counts towards a rule (ADR 0146).
