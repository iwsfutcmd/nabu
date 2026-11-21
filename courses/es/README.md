# es: Cuban Spanish for heritage speakers

A course in Cuban Spanish (`es-Latn-CU`) for people who grew up hearing it at home: they understand
a lot and speak "kitchen Spanish", but never studied it. It starts at A1, so anyone can take it,
and goes to B2. A placement test at the start ([ADR 0077](../../docs/adr/0077-adaptive-placement.md))
lets a heritage speaker skip what they already know. Thirty units: the first ten are the
everyday core, and the twenty after them are where a heritage speaker does most of their work
([ADR 0076](../../docs/adr/0076-cuban-spanish.md)).

Every sentence, story and scenario is an LLM draft (`llm:claude@…`, `status: draft`) awaiting a
native speaker's review. This file is the brief the drafts were written from.

## Who it is for, and what follows from that

- **Heritage speakers understand far more than they produce.** Listening and recognition come
  easily; the work is in production, spelling and the registers they never heard at home. So the
  course leans on typed production, and its placement test types its answers.
- **Their Spanish is Cuban, and the course respects it.** The canonical answers are what a Cuban
  family says (*guagua*, *¿Qué tú quieres?*, *ahorita*, *fruta bomba*). Pan-Hispanic forms are
  accepted too (*autobús*, *¿Qué quieres tú?*), and lexicon notes say where other countries
  differ. Nothing Cuban is "corrected" into another variety.
- **What they lack is mostly what school would have taught:** written accents, b/v, h, c/s/z,
  ll/y; the subjunctive, the conditional and the compound tenses; *usted* and formal writing;
  vocabulary beyond the home. The units after 10 work on these, always through Cuban family
  life and culture.
- **Accent marks** are part of the spelling. Left out, they are accepted with a note; where
  leaving one out makes another word (*esta* for *está*, *hablo* for *habló*), the answer is
  wrong (profile `es-Latn/standard`, `marks.distinguishes`).

## The family

One family runs through the stories, so a learner meets the same people from unit 1 to unit 30.

| Who | |
|---|---|
| **Daniel** | 24, grew up in Hialeah (Miami). Understands everything, answers in Spanglish. The learner's stand-in: first-person sentences with gendered words are his (`persons: {speaker: m}`). |
| **Lili** | Daniel's younger sister, 19, studies at FIU. |
| **Mami (Lourdes)** and **Papi (Alberto)** | Daniel's parents. Lourdes was born in Miami. Alberto grew up in Cienfuegos, by the sea, and came with his father on a raft in the summer of 1994, a *balsero* of about fourteen; he had never told his children (u24). |
| **Abuela Cachita** (Caridad) | Lourdes's mother, born in Matanzas, where her father built the family's *bohío* (u26). Married Pepe at twenty (u13); came with him in the Mariel boatlift (1980), in a motorboat a cousin of Pepe's brought (u24). 79 in u05, 80 at her birthday party in u30. Cooks, tells stories, speaks in refranes, and still misses Marisol every day. |
| **Abuelo Pepe** (José) | Cachita's husband, a retired mechanic. Pelota and dominó in the park on Calle Ocho. He courted Cachita in his 1957 car, which stayed in Matanzas with a cousin of his (u13); says he came for freedom (u24). |
| **Tía Marisol** | Cachita's daughter who stayed in Cuba: she was thirteen and with her grandmother in the countryside the night the boat left in 1980, and could never leave later (u24). Lives in Centro Habana, in a flat with a balcony over the neighbourhood; talks to the family on WhatsApp. Daniel first met her in person on his trip (u25). |
| **Yunior** | Marisol's son, Daniel's cousin, 25, in Havana. Very Cuban speech. |
| **Yasiel** | Daniel's friend in Miami, arrived from Holguín two years ago. |
| **Doña Ofelia** | The neighbour in Hialeah, 80, whom everyone addresses as *usted*. |

Further back: Daniel's great-grandfather cut cane at a *central* in Matanzas (u26).

## Conventions

