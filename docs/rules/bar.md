# Rules in a lexicon: South Tyrolean (bar), stages 1 to 4 as built (2026-11-25)

bar went through the four stages of [rules-design.md](../rules-design.md) in one session. Every rule, class, listed
form and branch is REVIEW, with its source beside it in `lexicons/bar/language.yaml` and `lexemes.yaml`: Moser (2015) by
headword or appendix section, or by the library notes' section (`nabu/notes/bar/survey.md`) where the notes give a form
without its headword; Weiß (1998) by page, only where he states it for Bavarian as a whole; the course's own forms
(said so); or Claude's. No token text, spelling, lemma, accept set or clip changed.

## Stage 1: lexical forms and their spelling

- **Every lexeme has a form** (269): its spelling, letter for letter (nouns keep their capital, phrases their space, the
  clitic its apostrophe), but a verb's, which is its stem (43 VERB and AUX: red, kemm, hob, sei, gea, tua, törggel).
  bar's lexical form is its spelling because Moser's spelling is the course's notation: nothing is written that is not
  said, or said that is not written, closely enough for the rules.
- **The notation** names sets only (an alphabet's vowels are letters, so no vowel signs: the coordinator's shared change,
  cherry-picked): L, V, C, N, and the sets the rules read (GE, OBS, SIB, UML).
- **`spell`** in `profiles/bar-Latn.moser.yaml` is the identity (`rules: []`): boundaries dropped. No alternatives: the
  free spellings (-n/-en, ia/ie, ß/ss, -sch/-scht) stay the profile's correspondences, which grading reads; the tie
  check in spell.test.ts is apc's and has nothing of bar's to tie.
- **`form.projection` is at zero**: 269 lemmas checked (a verb's through its citation cell, as the rules give it), two
  allomorphs with nothing to compare (no pinned spellings).

## Stages 2 and 3: the rules, and every token accounted for

**The check covers all 2,071 tokens** (sentences and story lines; one orthography): 1,669 given by the rules, 402 by a
form of the lexeme (397 listed, 5 pinned), none unaccounted. `form.unaccounted` was an error from the first compile and
never fired: each irregular got its listed form before the check ran.

**Realisation rules** (17, in order; branches in brackets):
- `rule:bar-past` [sg, 2sg, 2pl, pl], class `past` (sein): wor, worsch, worn. `rule:bar-subjunctive` [same], class
  `subjunctive` (hobm, tian): hatt, hattsch, hattn; tat, tatsch, tatn. `rule:bar-modal` [same], class `modal` (kinnen,
  miassn, derfn, welln, megn): no -t for he (er konn, er muaß). The three are the old preterite's endings; each is
  gated by its class so that no other verb gets a past or a subjunctive of its own (the dialect has none).
- `rule:bar-present` [1sg, 2sg, 3sg, 2pl, pl]: the bare stem, -sch, -t, -ts, -n (Moser: -sche, es¹).
- `rule:bar-imperative` [2sg, 2pl]: the bare stem; -ts to several (Moser: kemmts).
- `rule:bar-infinitive` [inf]: -n. The infinitive is a cell the rules give, since the verb's form is its stem (below).
- `rule:bar-participle-modal` [inf]: a modal's participle is its infinitive (Weiß 50–54: the substitute infinitive;
  Moser: hat megn). `rule:bar-participle-strong` [ge, n], class `strong`: g- … -n (gessn, gfohrn, kemmen).
  `rule:bar-participle` [ge, t]: g- … -t (gmocht, gredt, kaft).
- Nouns (Weiß 44–48: the noun marks no case, only the plural): `rule:bar-plural-er` [pl, sg] (Kinder; Heiser),
  `-plural-n` [pl, sg] (Tattn, Keschtn), `-plural-zero` [pl, sg] (Hund, Knedl, Johr), `-plural-only` [pl] (Leit),
  then `rule:bar-noun` and `rule:bar-name` [sg] for every other noun and name: the singular as it is, no plural.
- `rule:bar-adjective` [m, m-acc, f, n]: -er, -n, -e, -s (Claude's, from the course's own: a guater, an groaßn, a
  liabe, a schians).
