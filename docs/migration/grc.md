# Converting `courses/grc` to the lexical model

Written by `nabu migrate ../courses/grc`; do not edit by hand. It belongs to
[the migration's design note](../migration-design.md), deliverable 2. Nothing here is
decided: the converter applies the course's conversion plan
(`pipeline/src/nabu/migrate/plans/grc.yaml`, drafted, REVIEW) and lists what it found.

## What was converted

|  | Count |
|---|---|
| Sense KCs | 170 |
| `form:` KCs | 42 |
| `construction:` KCs | 1 |
| `grapheme:` KCs | 34 |
| Sentences and story lines | 414 |
| Tokens | 1282 |
| Lexemes in `lexicons/grc/lexemes.yaml` | 170 |
| Pinned forms (rule debt, ADR 0145) | 200 |
| Listed forms | 0: no statement that a form has no rule is drafted yet |

**Checks** (docs/migration-design.md, "What must not change"):

- every sentence and story line as displayed: text, tokens, readings, accept sets and translations are unchanged, item by item;
- no two annotations of the course became one;
- every lexeme a token writes is written as its entry, or as a form or allomorph the lexicon has;
- every name points at something, and every file fits its schema.

## What each KC id became

| Kind | KCs |
|---|---|
| a construction: a rule, not written yet | 1 |
| a form pinned on tokens: by sentence, the feature values taught | 42 |
| a letter of a script track: unchanged | 34 |
| a sense: the lexeme of its name | 170 |

**`form:` and `construction:` KCs** (the plan's statements, REVIEW):

| KC | Gloss | Becomes | Note |
|---|---|---|---|
| `form:f` | feminine, as subject: ἡ μήτηρ, the mother; νεωτέρα, younger (of a woma | values Case=Nom, Gender=Fem, Number=Sing |  |
| `form:f-voc` | feminine vocative: calling a woman (ὦ Ξανθίππη); in -η and -α as the s | values Case=Voc, Gender=Fem, Number=Sing |  |
| `form:f-acc` | feminine accusative: the object (ἀδελφὴν ἔχω, I have a sister; εἰς τὴν | values Case=Acc, Gender=Fem, Number=Sing |  |
| `form:f-gen` | feminine genitive: of, from (ἐκ τῆς οἰκίας, out of the house; Παρυσάτι | values Case=Gen, Gender=Fem, Number=Sing |  |
| `form:f-dat` | feminine dative: to, for; on (a day); after ἐν, in (ἐν τῇ ἀγορᾷ, in th | values Case=Dat, Gender=Fem, Number=Sing |  |
| `form:f-pl` | feminine plural, as subject or called: αἱ γυναῖκες, the women | values Case=Nom,Voc, Gender=Fem, Number=Plur |  |
| `form:f-acc-pl` | feminine accusative plural: the objects (ἀδελφὰς, sisters) | values Case=Acc, Gender=Fem, Number=Plur |  |
| `form:voc` | the vocative (masculine): the form for calling someone (Σώκρατες, from | values Case=Voc, Gender=Masc, Number=Sing |  |
| `form:acc` | the accusative (masculine; also με, σε): the object of a verb (ἀδελφὸν | values Case=Acc, Gender=Masc, Number=Sing |  |
| `form:gen` | the genitive (masculine): of, 's (Δαρείου, of Darius) | values Case=Gen, Gender=Masc, Number=Sing |  |
| `form:dat` | the dative (masculine; also μοι, σοι): to, for (τῷ Ἀσκληπιῷ, to Asclep | values Case=Dat, Gender=Masc, Number=Sing |  |
| `form:pl` | the plural (masculine; also ἡμεῖς, ὑμεῖς), as subject or called: -οι,  | values Case=Nom,Voc, Gender=Masc, Number=Plur |  |
| `form:acc-pl` | the accusative plural (masculine; also ἡμᾶς, ὑμᾶς): the objects (παῖδα | values Case=Acc, Gender=Masc, Number=Plur |  |
| `form:gen-pl` | the genitive plural (masculine): of (the) … (τῶν στρατιωτῶν, of the so | values Case=Gen, Gender=Masc, Number=Plur |  |
| `form:dat-pl` | the dative plural (masculine; also ἡμῖν): to, for (ἡμῖν, to us) | values Case=Dat, Gender=Masc, Number=Plur |  |
| `form:n` | neuter: one form as subject, as object and when called (τὸ τέκνον, the | values Case=Acc,Nom,Voc, Gender=Neut, Number=Sing |  |
| `form:n-gen` | neuter genitive: of; after ἔξω, outside (ἔξω τείχους, outside the wall | values Case=Gen, Gender=Neut, Number=Sing |  |
| `form:n-dat` | neuter dative: to, for; after ἐν, in (ἐν τῷ ἄστει, in the town) | values Case=Dat, Gender=Neut, Number=Sing |  |
| `form:n-pl` | neuter plural: one form as subject and as object, in -α (τὰ ἄνω, the u | values Case=Acc,Nom, Gender=Neut, Number=Plur |  |
| `form:n-dat-pl` | neuter dative plural: to, for (τοῖς κάτω, to the downstairs rooms) | values Case=Dat, Gender=Neut, Number=Plur |  |
| `form:comp` | the comparative: more …, -er (σοφώτερος, wiser); the one compared in t | values Case=Nom, Degree=Cmp, Gender=Masc, Number=Sing |  |
| `form:comp-f` | the comparative, feminine: more …, -er (σοφωτέρα, wiser, of a woman) | values Case=Nom, Degree=Cmp, Gender=Fem, Number=Sing |  |
| `form:pres-1s` | the present, I: I do, I am doing | values Mood=Ind, Number=Sing, Person=1, Tense=Pres, VerbForm=Fin |  |
| `form:pres-2s` | the present, you (one person): you do, you are doing | values Mood=Ind, Number=Sing, Person=2, Tense=Pres, VerbForm=Fin |  |
| `form:pres-3s` | the present, he, she, it: does, is doing | values Mood=Ind, Number=Sing, Person=3, Tense=Pres, VerbForm=Fin |  |
| `form:pres-1p` | the present, we: we do, we are doing | values Mood=Ind, Number=Plur, Person=1, Tense=Pres, VerbForm=Fin |  |
| `form:pres-2p` | the present, you (several people): you do, you are doing | values Mood=Ind, Number=Plur, Person=2, Tense=Pres, VerbForm=Fin |  |
| `form:pres-3p` | the present, they: they do, they are doing | values Mood=Ind, Number=Plur, Person=3, Tense=Pres, VerbForm=Fin |  |
| `form:pres-3p-mid` | the present, they, with middle endings: -ονται (πορεύονται, they go) | values Mood=Ind, Number=Plur, Person=3, Tense=Pres, VerbForm=Fin, Voice=Mid |  |
| `form:impf-1s` | the imperfect, I: I was doing, I used to do | values Aspect=Imp, Mood=Ind, Number=Sing, Person=1, Tense=Past, VerbForm=Fin |  |
| `form:impf-3s` | the imperfect, he, she, it: was doing, did | values Aspect=Imp, Mood=Ind, Number=Sing, Person=3, Tense=Past, VerbForm=Fin |  |
| `form:impf-3p` | the imperfect, they: they were doing, they did | values Aspect=Imp, Mood=Ind, Number=Plur, Person=3, Tense=Past, VerbForm=Fin |  |
| `form:aor-1s` | the aorist, I: I did (once, in the past) | values Mood=Ind, Number=Sing, Person=1, Tense=Past, VerbForm=Fin |  |
| `form:aor-3s` | the aorist, he, she, it: did (once, in the past) | values Mood=Ind, Number=Sing, Person=3, Tense=Past, VerbForm=Fin |  |
| `form:aor-subj-2p` | the aorist subjunctive, you (several): after μή, "don't (do it)!" | values Mood=Sub, Number=Plur, Person=2, Tense=Past, VerbForm=Fin |  |
| `form:perf-2s` | the perfect, you (one person): you have done (and so it stands) | values Aspect=Perf, Mood=Ind, Number=Sing, Person=2, VerbForm=Fin |  |
| `form:fut-1p` | the future, we: we will do | values Mood=Ind, Number=Plur, Person=1, Tense=Fut, VerbForm=Fin |  |
| `form:fut-3s` | the future, he, she, it: will do, will be | values Mood=Ind, Number=Sing, Person=3, Tense=Fut, VerbForm=Fin |  |
| `form:impv-2s` | the imperative, to one person: do! | values Mood=Imp, Number=Sing, Person=2, VerbForm=Fin |  |
| `form:impv-2p` | the imperative, to several people: do! | values Mood=Imp, Number=Plur, Person=2, VerbForm=Fin |  |
| `form:inf` | the infinitive: to do (κελεύει περιμεῖναι, he tells (you) to wait) | values VerbForm=Inf |  |
| `form:ptc` | the participle: -ing (βοώντων, shouting) | values VerbForm=Part |  |
| `construction:esti-moi` | ἔστι μοι + a noun: I have (word for word, there is to me) | `rule:esti-moi`, not written | a rule: "there is to me" says "I have"; the dative says whose (ADR 0145: its meaning is its parts') |

**Constructions, each with its sentences** (ADR 0145: a rule where its meaning is its
parts', a listed item with slots where it is not; decided per construction with its
course). None is decided here: the last column is the plan's drafter's reading.

| KC | Sentences that name it | Keeps | Reading |
|---|---|---|---|
| `construction:esti-moi` | 3 (s.09.3, s.09.4, s.09.5…) | `rule:esti-moi` | a rule: "there is to me" says "I have"; the dative says whose (ADR 0145: its meaning is its parts') |

## What the lexicon holds

Counts of what the converter wrote into the entries, beyond one entry a lexeme.

|  | Count |
|---|---|
| cells written more than one way | 11 |
| entries spelled as a form other than the citation form | 1 |
| pinned forms | 200 |
| second forms: a variant spelling | 5 |
| second forms: an inflected form, now pinned | 1 |
| written otherwise than the entry | 12 |

## Defaults

A default is a rule, and what it gives is no part of a lexeme (ADR 0146). These are
the plan's, drafted (REVIEW); the counts are this course's lexemes.

|  | Lexemes |
|---|---|
| default gender-a: gives | 5 |
| default gender-e: gives | 5 |
| default gender-es: gives | 4 |
| default gender-is: gives | 4 |
| default gender-ma: gives | 1 |
| default gender-on: gives | 3 |
| default gender-os: broken | 3 |
| default gender-os: gives | 13 |
| lexical feature chosen by the token | 1 |
| lexical feature stored: no default speaks | 15 |

**Endings a default could still cover:** among the lexemes that store the feature
with no default for their ending, these endings always go with one value (three
lexemes or more). Each is a candidate, not a finding: a course's words are few.

| Ending | Value | Lexemes | Such as |
|---|---|---|---|
| -ν | Gender=Masc | 6 | Κρίτων, Μένων, Ἕλλην, Γλαύκων, Ἀρίστων, ἀλεκτρυών |
| -ων | Gender=Masc | 5 | Κρίτων, Μένων, Γλαύκων, Ἀρίστων, ἀλεκτρυών |

## Dimensions

What every member of a category must choose (ADR 0145), as the plan declares it, and
how many tokens say a value of each: on themselves, or by an ending written on them.
A token that leaves one unsaid is the unmarked form, or one the course's annotation
has no name for.

| Category | Dimension | Tokens that say it | Tokens that do not |
|---|---|---|---|
| VERB | Mood | 204 | 14 |
| VERB | Tense | 156 | 62 |
| VERB | Aspect | 32 | 186 |
| VERB | Voice | 4 | 214 |
| VERB | Person | 204 | 14 |
| VERB | Number | 204 | 14 |
| VERB | VerbForm | 218 | 0 |
| AUX | Mood | 99 | 0 |
| AUX | Tense | 99 | 0 |
| AUX | Aspect | 5 | 94 |
| AUX | Person | 99 | 0 |
| AUX | Number | 99 | 0 |
| AUX | VerbForm | 99 | 0 |
| NOUN | Case | 207 | 0 |
| NOUN | Number | 207 | 0 |
| PROPN | Case | 111 | 0 |
| PROPN | Number | 111 | 0 |
| ADJ | Gender | 61 | 0 |
| ADJ | Case | 61 | 0 |
| ADJ | Number | 61 | 0 |
| ADJ | Degree | 6 | 55 |
| DET | Gender | 162 | 0 |
| DET | Case | 162 | 0 |
| DET | Number | 162 | 0 |
| PRON | Gender | 45 | 54 |
| PRON | Case | 85 | 14 |
| PRON | Number | 85 | 14 |

**Values no dimension declares:** tokens carry them all the same. A category whose
members do not all inflect (a pronoun, a set phrase said to a woman), or a lexeme
tagged as another category than it behaves as.

| Category | Feature | Tokens | Lexemes, the commonest first |
|---|---|---|---|
| NOUN | Gender | 19 | pais |

## Clips

The audio index is not rewritten: the compiler still reads it. A word's clip is keyed
by its KC id; these are the clips whose item has one name in the new shape, which the
switch renames and changes nothing else of. In a cast of several voices the voice
each has today is pinned (`courses/grc/next/audio/assignment.yaml`), since a voice
is drawn by the item's id (ADR 0078).

|  | Clips |
|---|---|
| clips | 549 |
| clips keyed by a KC | 135 |
| clips renamed with their item | 135 |

## Relations

Drafted by the plan's rules (`relations`): a link is written only where the values
agree and nothing but the words a rule may skip stands between. What is left bare
waits for a tree (ADR 0145: drafted by a parser, corrected by a reviewer).

|  | Lexemes |
|---|---|
| ADJ with values and no relation | 37 |
| DET with values and no relation | 15 |
| amod: written | 24 |
| case: written | 48 |
| det: written | 147 |

## Lexemes that break a default (3)

The entry stores the feature, and it is a part to learn (ADR 0146). Check each: a wrong default makes parts of regular words, a missing one hides an exception.

| Where | What |
|---|---|
| `lexeme:teichos` | Gender=Neut: gender-os would give Masc for τεῖχος |
| `lexeme:hodos` | Gender=Fem: gender-os would give Masc for ὁδός |
| `lexeme:oros` | Gender=Neut: gender-os would give Masc for ὄρος |

## Lexemes no default speaks of (15)

No stated default gives the feature for a lexeme so written, so the entry stores it and it is a part to learn. A reliable ending among these is a default to add.

| Where | What |
|---|---|
| `lexeme:kriton` | Gender=Masc: no default speaks of Κρίτων |
| `lexeme:nyx` | Gender=Fem: no default speaks of νύξ |
| `lexeme:pater` | Gender=Masc: no default speaks of πατήρ |
| `lexeme:meter` | Gender=Fem: no default speaks of μήτηρ |
| `lexeme:thygater` | Gender=Fem: no default speaks of θυγάτηρ |
| `lexeme:lysias` | Gender=Masc: no default speaks of Λυσίας |
| `lexeme:astu` | Gender=Neut: no default speaks of ἄστυ |
| `lexeme:menon` | Gender=Masc: no default speaks of Μένων |
| `lexeme:hellen` | Gender=Masc: no default speaks of Ἕλλην |
| `lexeme:peiraieus` | Gender=Masc: no default speaks of Πειραιεύς |
| `lexeme:glaukon` | Gender=Masc: no default speaks of Γλαύκων |
| `lexeme:ariston` | Gender=Masc: no default speaks of Ἀρίστων |
| `lexeme:opisthophylax` | Gender=Masc: no default speaks of ὀπισθοφύλαξ |
| `lexeme:alektryon` | Gender=Masc: no default speaks of ἀλεκτρυών |
| `lexeme:aner` | Gender=Masc: no default speaks of ἀνήρ |

## Lexical features the tokens choose (1)

The feature is declared lexical for the category, and this lexeme's tokens have more than one value of it, or the entry itself is written in another (tía under tío). By ADR 0145 a noun's feminine is a derivative, a lexeme of its own where it is listed. The values stay on the tokens until that is decided.

| Where | What |
|---|---|
| `lexeme:pais` | Gender is Fem and Masc on its tokens: kept on the tokens, not on the entry |

## Written otherwise than the entry (12)

A token names the lexeme, no feature value tells it from the entry's own form, and it is spelled differently: an allomorph by context (gran before a noun), or a form the course's annotation has no name for. Kept as an allomorph of the entry.

| Where | What |
|---|---|
| `lexeme:eimi` | written εἰμι (6×, first in s.02.42): an allomorph, or a form no value names |
| `lexeme:parysatis` | written Παρύσατίς (1×, first in s.02.33): an allomorph, or a form no value names |
| `lexeme:presbyteros` | written πρεσβύτερός (2×, first in s.02.39): an allomorph, or a form no value names |
| `lexeme:neoteros` | written νεώτερός (1×, first in s.02.40): an allomorph, or a form no value names |
| `lexeme:de` | written δ’ (4×, first in s.05.34): an allomorph, or a form no value names |
| `lexeme:ge` | written γ’ (2×, first in grc.story.not-one-woman#1): an allomorph, or a form no value names |
| `lexeme:athenaios` | written Ἀθηναῖός (1×, first in s.04.19): an allomorph, or a form no value names |
| `lexeme:alla` | written ἀλλ’ (2×, first in grc.story.a-rooster#4): an allomorph, or a form no value names |
| `lexeme:hetoimos` | written ἕτοιμός (1×, first in s.06.33): an allomorph, or a form no value names |
| `lexeme:onoma` | written ὄνομά (3×, first in s.07.10): an allomorph, or a form no value names |
| `lexeme:horao` | written ὁρῶ (4×, first in s.08.22): an allomorph, or a form no value names |
| `lexeme:ei` | written εἴ (2×, first in s.08.25): an allomorph, or a form no value names |

## Entries spelled as a form other than the citation form (1)

A word card shows the entry's first spelling, and here that is one of the lexeme's inflected forms, not the form its language cites a word in (the plan's `citation`). The spelling is kept, since it is what a learner sees today.

| Where | What |
|---|---|
| `lexeme:emi` | its entry is spelled ἦ, which its tokens write as Aspect=Imp\|Mood=Ind\|Number=Sing\|Person=3\|Tense=Past\|VerbForm=Fin |

## Feature values that do not tell forms apart (11)

Several spellings share one set of values: the course's form KC names less than the forms differ by. Each is pinned; a tie is an authoring error once a rule reads it (ADR 0145).

| Where | What |
|---|---|
| `lexeme:chairo` | Mood=Imp\|Number=Sing\|Person=2\|VerbForm=Fin is written 2 ways: χαῖρε, χαῖρ’ |
| `lexeme:eimi` | Mood=Ind\|Number=Plur\|Person=3\|Tense=Pres\|VerbForm=Fin is written 2 ways: εἰσίν, εἰσιν |
| `lexeme:eimi` | Mood=Ind\|Number=Sing\|Person=3\|Tense=Pres\|VerbForm=Fin is written 6 ways: ἐστί, ἐστίν, ἐστι, ἐστιν, ἔστι, ἔστιν |
| `lexeme:ho` | Case=Nom\|Gender=Fem\|Number=Sing is written 2 ways: ἡ, ἥ |
| `lexeme:athenaios` | Case=Nom,Voc\|Gender=Masc\|Number=Plur is written 2 ways: ἀθηναῖοί, ἀθηναῖοι |
| `lexeme:akouo` | Mood=Ind\|Number=Plur\|Person=3\|Tense=Pres\|VerbForm=Fin is written 2 ways: ἀκούουσι, ἀκούουσιν |
| `lexeme:perimeno` | Mood=Imp\|Number=Sing\|Person=2\|VerbForm=Fin is written 2 ways: περίμενέ, περίμενε |
| `lexeme:hode` | Case=Nom\|Gender=Fem\|Number=Sing is written 2 ways: ἥδε, ἥδ’ |
| `lexeme:skythropazo` | Mood=Imp\|Number=Sing\|Person=2\|VerbForm=Fin is written 2 ways: σκυθρώπαζε, σκυθρώπαζ’ |
| `lexeme:gynaikonitis` | Case=Dat\|Number=Sing is written 2 ways: γυναικωνίτιδί, γυναικωνίτιδι |
| `lexeme:sophos` | Case=Nom\|Degree=Cmp\|Gender=Masc\|Number=Sing is written 2 ways: σοφώτεροσ, σοφώτερόσ |

## Nodes that introduce less (1)

What the node introduced is introduced earlier in the new shape (a sense that was built of lexemes an earlier node now names), or was a form KC whose values name nothing new.

| Where | What |
|---|---|
| `grc.u08.it-shall-be-done` | introduces form:fut-3s, form:n-pl: all of it is introduced earlier now, or is a form no value introduces |

## A determiner that does not agree with the noun after it (5)

The two stand side by side and the values the course pins on them differ: one of the two annotations may be wrong, or the noun is not the determiner's.

| Where | What |
|---|---|
| `s.02.31 (grc-Grek/polytonic)` | ὁ (Gender=Masc, Case=Nom, Number=Sing) stands before Δαρείου (Gender=Masc, Case=Gen, Number=Sing) and does not agree with it |
| `s.02.32 (grc-Grek/polytonic)` | ὁ (Gender=Masc, Case=Nom, Number=Sing) stands before Δαρείου (Gender=Masc, Case=Gen, Number=Sing) and does not agree with it |
| `s.02.33 (grc-Grek/polytonic)` | ἡ (Gender=Fem, Case=Nom, Number=Sing) stands before Κύρου (Gender=Masc, Case=Gen, Number=Sing) and does not agree with it |
| `s.03.34 (grc-Grek/polytonic)` | ὁ (Gender=Masc, Case=Nom, Number=Sing) stands before Κεφάλου (Gender=Masc, Case=Gen, Number=Sing) and does not agree with it |
| `s.05.7 (grc-Grek/polytonic)` | ὁ (Gender=Masc, Case=Nom, Number=Sing) stands before Ἀρίστωνος (Gender=Masc, Case=Gen, Number=Sing) and does not agree with it |

## Left for a reviewer by the plan

What the plan's drafter saw and did not decide.

- Tense and aspect follow the Perseus treebank (the imperfect: past and imperfect aspect; the aorist: past alone; the perfect: perfect aspect alone). PROIEL tags the aorist with the perfect aspect; neither documents its choice.
- A word before an enclitic takes a second accent (πρεσβύτερός ἐστιν) and εἰμί loses its own (εἰμι); a vowel is elided (δ', ἀλλ'). Each is listed as written otherwise or as a cell written two ways: rules of accent and elision, not forms.
- A neuter's one form for subject, object and address carries all three cases at once (Case=Acc,Nom,Voc), as the course's KC says; a plural for subject and address Case=Nom,Voc.
- The course marks voice only on one KC (the middle's -ονται): a deponent verb's other forms name no voice.

## What no finding above covers

- **Projections:** no orthography of this course has a stated projection yet, so every
  spelling and reading stays pinned as it is; there is nothing to compare them with
  (ADR 0148).
- **Credits by sentence:** an old credit for a `form:` KC that is feature values now goes,
  sentence by sentence, to the values the form chose there that the course teaches (the
  sentence's parts). Where the sentence is not known it goes nowhere, and nothing old
  counts towards a rule (ADR 0146).