- **Course:** `id: es`, target `es-Latn-CU`, one orthography `es-Latn/standard`, support `en`.
- **Unit files:** `units/uNN-<slug>.yaml`, unit ids `uNN`, node ids `es.uNN.<slug>`, sentence ids
  `s.uNN.<n>`, story ids `es.story.uNN` on a story node `es.uNN.story`, the last node of the unit.
- **Lexicon:** the course's words are lexemes in `lexicons/es/lexemes.yaml` (`lexicon: es` in
  `course.yaml`), one flat list sorted by id that names no unit; the language's features,
  defaults, labels and registers are in `lexicons/es/language.yaml`.
- **Lexemes.**
  - An entry has an `id`, its UD `pos`, its `gloss` and its spelling (`spelled`, the first shown):

    ```yaml
    - id: lexeme:guagua
      pos: NOUN
      gloss: {en: bus}
      spelled: {es-Latn/standard: [guagua]}
    ```

  - `lexeme:<lemma>`: the lemma as written, accents and all (`lexeme:café`, `lexeme:adiós`). Verbs
    by infinitive (`lexeme:hablar`), reflexive verbs with -se (`lexeme:levantarse`), nouns in the
    singular, adjectives in the masculine singular. Words spelled alike differ by their accent
    (`lexeme:si` "if", `lexeme:sí` "yes"; `lexeme:el` "the", `lexeme:él` "he") or by a suffix
    (`lexeme:como.like`).
  - `spelled` holds the lemma and its variant spellings (`lexeme:agromercado`: `[agromercado,
    agro]`), never an inflected word: the forms the sentences write are its `forms`, each with its
    feature values (`lexeme:tío`: `{feats: {Gender: Fem, Number: Sing}, spelled: {es-Latn/standard:
    [tía]}, status: pinned}`).
  - Articles and determiners by their masculine singular: `lexeme:el` (el, la, los, las),
    `lexeme:un`, `lexeme:este` (este, esta, estos, estas: *esta casa* is `lexeme:este`; *está* is
    `lexeme:estar`), `lexeme:mi` (mi, mis), `lexeme:su`. What UD says of the word itself goes in
    `feats` (`lexeme:este`: `{PronType: Dem}`; `lexeme:mi`: `{Poss: 'Yes', PronType: Prs}`).
  - Contractions are their own lexemes: `lexeme:al`, `lexeme:del`.
  - A multi-word expression is one lexeme whose tokens all name it: *buenos días* is
    `lexeme:buenos-días`, spelled `[buenos días]`, and two tokens, `{surface: Buenos, lexeme:
    buenos-días}, {surface: días, lexeme: buenos-días}`. Keep these few; teach the words. Where it
    inflects, the token that inflects chooses its form: *tengo que* is `{surface: Tengo, lexeme:
    tener-que, feats: {Mood: Ind, Number: Sing, Person: '1', Tense: Pres, VerbForm: Fin}}, {surface:
    que, lexeme: tener-que}`; *buenos días* chooses nothing.
  - **A noun's gender** is its lexeme's ([ADR 0132](../../docs/adr/0132-a-choice-asks-one-thing.md)'s
    amendment). `language.yaml`'s `defaults` give it by the ending (-a, -ión, -dad, -tad, -tud,
    -umbre feminine; -o, -ón, -aje, -or masculine), so *casa* and *agua* store nothing. Write
    `feats` only where no default gives it or the default is wrong: *mano* `{Gender: Fem}`,
    *aceite* `{Gender: Masc}`. A noun with both genders says `chooses: [Gender]` and its tokens
    choose (`lexeme:tío`, `lexeme:mijo`).
  - Names are lexemes, `pos: PROPN` (`lexeme:daniel`, `lexeme:cachita`). No default gives a name's
    gender, so each stores it: `lexeme:cuba`, `lexeme:habana`, `lexeme:marisol` `{Gender: Fem}`;
    `lexeme:daniel`, `lexeme:miami` `{Gender: Masc}`. A name of several words (`lexeme:calle-ocho`)
    stores none.
  - Every lexeme has an English gloss. Use `notes` for the Cuban side: what Cubans say and others
    don't (*guagua*: "the bus in Cuba, Puerto Rico, the Dominican Republic and the Canaries;
    elsewhere el autobús …"), how it is said (*para* is often *pa'*), and false friends.
