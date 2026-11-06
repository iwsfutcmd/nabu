# es: Cuban Spanish for heritage speakers

A course in Cuban Spanish (`es-Latn-CU`) for people who grew up hearing it at home: they understand
a lot and speak "kitchen Spanish", but never studied it. It starts at A1, so anyone can take it,
and goes to B2. A placement test at the start ([ADR 0075](../../docs/adr/0075-adaptive-placement.md))
lets a heritage speaker skip what they already know. Thirty units: the first ten are the
everyday core, and the twenty after them are where a heritage speaker does most of their work
([ADR 0074](../../docs/adr/0074-cuban-spanish.md)).

Every sentence, story and scenario is an LLM draft (`llm:claude@…`, `status: draft`) awaiting a
native speaker's review. This file is the brief the drafts were written from.

## Who it is for, and what follows from that

- **Heritage speakers understand far more than they produce.** Listening and recognition come
  easily; the work is in production, spelling and the registers they never heard at home. So the
  course leans on typed production, and its placement test types its answers.
- **Their Spanish is Cuban, and the course respects it.** The canonical answers are what a Cuban
  family says (*guagua*, *¿Qué tú quieres?*, *ahorita*, *fruta bomba*). Pan-Hispanic forms are
  accepted too (*autobús*, *¿Qué quieres tú?*), and KC notes say where other countries differ.
  Nothing Cuban is "corrected" into another variety.
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
| **Mami (Lourdes)** and **Papi (Alberto)** | Daniel's parents. Lourdes was born in Miami; Alberto came from Cienfuegos as a boy. |
| **Abuela Cachita** (Caridad) | Lourdes's mother, born in Matanzas, came in the Mariel boatlift (1980). Cooks, tells stories, speaks in refranes. |
| **Abuelo Pepe** (José) | Cachita's husband, a retired mechanic. Pelota and dominó in the park on Calle Ocho. |
| **Tía Marisol** | Cachita's daughter who stayed in Cuba. Lives in Centro Habana; talks to the family on WhatsApp. |
| **Yunior** | Marisol's son, Daniel's cousin, 25, in Havana. Very Cuban speech. |
| **Yasiel** | Daniel's friend in Miami, arrived from Holguín two years ago. |
| **Doña Ofelia** | The neighbour in Hialeah, 80, whom everyone addresses as *usted*. |

## Conventions

- **Course:** `id: es`, target `es-Latn-CU`, one orthography `es-Latn/standard`, support `en`.
- **Unit files:** `units/uNN-<slug>.yaml`, unit ids `uNN`, node ids `es.uNN.<slug>`, sentence ids
  `s.uNN.<n>`, story ids `es.story.uNN` on a story node `es.uNN.story`, the last node of the unit.
- **KCs.**
  - `sense:<lemma>`: the lemma as written, accents and all (`sense:mamá`, `sense:café`). Verbs by
    infinitive (`sense:hablar`), reflexive verbs with -se (`sense:levantarse`), nouns in the
    singular, adjectives in the masculine singular. Words spelled alike differ by their accent
    (`sense:si` "if", `sense:sí` "yes"; `sense:el` "the", `sense:él` "he") or by a suffix
    (`sense:como.like`).
  - Articles and determiners by their masculine singular: `sense:el` (el, la, los, las),
    `sense:un`, `sense:este` (este, esta, estos, estas: *esta casa* is `sense:este`; *está* is
    `sense:estar`), `sense:mi` (mi, mis), `sense:su`.
  - Contractions are their own words: `sense:al`, `sense:del`.
  - A multi-word expression is one KC whose tokens all name it: *buenos días* is two tokens,
    each `sense: buenos-días`, with `forms: [buenos días]`. Keep these few; teach the words.
  - **Verb forms** go on the token as `form:` (Spanish is fusional; no morphs):

    | KC | Gloss |
    |---|---|
    | `form:pres-1s` … `form:pres-3p` | present: yo, tú, él/ella/usted, nosotros, ellos/ustedes (`1s 2s 3s 1p 3p`) |
    | `form:pret-1s` … `form:pret-3p` | preterite, by person |
    | `form:impf` | imperfect (all persons) |
    | `form:fut`, `form:cond` | future, conditional |
    | `form:subj`, `form:subj-past` | present and imperfect subjunctive |
    | `form:imp-tu`, `form:imp-ud`, `form:imp-neg` | commands: tú, usted/ustedes, negative |
    | `form:ger`, `form:part` | gerund (-ando, -iendo), past participle |

    An infinitive has no form. *Me levanto* is `me` (`sense:me`) and `levanto`
    (`sense:levantarse`, `form:pres-1s`). *Tengo* is `sense:tener`, `form:pres-1s`. The form KCs
    are defined in the unit that first teaches them.
  - Names are KCs (`sense:daniel`, `sense:cachita`).
  - Every KC has an English gloss. Use `notes` for the Cuban side: what Cubans say and others
    don't (*guagua*: "the bus in Cuba, Puerto Rico and the Canaries; *autobús* elsewhere"), how it
    is said (*para* is often *pa'*), and false friends.
- **i+1:** a sentence brings in at most one KC no earlier sentence used (default `iPlusOne`).
  Order the sentences of a node so each adds one.
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
  two `distractors`). Lines use only KCs taught up to that unit.
- **Scenarios** (roleplay with a model): about one every three units, in Cuban settings.
- **Provenance and license:** the course default (`llm:claude@…`, draft; CC-BY-SA-4.0). Authentic
  texts keep their own provenance (José Martí's *Versos sencillos*, 1891, public domain).

## Writing a unit

`units/u01-que-bola.yaml` is the model. Build with `cd pipeline && uv run nabu build ../courses/es
--check`; a unit is done when it has no errors and no warnings. What the linter catches most:

- **i+1** (`iPlusOne: 2` here): a new verb in a new tense is already two new KCs.
- **Duplicate answers** (`grading.duplicate`): accept sets are compared after normalization, which
  drops punctuation and case. Never vary only punctuation (`(,| )`, `[.]`), and do not list the
  displayed translation on its own line when a later line generates it too. Write one pattern whose
  first alternatives give the displayed form: `(I'm|I am) (fine|good|well).`
- **YAML:** quote any value in a flow mapping (`{en: …}`) that contains `?`, `:` followed by a
  space, `#`, brackets or braces, and any accept set that starts with `[`. Use `|-` blocks for
  multi-line accept sets.
- **Tokens:** every word of `text`, in order, exactly as written (capitals, accents); punctuation
  is not a token. Each has a `sense` (and a `form` on inflected verbs) that a unit up to this one
  defines and a node up to this one introduces.
- **Stories:** a `complete` line's `gap` must be the KC of exactly one word token of the line, and
  its distractors other KCs already taught.

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
