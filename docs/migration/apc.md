# Converting `courses/apc` to the lexical model

Written by `nabu migrate ../courses/apc`; do not edit by hand. It belongs to
[the migration's design note](../migration-design.md), deliverable 2. Nothing here is
decided:
the converter applies the course's conversion plan
(`pipeline/src/nabu/migrate/plans/apc.yaml`, drafted, REVIEW) and lists what it found.

## What was converted

|  | Count |
|---|---|
| Sense KCs | 358 |
| `form:` KCs | 46 |
| `construction:` KCs | 3 |
| `grapheme:` KCs | 3 |
| Sentences and story lines | 868 |
| Tokens | 5470 |
| Lexemes in `lexicons/apc/lexemes.yaml` | 370 |
| Pinned forms (rule debt, ADR 0145) | 266 |
| Listed forms | 0: no statement that a form has no rule is drafted yet |

**Checks** (docs/migration-design.md, "What must not change"):

- every sentence and story line as displayed: text, tokens, readings, accept sets and translations are unchanged, item by item;
- no two annotations of the course became one;
- every lexeme a token writes is written as its entry, or as a form or allomorph the lexicon has;
- every name points at something, and every file fits its schema.

## What each KC id became

| Kind | KCs |
|---|---|
| a construction: a rule, not written yet | 3 |
| a form pinned on tokens: feature values, no part | 28 |
| a form written as a morph: a lexeme | 18 |
| a letter of a script track: unchanged | 3 |
| a sense built of several lexemes: its first, and each by sentence | 5 |
| a sense that is a form of another lexeme | 1 |
| a sense: the lexeme of its name | 352 |

**Senses that are no lexeme of their own now** (the plan's statements):

| KC | Gloss | Became | Why |
|---|---|---|---|
| `sense:baddak` | you want | built of `lexeme:badd` + `lexeme:poss-2ms` | badd and -ak; pinned as -ik, badd and that |
| `sense:baddi` | I want | built of `lexeme:badd` + `lexeme:poss-1sg` | badd and -i |
| `sense:esmak` | your name | built of `lexeme:esm` + `lexeme:poss-2ms` | esm and -ak |
| `sense:esmi` | my name | built of `lexeme:esm` + `lexeme:poss-1sg` | esm and -i |
| `sense:kifak` | how are you? | built of `lexeme:kif` + `lexeme:poss-2ms` | kif and -ak: a sentence, not a listed item (ADR 0146 on chunks) |
| `sense:raye7` | going (a man going somewhere) | a form of `lexeme:ra7` (Aspect=Part) | the participle of ra7 |

**`form:` and `construction:` KCs** (the plan's statements, REVIEW):

| KC | Gloss | Becomes | Note |
|---|---|---|---|
| `form:fem` | feminine: a feminine noun (ahwe, madrase, teta), or the -e / -a ending | values Gender=Fem, Number=Sing |  |
| `form:pl` | plural: a plural noun (wlad, jiren), or the -in ending on an adjective | values Number=Plur |  |
| `form:impf-1sg` | b-: I (present) | values Aspect=Imp, Mood=Ind, Number=Sing, Person=1 |  |
| `form:impf-2ms` | bt-: you (present, to a man) | values Aspect=Imp, Gender=Masc, Mood=Ind, Number=Sing, Person=2 |  |
| `form:impf-2fs` | bt-…-i: you (present, to a woman) | values Aspect=Imp, Gender=Fem, Mood=Ind, Number=Sing, Person=2 |  |
| `form:impf-3ms` | bi-: he (present) | values Aspect=Imp, Gender=Masc, Mood=Ind, Number=Sing, Person=3 |  |
| `form:impf-3fs` | bt-: she (present) | values Aspect=Imp, Gender=Fem, Mood=Ind, Number=Sing, Person=3 |  |
| `form:impf-1pl` | mn-: we (present) | values Aspect=Imp, Mood=Ind, Number=Plur, Person=1 |  |
| `form:impf-2pl` | bt-…-o: you (present, to several people) | values Aspect=Imp, Mood=Ind, Number=Plur, Person=2 |  |
| `form:impf-3pl` | bi-…-o: they (present) | values Aspect=Imp, Mood=Ind, Number=Plur, Person=3 |  |
| `form:subj-1sg` | e- / no b-: I (after baddi, b7ebb, 3am…) | values Aspect=Imp, Mood=Sub, Number=Sing, Person=1 |  |
| `form:subj-2ms` | t-: you (after baddak, 3am…; to a man) | values Aspect=Imp, Gender=Masc, Mood=Sub, Number=Sing, Person=2 |  |
| `form:subj-2fs` | t-…-i: you (to a woman, after ra7, baddik…) | values Aspect=Imp, Gender=Fem, Mood=Sub, Number=Sing, Person=2 |  |
| `form:subj-3ms` | y-: he (after ra7, baddo, lezem…) | values Aspect=Imp, Gender=Masc, Mood=Sub, Number=Sing, Person=3 |  |
| `form:subj-3fs` | t-: she (after ra7, badda…) | values Aspect=Imp, Gender=Fem, Mood=Sub, Number=Sing, Person=3 |  |
| `form:subj-1pl` | n-: we (after badna, ta…) | values Aspect=Imp, Mood=Sub, Number=Plur, Person=1 |  |
| `form:subj-2pl` | t-…-o: you (to several people, after ra7, badkon…) | values Aspect=Imp, Mood=Sub, Number=Plur, Person=2 |  |
| `form:subj-3pl` | y-…-o: they (after ra7, baddon…) | values Aspect=Imp, Mood=Sub, Number=Plur, Person=3 |  |
| `form:past-1sg` | -t: I (past) | values Aspect=Perf, Number=Sing, Person=1 |  |
| `form:past-2ms` | -t: you (past, to a man) | values Aspect=Perf, Gender=Masc, Number=Sing, Person=2 |  |
| `form:past-2fs` | -ti: you (past, to a woman) | values Aspect=Perf, Gender=Fem, Number=Sing, Person=2 |  |
| `form:past-3ms` | he (past): the bare verb | values Aspect=Perf, Gender=Masc, Number=Sing, Person=3 |  |
| `form:past-3fs` | -et: she (past) | values Aspect=Perf, Gender=Fem, Number=Sing, Person=3 |  |
| `form:past-1pl` | -na: we (past) | values Aspect=Perf, Number=Plur, Person=1 |  |
| `form:past-2pl` | -to: you (past, to several people) | values Aspect=Perf, Number=Plur, Person=2 |  |
| `form:past-3pl` | -o: they (past) | values Aspect=Perf, Number=Plur, Person=3 |  |
| `form:imp-2fs` | -i: telling a woman to do something | values Gender=Fem, Mood=Imp, Number=Sing, Person=2 |  |
| `form:imp-2pl` | -o: telling several people to do something | values Mood=Imp, Number=Plur, Person=2 |  |
| `form:poss-1sg` | -i: my (ending on a noun) | `lexeme:poss-1sg` (PRON) |  |
| `form:poss-2ms` | -ak: your (to a man) | `lexeme:poss-2ms` (PRON) |  |
| `form:poss-2fs` | -ik: your (to a woman) | values Gender[psor]=Fem, Number[psor]=Sing, Person[psor]=2; `lexeme:poss-2fs` (PRON) |  |
| `form:poss-2pl` | -kon: your (to several people) | values Number[psor]=Plur, Person[psor]=2; `lexeme:poss-2pl` (PRON) |  |
| `form:poss-3ms` | -o: his | `lexeme:poss-3ms` (PRON) |  |
| `form:poss-3fs` | -a: her | `lexeme:poss-3fs` (PRON) |  |
| `form:poss-1pl` | -na: our | `lexeme:poss-1pl` (PRON) |  |
| `form:poss-3pl` | -on: their (ending on a noun) | `lexeme:poss-3pl` (PRON) |  |
| `form:obj-1sg` | -ni: me (on a verb) | `lexeme:obj-1sg` (PRON) |  |
| `form:obj-2ms` | -ak: you (on a verb, to a man) | `lexeme:obj-2ms` (PRON) |  |
| `form:obj-2fs` | -ik: you (on a verb, to a woman) | `lexeme:obj-2fs` (PRON) |  |
| `form:obj-3ms` | -o: him; it (on a verb) | `lexeme:obj-3ms` (PRON) |  |
| `form:obj-3fs` | -a: her; it (on a verb) | `lexeme:obj-3fs` (PRON) |  |
| `form:obj-1pl` | -na: us (on a verb) | `lexeme:obj-1pl` (PRON) |  |
| `form:obj-2pl` | -kon: you (on a verb, to several people) | `lexeme:obj-2pl` (PRON) |  |
| `form:la-1sg` | -li: to me; for me (on a verb) | `lexeme:la-1sg` (PRON) |  |
| `form:la-2ms` | -lak: to you; for you (on a verb, to a man) | `lexeme:la-2ms` (PRON) |  |
| `form:dual` | -en: two (on a noun) | `lexeme:dual` (realises Number=Dual) |  |
| `construction:used-to` | kent + a verb without b-: used to; would | `rule:used-to`, not written | a rule: kan and a verb without b- (ADR 0145 names it: it fills a feature in two words) |
| `construction:was-doing` | kent 3am + verb: was …ing | `rule:was-doing`, not written | a rule: kan, 3am and a verb without b- |
| `construction:shu-excl` | shu + adjective: how …! | `rule:shu-excl`, not written | a listed item with a slot: shu before an adjective exclaims, which "what" does not say |

## Defaults

A default is a rule, and what it gives is no part of a lexeme (ADR 0146). These are
the plan's, drafted (REVIEW); the counts are this course's lexemes.

|  | Lexemes |
|---|---|
| default gender-none-name: broken | 2 |
| default gender-none-name: gives | 10 |
| default gender-none: broken | 7 |
| default gender-none: gives | 77 |
| default gender-ta: broken | 1 |
| default gender-ta: gives | 31 |
| lexical feature chosen by the token | 6 |
| lexical feature unknown | 11 |

**Endings a default could still cover:** among the lexemes that store the feature
with no default for their ending, these endings always go with one value (three
lexemes or more). Each is a candidate, not a finding: a course's words are few.

| Ending | Value | Lexemes | Such as |
|---|---|---|---|
| -ا | Gender=Fem | 3 | مايا, تيتا, عشا |
| -ت | Gender=Fem | 3 | إخت, بنت, بيروت |

## Dimensions

What every member of a category must choose (ADR 0145), as the plan declares it, and
how many tokens say a value of each: on themselves, or by an ending written on them.
A token that leaves one unsaid is the unmarked form, or one the course's annotation
has no name for.

| Category | Dimension | Tokens that say it | Tokens that do not |
|---|---|---|---|
| VERB | Aspect | 710 | 260 |
| VERB | Mood | 592 | 378 |
| VERB | Person | 722 | 248 |
| VERB | Gender | 298 | 672 |
| VERB | Number | 772 | 198 |
| AUX | Aspect | 102 | 110 |
| AUX | Mood | 2 | 210 |
| AUX | Person | 102 | 110 |
| AUX | Gender | 42 | 170 |
| AUX | Number | 102 | 110 |
| NOUN | Number | 1414 | 20 |
| ADJ | Gender | 416 | 18 |
| ADJ | Number | 434 | 0 |

**Values no dimension declares:** tokens carry them all the same. A category whose
members do not all inflect (a pronoun, a set phrase said to a woman), or a lexeme
tagged as another category than it behaves as.

| Category | Feature | Tokens | Lexemes, the commonest first |
|---|---|---|---|
| ADJ | Aspect | 4 | khayef |
| ADJ | Mood | 4 | khayef |
| ADJ | Person | 4 | khayef |
| INTJ | Gender | 12 | tfaddal, kell-sene, 3mol-ma3rouf, lek |
| INTJ | Gender[psor] | 10 | shu-bak, salemtak, 3a-albak |
| INTJ | Mood | 12 | tfaddal, lek, 3mol-ma3rouf |
| INTJ | Number | 18 | tfaddal, kell-sene, lek, 3mol-ma3rouf |
| INTJ | Number[psor] | 14 | shu-bak, salemtak, 3a-albak |
| INTJ | Person | 12 | tfaddal, lek, 3mol-ma3rouf |
| INTJ | Person[psor] | 14 | shu-bak, salemtak, 3a-albak |
| NOUN | Gender | 40 | jar, 7abibi, rfi2, m3allem, tilmiz, mhandes |
| PRON | Gender | 54 | hayde, enti, hiyye |
| PRON | Number | 68 | hayde, enti, hiyye, ento, henne, nehna |
| PROPN | Number | 186 | sami, maya, beirut, lebnen, nisan, aylul |

## Clips

The audio index is not rewritten: the compiler still reads it. A word's clip is keyed
by its KC id; these are the clips whose item has one name in the new shape, which the
switch renames and changes nothing else of. In a cast of several voices the voice
each has today is pinned (`courses/apc/next/audio/assignment.yaml`), since a voice
is drawn by the item's id (ADR 0078).

|  | Clips |
|---|---|
| clips | 1222 |
| clips a person checked | 82 |
| clips keyed by a KC | 354 |
| clips renamed with their item | 348 |
| clips whose item is no lexeme of its own now | 6 |
| voices pinned (a cast of several draws by the item's id) | 348 |

## Relations

Drafted by the plan's rules (`relations`): a link is written only where the values
agree and nothing but the words a rule may skip stands between. What is left bare
waits for a tree (ADR 0145: drafted by a parser, corrected by a reviewer).

|  | Lexemes |
|---|---|
| ADJ with values and no relation | 292 |
| amod: written | 142 |
| case: written | 140 |
| det: written | 336 |

## Lexemes that break a default (10)

The entry stores the feature, and it is a part to learn (ADR 0146). Check each: a wrong default makes parts of regular words, a missing one hides an exception.

| Where | What |
|---|---|
| `lexeme:maya` | Gender=Fem: gender-none-name would give Masc for مايا |
| `lexeme:emm` | Gender=Fem: gender-none would give Masc for إمّ |
| `lexeme:ekht` | Gender=Fem: gender-none would give Masc for إخت |
| `lexeme:teta` | Gender=Fem: gender-none would give Masc for تيتا |
| `lexeme:bent` | Gender=Fem: gender-none would give Masc for بنت |
| `lexeme:beirut` | Gender=Fem: gender-none-name would give Masc for بيروت |
| `lexeme:musi2a` | Gender=Fem: gender-none would give Masc for موسيقى |
| `lexeme:3asha` | Gender=Fem: gender-none would give Masc for عشا |
| `lexeme:shams` | Gender=Fem: gender-none would give Masc for شمس |
| `lexeme:zalame` | Gender=Masc: gender-ta would give Fem for زلمة |

## Lexical features the tokens choose (6)

The feature is declared lexical for the category, and this lexeme's tokens have more than one value of it, or the entry itself is written in another (tía under tío). By ADR 0145 a noun's feminine is a derivative, a lexeme of its own where it is listed. The values stay on the tokens until that is decided.

| Where | What |
|---|---|
| `lexeme:7abibi` | Gender is Fem and Masc on its tokens: kept on the tokens, not on the entry |
| `lexeme:jar` | Gender is Fem and Masc on its tokens: kept on the tokens, not on the entry |
| `lexeme:rfi2` | Gender is Fem and Masc on its tokens: kept on the tokens, not on the entry |
| `lexeme:m3allem` | Gender is Fem and Masc on its tokens: kept on the tokens, not on the entry |
| `lexeme:tilmiz` | Gender is Fem and Masc on its tokens: kept on the tokens, not on the entry |
| `lexeme:mhandes` | Gender is Fem and Masc on its tokens: kept on the tokens, not on the entry |

## Lexemes whose lexical feature no token says (11)

Mostly entries written as several tokens, on which the course pins no form.

| Where | What |
|---|---|
| `lexeme:wlad` | no token says its Gender |
| `lexeme:masari` | no token says its Gender |
| `lexeme:shabeb` | no token says its Gender |
| `lexeme:ahl` | no token says its Gender |
| `lexeme:jiren` | no token says its Gender |
| `lexeme:tyeb` | no token says its Gender |
| `lexeme:kanoun-tene` | no token says its Gender |
| `lexeme:tishrin-awwal` | no token says its Gender |
| `lexeme:tishrin-tene` | no token says its Gender |
| `lexeme:kanoun-awwal` | no token says its Gender |
| `lexeme:3id-milad` | no token says its Gender |

## Written otherwise than the entry (18)

A token names the lexeme, no feature value tells it from the entry's own form, and it is spelled differently: an allomorph by context (gran before a noun), or a form the course's annotation has no name for. Kept as an allomorph of the entry.

| Where | What |
|---|---|
| `lexeme:3end` | joined to another lexeme, written عند / 3en (1×, first in s.trip.13) |
| `lexeme:el` | joined to another lexeme, written ال / l (70×, first in s.home.28) |
| `lexeme:badd` | joined to another lexeme, written بد / bad (3×, first in s.like.18) |
| `lexeme:sa7eb` | joined to another lexeme, written صاحب / sa7b (1×, first in s.past.11) |
| `lexeme:fi.can` | joined to another lexeme, written فيّ / fiyy (10×, first in s.health.13) |
| `lexeme:fi.can` | joined to another lexeme, written في / f (2×, first in s.health.15) |
| `lexeme:b3at` | joined to another lexeme, written بعت / ba3at (1×, first in s.phone.30) |
| `lexeme:men.than` | joined to another lexeme, written منّ / menn (2×, first in s.shop.22) |
| `lexeme:7da3sh` | written حدعشر / 7da3shar (1×, first in s.date.2): an allomorph, or a form no value names |
| `lexeme:tna3sh` | written تنعشر / tna3shar (1×, first in s.date.3): an allomorph, or a form no value names |
| `lexeme:tleta3sh` | written تلاتعشر / tleta3shar (1×, first in s.date.5): an allomorph, or a form no value names |
| `lexeme:arba3ta3sh` | written أربعتعشر / arba3ta3shar (1×, first in s.date.6): an allomorph, or a form no value names |
| `lexeme:khamsta3sh` | written خمستعشر / khamsta3shar (1×, first in s.date.7): an allomorph, or a form no value names |
| `lexeme:setta3sh` | written ستّعشر / setta3shar (1×, first in s.date.8): an allomorph, or a form no value names |
| `lexeme:saba3ta3sh` | written سبعتعشر / saba3ta3shar (1×, first in s.date.9): an allomorph, or a form no value names |
| `lexeme:tmenta3sh` | written تمانتعشر / tmenta3shar (1×, first in s.date.10): an allomorph, or a form no value names |
| `lexeme:tsa3ta3sh` | written تسعتعشر / tsa3ta3shar (1×, first in s.date.11): an allomorph, or a form no value names |
| `lexeme:allah-ybarek` | written الله يبارك فيكي / allah ybarek fiki (1×, first in s.party.3): an allomorph, or a form no value names |

## Feature values that do not tell forms apart (2)

Several spellings share one set of values: the course's form KC names less than the forms differ by. Each is pinned; a tie is an authoring error once a rule reads it (ADR 0145).

| Where | What |
|---|---|
| `lexeme:3eref` | Aspect=Imp\|Mood=Ind\|Number=Sing\|Person=1 is written 2 ways: بعرف / ba3ref, بعرف / ba3rf |
| `lexeme:jar` | Gender=Fem\|Number=Sing is written 2 ways: جارت / jaret, جارت / jart |

## Nodes that introduce less (4)

What the node introduced is introduced earlier in the new shape (a sense that was built of lexemes an earlier node now names), or was a form KC whose values name nothing new.

| Where | What |
|---|---|
| `apc.food.you-pl` | introduces form:imp-2pl: all of it is introduced earlier now, or is a form no value introduces |
| `apc.past.you-pl` | introduces form:past-2pl: all of it is introduced earlier now, or is a form no value introduces |
| `apc.ppl.they-did` | introduces form:past-3pl: all of it is introduced earlier now, or is a form no value introduces |
| `apc.trip.you-they` | introduces form:subj-2fs, form:subj-2pl, form:subj-3pl: all of it is introduced earlier now, or is a form no value introduces |

## Clips of a word that is no lexeme of its own now (6)

The clip says the word; the word is a form of another lexeme now, or built of several. It stays in the index under its old item until the switch says what keys a form's clip.

| Where | What |
|---|---|
| `sense:baddak` | its clip says a word that is a form of another lexeme, or built of several, now: no item of the new shape has that name |
| `sense:baddi` | its clip says a word that is a form of another lexeme, or built of several, now: no item of the new shape has that name |
| `sense:esmak` | its clip says a word that is a form of another lexeme, or built of several, now: no item of the new shape has that name |
| `sense:esmi` | its clip says a word that is a form of another lexeme, or built of several, now: no item of the new shape has that name |
| `sense:kifak` | its clip says a word that is a form of another lexeme, or built of several, now: no item of the new shape has that name |
| `sense:raye7` | its clip says a word that is a form of another lexeme, or built of several, now: no item of the new shape has that name |

## What no finding above covers

- **Projections:** no orthography of this course has a stated projection yet, so every
  spelling and reading stays pinned as it is; there is nothing to compare them with
  (ADR 0148).
- **Credits by sentence:** an old credit for a `form:` KC that is feature values now has
  no
  part to go to: a feature's uses are not authored, and nothing old counts towards a rule
  (ADR 0146).
