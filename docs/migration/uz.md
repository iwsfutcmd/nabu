# Converting `courses/uz` to the lexical model

Written by `nabu migrate ../courses/uz`; do not edit by hand. It belongs to
[the migration's design note](../migration-design.md), deliverable 2. Nothing here is
decided: the converter applies the course's conversion plan
(`pipeline/src/nabu/migrate/plans/uz.yaml`, drafted, REVIEW) and lists what it found.

## What was converted

|  | Count |
|---|---|
| Sense KCs | 213 |
| `form:` KCs | 28 |
| `construction:` KCs | 0 |
| `grapheme:` KCs | 3 |
| Sentences and story lines | 422 |
| Tokens | 2504 |
| Lexemes in `lexicons/uz/lexemes.yaml` | 241 |
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
| a form written as a morph: a lexeme | 28 |
| a letter of a script track: unchanged | 3 |
| a sense: the lexeme of its name | 213 |

**`form:` and `construction:` KCs** (the plan's statements, REVIEW):

| KC | Gloss | Becomes | Note |
|---|---|---|---|
| `form:cop-1sg-man` | -man: I am (suffix on the predicate) | `lexeme:cop-1sg` (realises Number=Sing, Person=1) |  |
| `form:cop-2-siz` | -siz: you are (polite; suffix on the predicate) | `lexeme:cop-2` (realises Person=2, Polite=Form) |  |
| `form:cop-1pl-miz` | -miz: we are (suffix on the predicate) | `lexeme:cop-1pl` (realises Number=Plur, Person=1) |  |
| `form:past-1sg-m` | -m: I (past tense) | `lexeme:past-1sg` (realises Number=Sing, Person=1) | the same value as cop-1sg, in the shape the past takes |
| `form:past-2-ngiz` | -ngiz: you (past tense, polite) | `lexeme:past-2` (realises Person=2, Polite=Form) | the same value as cop-2, in the shape the past takes |
| `form:past-1pl-k` | -k: we (past tense) | `lexeme:past-1pl` (realises Number=Plur, Person=1) | the same value as cop-1pl, in the shape the past takes |
| `form:pres-3sg-di` | -di: he, she, it (present tense) | `lexeme:pres-3sg` (realises Person=3) |  |
| `form:poss-1sg-im` | -(i)m: my | `lexeme:poss-1sg` (realises Number[psor]=Sing, Person[psor]=1) |  |
| `form:poss-2-ingiz` | -(i)ngiz: your (polite) | `lexeme:poss-2` (realises Person[psor]=2, Polite=Form) |  |
| `form:poss-3-si` | -(s)i: his, her, its | `lexeme:poss-3` (realises Person[psor]=3) |  |
| `form:poss-1pl-imiz` | -(i)miz: our | `lexeme:poss-1pl` (realises Number[psor]=Plur, Person[psor]=1) |  |
| `form:plural-lar` | -lar: plural (-s) | `lexeme:pl` (realises Number=Plur) |  |
| `form:gen-ning` | -(n)ing: of, 's | `lexeme:gen` (realises Case=Gen) |  |
| `form:acc-ni` | -ni: the (definite object) | `lexeme:acc` (realises Case=Acc) |  |
| `form:dat-ga` | -ga: to, toward; for | `lexeme:dat` (realises Case=Dat) |  |
| `form:loc-da` | -da: in, at, on | `lexeme:loc` (realises Case=Loc) |  |
| `form:abl-dan` | -dan: from; out of | `lexeme:abl` (realises Case=Abl) |  |
| `form:term-gacha` | -gacha: until, up to, as far as | `lexeme:term` (realises Case=Ter) |  |
| `form:pres-a` | -a / -y: present-future tense | `lexeme:pres` (realises Tense=Pres) |  |
| `form:past-di` | -di: past tense (he, she, it did) | `lexeme:past` (realises Tense=Past) |  |
| `form:prog-yap` | -yap: right now (present continuous) | `lexeme:prog` (realises Aspect=Prog) |  |
| `form:neg-ma` | -ma: not (on verbs) | `lexeme:neg` (realises Polarity=Neg) |  |
| `form:imp-ing` | -(i)ng: please do (polite imperative) | `lexeme:imp` (realises Mood=Imp, Person=2, Polite=Form) |  |
| `form:want-moqchi` | -moqchi: want to; be going to | `lexeme:want` (realises Mood=Des) |  |
| `form:comp-roq` | -roq: -er, more (comparative) | `lexeme:comp` (realises Degree=Cmp) |  |
| `form:count-ta` | -ta: counting suffix | `lexeme:count` (a function head) | the counting form of a number (bitta, ikkita): REVIEW |
| `form:q-mi` | -mi: yes/no question | `lexeme:q` (PART) |  |
| `form:part-chi` | -chi: and ...? what about ...? | `lexeme:chi` (PART) |  |

## What the lexicon holds

Counts of what the converter wrote into the entries, beyond one entry a lexeme.

|  | Count |
|---|---|
| entries shown as a built word | 11 |
| second forms: a built word, now its lexemes | 58 |
| second forms: a variant spelling | 2 |
| stems: the entry less its citation ending | 24 |
| written otherwise than the entry | 13 |

## Dimensions

What every member of a category must choose (ADR 0145), as the plan declares it, and
how many tokens say a value of each: on themselves, or by an ending written on them.
A token that leaves one unsaid is the unmarked form, or one the course's annotation
has no name for.

| Category | Dimension | Tokens that say it | Tokens that do not |
|---|---|---|---|
| NOUN | Number | 28 | 854 |
| NOUN | Case | 210 | 672 |
| VERB | Tense | 254 | 84 |
| VERB | Person | 328 | 10 |
| VERB | Number | 188 | 150 |

## Clips

The audio index is not rewritten: the compiler still reads it. A word's clip is keyed
by its KC id; these are the clips whose item has one name in the new shape, which the
switch renames and changes nothing else of. In a cast of several voices the voice
each has today is pinned (`courses/uz/next/audio/assignment.yaml`), since a voice
is drawn by the item's id (ADR 0078).

|  | Clips |
|---|---|
| clips | 628 |
| clips a person checked | 29 |
| clips keyed by a KC | 213 |
| clips renamed with their item | 213 |

## Written otherwise than the entry (13)

A token names the lexeme, no feature value tells it from the entry's own form, and it is spelled differently: an allomorph by context (gran before a noun), or a form the course's annotation has no name for. Kept as an allomorph of the entry.

| Where | What |
|---|---|
| `lexeme:singil` | joined to another lexeme, written singl / сингл (3×, first in s.family.16) |
| `lexeme:necha` | joined to another lexeme, written nech / неч (4×, first in s.numbers.8) |
| `lexeme:ogil` | joined to another lexeme, written oʻgʻl / ўғл (1×, first in s.numbers.30) |
| `lexeme:kechirmoq` | joined to another lexeme, written kechir / кечир (3×, first in s.city.19) |
| `lexeme:ong` | joined to another lexeme, written oʻng / ўнг (1×, first in s.city.26) |
| `lexeme:boshqa` | joined to another lexeme, written boshqa / бошқа (1×, first in s.bazaar.28) |
| `lexeme:hamma` | joined to another lexeme, written hamma / ҳамма (1×, first in s.bazaar.29) |
| `lexeme:dost` | joined to another lexeme, written doʻst / дўст (2×, first in s.past.10) |
| `lexeme:bilmoq` | joined to another lexeme, written bil / бил (1×, first in s.past.17) |
| `lexeme:toymoq` | joined to another lexeme, written toʻy / тўй (1×, first in s.past.20) |
| `lexeme:qish` | joined to another lexeme, written qish / қиш (1×, first in s.travel.8) |
| `lexeme:kuz` | joined to another lexeme, written kuz / куз (1×, first in s.travel.10) |
| `lexeme:samolyot` | joined to another lexeme, written samolyot / самолёт (1×, first in s.travel.23) |

## Entries shown as a built word (11)

A word card shows the entry's first spelling, and here that is the lexeme with an ending on it. The spelling is kept, since it is what a learner sees today; the lexeme's own form is then missing from its entry.

| Where | What |
|---|---|
| `lexeme:singil` | its entry is spelled singlim / синглим, which the course writes as this lexeme and others: the lexeme's own form is not among its spellings |
| `lexeme:kechirmoq` | its entry is spelled kechirasiz / кечирасиз, which the course writes as this lexeme and others: the lexeme's own form is not among its spellings |
| `lexeme:ong` | its entry is spelled oʻngga / ўнгга, which the course writes as this lexeme and others: the lexeme's own form is not among its spellings |
| `lexeme:boshqa` | its entry is spelled boshqasi / бошқаси, which the course writes as this lexeme and others: the lexeme's own form is not among its spellings |
| `lexeme:hamma` | its entry is spelled hammasi / ҳаммаси, which the course writes as this lexeme and others: the lexeme's own form is not among its spellings |
| `lexeme:dost` | its entry is spelled doʻstim / дўстим, which the course writes as this lexeme and others: the lexeme's own form is not among its spellings |
| `lexeme:bilmoq` | its entry is spelled bilmayman / билмайман, which the course writes as this lexeme and others: the lexeme's own form is not among its spellings |
| `lexeme:toymoq` | its entry is spelled toʻydim / тўйдим, which the course writes as this lexeme and others: the lexeme's own form is not among its spellings |
| `lexeme:qish` | its entry is spelled qishda / қишда, which the course writes as this lexeme and others: the lexeme's own form is not among its spellings |
| `lexeme:kuz` | its entry is spelled kuzda / кузда, which the course writes as this lexeme and others: the lexeme's own form is not among its spellings |
| `lexeme:samolyot` | its entry is spelled samolyotda / самолётда, which the course writes as this lexeme and others: the lexeme's own form is not among its spellings |

## Left for a reviewer by the plan

What the plan's drafter saw and did not decide.

- Person is written by two sets of endings (-man, -siz, -miz on a predicate and after -a; -m, -ngiz, -k after the past's -di): one value in two shapes by what stands before, kept as the course's separate endings. By ADR 0145 agreement merges no head; these are lexemes only because the tokens write them as morphs.
- Eleven entries are spelled as a built word (singlim, do'stim, kechirasiz): what a card shows today. The lexeme's own form is then missing from its entry.
- A stem that drops a vowel before an ending (singil, singl-; o'g'il, o'g'l-) is listed as written otherwise: a rule of the language, not yet written.

## What no finding above covers

- **Projections:** no orthography of this course has a stated projection yet, so every
  spelling and reading stays pinned as it is; there is nothing to compare them with
  (ADR 0148).
- **Credits by sentence:** an old credit for a `form:` KC that is feature values now
  goes, sentence by sentence, to the values the form chose there that the course teaches
  (the sentence's parts). Where the sentence is not known it goes nowhere, and nothing
  old counts towards a rule (ADR 0146).