- `rule:bar-ein` [m-acc, n-dat, nom, acc], class `ein` (a, koan, mei, dei, sei, ihr): -n for him and to or for him or
  it (Moser: an); the rest bare.

**Rewrites** (17, in order): `bar-e-i` (the stem's first e is i in the singular and the command: kimm, iss, gib, class
`e-i`); `bar-umlaut` [au, ua, vowel] (Heiser, Briader, Epfl, Teg; class `umlaut`, plural only); `bar-ge` [plosive, ver]
(no g- before b d g k p t z: Moser's ge-; none before ver-: Claude's); `bar-nasal` (-en after a nasal, verbs: kemmen,
lernen, singen); `bar-assimilation` (-n is -m after b: Moser, Fachausdrücke: hobm); `bar-epenthesis` [t, nasal]
(orbatet, koschtet, regnet; not lernt, wohnt); `bar-scht` (st is scht before a vowel: koschtet beside kostn);
`bar-sibilant` [sz, ss, sch] (-sch takes in the stem's s: Moser's muasch; the other two Claude's); `bar-adjective-e`
(groaßes, frisches); `bar-plural-e` (Tatte, Tattn); `bar-degemination` (koan for him; Keschtn).

**Classes** (11, declared in language.yaml, stored on 43 lexemes): strong 15, pl-zero 10, ein 6, modal 5, e-i 4, umlaut
4, pl-er 2, pl-n 2, subjunctive 2, plural-only 1, past 1. A noun has a plural class only where its plural is attested
(the course's tokens, its own lexicon notes, Moser): 15 of 92 nouns, and Bua's listed Buabm. The rest have no plural
the rules give, rather than a guess (Moser's tally, fem -n, masc none, neut -er, is a default with many exceptions; the
owner may want it).

**Listed** (46, each with its statement and source): whole forms 29 (bin, bisch, isch, seids; hon; gian ×2 and tian ×2
for the infinitive and the plural; kimp, gip; geton; Buabm; the article's six; the pronouns' mi, mir, di, dir, ins,
sie, Eana; ar; koane ×2), stems 17 (ho, hatt, wor, wes, tat, gong, holf, trunk, broch, fund, sung, verstond, siach,
konn, muaß, will, mog: a stem the regular endings go on, ADR 0145's tuv-).

**Pinned with a form** (2, rule debt): hoaßn's 2sg *hoaßt* (the course; the rule gives *hoasch*, as Moser's *muasch*)
and törggelen's infinitive (the course writes -en after l, as Standard German does).

**Joins** (apc's clitics as the model): `der` has an allomorph *n* written onto the word before it in its token (afn,
mitn: Moser's aufn, mitn); `es.it` an allomorph *'s* (geat's, gip's, isch's, regnet's, schneibt's). The allomorph is
chosen by what it follows; the article's cell is not read there (the engine chooses allomorphs by context only).

**Prune.** `nabu forms prune ../lexicons/bar` removed 260 of the 263 pinned spelling-only copies. It kept three: der's
accusative and dative masculine (`[in, n]`), whose *in* the listed form gives and whose *n* is the allomorph (a cell's
realisation cannot see a token's join), removed by hand; and hoaßn's 2sg, merged into its pinned form. lexemes.yaml went
from 69.6 to 53.2 KB.

## Stage 4: what the bundle carries

- **Cells:** VERB Inf and Part; AUX Part; NOUN its six (Nom, Acc, Dat by number); PROPN its three singulars; DET seven.
  157 lexemes carry a paradigm, 23 a `regularised` form. The lexicon file went from 133.6 to 146.0 KB (7.9 to 9.5 KB
  gzipped). `form.spelling-script` never fires (Latin, no carrier).
- **No present and no adjective cells ship.** paradigms.py lists a cell only where each of its values is taught (a node
  introduces it, or the category's citation or bare cell has it, or the course introduces no value of that feature).
  bar's nodes introduce Person=2, Number=Plur, Mood=Imp and Sub, Tense=Past, but never the unmarked Ind, Pres, Sing,
  Fin, Person 1 or 3; and ADJ has no citation cell. So every finite cell and every adjective cell is dropped. The rules
  give them all (the vectors pin them); shipping them needs the course to introduce those values (a change to what
  lessons present) or paradigms.py to read the unmarked values otherwise: for the owner.
- **Principal parts:** VERB the participle (REVIEW: German dictionaries cite a strong verb so; Moser cites the perfect,
  megn ⟨hat megn⟩). Every verb has one; a modal's is its infinitive, so megn and welln show theirs twice. AUX is left
  out (hobm / ghobt, sein / gwesn would help; the AUX modals would show doubles).
- **Regularised** forms (blocking off: listed forms and classes passed over) are a learner's plausible errors: kemmt,
  gsecht, gesst, gseit (gwesn), bringt (brocht), versteaht. Three are not errors: gian's *gean* and tian's *tuan* are
  Moser's own variants of the infinitive; Leit's singular cells come out as *Leit* (its class passed over). Stage 6
  would label them regularised: for the owner.
- **Grading:** every alternative of the course's accept sets (546) grades as before. Of 8,571 constructed slips
  (a letter dropped or n, t, e added to each word), 62 change label, none verdict (all stay WRONG): 38 now
  `grammatical` where they were `phonemic` or `lexical` and rightly so (*mein Oma* for *mei Oma*, *sein Mamme* for
  *sei Mamme*, *I zohlt* for *I zohl*); 24 are a homograph's: *sei* typed for the verb *sein* is now "another form", because *sein* is also the
  paradigm's possessive *sei* for him (Acc M). The grader keys forms by spelling; the expected token's lexeme is not
  asked.

## Engine changes

- **`stemmed`** (language.schema.json; one optional key): the categories whose string forms are stems. `realise`
  skips the citation shortcut for them, so the citation cell goes through the rules like any other
  (packages/core/src/lexicon/realise.ts, three lines); the lemma check (`nabu.forms.check`) realises such a lexeme's
  citation cell through core, as it does a radical form's (pipeline/src/nabu/forms.py); the Data page names the key's
  kind (lexicon-data.ts). A language without the key realises exactly as before. Vectors on zz, an invented language:
  conformance/realise-stemmed.json (6); a pytest on bar's lexicon: pipeline/tests/test_stems.py.
- Nothing else: classes, rewrites with `when`, comma values and listed stems said the rest.

## Vectors

conformance/realise-bar.json (79): a vector per branch of every rule and rewrite, the listed and pinned forms, and the
two-lexeme tokens, each from a form the course writes (the note names it), else Moser's or Claude's, said so.
conformance/spell-bar.json (8): the identity, case and punctuation as the profile keys a word, å read as o, no
alternatives. Both harnesses pass over every file of conformance/ (1,344 TS tests, 1,345 Python).

## What the course disagrees with, for the owner

- *hoaßt* (2sg) where Moser's *muasch* gives *hoasch* (pinned).
- *koane* for her (Acc F) where Moser writes *koa Folge*; Moser's *koane* is the plural.
- *konn*, *konnsch* where Moser has *kunn*, *kannsch*; *mogsch* where he has *maggsch*; *ins* where he has *uns*;
  *tat* where he has *tetn* (Deutschn.). The course's forms are listed as written.
- *törggelen*: -en after l, the standard spelling (pinned).

## What waits for the owner

- Every branch and class (REVIEW), above all Claude's: the adjective endings, the possessives' -n (*mein*, *dein*),
  the past's and the subjunctive's 2pl, *du isch* (essn) and *du ratsch* by the sibilant rule, the participles of
  verbs the course never writes in it (gfundn, gsungen, verstondn, geton, the AUX modals' infinitive), *siach* for the
  command.
- Whether the course should introduce the unmarked values (present cells would ship) or paradigms.py should treat them
  as taught.
- Moser's noun-plural defaults by gender, for nouns with no class.
- The 24 *sei*/*sein* labels: a grading question (which lexeme the expected token is), not a rule's.
- *gean*, *tuan* as free variants rather than regularised forms.

## Sources

Moser, *Wörterbuch der Südtiroler Mundarten* (2015), by headword and appendix (Buchstaben und Lauten; Fachausdrücke:
Assimilation; ge-), through the library notes `nabu/notes/bar/survey.md`; Weiß, *Syntax des Bairischen* (1998), pp.
44–48 (case on the article, the dative's -n), 50–54 (the substitute infinitive), 101 (clitic 's). The course's own
forms where neither has a form; the rest Claude's.
