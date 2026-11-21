# Converting `courses/lzh` to the lexical model

Written by `nabu migrate ../courses/lzh`; do not edit by hand. It belongs to
[the migration's design note](../migration-design.md), deliverable 2. Nothing here is
decided: the converter applies the course's conversion plan
(`pipeline/src/nabu/migrate/plans/lzh.yaml`, drafted, REVIEW) and lists what it found.

## What was converted

|  | Count |
|---|---|
| Sense KCs | 227 |
| `form:` KCs | 0 |
| `construction:` KCs | 5 |
| `grapheme:` KCs | 0 |
| Sentences and story lines | 444 |
| Tokens | 1954 |
| Lexemes in `lexicons/lzh/lexemes.yaml` | 227 |
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
| a construction: a rule, not written yet | 5 |
| a sense: the lexeme of its name | 227 |

**`form:` and `construction:` KCs** (the plan's statements, REVIEW):

| KC | Gloss | Becomes | Note |
|---|---|---|---|
| `construction:ye` | A，B也: “A is B”, a noun as the predicate | `rule:ye`, not written | a rule: a noun predicate with no verb, closed by 也 |
| `construction:neg-pronoun` | 不我知: after a negative, a pronoun object comes before the verb, “does n | `rule:neg-pronoun`, not written | a rule of order: after a negative a pronoun object stands before the verb (CLAUDE.md, lzh) |
| `construction:buyi-hu` | 不亦…乎: “isn’t it …?”, a question that expects “yes” | `rule:buyi-hu`, not written | a listed item with slots: 不亦…乎 expects "yes", which its parts do not say |
| `construction:you-zhe` | X人有…者: “there was a man of X who …”, how a story brings in its hero | `rule:you-zhe`, not written | a listed item with slots: the formula that brings in a story's hero |
| `construction:wei-passive` | 為 A V: “be V-ed by A”, as in 為人笑 “be laughed at by people” | `rule:wei-passive`, not written | a rule: 為 with an agent before the verb makes a passive |

**Constructions, each with its sentences** (ADR 0145: a rule where its meaning is its
parts', a listed item with slots where it is not; decided per construction with its
course). None is decided here: the last column is the plan's drafter's reading.

| KC | Sentences that name it | Keeps | Reading |
|---|---|---|---|
| `construction:ye` | 1 (s.01.10…) | `rule:ye` | a rule: a noun predicate with no verb, closed by 也 |
| `construction:neg-pronoun` | 1 (s.01.30…) | `rule:neg-pronoun` | a rule of order: after a negative a pronoun object stands before the verb (CLAUDE.md, lzh) |
| `construction:buyi-hu` | 1 (s.01.39…) | `rule:buyi-hu` | a listed item with slots: 不亦…乎 expects "yes", which its parts do not say |
| `construction:you-zhe` | 1 (s.06.18…) | `rule:you-zhe` | a listed item with slots: the formula that brings in a story's hero |
| `construction:wei-passive` | 3 (s.07.35, s.07.36, s.07.37…) | `rule:wei-passive` | a rule: 為 with an agent before the verb makes a passive |

## What no finding above covers

- **Projections:** no orthography of this course has a stated projection yet, so every
  spelling and reading stays pinned as it is; there is nothing to compare them with
  (ADR 0148).
- **Credits by sentence:** an old credit for a `form:` KC that is feature values now goes,
  sentence by sentence, to the values the form chose there that the course teaches (the
  sentence's parts). Where the sentence is not known it goes nowhere, and nothing old
  counts towards a rule (ADR 0146).