- **Tokens** name the lexeme they write (`lexeme`, without its `lexeme:` prefix) and the feature
  values chosen there (`feats`), never the lexeme's own (*mano*'s gender stays in its entry).
  - **Verb forms** are feature values (Spanish is fusional): *Tengo* is `{surface: Tengo, lexeme:
    tener, feats: {Mood: Ind, Number: Sing, Person: '1', Tense: Pres, VerbForm: Fin}}`. *Me
    levanto* is two tokens: `{surface: Me, lexeme: me}, {surface: levanto, lexeme: levantarse,
    feats: {Mood: Ind, Number: Sing, Person: '1', Tense: Pres, VerbForm: Fin}}`. An infinitive is
    `{VerbForm: Inf}`; every verb token has its `feats`.
  - A token that writes several lexemes lists them in `lexemes`, the one the others join marked
    `base`: *vernos* is `{surface: vernos, lexemes: [{lexeme: ver, surface: ver, base: true,
    feats: {VerbForm: Inf}}, {lexeme: nos, surface: nos, feats: {Number: Plur}}]}`.
  - **Gender and number:** a noun's token chooses its number (`{surface: casa, lexeme: casa,
    feats: {Number: Sing}}`); every adjective, determiner and pronoun that agrees chooses gender
    and number by its agreement in the line, the masculine singular written too:

    | `feats` | | |
    |---|---|---|
    | `{Gender: Masc, Number: Sing}` | masculine singular | *el carro, un amigo, cubano, mi papi* |
    | `{Gender: Fem, Number: Sing}` | feminine | *la casa, una amiga, cubana, mi mami* |
    | `{Gender: Masc, Number: Plur}` | plural (masculine, or men and women together) | *los carros, mis padres, cubanos* |
    | `{Gender: Fem, Number: Plur}` | feminine plural | *las casas, unas amigas, cubanas* |

    The form is the word's agreement in its line, not its ending: a word that looks the same in
    both genders takes its noun's (*mi casa*: `{surface: mi, lexeme: mi, feats: {Gender: Fem,
    Number: Sing}, n: 3, head: 4, rel: det}`; *una familia grande*: `grande` `{Gender: Fem, Number:
    Sing}`, `rel: amod`), and a first or second person the sentence's `persons` (untagged: the
    masculine singular, *Cuando yo era joven*: `joven` `{Gender: Masc, Number: Sing}`). `n`,
    `head` and `rel` (UD's relation) are written where a word agrees with another. An adjective
    with nothing to agree with is masculine singular (*es posible*: `posible` `{Gender: Masc,
    Number: Sing}`); *quién* and *cuál* choose nothing.
    A pronoun chooses its own (*ella*: `{Gender: Fem, Number: Sing}`; *nosotros*, *ustedes*,
    *nos*, *les*: `{Number: Plur}`).
    A word question offers only words of the answer's form, so *una ___* never offers *carro*.
- **What a learner is told a form is** comes from `labels` in `language.yaml`: the most specific
  label whose feature values the form has names it. For example:

  | `feats` | `gloss` |
  |---|---|
  | `{Mood: Ind, Number: Sing, Person: '1', Tense: Pres, VerbForm: Fin}` | present tense: I (yo) |
  | `{Mood: Ind, Number: Plur, Person: '3', Tense: Pres, VerbForm: Fin}` | present tense: they, you all (ellos, ustedes) |
  | `{Mood: Ind, Number: Sing, Person: '1', Tense: Past, VerbForm: Fin}` | past tense (preterite): I (yo) |
  | `{Mood: Ind, Tense: Imp, VerbForm: Fin}` | imperfect: was …ing, used to (hablaba, comía, era, iba) |
  | `{Mood: Imp, Number: Sing, Person: '2', VerbForm: Fin}` | command, tú (¡habla!, ¡come!, ¡ven!) |
  | `{Mood: Sub, Tense: Pres, VerbForm: Fin}` | present subjunctive (que hable, que coma) |
  | `{VerbForm: Ger}` | gerund, -ando, -iendo (estoy trabajando: I'm working) |
  | `{Gender: Fem, Number: Sing}` | feminine: la, una, cubana |

  A label also has `notes`, and `was`, the old id of the form it names.
- **Nodes:** a node's `introduces` lists the lexemes and feature values it teaches
  (`introduces: ['lexeme:estar', 'feature:Tense=Pres', 'lexeme:cómo', 'lexeme:usted']`). The
  node that first teaches a tense, a mood or a verb form introduces its value (`feature:Tense=Past`
  in `es.u09.ayer`, `feature:VerbForm=Ger` in `es.u07.estoy-trabajando`), and so do the first
  feminine and the first plural (`feature:Gender=Fem` in `es.u01.soy`, `feature:Number=Plur` in
  `es.u02.tengo`).
- **i+1:** a sentence brings in at most `iPlusOne` lexemes and feature values no earlier sentence
  used (default 1; `iPlusOne: 2` here). Order the sentences of a node so each adds one.
- **Sentences:** about 30–36 a unit, short in the early units, longer from unit 11. Every
  sentence has `reverse` (the Spanish accept set) and `translations.en` (the English accept set,
  displayed form first).
  - Accept sets: `(a|b)` alternatives, `[x]` optional. Subject pronouns optional where Spanish drops
    them: `[Yo] tengo hambre`.
  - Cuban questions keep the subject before the verb: canonical *¿Qué tú quieres?*, also
    accepting *¿Qué quieres [tú]?*
  - English "you" covers *tú*, *usted* and *ustedes*: accept every form that fits, unless the
    sentence's `register` (formal: *usted*) or `persons` narrows it.
  - `persons: {speaker: m|f, addressee: m|f|pl}` where Spanish marks gender or number and English
    does not (*Estoy cansado*), and keep the accept set to the forms that fit (ADR 0056).
  - `register: colloquial` for slang (*asere*, *¿qué bolá?*), `formal` for *usted* sentences.
- **Stories:** one per unit, on its last node: 10–16 lines with the family as characters, two or
  three `choose` questions, one or two `ask: arrange`, one or two `ask: complete` (with `gap` and
  two `distractors`). Lines use only lexemes and feature values taught up to that unit.
- **Scenarios** (roleplay with a model): about one every three units, in Cuban settings.
- **Provenance and license:** the course default (`llm:claude@…`, draft; CC-BY-SA-4.0). Authentic
  texts keep their own provenance (José Martí's *Versos sencillos*, 1891, public domain).

## Writing a unit

`units/u01-que-bola.yaml` is the model. Build with `cd pipeline && uv run nabu build ../courses/es
--check`; a unit is done when it has no errors and no warnings. What the linter catches most:

- **i+1** (`iPlusOne: 2` here): a new verb in a new tense is already two new parts (`lexeme:hablar`
  and `feature:Tense=Past`, both introduced by `es.u09.ayer`).
- **Duplicate answers** (`grading.duplicate`): accept sets are compared after normalization, which
  drops punctuation and case. Never vary only punctuation (`(,| )`, `[.]`), and do not list the
  displayed translation on its own line when a later line generates it too. Write one pattern whose
  first alternatives give the displayed form: `(I'm|I am) (fine|good|well).`
- **YAML:** quote any value in a flow mapping (`{en: …}`) that contains `?`, `:` followed by a
  space, `#`, brackets or braces, and any accept set that starts with `[`. Use `|-` blocks for
  multi-line accept sets.
- **Tokens:** every word of `text`, in order, exactly as written (capitals, accents); punctuation
  is not a token. Each names a `lexeme` that `lexicons/es/lexemes.yaml` has and a node up to this
  one introduces (`curriculum.unknown`, `curriculum.introduced-late`), with its `feats` on every
  verb and noun and on each adjective, determiner and pronoun that agrees (on a multi-word
  lexeme's tokens, only where it inflects).
- **Stories:** a `complete` line's `gap` must be the lexeme of exactly one token of the line
  (`gap: lexeme:yasiel`). It asks which lexeme (`asks: lexeme`, the default): its `distractors` are
  other lexemes of the gap's part of speech (for that gap, `lexeme:daniel` and `lexeme:miami`), each
  written by the course in the gap's form in this unit or an earlier one (`story.distractor-form`,
  `story.distractor-pos`). Or it asks which form (`asks: form`): its `distractors` are feature
  values of the gap's own lexeme in forms the course writes (u12, `gap: lexeme:ser`: `{Mood: Ind,
  Number: Sing, Person: '1', Tense: Pres, VerbForm: Fin}` beside the line's *Éramos*).

## The units

| # | File | Title | CEFR | Grammar | Cuban life |
|---|---|---|---|---|---|
| 1 | `u01-que-bola` | ¿Qué bolá? | A1 | *ser* (soy, eres, es), *llamarse*, *tú* and *usted*, questions | greetings: *¿Qué bolá?*, *asere*, *mi vida*; meeting the family |
| 2 | `u02-la-familia` | La familia | A1 | *tener* (present), *mi/tu/su*, gender and number, *este* | Mami, Papi, Abuela Cachita, Abuelo Pepe, *mi'ja*, *el puro/la pura* (parents) |
| 3 | `u03-la-casa` | La casa | A1 | *estar* for place, *hay*, articles, *en*, *al/del* | the house in Hialeah: *el portal*, *el patio*, *la sala*; Abuela's *ventilador* |
| 4 | `u04-la-comida` | La comida | A1 | *gustar*, *querer*, regular -er verbs (*comer*, *beber*) | *arroz con frijoles negros*, *congrí*, *plátanos maduros*, *tostones*, *cafecito*, *fruta bomba* |
| 5 | `u05-los-numeros` | Los números | A1 | numbers 0–100, *tener … años*, *¿cuánto?*, the time | prices in *pesos* and dollars, *la cola*, birthdays |
| 6 | `u06-el-barrio` | El barrio | A1 | *ir a*, *¿dónde está?*, *cerca/lejos*, regular -ar verbs | *la guagua*, *la bodega*, *la Calle Ocho*, *la ventanita* |
| 7 | `u07-el-dia` | Un día | A2 | reflexive verbs (*levantarse*, *bañarse*), days, *por la mañana* | *el cafecito* at seven, the *colada* at work, *la novela* at night |
| 8 | `u08-de-compras` | De compras | A2 | all present persons of regular verbs, *¿cuánto cuesta?*, colours, *ese* | *la jaba*, *el pomo*, *la shopping* (Cuban hard-currency shop), *el agromercado* |
| 9 | `u09-ayer` | Ayer | A2 | preterite of regular verbs, *ir/ser* (fui, fue), *hacer*, *tener* | a Sunday at Abuela's: *dominó*, *pelota* on TV |
| 10 | `u10-el-viaje` | El viaje | A2 | *ir a* + infinitive, *querer/poder* + infinitive, weather | planning a trip to Cuba: *Varadero*, *La Habana*, *el aeropuerto* |
| 11 | `u11-las-tildes` | Las tildes | A2 | written accents: *tú/tu, él/el, sí/si, mí/mi, té/te, sé/se, más*; question words *qué, cómo, dónde, cuándo, quién, cuál* | texting Tía Marisol on WhatsApp |
| 12 | `u12-cuando-era-nino` | Cuando era niño | A2 | the imperfect (*era, vivía, jugaba, había*) | childhood in Hialeah; Abuela's childhood in Matanzas: *el bohío*, *el papalote*, *la quimbumbia* |
| 13 | `u13-los-cuentos-de-abuela` | Los cuentos de Abuela | B1 | preterite vs imperfect | how Cachita met Pepe at a *guateque*; the old *máquina* |
| 14 | `u14-la-cocina-cubana` | La cocina cubana | B1 | commands (*tú*, *usted*), *se* impersonal (*se pica, se fríe*) | *mojo*, *sofrito*, *picadillo*, *ropa vieja*, *yuca con mojo*, the *olla de presión* |
| 15 | `u15-la-carta` | Una carta a Cuba | B1 | spelling: b/v, h, c/s/z, ll/y, g/j; *hay/ahí/ay*, *a ver/haber*, *echo/hecho* | writing to Tía Marisol; sending a *paquete* |
| 16 | `u16-la-musica` | La música | B1 | *encantar, fascinar, molestar*; comparatives and superlatives | *son*, *salsa*, *bolero*, *danzón*, Celia Cruz (*¡Azúcar!*), Benny Moré, *el Buena Vista* |
| 17 | `u17-pelota-y-domino` | Pelota y dominó | B1 | the present perfect (*he jugado, ¿has visto?*) | *la pelota*, *el jonrón*, *ponchar*, the dominó tables of Calle Ocho, *el doble nueve* |
| 18 | `u18-la-salud` | La salud | B1 | *doler*, *tener que*, *deber*; *usted* at the doctor's | Abuelo's check-up, *la presión*, *el azúcar*, home remedies (*tilo*, *manzanilla*) |
| 19 | `u19-con-respeto` | Con respeto | B1 | *usted/ustedes*; *quisiera, ¿podría?*; the conditional | talking to Doña Ofelia, to elders, at an office; *la bendición* (*Bendición, abuela*) |
| 20 | `u20-nochebuena` | Nochebuena | B1 | the future (*será, habrá, vendrán*) | *el lechón*, *la caja china*, *turrones*, *las doce uvas*; *los quince* |
| 21 | `u21-los-consejos` | Los consejos de Abuela | B1 | present subjunctive: wishes and advice (*quiero que, ojalá, espero que*) | Abuela's advice on love, work and money |
| 22 | `u22-la-llamada` | La llamada | B2 | subjunctive: feelings and doubt (*me alegra que, dudo que, no creo que*) | a video call to Havana; *la conexión*, *los apagones* |
| 23 | `u23-refranes` | Refranes | B2 | *por* and *para*; set phrases | *Camarón que se duerme…*, *No hay mal que por bien no venga*, Cuban idioms (*estar en talla*, *coger lucha*, *tirar un cabo*) |
| 24 | `u24-la-historia` | La historia de la familia | B2 | the past perfect (*había salido*) | leaving Cuba: 1960s, Mariel (1980), the *balseros* (1994); *el exilio*, Miami |
| 25 | `u25-la-habana` | La Habana | B2 | relative clauses (*que, donde, quien, lo que, el cual*) | Daniel's first trip: *el Malecón*, *La Habana Vieja*, *el Capitolio*, *el Morro*, *el almendrón* |
| 26 | `u26-el-campo` | El campo | B2 | the passive and passive *se*; describing places | Viñales, *el guajiro*, tobacco and sugar cane, *la palma real*, *el tocororo* |
| 27 | `u27-marti` | José Martí | B2 | reading poetry; the imperfect subjunctive in reading | *Versos sencillos* (1891, public domain): *Yo soy un hombre sincero*, *Cultivo una rosa blanca*; *Guantanamera* |
| 28 | `u28-si-pudiera` | Si pudiera | B2 | *si* clauses: imperfect subjunctive and conditional | dreams: going back, bringing Marisol to Miami, opening a *paladar* |
| 29 | `u29-quien-soy` | ¿Quién soy? | B2 | reported speech (*dijo que…*); anglicisms and their Spanish (*llamar para atrás* → *devolver la llamada*, *aplicar* → *solicitar*) | being Cuban-American: Spanglish, *¿De dónde tú eres?*, identity |
| 30 | `u30-el-brindis` | El brindis | B2 | connectors (*sin embargo, aunque, por lo tanto, a pesar de que*); formal speech | Abuela's 80th birthday: Daniel's toast, in Spanish, to the whole family |

Units 1–10 are what most heritage speakers place out of. Each unit after them has five or six
lessons and a story, so a learner who places at unit 11 still has twenty units, about two thirds
of the course.

## Scenarios

| After | Scenario |
|---|---|
| u01 | Meeting Abuela Cachita's friends on her porch |
| u04 | Ordering at *la ventanita* of a Miami café |
| u08 | Shopping at an *agromercado* in Havana |
| u13 | Asking Abuelo Pepe how he met Abuela |
| u17 | Joining a dominó game on Calle Ocho |
| u19 | Calling a doctor's office for Abuelo, formally |
| u22 | A video call with Tía Marisol |
| u25 | Getting around Havana with a *botero* (shared-taxi driver) |
| u28 | Talking with Yunior about the future |
| u30 | Giving the toast at Abuela's birthday |
