# Converting `courses/es` to the lexical model

Written by `nabu migrate ../courses/es`; do not edit by hand. It belongs to
[the migration's design note](../migration-design.md), deliverable 2. Nothing here is
decided: the converter applies the course's conversion plan
(`pipeline/src/nabu/migrate/plans/es.yaml`, drafted, REVIEW) and lists what it found.

## What was converted

|  | Count |
|---|---|
| Sense KCs | 721 |
| `form:` KCs | 23 |
| `construction:` KCs | 0 |
| `grapheme:` KCs | 0 |
| Sentences and story lines | 1542 |
| Tokens | 11152 |
| Lexemes in `lexicons/es/lexemes.yaml` | 721 |
| Pinned forms (rule debt, ADR 0145) | 835 |
| Listed forms | 0: no statement that a form has no rule is drafted yet |

**Checks** (docs/migration-design.md, "What must not change"):

- every sentence and story line as displayed: text, tokens, readings, accept sets and translations are unchanged, item by item;
- no two annotations of the course became one;
- every lexeme a token writes is written as its entry, or as a form or allomorph the lexicon has;
- every name points at something, and every file fits its schema.

## What each KC id became

| Kind | KCs |
|---|---|
| a form pinned on tokens: by sentence, the feature values taught | 23 |
| a sense: the lexeme of its name | 721 |

**`form:` and `construction:` KCs** (the plan's statements, REVIEW):

| KC | Gloss | Becomes | Note |
|---|---|---|---|
| `form:fem` | feminine: la, una, cubana | values Gender=Fem, Number=Sing; on PROPN: Gender=Fem |  |
| `form:pl` | plural: los, unos, cubanos | values Gender=Masc, Number=Plur; on PRON: Number=Plur |  |
| `form:fem-pl` | feminine plural: las, unas, cubanas | values Gender=Fem, Number=Plur |  |
| `form:pres-1s` | present tense: I (yo) | values Mood=Ind, Number=Sing, Person=1, Tense=Pres, VerbForm=Fin |  |
| `form:pres-2s` | present tense: you (tú) | values Mood=Ind, Number=Sing, Person=2, Tense=Pres, VerbForm=Fin |  |
| `form:pres-3s` | present tense: he, she, it, you (usted) | values Mood=Ind, Number=Sing, Person=3, Tense=Pres, VerbForm=Fin |  |
| `form:pres-1p` | present tense: we (nosotros) | values Mood=Ind, Number=Plur, Person=1, Tense=Pres, VerbForm=Fin |  |
| `form:pres-3p` | present tense: they, you all (ellos, ustedes) | values Mood=Ind, Number=Plur, Person=3, Tense=Pres, VerbForm=Fin |  |
| `form:pret-1s` | past tense (preterite): I (yo) | values Mood=Ind, Number=Sing, Person=1, Tense=Past, VerbForm=Fin |  |
| `form:pret-2s` | past tense (preterite): you (tú) | values Mood=Ind, Number=Sing, Person=2, Tense=Past, VerbForm=Fin |  |
| `form:pret-3s` | past tense (preterite): he, she, it, you (usted) | values Mood=Ind, Number=Sing, Person=3, Tense=Past, VerbForm=Fin |  |
| `form:pret-1p` | past tense (preterite): we (nosotros) | values Mood=Ind, Number=Plur, Person=1, Tense=Past, VerbForm=Fin |  |
| `form:pret-3p` | past tense (preterite): they, you all (ellos, ustedes) | values Mood=Ind, Number=Plur, Person=3, Tense=Past, VerbForm=Fin |  |
| `form:impf` | imperfect: was …ing, used to (hablaba, comía, era, iba) | values Mood=Ind, Tense=Imp, VerbForm=Fin; by ending: -mos: Number=Plur, Person=1, -s: Number=Sing, Person=2, -n: Number=Plur, Person=3, -(any other): Number=Sing |  |
| `form:fut` | future: will (hablará, será) | values Mood=Ind, Tense=Fut, VerbForm=Fin; by ending: -mos: Number=Plur, Person=1, -s: Number=Sing, Person=2, -n: Number=Plur, Person=3, -é: Number=Sing, Person=1, -á: Number=Sing, Person=3 |  |
| `form:cond` | conditional: would (hablaría, podría) | values Mood=Cnd, VerbForm=Fin; by ending: -mos: Number=Plur, Person=1, -s: Number=Sing, Person=2, -n: Number=Plur, Person=3, -(any other): Number=Sing |  |
| `form:subj` | present subjunctive (que hable, que coma) | values Mood=Sub, Tense=Pres, VerbForm=Fin; by ending: -mos: Number=Plur, Person=1, -s: Number=Sing, Person=2, -n: Number=Plur, Person=3, -(any other): Number=Sing |  |
| `form:subj-past` | imperfect subjunctive (si hablara, si tuviera) | values Mood=Sub, Tense=Imp, VerbForm=Fin; by ending: -mos: Number=Plur, Person=1, -s: Number=Sing, Person=2, -n: Number=Plur, Person=3, -(any other): Number=Sing |  |
| `form:imp-tu` | command, tú (¡habla!, ¡come!, ¡ven!) | values Mood=Imp, Number=Sing, Person=2, VerbForm=Fin |  |
| `form:imp-ud` | command, usted or ustedes (¡hable!, ¡coman!) | values Mood=Imp, Person=3, VerbForm=Fin; by ending: -n: Number=Plur, -(any other): Number=Sing |  |
| `form:imp-neg` | negative command (¡no hables!, ¡no coma!) | values Mood=Imp, Polarity=Neg, VerbForm=Fin; by ending: -mos: Number=Plur, Person=1, -s: Number=Sing, Person=2, -n: Number=Plur, Person=3, -(any other): Number=Sing |  |
| `form:ger` | gerund, -ando, -iendo (estoy trabajando: I'm working) | values VerbForm=Ger |  |
| `form:part` | past participle (hablado, comido, hecho; he hablado) | values Tense=Past, VerbForm=Part; by ending: -os: Gender=Masc, Number=Plur, -as: Gender=Fem, Number=Plur, -a: Gender=Fem, Number=Sing |  |

## What the lexicon holds

Counts of what the converter wrote into the entries, beyond one entry a lexeme.

|  | Count |
|---|---|
| pinned forms | 835 |
| second forms: a variant spelling | 2 |
| written otherwise than the entry | 4 |

## Defaults

A default is a rule, and what it gives is no part of a lexeme (ADR 0146). These are
the plan's, drafted (REVIEW); the counts are this course's lexemes.

|  | Lexemes |
|---|---|
| default gender-a: broken | 6 |
| default gender-a: gives | 91 |
| default gender-aje: gives | 2 |
| default gender-dad: gives | 3 |
| default gender-ion: broken | 1 |
| default gender-ion: gives | 5 |
| default gender-o: broken | 2 |
| default gender-o: gives | 95 |
| default gender-on: gives | 13 |
| default gender-or: broken | 1 |
| default gender-or: gives | 5 |
| default gender-tad: gives | 1 |
| lexical feature chosen by the token | 14 |
| lexical feature stored: no default speaks | 112 |
| lexical feature unknown | 18 |

**Endings a default could still cover:** among the lexemes that store the feature
with no default for their ending, these endings always go with one value (three
lexemes or more). Each is a candidate, not a finding: a course's words are few.

| Ending | Value | Lexemes | Such as |
|---|---|---|---|
| -s | Gender=Masc | 17 | cumpleaños, lunes, martes, miércoles, jueves, viernes |
| -es | Gender=Masc | 8 | lunes, martes, miércoles, jueves, viernes, inglés |
| -o | Gender=Masc | 7 | Varadero, enero, Guantánamo, centro, Capitolio, Morro |
| -a | Gender=Fem | 6 | Cuba, Cachita, Habana, Ofelia, Nochebuena, Guantanamera |
| -ar | Gender=Masc | 5 | dólar, mar, solar, lugar, paladar |
| -el | Gender=Masc | 4 | Daniel, Yasiel, Mariel, papel |
| -he | Gender=Fem | 4 | leche, noche, hache, medianoche |
| -les | Gender=Masc | 4 | miércoles, inglés, Industriales, Viñales |
| -ro | Gender=Masc | 4 | Varadero, enero, centro, Morro |
| -n | Gender=Masc | 4 | son, refrán, examen, malecón |
| -iel | Gender=Masc | 3 | Daniel, Yasiel, Mariel |
| -os | Gender=Masc | 3 | cumpleaños, Dios, Cienfuegos |
| -ue | Gender=Masc | 3 | guateque, parque, tranque |

## Dimensions

What every member of a category must choose (ADR 0145), as the plan declares it, and
how many tokens say a value of each: on themselves, or by an ending written on them.
A token that leaves one unsaid is the unmarked form, or one the course's annotation
has no name for.

| Category | Dimension | Tokens that say it | Tokens that do not |
|---|---|---|---|
| VERB | Mood | 1416 | 284 |
| VERB | Tense | 1362 | 338 |
| VERB | Person | 1256 | 444 |
| VERB | Number | 1419 | 281 |
| VERB | VerbForm | 1687 | 13 |
| AUX | Mood | 504 | 9 |
| AUX | Tense | 500 | 13 |
| AUX | Person | 432 | 81 |
| AUX | Number | 504 | 9 |
| AUX | VerbForm | 513 | 0 |
| NOUN | Number | 2249 | 58 |
| ADJ | Gender | 304 | 0 |
| ADJ | Number | 304 | 0 |
| DET | Gender | 1519 | 0 |
| DET | Number | 1519 | 0 |

**Values no dimension declares:** tokens carry them all the same. A category whose
members do not all inflect (a pronoun, a set phrase said to a woman), or a lexeme
tagged as another category than it behaves as.

| Category | Feature | Tokens | Lexemes, the commonest first |
|---|---|---|---|
| ADV | Gender | 34 | mucho |
| ADV | Number | 34 | mucho |
| INTJ | Gender | 3 | encantado |
| INTJ | Number | 3 | encantado |
| NOUN | Gender | 250 | tío, mijo, primo, don, niño, hermano |
| NUM | Gender | 5 | uno |
| NUM | Number | 7 | uno, mil |
| PRON | Gender | 23 | ella, lo |
| PRON | Number | 123 | ustedes, nosotros, nos, lo, ella, cuánto |
| VERB | Gender | 3 | cosechar, hacer, agradecer |
| VERB | Polarity | 12 | abrir, echar, preocupar, coger, revolver, colgar |

## Clips

The audio index is not rewritten: the compiler still reads it. A word's clip is keyed
by its KC id; these are the clips whose item has one name in the new shape, which the
switch renames and changes nothing else of. In a cast of several voices the voice
each has today is pinned (`courses/es/next/audio/assignment.yaml`), since a voice
is drawn by the item's id (ADR 0078).

|  | Clips |
|---|---|
| clips | 2263 |
| clips keyed by a KC | 721 |
| clips renamed with their item | 721 |
| voices pinned (a cast of several draws by the item's id) | 721 |

## Relations

Drafted by the plan's rules (`relations`): a link is written only where the values
agree and nothing but the words a rule may skip stands between. What is left bare
waits for a tree (ADR 0145: drafted by a parser, corrected by a reviewer).

|  | Lexemes |
|---|---|
| ADJ with values and no relation | 186 |
| DET with values and no relation | 171 |
| amod: written | 118 |
| case: written | 1029 |
| det: written | 1348 |

## Lexemes that break a default (10)

The entry stores the feature, and it is a part to learn (ADR 0146). Check each: a wrong default makes parts of regular words, a missing one hides an exception.

| Where | What |
|---|---|
| `lexeme:día` | Gender=Masc: gender-a would give Fem for día |
| `lexeme:avión` | Gender=Masc: gender-ion would give Fem for avión |
| `lexeme:foto` | Gender=Fem: gender-o would give Masc for foto |
| `lexeme:capicúa` | Gender=Masc: gender-a would give Fem for capicúa |
| `lexeme:turista` | Gender=Masc: gender-a would give Fem for turista |
| `lexeme:flor` | Gender=Fem: gender-or would give Masc for flor |
| `lexeme:poeta` | Gender=Masc: gender-a would give Fem for poeta |
| `lexeme:poema` | Gender=Masc: gender-a would give Fem for poema |
| `lexeme:mano` | Gender=Fem: gender-o would give Masc for mano |
| `lexeme:idioma` | Gender=Masc: gender-a would give Fem for idioma |

## Lexemes no default speaks of (112)

No stated default gives the feature for a lexeme so written, so the entry stores it and it is a part to learn. A reliable ending among these is a default to add.

| Where | What |
|---|---|
| `lexeme:asere` | Gender=Masc: no default speaks of asere |
| `lexeme:daniel` | Gender=Masc: no default speaks of Daniel |
| `lexeme:miami` | Gender=Masc: no default speaks of Miami |
| `lexeme:cuba` | Gender=Fem: no default speaks of Cuba |
| `lexeme:yasiel` | Gender=Masc: no default speaks of Yasiel |
| `lexeme:cachita` | Gender=Fem: no default speaks of Cachita |
| `lexeme:mami` | Gender=Fem: no default speaks of mami |
| `lexeme:papi` | Gender=Masc: no default speaks of papi |
| `lexeme:lili` | Gender=Fem: no default speaks of Lili |
| `lexeme:pepe` | Gender=Masc: no default speaks of Pepe |
| `lexeme:marisol` | Gender=Fem: no default speaks of Marisol |
| `lexeme:habana` | Gender=Fem: no default speaks of Habana |
| `lexeme:yunior` | Gender=Masc: no default speaks of Yunior |
| `lexeme:padre` | Gender=Masc: no default speaks of padre |
| `lexeme:hialeah` | Gender=Masc: no default speaks of Hialeah |
| `lexeme:café` | Gender=Masc: no default speaks of café |
| `lexeme:portal` | Gender=Masc: no default speaks of portal |
| `lexeme:arroz` | Gender=Masc: no default speaks of arroz |
| `lexeme:frijol` | Gender=Masc: no default speaks of frijol |
| `lexeme:congrí` | Gender=Masc: no default speaks of congrí |
| `lexeme:leche` | Gender=Fem: no default speaks of leche |
| `lexeme:hambre` | Gender=Fem: no default speaks of hambre |
| `lexeme:dólar` | Gender=Masc: no default speaks of dólar |
| `lexeme:cumpleaños` | Gender=Masc: no default speaks of cumpleaños |
| `lexeme:calle` | Gender=Fem: no default speaks of calle |
| `lexeme:noche` | Gender=Fem: no default speaks of noche |
| `lexeme:lunes` | Gender=Masc: no default speaks of lunes |
| `lexeme:martes` | Gender=Masc: no default speaks of martes |
| `lexeme:miércoles` | Gender=Masc: no default speaks of miércoles |
| `lexeme:jueves` | Gender=Masc: no default speaks of jueves |
| `lexeme:viernes` | Gender=Masc: no default speaks of viernes |
| `lexeme:pulóver` | Gender=Masc: no default speaks of pulóver |
| `lexeme:shopping` | Gender=Fem: no default speaks of shopping |
| `lexeme:suerte` | Gender=Fem: no default speaks of suerte |
| `lexeme:pasaporte` | Gender=Masc: no default speaks of pasaporte |
| `lexeme:varadero` | Gender=Masc: no default speaks of Varadero |
| `lexeme:matanzas` | Gender=Masc: no default speaks of Matanzas |
| `lexeme:whatsapp` | Gender=Masc: no default speaks of WhatsApp |
| `lexeme:té` | Gender=Masc: no default speaks of té |
| `lexeme:español` | Gender=Masc: no default speaks of español |
| `lexeme:tilde` | Gender=Fem: no default speaks of tilde |
| `lexeme:luz` | Gender=Fem: no default speaks of luz |
| `lexeme:papalote` | Gender=Masc: no default speaks of papalote |
| `lexeme:inglés` | Gender=Masc: no default speaks of inglés |
| `lexeme:guateque` | Gender=Masc: no default speaks of guateque |
| `lexeme:gente` | Gender=Fem: no default speaks of gente |
| `lexeme:vez` | Gender=Fem: no default speaks of vez |
| `lexeme:carne` | Gender=Fem: no default speaks of carne |
| `lexeme:ají` | Gender=Masc: no default speaks of ají |
| `lexeme:aceite` | Gender=Masc: no default speaks of aceite |
| `lexeme:sal` | Gender=Fem: no default speaks of sal |
| `lexeme:ofelia` | Gender=Fem: no default speaks of Ofelia |
| `lexeme:paquete` | Gender=Masc: no default speaks of paquete |
| `lexeme:hache` | Gender=Fem: no default speaks of hache |
| `lexeme:son` | Gender=Masc: no default speaks of son |
| `lexeme:clave` | Gender=Fem: no default speaks of clave |
| `lexeme:industriales` | Gender=Masc: no default speaks of Industriales |
| `lexeme:marlins` | Gender=Masc: no default speaks of Marlins |
| `lexeme:parque` | Gender=Masc: no default speaks of parque |
| `lexeme:doble` | Gender=Masc: no default speaks of doble |
| `lexeme:tranque` | Gender=Masc: no default speaks of tranque |
| `lexeme:nochebuena` | Gender=Fem: no default speaks of Nochebuena |
| `lexeme:diciembre` | Gender=Masc: no default speaks of diciembre |
| `lexeme:navidad` | Gender=Fem: no default speaks of Navidad |
| `lexeme:medianoche` | Gender=Fem: no default speaks of medianoche |
| `lexeme:enero` | Gender=Masc: no default speaks of enero |
| `lexeme:rey` | Gender=Masc: no default speaks of rey |
| `lexeme:vals` | Gender=Masc: no default speaks of vals |
| `lexeme:wifi` | Gender=Masc: no default speaks of wifi |
| `lexeme:corriente` | Gender=Fem: no default speaks of corriente |
| `lexeme:refrán` | Gender=Masc: no default speaks of refrán |
| `lexeme:examen` | Gender=Masc: no default speaks of examen |
| `lexeme:mal.harm` | Gender=Masc: no default speaks of mal |
| `lexeme:dios` | Gender=Masc: no default speaks of Dios |
| `lexeme:aire` | Gender=Masc: no default speaks of aire |
| `lexeme:mariel` | Gender=Masc: no default speaks of Mariel |
| `lexeme:mar` | Gender=Masc: no default speaks of mar |
| `lexeme:cienfuegos` | Gender=Masc: no default speaks of Cienfuegos |
| `lexeme:guardacostas` | Gender=Masc: no default speaks of guardacostas |
| `lexeme:guantánamo` | Gender=Masc: no default speaks of Guantánamo |
| `lexeme:papel` | Gender=Masc: no default speaks of papel |
| `lexeme:centro` | Gender=Masc: no default speaks of centro |
| `lexeme:solar` | Gender=Masc: no default speaks of solar |
| `lexeme:lugar` | Gender=Masc: no default speaks of lugar |
| `lexeme:malecón` | Gender=Masc: no default speaks of malecón |
| `lexeme:catedral` | Gender=Fem: no default speaks of catedral |
| `lexeme:capitolio` | Gender=Masc: no default speaks of Capitolio |
| `lexeme:morro` | Gender=Masc: no default speaks of Morro |
| `lexeme:bicitaxi` | Gender=Masc: no default speaks of bicitaxi |
| `lexeme:viñales` | Gender=Masc: no default speaks of Viñales |
| `lexeme:valle` | Gender=Masc: no default speaks of valle |
| `lexeme:mogote` | Gender=Masc: no default speaks of mogote |
| `lexeme:central` | Gender=Masc: no default speaks of central |
| `lexeme:machete` | Gender=Masc: no default speaks of machete |
| `lexeme:árbol` | Gender=Masc: no default speaks of árbol |
| `lexeme:ave` | Gender=Fem: no default speaks of ave |
| `lexeme:yarey` | Gender=Masc: no default speaks of yarey |
| `lexeme:martí` | Gender=Masc: no default speaks of Martí |
| `lexeme:héroe` | Gender=Masc: no default speaks of héroe |
| `lexeme:josé` | Gender=Masc: no default speaks of José |
| `lexeme:apóstol` | Gender=Masc: no default speaks of apóstol |
| `lexeme:hombre` | Gender=Masc: no default speaks of hombre |
| `lexeme:guantanamera` | Gender=Fem: no default speaks of Guantanamera |
| `lexeme:julio` | Gender=Masc: no default speaks of julio |
| `lexeme:país` | Gender=Masc: no default speaks of país |
| `lexeme:paladar` | Gender=Masc: no default speaks of paladar |
| `lexeme:cliente` | Gender=Masc: no default speaks of cliente |
| `lexeme:espanglish` | Gender=Masc: no default speaks of espanglish |
| `lexeme:cake` | Gender=Masc: no default speaks of cake |
| `lexeme:brindis` | Gender=Masc: no default speaks of brindis |
| `lexeme:mujer` | Gender=Fem: no default speaks of mujer |
| `lexeme:raíz` | Gender=Fem: no default speaks of raíz |

## Lexical features the tokens choose (14)

The feature is declared lexical for the category, and this lexeme's tokens have more than one value of it, or the entry itself is written in another (tía under tío). By ADR 0145 a noun's feminine is a derivative, a lexeme of its own where it is listed. The values stay on the tokens until that is decided.

| Where | What |
|---|---|
| `lexeme:hermano` | Gender is Fem and Masc on its tokens: kept on the tokens, not on the entry |
| `lexeme:tío` | Gender is Fem on its tokens: kept on the tokens, not on the entry |
| `lexeme:primo` | Gender is Fem and Masc on its tokens: kept on the tokens, not on the entry |
| `lexeme:hijo` | Gender is Fem and Masc on its tokens: kept on the tokens, not on the entry |
| `lexeme:mijo` | Gender is Fem and Masc on its tokens: kept on the tokens, not on the entry |
| `lexeme:niño` | Gender is Fem and Masc on its tokens: kept on the tokens, not on the entry |
| `lexeme:mecánico` | Gender is Fem and Masc on its tokens: kept on the tokens, not on the entry |
| `lexeme:novio` | Gender is Fem and Masc on its tokens: kept on the tokens, not on the entry |
| `lexeme:don` | Gender is Fem and Masc on its tokens: kept on the tokens, not on the entry |
| `lexeme:azúcar` | Gender is Fem and Masc on its tokens: kept on the tokens, not on the entry |
| `lexeme:doctor` | Gender is Fem on its tokens: kept on the tokens, not on the entry |
| `lexeme:vecino` | Gender is Fem on its tokens: kept on the tokens, not on the entry |
| `lexeme:muchacho` | Gender is Fem and Masc on its tokens: kept on the tokens, not on the entry |
| `lexeme:yuma` | Gender is Fem and Masc on its tokens: kept on the tokens, not on the entry |

## Lexemes whose lexical feature no token says (18)

Mostly entries written as several tokens, on which the course pins no form.

| Where | What |
|---|---|
| `lexeme:fruta-bomba` | no token says its Gender |
| `lexeme:calle-ocho` | no token says its Gender |
| `lexeme:fin-de-semana` | no token says its Gender |
| `lexeme:naranja-agria` | no token says its Gender |
| `lexeme:ropa-vieja` | no token says its Gender |
| `lexeme:olla-de-presión` | no token says its Gender |
| `lexeme:benny-moré` | no token says its Gender |
| `lexeme:celia-cruz` | no token says its Gender |
| `lexeme:buena-vista` | no token says its Gender |
| `lexeme:compay-segundo` | no token says its Gender |
| `lexeme:caja-china` | no token says its Gender |
| `lexeme:cayo-hueso` | no token says its Gender |
| `lexeme:pequeña-habana` | no token says its Gender |
| `lexeme:bodeguita-del-medio` | no token says its Gender |
| `lexeme:pinar-del-río` | no token says its Gender |
| `lexeme:palma-real` | no token says its Gender |
| `lexeme:nueva-york` | no token says its Gender |
| `lexeme:edad-de-oro` | no token says its Gender |

## Written otherwise than the entry (4)

A token names the lexeme, no feature value tells it from the entry's own form, and it is spelled differently: an allomorph by context (gran before a noun), or a form the course's annotation has no name for. Kept as an allomorph of the entry.

| Where | What |
|---|---|
| `lexeme:grande` | written gran (1×, first in s.u27.10): an allomorph, or a form no value names |
| `lexeme:primero` | written primer (4×, first in s.u13.32): an allomorph, or a form no value names |
| `lexeme:bueno` | written buen (1×, first in s.u21.9): an allomorph, or a form no value names |
| `lexeme:mudarse` | joined to another lexeme, written mudar (1×, first in s.u28.10) |

## A determiner that does not agree with the noun after it (7)

The two stand side by side and the values the course pins on them differ: one of the two annotations may be wrong, or the noun is not the determiner's.

| Where | What |
|---|---|
| `s.u18.17 (es-Latn/standard)` | el (Gender=Masc, Number=Sing) stands before azúcar (Gender=Fem, Number=Sing) and does not agree with it |
| `s.u26.24 (es-Latn/standard)` | el (Gender=Masc, Number=Sing) stands before ave (Gender=Fem, Number=Sing) and does not agree with it |
| `s.u26.25 (es-Latn/standard)` | un (Gender=Masc, Number=Sing) stands before ave (Gender=Fem, Number=Sing) and does not agree with it |
| `es.story.u26#6 (es-Latn/standard)` | un (Gender=Masc, Number=Sing) stands before ave (Gender=Fem, Number=Sing) and does not agree with it |
| `es.story.u26#8 (es-Latn/standard)` | el (Gender=Masc, Number=Sing) stands before ave (Gender=Fem, Number=Sing) and does not agree with it |
| `es.story.u26#9 (es-Latn/standard)` | el (Gender=Masc, Number=Sing) stands before ave (Gender=Fem, Number=Sing) and does not agree with it |
| `s.u27.20 (es-Latn/standard)` | el (Gender=Masc, Number=Sing) stands before alma (Gender=Fem, Number=Sing) and does not agree with it |

## Left for a reviewer by the plan

What the plan's drafter saw and did not decide.

- hay (there is) is an entry of its own. It is the impersonal present of haber, whose third person is ha: a form of haber in another use, or a lexeme?
- mucho is tagged ADV and agrees like a determiner (mucha gente, muchos días): one lexeme under one tag (ADR 0145), and which?
- Nouns written in both genders under one entry (hermano, hermana; tío, tía; doctor, doctora) keep the gender on the token. By ADR 0145 the feminine is a derivative, a lexeme of its own where it is listed: decided per noun.
- The article before a feminine noun in stressed a- is pinned feminine by the course's rule (el agua); el ave, un ave, el alma and el azúcar are bare. The report lists them as determiners that do not agree.
- The imperfect, the future, the conditional and the subjunctives name no person in the course. The plan reads it off the ending where the ending has one (-mos, -s, -n); a first and a third person singular stay one form.

## What no finding above covers

- **Projections:** no orthography of this course has a stated projection yet, so every
  spelling and reading stays pinned as it is; there is nothing to compare them with
  (ADR 0148).
- **Credits by sentence:** an old credit for a `form:` KC that is feature values now goes,
  sentence by sentence, to the values the form chose there that the course teaches (the
  sentence's parts). Where the sentence is not known it goes nowhere, and nothing old
  counts towards a rule (ADR 0146).
