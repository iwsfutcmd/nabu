# Converting `courses/yue` to the lexical model

Written by `nabu migrate ../courses/yue`; do not edit by hand. It belongs to
[the migration's design note](../migration-design.md), deliverable 2. Nothing here is
decided:
the converter applies the course's conversion plan
(`pipeline/src/nabu/migrate/plans/yue.yaml`, drafted, REVIEW) and lists what it found.

## What was converted

|  | Count |
|---|---|
| Sense KCs | 261 |
| `form:` KCs | 1 |
| `construction:` KCs | 2 |
| `grapheme:` KCs | 0 |
| Sentences and story lines | 455 |
| Tokens | 3746 |
| Lexemes in `lexicons/yue/lexemes.yaml` | 262 |
| Pinned forms (rule debt, ADR 0145) | 0 |
| Listed forms | 0: no statement that a form has no rule is drafted yet |

**Checks** (docs/migration-design.md, "What must not change"):

- every sentence and story line as displayed: text, tokens, readings, accept sets and translations are unchanged, item by item;
- no two annotations of the course became one;
- every lexeme a token writes is written as its entry, or as a form or allomorph the lexicon has;
- every name points at something, and every file fits its schema.

## What each KC id became

| Kind | KCs |
|---|---|
| a construction: a rule, not written yet | 2 |
| a form written as a morph: a lexeme | 1 |
| a sense: the lexeme of its name | 261 |

**`form:` and `construction:` KCs** (the plan's statements, REVIEW):

| KC | Gloss | Becomes | Note |
|---|---|---|---|
| `form:plural-dei` | -哋 (dei6): plural of a pronoun | `lexeme:pl` (realises Number=Plur) |  |
| `construction:a-not-a` | X唔X: a yes-or-no question (係唔係, 'is it or not') | `rule:a-not-a`, not written | a rule: a predicate, 唔 and the predicate again ask yes or no; a two-syllable word repeats only its first (得唔得閒) |
| `construction:cl-possessive` | pronoun + classifier + noun: possessive (我本書 my book, 你個仔 your son) | `rule:cl-possessive`, not written | a rule: a classifier between a pronoun and its noun says whose it is |

## Clips

The audio index is not rewritten: the compiler still reads it. A word's clip is keyed
by its KC id; these are the clips whose item has one name in the new shape, which the
switch renames and changes nothing else of. In a cast of several voices the voice
each has today is pinned (`courses/yue/next/audio/assignment.yaml`), since a voice
is drawn by the item's id (ADR 0078).

|  | Clips |
|---|---|
| clips | 724 |
| clips keyed by a KC | 260 |
| clips renamed with their item | 260 |
| voices pinned (a cast of several draws by the item's id) | 260 |

## Written otherwise than the entry (2)

A token names the lexeme, no feature value tells it from the entry's own form, and it is spelled differently: an allomorph by context (gran before a noun), or a form the course's annotation has no name for. Kept as an allomorph of the entry.

| Where | What |
|---|---|
| `lexeme:得閒` | joined to another lexeme, written 得 / dak1 (3×, first in s.u06.26) |
| `lexeme:可以` | joined to another lexeme, written 可 / ho2 (1×, first in s.u08.20) |

## Left for a reviewer by the plan

What the plan's drafter saw and did not decide.

- A question of the kind X唔X repeats only the first syllable of a two-syllable word (得唔得閒, 可唔可以): the first copy is listed as written otherwise.
- Names the course teaches no word for (家明, 美玲) are tokens that name no lexeme, as today.

## What no finding above covers

- **Projections:** no orthography of this course has a stated projection yet, so every
  spelling and reading stays pinned as it is; there is nothing to compare them with
  (ADR 0148).
- **Credits by sentence:** an old credit for a `form:` KC that is feature values now has
  no
  part to go to: a feature's uses are not authored, and nothing old counts towards a rule
  (ADR 0146).
