# Rules in a lexicon: Spanish (es), stages 1 to 4 as built (2026-11-25)

es went through docs/rules-design.md's stages 1 to 4 as apc did, and its section 7 item 6 (6a and the listed
forms and pruning of 6b): lexical forms and their spelling, the verbs' and the nominals' rules, every token of
the course accounted for, the pinned copies pruned, the bundle's paradigms. Not done: the label `regularised`
(stage 6b) and the built-word card (stage 5). Every rule, class and listed form is REVIEW (`llm:` statements,
status draft) until the owner signs it off.

## Counts

- **Tokens checked: 11,152** (every token of every part of speech, sentences and story lines): 9,863 given by
  the rules (2,095 through a rule's steps, 7,768 in their citation cell or a cell no exponent changes), 1,261 by
  a listed form of the lexeme (1,155 whole forms, 106 stems), 28 by a pinned form (the phrase tener que); **none
  unaccounted.** The compile is clean: 0 errors, 0 warnings, one `form.rule-debt` info (7 pinned forms on 2
  lexemes). `form.projection` is at zero (724 spellings checked: 721 lemmas, 3 allomorphs).
- **Lexical forms: 721,** every lexeme's: its spelling (the notation is the orthography), but a reflexive verb's
  (21), which stores its citation's se after a boundary (`levantar+se`).
- **Listed: 193** forms on 29 lexemes: 114 whole forms (ser, ir, irse, estar, haber, dar, saber's sé, hay's
  había and habrá, el's la/los/las, don's doña, decir's di, poder's pudiendo, ir's yendo) and 79 stems (the
  strong pasts, the short futures, the irregular participles, the suppletive subjunctives vay-, se-, sep-, hay-,
  ver's ve-).
- **Pinned: 7,** all rule debt: tener-que's six cells (tengo que, tenemos que, tienes que, tiene que, tuvo
  que, tenía que) and palma-real's plural (palmas reales): no rule reaches inside a phrase, as in apc.
- **Pruned: 813** of the 835 pinned forms (`nabu forms prune ../lexicons/es`); 4 became listed (el's three, don's
  doña); 7 were given a `form` (the phrases); 11 were removed by hand with the course change below (each pinned,
  as a cell's spelling, what a token wrote with its pronoun: cómelos as comer's tú command, écha as echar's).
- **Classes: 11** (`classes` in language.yaml, 71 memberships): e-ie 11, o-ue 16, u-ue 1, e-i 4, hiatus 1, go 10,
  zco 5, strong 12, short-imperative 5 (verbs); short-masculine 3 (DET); comparative 3 (ADJ).
- **Vectors:** conformance/realise-es.json, 198, one per branch of every rule (146 from a token of the course,
  its form spelled as the course writes it; 52 from a paradigm cell where no token takes the branch, each
  spelling written by hand and noted so); conformance/realise-es-engine.json, 8 on zz (the engine changes);
  conformance/spell-es.json, 12. Both harnesses pass (TS 1,475).

## Lexical forms and spelling (stage 1)

- `notation` names no vowel signs (an alphabet's vowels are letters; the shared schema change), only sets: C a
  consonant letter (y with them, as the plural counts it), NGQ one other than g and q (after which u is no
  vowel), V the vowel of an ending after a stressed stem (a e o), U an unaccented vowel, AV any vowel.
- es-Latn/standard's `spell` is the identity, boundaries dropped, with two word-whole rules: agro and tele, the
  clipped words the course writes for agromercado and televisión (`spelled: [agromercado, agro]`), are free
  spellings of the lemma (`alternatives`, id `clipped`; read only by the compiler). REVIEW: a clipping is a word of
  its own, arguably a lexeme or a listed form; no form can say "this cell, another spelling" today.
- A reflexive verb's form is `levantar+se`: spelled `levantarse` (its lemma); the rules read `levantar` (engine
  change 1) and `rule:es-reflexive` drops `+se` before an ending or a joined pronoun (me levanto; mudarme).

## The rules (stages 2 and 3)

Realisation rules, in order (the first whose `when` holds):

- `rule:es-participle` (VerbForm=Part, every verb): fem-sg -a, fem-pl -as, masc-pl -os, masc-sg -o. The -ad-, -id-
  is a rewrite of the infinitive's -ar, -er, -ir (below), so an irregular participle is a listed stem the same
  endings stand on (hech-o, hech-os) and blocking off gives a learner's hacido.
- `rule:es-strong-preterite` (class strong, Ind Past): 1sg -e, 2sg -iste, 3sg -o, 1pl -imos, 2pl -isteis, 3pl
  -ieron, on the listed stem (tuv-, estuv-, pud-, pus-, quis-, sup-, vin-, hiz-, dij-, traj-, anduv-, hub-).
- `rule:es-strong-subjunctive` (class strong, Sub Imp): sg -iera, 2sg -ieras, 1pl -iéramos, 2pl -ierais, 3pl -ieran:
  -iera whatever the infinitive (estuviera, anduviera), so -ar strong verbs need no listed forms here.
- `rule:es-ar`, `rule:es-er`, `rule:es-ir` (by the infinitive's ending, `ends`/`endsIn`; VerbForm Fin or Ger), one
  block each: pres-1sg…3pl, impf-sg (the course leaves the person out: era, hablaba), impf-2sg…3pl, pret-1sg…3pl,
  fut-1sg…3pl and cond-sg…3pl (on the whole infinitive), subj-sg, subj-2sg…3pl, subj-impf-sg…3pl, imp-2sg, imp-neg-2sg,
  imp-3sg, imp-3pl, imp-1pl, imp-neg (usted, where the course leaves the person out: no abra), ger. A cell with a
  value left out takes the exponent for the values it has (hablaría: cond-sg).
- `rule:es-impersonal` (a VERB no conjugation takes: hay): pres-3sg, the form itself; hay's other tenses are listed.
- Nominals (every cell but the citation's names a number): `rule:es-short-masculine` (class: este, ese, un: fem -a,
  neut -o, masc-pl -o, then pl -s), `rule:es-comparative` (class: mayor, mejor, peor: pl only), `rule:es-o` (fem -a,
  pl -s: bueno, hermano, lo, uno), `rule:es-or` (fem -a, pl -s: trabajadora, doctora), `rule:es-nominal` (the rest:
  pl -s; no feminine exponent, so a token's feminine is the word itself and a paradigm lists none for grande, mi,
  nosotros).

Rewrites, in order, each once over the whole form (`phonology`):

- `rule:es-reflexive`: `+se+` → `+`.
- `rule:es-participle|id`, `|ad`: the infinitive's -er/-ir/-ír → -id-, -ar → -ad- (id first: -ad- would leave
  esperar's er+ for it).
- `rule:es-stem`: the infinitive's ending goes before an ending in the finite cells but the future and conditional
  (Ind/Sub Pres, Past, Imp; the commands; the gerund); `|future`: oír's í loses its accent there (oiré).
- `rule:es-short-imperative` (class): the tú command drops its -e (ten, pon, ven, sal); `|z`: a final c is z (haz).
- `rule:es-go` (class), in the present and the commands, before an ending in a or o: `|g` after l or n (tengo,
  salgo), `|c` in place of c (hago, digo), `|ig` after a vowel (traigo, caigo, oigo). Not in the past (vino).
- `rule:es-stem-change` on a stressed stem (its last vowel before one to three consonants and a one-syllable
  ending, or a pronoun joined after one): `|e-ie`, `|o-ue`, `|u-ue`, `|e-i` (also a stem ending in its vowel: fríe;
  and gu: consigue), `|hiatus` (a stressed i or u written í ú: reúne).
- `rule:es-raising` (-ir verbs; e-i always): `|e-i`, `|o-u` before an unstressed a, ie, ié, ió (pidió, sintamos,
  durmiendo, consiguiéramos).
- `rule:es-zco` (class): c → zc before a or o (conozco, agradezca).
- `rule:es-plural` (cells with Number=Plur): `|same` (an unstressed last syllable in s or x: los jueves),
  `|es` (after d l j n r s x y z ch: ciudades, reyes; another consonant takes -s: shoppings), `|ies` (after a
  stressed í or ú: ajíes), `|accent-gain` (jóvenes, exámenes), `|accent-loss` (canciones, ingleses; países keeps it).
- `rule:es-final-vowel` (cells with a gender): a word's last vowel gives way to its ending (buena, esta, la).
- `rule:es-spelling`: `|c-qu` (-car: busqué), `|g-gu` (-gar: llegué, juegue), `|g-j` (-ger, -gir: cojo),
  `|gu-g` (-guir: consigo), `|z-c` (hice, felices, realicé).
- `rule:es-y`: `|uir` (construyo), `|oir` (oyes), `|i-y` (an unstressed i between vowels: leyó, cayó, oyendo,
  construyó).
- `rule:es-merge`: `|ii` (frió, frieron, friendo), `|j` (strong: dijeron, trajera, dijéramos).
- `rule:es-accent`: `|hiatus` (leímos, oído, freímos; fríe), `|monosyllable` (vi, vio, frio: the Ortografía
  2010), `|enclitic` (a command's stressed vowel where a pronoun is joined: échale, díganme).

Listed (the language has no rule): ser, ir and irse (the same forms: irse is its own lexeme), estar's present and
subjunctive (the accents), haber's present, dar (doy, its past, dé, des), saber's sé, hay's había and habrá, the
strong stems and short futures (tendr-, podr-, har-, dir-, sabr-, querr-, saldr-, vendr-, pondr-, habr-, valdr-), the
irregular participles (abiert-, dich-, escrit-, hech-, muert-, puest-, rot-, vist-, vuelt-, devuelt-, revuelt-),
decir's di, poder's pudiendo, ir's yendo, el's la/los/las, don's doña. Where a listed tú command (di, ve, sé,
está) or a listed usted negative (dé, esté: `{Mood: Imp, Number: Sing, Polarity: Neg}`) would also block the tú
negative (its cell has their values), the tú negative is listed too, though regular (dig-, vay-, se-; estés, des):
blocking reads only the values a cell has, and nothing says "not negative".

Paradigm audit (by hand, every verb in 47 cells, every noun's plural, every adjective's and determiner's four):
standard Spanish throughout; haber's commands (habe, haba) are nonsense but no AUX command cell ships.

## Engine and compiler changes (own commits, additive)

1. **A stored boundary ends what a rule's `ends`, `starts` and `endsIn` read** (realise.ts `conditionHolds`):
   `levantar+se` takes rule:es-ar. No lexicon stored a boundary before.
2. **A token's other words realised in their values** (realise.ts `realiseToken`): a lexeme beside the base that
   the token gives values, with no allomorph to choose, is realised in them (buscarlos: lo in the plural;
   agradecerles), its steps after the base's. No apc token gives such values. Vectors for both:
   conformance/realise-es-engine.json.
3. **The next word an allomorph reads is the one only a space stands before** (build.py `_token_sites`; forms.py
   `Site.following`): punctuation ends the phrase, so "Bueno, primo" has no buen. apc's bundle is byte for byte the
   same with 1-3 (built and compared).
4. conformance/spell.json's two error vectors that took es as the language with no notation now take en.

Picked from the coordinator's branch: fe8f0dd (a notation with no vowel signs, `rules: []`), a7ea75a (`unmarked`)
and, so that a7ea75a applies, cfc8b80 (`stemmed`), which es does not use: Spanish's conjugation is read off the
infinitive (`ends`), so its form stays the infinitive and rewrites drop the ending. a7ea75a's test is kept, the uz
test beside it in that file (from a commit not picked) left out. packages/core/test/lexicon-data.test.ts now takes
"a lexeme with a pinned form" as one with a form whose status is pinned (es's forms are listed now).

## Course changes (the owner should see these)

Twelve imperative tokens wrote a pronoun their annotation did not name (the course's échale and échalo do, as
courses/es/README.md says a token that writes several lexemes must). Each now lists its verb (`base: true`, the
surface it writes of it) and the pronoun; text, accept sets, readings and clips are untouched; each pronoun is
introduced earlier (lexeme:me and te by es.u01.me-llamo, le by es.u11.el-mensaje, lo by es.u13.la-maquina).
Their `n` and `head` (which count a form's lexemes) are renumbered after the added lexeme. Two also had the wrong
number (an ustedes command, -n, annotated Sing): set to Plur.

| file:line | item | before | after |
|---|---|---|---|
| u14-la-cocina-cubana.yaml:412 | s.u14.34 | cómelos: comer | comer (cóme) + lo `{Number: Plur}` (los) |
| u21-los-consejos.yaml:439 | s.u21.36 | Cuídate: cuidarse; pórtate: portarse | cuidarse (Cuída) + te; portarse (pórta) + te |
| u21-los-consejos.yaml:638 | es.story.u21 | the same two | the same two |
| u23-refranes.yaml:304 | s.u23.25 | Dime: decir | decir (Di) + me |
| u23-refranes.yaml:340 | s.u23.28 | Pásame: pasar | pasar (Pása) + me |
| u23-refranes.yaml:420 | s.u23.34 | tírame: tirar | tirar (tíra) + me |
| u28-si-pudiera.yaml:75 | s.u28.5 | llámenme: llamar `{Imp, Sing, 3}` | llamar (llámen) `{Imp, Plur, 3}` + me |
| u28-si-pudiera.yaml:474 | es.story.u28 | Díganme: decir `{Imp, Sing, 3}` | decir (Dígan) `{Imp, Plur, 3}` + me |
| u29-quien-soy.yaml:434 | es.story.u29 | Dale: dar | dar (Da) + le |
| u29-quien-soy.yaml:487 | es.story.u29 | Espérate: esperar | esperar (Espéra) + te |

What a learner sees of them: a tap glosses the pronoun too; the sentences' parts gain the pronoun (already
taught); the two plurals' feature value is Number=Plur (the label, "command, usted or ustedes", is the same).

## What the course disagrees with, and questions for the owner

- **hay** is annotated `{VerbForm: Inf}` (33 tokens) where UD has haber's present, 3sg; its other tenses (había,
  habrá) are listed forms of hay. A lexeme of its own, or haber's impersonal cells?
- **el alma, el ave**: el is annotated Masc where the noun is feminine (UD: Fem; the form el before a stressed a).
  The rules follow the annotation.
- **agro, tele** (above): clippings as free spellings, or lexemes, or listed forms?
- **freír's participle** is the regular freído; frito (the commoner) is not listed. **ajíes** (-es after a stressed
  í or ú, as the lexeme's note has it; the RAE also takes ajís, and menú takes only -s). **shoppings,
  espanglishs**: a loan's consonant takes -s.
- **gran, buen, primer** are allomorphs before a noun (`before: {pos: NOUN}`): the rule reads the next word, not
  the noun phrase (a predicate or a vocative noun after a comma is no context: compiler change 3).
- **Regularised forms** (blocking off) ship for 64 lexemes: penso, tenió, hacido, abrido, conoco, dormo, mayora,
  estes, unes are a learner's over-regularisations; the suppletive verbs' are nonsense and collide with
  other words (ir's are bare endings: o, es, a, en; ser: so, se; ver: va, vas; el: eles). Nothing reads them yet;
  stage 6 should decide what a suppletive verb's regularised form is (none, probably) before the label is produced.
- **The negative command** is Mood=Imp + Polarity=Neg in the course (UD has Mood=Sub): a listed affirmative blocks
  it, hence the listed negatives above.
- **Every class membership and listed form**, and the stress contexts of the boot verbs (a one-syllable ending),
  are drafts: the course's own forms agree with all of them.

## Paradigms (stage 4)

The compiler writes them (paradigms.py), format 5 as apc's; no `principalParts` (Spanish dictionaries cite the
infinitive alone). The course introduces the marked values only (Mood Cnd, Imp, Sub; VerbForm Ger, Part;
Number Plur), so a cell is listed only with es's `unmarked: {Mood: [Ind], VerbForm: [Fin], Number: [Sing]}`
(language.yaml; the shared key of a7ea75a): without it VERB listed 4 cells (the infinitive, the gerund, two
participles), with it **41**, and AUX 16 (every indicative and every finite cell of a verb).

- **Cells:** VERB 41, AUX 16, ADJ 4, DET 4, NOUN 2, NUM 2, PRON 2. A cell no exponent of a category's rule names
  is null (strict): a word in -e or a consonant has no feminine cell (grande, mi), a pronoun cited in one cell
  (nosotros, ellos, nos, ustedes) no other, hay only its present 3sg and the cells of its two listed tenses.
- **Shipped:** 551 lexemes with a paradigm (316 nouns, 161 verbs, 50 adjectives, 12 determiners, 7 pronouns,
  3 auxiliaries, 2 numerals), **7,494 spellings,** 53 null cells (hay 27, the rest the feminines above), none
  refused (`form.spelling-script`: every spelling is in the Latin script). `regularised` on 64 lexemes.
- **The lexicon file:** 480 to 641 KB (25 to 52 KB gzipped). The design's estimate was 100 KB beside 480; the
  rest is `regularised` (every cell where blocking off differs, for 64 lexemes) and the plurals of 316 nouns.

## Sources

The standard paradigms and spelling rules of the RAE and ASALE (Nueva gramática de la lengua española, 2009;
Ortografía de la lengua española, 2010, chapter 3 for the accents and the plural). No Spanish grammar is in the
reference library (`nabu refs find`: only Lloyd, 1987, a historical phonology), so no page is cited; the course's
own forms where it writes them.
