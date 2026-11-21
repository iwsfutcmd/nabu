# Converting `courses/tok` to the lexical model

Written by `nabu migrate ../courses/tok`; do not edit by hand. It belongs to
[the migration's design note](../migration-design.md), deliverable 2. Nothing here is
decided: the converter applies the course's conversion plan
(`pipeline/src/nabu/migrate/plans/tok.yaml`, drafted, REVIEW) and lists what it found.

## What was converted

|  | Count |
|---|---|
| Sense KCs | 126 |
| `form:` KCs | 0 |
| `construction:` KCs | 6 |
| `grapheme:` KCs | 0 |
| Sentences and story lines | 485 |
| Tokens | 5330 |
| Lexemes in `lexicons/tok/lexemes.yaml` | 126 |
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
| a construction: a rule, not written yet | 6 |
| a sense: the lexeme of its name | 126 |

**`form:` and `construction:` KCs** (the plan's statements, REVIEW):

| KC | Gloss | Becomes | Note |
|---|---|---|---|
| `construction:x-ala-x` | X ala X?: a yes/no question | `rule:x-ala-x`, not written | a rule: a word, ala and the word again ask yes or no of any predicate |
| `construction:pona-tawa` | X li pona tawa Y: Y likes X | `rule:pona-tawa`, not written | a listed item with slots: "X is good to Y" is how liking is said, and the parts do not say "like" |
| `construction:la-if` | X la Y as a condition: if X, Y; when X, Y | `rule:la-if`, not written | a rule: la after a clause makes it the condition |
| `construction:preverb` | a preverb before a verb: mi wile moku (I want to eat) | `rule:preverb`, not written | a rule: a verb of wanting, knowing or being able stands before the verb it governs |
| `construction:counting` | numbers that add up: tu wan (three), tu tu (four) | `rule:counting`, not written | a rule: number words add up in the order said |
| `construction:ni-colon` | e ni: before a reported sentence (says that, thinks that) | `rule:ni-colon`, not written | a rule: ni stands for the sentence that follows |

**Constructions, each with its sentences** (ADR 0145: a rule where its meaning is its
parts', a listed item with slots where it is not; decided per construction with its
course). None is decided here: the last column is the plan's drafter's reading.

| KC | Sentences that name it | Keeps | Reading |
|---|---|---|---|
| `construction:x-ala-x` | 10 (s.u04.8, s.u04.9, s.u04.10…) | `rule:x-ala-x` | a rule: a word, ala and the word again ask yes or no of any predicate |
| `construction:pona-tawa` | 8 (s.u06.34, s.u06.35, s.u06.36…) | `rule:pona-tawa` | a listed item with slots: "X is good to Y" is how liking is said, and the parts do not say "like" |
| `construction:la-if` | 4 (s.u07.35, s.u07.36, s.u07.37…) | `rule:la-if` | a rule: la after a clause makes it the condition |
| `construction:preverb` | 8 (s.u08.9, s.u08.10, s.u08.11…) | `rule:preverb` | a rule: a verb of wanting, knowing or being able stands before the verb it governs |
| `construction:counting` | 2 (s.u09.34, s.u09.35…) | `rule:counting` | a rule: number words add up in the order said |
| `construction:ni-colon` | 3 (s.u10.35, s.u10.36, s.u10.37…) | `rule:ni-colon` | a rule: ni stands for the sentence that follows |

## Clips

The audio index is not rewritten: the compiler still reads it. A word's clip is keyed
by its KC id; these are the clips whose item has one name in the new shape, which the
switch renames and changes nothing else of. In a cast of several voices the voice
each has today is pinned (`courses/tok/next/audio/assignment.yaml`), since a voice
is drawn by the item's id (ADR 0078).

|  | Clips |
|---|---|
| clips | 611 |
| clips keyed by a KC | 126 |
| clips renamed with their item | 126 |
| voices pinned (a cast of several draws by the item's id) | 126 |

## What no finding above covers

- **Projections:** no orthography of this course has a stated projection yet, so every
  spelling and reading stays pinned as it is; there is nothing to compare them with
  (ADR 0148).
- **Credits by sentence:** an old credit for a `form:` KC that is feature values now
  goes, sentence by sentence, to the values the form chose there that the course teaches
  (the sentence's parts). Where the sentence is not known it goes nowhere, and nothing
  old counts towards a rule (ADR 0146).
