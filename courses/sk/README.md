# sk: Slovak

A course in standard Slovak (`sk-Latn`) for adult English speakers starting from nothing, A1 to B1 in
twenty units ([ADR 0155](../../docs/adr/0155-slovak.md), Proposed; the owner's answers of 2026-11-23 are
in it). This file is the brief the drafts were written from, brought up to what was built;
[docs/gameplan-sk.md](../../docs/gameplan-sk.md) is the build order and says where each stage stands.
All twenty units are drafted (555 sentences, 459 lexemes; LLM drafts, status draft) and compile clean;
[REVIEW.md](../REVIEW.md#sk-slovak) lists what a native reviewer should look at first.

The unit files and the lexicon were first written by a generator kept in the library
(`nabu/notes/sk/generator`: a compact source per unit, the paradigms, and the analysis of every token);
they are sources now, edited here directly, as every course's are.

The grammar's order and every form come from the library's three Slovak books (facts only, never
their sentences, dialogues or characters):

- **KK**: Kamenárová et al., *Krížom-krážom: Slovenčina A1* (Studia Academica Slovaca, 2009). Ten
  lessons; units 1–10 take its order.
- **N**: Naughton, *Colloquial Slovak*, 2nd ed. (Routledge, 2012). Sixteen units; units 11–20 take
  the order of its later ones.
- **M**: Mistrík, *A Grammar of Contemporary Slovak*, 2nd ed. (SPN, 1988). The paradigms every form
  is checked against; page numbers below are its printed pages.

## Who it is for, and what follows from that

- **An English speaker with no Slavic language.** Everything is new: cases, aspect, a past that
  agrees with who speaks, clitics. So the course brings the cases in one at a time (nominative,
  accusative, instrumental, locative, genitive, then the dative), each first in the singular, and
  the plural's other cases only once all six are known.
- **The marks are part of the spelling**, and all four carry sound: the acute is length (*pas*
  "passport", *pás* "belt"), the caron another consonant (*cas*, *čas*). Left out, they are wrong, as
  in Spanish (ADR 0148). Unit 1 says so, and the keyboard hint asks for a Slovak keyboard (ADR 0143).
- **What Slovak children learn to spell is what the learner will miss**: i or y after b, m, p, r, s,
  v, z (*byť*, *biť*; *my*, *mi*), d t n l before i and e (said soft, written plain), ä after labials,
  voiced consonants written where they are said voiceless (*hrad*, *všetko*). The profile states these
  as sound-alike spellings, so the right sound with the wrong letter is an orthographic miss, and
  spelling-choice cards ask them (ADR 0142, 0148).
- **A woman says other words than a man.** Lucka and Dominik say the same things in pairs
  (*Bola som v Bratislave.* / *Bol som v Bratislave.*), and the course speaks to men, to women and to
  several people (ADR 0075).
- **Real Slovak to read at the end.** Unit 17's story is the start of one of Dobšinský's folk tales,
  *Ako šlo vajce na vandrovku* (1881, public domain): the first Slovak a learner reads that was not
  written for learners. Unit 20 says how the tales were collected.

## The people

Everyday scenes in Žilina, with people who come back from unit to unit, as the other courses have
them (fa's Maryam and Ali, apc's Sami, Maya and Teta): no stand-in for the learner and no plot to
follow. Every name is the course's own, none taken from the books.

| Who | |
|---|---|
| **Lucka** (Lucia) | 24, a nurse at the hospital. Shares a flat in the old town with her sister. |
| **Tereza** | 21, Lucka's sister, studies in Bratislava and comes home at weekends. |
| **Dominik** | 26, Lucka's boyfriend, an electrician; hockey with friends on Thursdays. |
| **Simona** and **Rudo** (Rudolf) | 36 and 39, the new neighbours across the landing. She runs a small café; he drives a trolleybus. |
| **Samko** (Samuel) | 9, their son: hockey, and questions about everything. |
| **Babka** | 78, Lucka and Tereza's grandmother, in a village under the Malá Fatra. Keeps hens, cooks, and knows Dobšinský's tales by heart. |
| **Liam** | Tereza's Irish classmate in Bratislava; learns Slovak, as the learner does. |
| **Pani Tóthová** | About 70, the neighbour downstairs. Everyone says *vy* to her. |
| **Doktor Baláž** | The paediatrician Simona takes Samko to; *vy*. |

Women and men speak alike often: Lucka and Tereza, Simona, babka and pani Tóthová; Dominik, Rudo,
Samko and the doctor. *Ty* among friends, family and children; *vy* to one person politely (pani
Tóthová, the doctor, a shopkeeper, a flat's owner) and to several (the sisters together, Simona and
Rudo).

## Conventions

- **Course:** `id: sk`, target `sk-Latn`, one orthography `sk-Latn/standard`, support `en`, lexicon
  `sk`. `iPlusOne: 2`, `wordParts: true`.
- **Unit files:** `units/uNN-<slug>.yaml`, unit ids `uNN`, node ids `sk.uNN.<slug>`, sentence ids
  `s.uNN.<n>`, story ids `sk.story.uNN` on a story node `sk.uNN.story`, the last node of the unit.
- **Lexicon:** `lexicons/sk/lexemes.yaml`, one flat list sorted by id that names no unit;
  `lexicons/sk/language.yaml` for the dimensions, features, defaults, labels and registers.
- **Lexemes.**
  - An entry has an `id`, its UD `pos`, its `gloss`, and its spelling (`spelled`, the lemma first):

    ```yaml
    - id: lexeme:dom
      pos: NOUN
      gloss: {en: 'house; home'}
      spelled: {sk-Latn/standard: [dom]}
    ```

  - `lexeme:<lemma>` with its marks (`lexeme:byť`, `lexeme:ďakovať`, `lexeme:pekný`). Nouns in the
    nominative singular (pluralia tantum in the plural: `lexeme:dvere`, `lexeme:Tatry`), adjectives
    in the masculine nominative singular, verbs by the infinitive. Words spelled alike take a suffix
    by sense, as es's do.
  - **Aspect partners are two lexemes**, each storing its aspect and noting the other:
    `lexeme:robiť` `{Aspect: Imp}`, `lexeme:urobiť` `{Aspect: Perf}`. No default gives aspect, so every
    verb stores it.
  - **Reflexive verbs** are cited with their clitic: `lexeme:volať-sa`, spelled `[volať sa]`; the
    clitics are `lexeme:sa` and `lexeme:si` (PRON, `{PronType: Prs, Reflex: 'Yes'}`).
  - **Pronouns** are one lexeme with all their forms: `lexeme:ja` writes *ja, mňa, ma, mne, mi,
    mnou*; `lexeme:on` writes *on, jeho, ho, neho, mu, jemu, ňom, ním*. `lexeme:ten` writes every form
    of *ten, tá, to*; `lexeme:môj` every form of *môj, moja, moje*.
  - **A noun's gender, and animacy in the masculine,** is its lexeme's. `language.yaml`'s `defaults`
    give it by the ending (a consonant: masculine inanimate; -a feminine; -o, -e, -ie neuter; -osť
    feminine). Write `feats` only where no default gives it or the default is wrong: every masculine
    person or animal `{Animacy: Anim}` (*brat*, *učiteľ*, *pes*); *hrdina*, *kolega* `{Animacy: Anim,
    Gender: Masc}`; *dievča* `{Gender: Neut}`; *dlaň*, *jeseň* `{Gender: Fem}`. A man and a woman are
    two nouns (*učiteľ*, *učiteľka*; *kamarát*, *kamarátka*), two lexemes as UD has them: no noun
    chooses its gender.
  - Names are lexemes (`pos: PROPN`) with their gender and animacy as nouns have them: *Lucka*,
    *Simona* by the -a default; *Dominik* `{Animacy: Anim}`; *Rudo* and *Samko* `{Animacy: Anim,
    Gender: Masc}` (the -o default says neuter); *Dobšinský* `{Animacy: Anim, Gender: Masc}`, a surname
    declined as an adjective.
  - Prepositions are ADP lexemes, their vocalized forms spelled variants: `lexeme:v` `[v, vo]`,
    `lexeme:s` `[s, so]`, `lexeme:z` `[z, zo]`, `lexeme:k` `[k, ku]`.
  - Every lexeme has an English gloss. `notes` say what a learner needs and the gloss cannot: the
    aspect partner, a case a verb or preposition takes (*pomáhať* + dative; *na* + accusative for
    where to, + locative for where), a Czech word a learner will hear.
- **Tokens** name the lexeme they write and the feature values chosen there, never the lexeme's own.
  - **Nouns** choose case and number: *brata* in *Mám brata.* is `{surface: brata, lexeme: brat,
    feats: {Case: Acc, Number: Sing}}`.
  - **Adjectives, determiners, pronouns and numerals** choose what they agree in, every value
    written, animacy wherever the gender is masculine:

    | `feats` | | |
    |---|---|---|
    | `{Animacy: Inan, Case: Nom, Gender: Masc, Number: Sing}` | masculine | *pekný dom*, *ten stôl* |
    | `{Animacy: Anim, Case: Acc, Gender: Masc, Number: Sing}` | masculine animate, accusative | *dobrého brata* |
    | `{Case: Nom, Gender: Fem, Number: Sing}` | feminine | *pekná izba*, *tá žena* |
    | `{Case: Nom, Gender: Neut, Number: Sing}` | neuter | *pekné mesto* |
    | `{Animacy: Anim, Case: Nom, Gender: Masc, Number: Plur}` | men, or men and women | *dobrí študenti*, *dvaja bratia* |
    | `{Animacy: Inan, Case: Nom, Gender: Masc, Number: Plur}` | masculine inanimate plural | *pekné domy*, *dva stoly* |
    | `{Case: Nom, Gender: Fem, Number: Plur}` | feminine plural | *pekné izby*, *dve ženy* |

    The form is the word's agreement in its line: *Lucka je unavená.* has `unavená` `{Case: Nom,
    Gender: Fem, Number: Sing}`. No token writes `n`, `head` or `rel` yet: the agreement was settled
    when the line was drafted, and a reviewer checks it as written.
  - **Comparatives and superlatives** are their adjective's forms (`{Degree: Cmp}`, `{Degree: Sup}` beside
    the agreement): *väčšia* is `lexeme:veľký`, *najlepšiu* `lexeme:dobrý`; an adverb's too (*lepšie*,
    `lexeme:dobre`; *viac*, `lexeme:veľa`).
  - **The passive participle** is its verb's form, declined as an adjective: *zapísané* in *Rozprávky boli
    zapísané.* is `lexeme:zapísať` `{Case: Nom, Gender: Fem, Number: Plur, VerbForm: Part, Voice: Pass}`.
  - **Verbs:**

    | Token | `feats` |
    |---|---|
    | *Volám* (sa Lucka) | `{Mood: Ind, Number: Sing, Person: '1', Tense: Pres, VerbForm: Fin}` |
    | *nerozumiem* | `{Mood: Ind, Number: Sing, Person: '1', Polarity: Neg, Tense: Pres, VerbForm: Fin}` |
    | *urobím* (perfective: "I will do") | `{Mood: Ind, Number: Sing, Person: '1', Tense: Pres, VerbForm: Fin}` |
    | *varila* (som) | `{Gender: Fem, Number: Sing, Tense: Past, VerbForm: Part}` |
    | *som* (in *varila som*), AUX `lexeme:byť` | `{Mood: Ind, Number: Sing, Person: '1', Tense: Pres, VerbForm: Fin}` |
    | *budem* (robiť), AUX | `{Mood: Ind, Number: Sing, Person: '1', Tense: Fut, VerbForm: Fin}` |
    | *by* (som robil), AUX `lexeme:by` | `{Mood: Cnd}`; the -l form with it keeps `Tense: Past`, as UD tags it |
    | *Choď!* | `{Mood: Imp, Number: Sing, Person: '2', VerbForm: Fin}` |
    | *robiť* | `{VerbForm: Inf}` |

    *byť* is AUX everywhere (UD tags it so as copula and auxiliary, the uses the course has; one tag a
    lexeme, ADR 0145). *nie som* is two tokens, *nie* a particle (`lexeme:nie`).
- **What a learner is told a form is** comes from `labels` in `language.yaml`, for example:

  | `feats` | `gloss` |
  |---|---|
  | `{Case: Acc, Number: Sing}` | accusative: the object (whom? what?), and where to after *na*, *do*… |
  | `{Case: Loc, Number: Sing}` | locative: after *v*, *na*, *o*, *po*, *pri* (where? about what?) |
  | `{Case: Ins, Number: Sing}` | instrumental: with (*s*), by (*vlakom*), after *pred*, *za*, *nad*, *pod* |
  | `{Case: Gen, Number: Plur}` | genitive plural: of, and after *päť*, *veľa*, *málo* |
  | `{Mood: Ind, Number: Sing, Person: '1', Tense: Pres, VerbForm: Fin}` | present tense: I (ja) |
  | `{Gender: Fem, Number: Sing, Tense: Past, VerbForm: Part}` | past tense: she, or I or you, a woman (bola, robila) |
  | `{Animacy: Anim, Case: Nom, Gender: Masc, Number: Plur}` | plural, men (or men and women): *dobrí*, *dvaja* |

  A perfective verb's present form says the future; until a label can read the lexeme's aspect (the
  gameplan's stage 2), its note says so.
- **Nodes:** a node's `introduces` lists the lexemes and feature values it teaches. The node that
  first teaches a feature value introduces it: the negative (`feature:Polarity=Neg`, u02), the
  feminine and neuter (u03), the plural and the masculine animate (u04's *študenti*), the accusative
  (u05), instrumental (u06), past (u08), locative (u09), genitive (u10), future (u11), dative (u12),
  imperative (u15), comparative and superlative (u18), conditional (u19) and passive (u20).
- **i+1:** at most two new lexemes or feature values a sentence (`iPlusOne: 2`); order each node's
  sentences so that each adds one or two.
- **Sentences:** 17 to 40 a unit (555 in all), short in units 1–10, longer from unit 11. Every sentence has
  `reverse` (the Slovak accept set) and `translations.en` (the English one, displayed form first).
  - `[Ja] som Lucka.`: the subject pronoun optional, as Slovak drops it.
  - Every word order whose translation would be the prompt (ADR 0085), the clitics (*som, si, sa,
    mi, ti, mu, ho, ju, by*) always second: *Volám sa Lucka.* and *Lucka sa volám.*, never
    *Sa volám Lucka.*
  - Both aspects where the English does not decide (*I wrote a letter*: *písal som list*, *napísal
    som list*); one where it does (*I was writing a letter*: imperfective only).
  - English: *a* and *the* wherever the Slovak says neither; *this* and *that* both for *ten*,
    *tá*, *to* where the English would use either.
  - `persons: {speaker: m|f, addressee: m|f|pl}` wherever the Slovak marks it and the English does not,
    with the accept set kept to the forms that fit. `register: formal` for polite *vy* to one person,
    with the addressee's gender (*Boli ste unavená?*).
- **Stories:** one a unit on its last node, 10–16 lines with the cast, two or three `choose`
  questions, one or two `ask: arrange`, one or two `ask: complete` (ADR 0132: a wrong word makes the
  line false or absurd, a wrong form makes it ungrammatical, never another line it takes). Lines use
  only what the unit and the units before teach.
- **Scenarios** (roleplay with a model): about one every two or three units, in Slovak settings.
- **Provenance and license:** the course default (`llm:claude@…`, draft; CC-BY-SA-4.0). The Dobšinský
  passage is marked as grc's Perseus passages are: its story's title names the source, and the unit
  file's header says where it is (the 1881 edition, its page) and what the course changed in it.

## The units

KK lessons, N units and M pages are where the grammar is described; nothing is copied from them.

| # | File | Title | CEFR | Grammar | Life | KK · N · M |
|---|---|---|---|---|---|---|
| 1 | `u01-ahoj` | Ahoj! | A1 | *byť* in the present (*som, si, je, sme, ste, sú*); personal pronouns; *volať sa*, *mať sa*; *ty* and *vy* | Lucka meets her new neighbours on the stairs, and pani Tóthová (*vy*): *Dobrý deň*, *Ahoj*, *Ďakujem*, *Prosím* | 1–2 · 1 · 12–16, 55 |
| 2 | `u02-odkial-si` | Odkiaľ si? | A1 | the present of the regular classes (*hovorím*, *rozumiem*, *študujem*, *učím sa*); negation with *ne-*, and *nie som*; numbers to ten | Tereza's classmates in Bratislava (Liam among them): countries, nationalities (*Poľka*, *Maďar*, *Slovenka*), languages (*po slovensky*) | 2 · 1–2 · 78–84 |
| 3 | `u03-u-nas-doma` | U nás doma | A1 | gender; adjectives in the nominative (*pekný*, *krásny*); *ten, tá, to*; *môj, tvoj, jeho, jej, náš, váš, ich*; *čí? aký? ktorý?* | the sisters' flat: rooms and furniture | 3 · 3 · 46–53, 57–58 |
| 4 | `u04-zilina` | Žilina | A1 | the nominative plural (*študenti*, *domy*, *ulice*, *mestá*); *dva, dve, dvaja*, *tri*, *štyri*; *mať* | the town, jobs (*učiteľ* / *učiteľka*, *lekár* / *lekárka*) | 4 · 10 · 27–45 |
| 5 | `u05-narodeniny` | Narodeniny | A1 | the accusative singular (*mám brata*, *mám knihu*); *mať rád* / *rada*; *chcieť*, *môcť*, *musieť*, *kúpiť*; *ísť* and *na* + accusative; colours | Samko's birthday: buying a present | 5 · 3, 5 · 99–105 |
| 6 | `u06-koliba` | V kolibe | A1 | the instrumental (*s*, *pred*, *za*, *nad*, *pod*; *vlakom*); *dať si*, *jesť*, *piť*, *žiť*, *niesť*, *pozvať* | lunch at a *koliba*: *halušky*, *kapustnica*, *kofola* | 6 · 6–7 · 27–45 |
| 7 | `u07-moj-den` | Môj deň | A1 | reflexive verbs (*umývať sa*, *obliekať sa*, *ponáhľať sa*); *spať*, *vidieť*, *stretnúť*; the time (*o šiestej*); days | Lucka's day at the hospital; Samko's school day | 7, 9 · 12 · 56, 72 |
| 8 | `u08-vcera` | Včera | A2 | the past (*bol som*, *bola som*, *boli sme*), negated (*nebol*, *nič … ne-*); *už*, *ešte* | Lucka's and Dominik's weekend, a woman's and a man's sentences side by side | 7 · 6 · 73, 85 |
| 9 | `u09-kde-byvas` | Kde bývaš? | A2 | the locative (*v*, *na*, *o*, *po*, *pri*); where and where to (*na námestí*, *na námestie*); months, ordinals and floors | Tereza looks for a flat in Bratislava | 8 · 5, 15 · 99–105 |
| 10 | `u10-tatry` | Výlet do Tatier | A2 | the genitive singular (*do*, *z*, *od*, *u*, *bez*, *okolo*, *vedľa*); weather and seasons | a weekend in the High Tatras, a mountain hut | 10 · 4, 6 · 27–45 |
| 11 | `u11-zajtra` | Čo urobíš zajtra? | A2 | the future (*budem robiť*); aspect pairs (*písať* / *napísať*, *robiť* / *urobiť*, *kupovať* / *kúpiť*); a perfective's present says the future | the week ahead | – · 8 · 75–76, 88 |
| 12 | `u12-darcek` | Darček pre babku | A2 | the dative (*k*; *mi, ti, mu, jej, nám, vám, im*); *páčiť sa*, *chutiť*; *je mi zima*; *dať*, *pomôcť* | visiting babka in her village | – · 4–5 · 55 |
| 13 | `u13-vianoce` | Vianoce | A2 | the genitive plural (*päť darčekov*, *veľa ľudí*, *málo času*); numbers to a hundred | Christmas Eve at babka's: *oblátky*, *kapustnica*, *kapor*, *koledy* | – · 10–11 · 31–45 |
| 14 | `u14-trh` | Na trhu | A2 | the dative, locative and instrumental plural (*k ľuďom*, *na trhoch*, *s jablkami*); quantities (*kilo*, *fľaša*); euros | the market | – · 11 · 31–45 |
| 15 | `u15-chod-rovno` | Choď rovno! | A2 | the imperative (*choď*, *poď*, *daj*, *sadni si*; *poďme*, *choďte*; *nechoď*); *sedieť* / *sadnúť si*, *ležať* / *ľahnúť si* | directions in Žilina; Easter eggs | – · 9–10 · 91 |
| 16 | `u16-hokej` | Hokej | B1 | the pronouns in every case, long and short (*mňa* / *ma*, *jeho* / *ho* / *neho*), after prepositions (*pre mňa*, *o ňom*, *s nami*); the order of clitics (*dal som ti ho*) | Dominik's Thursday hockey; a match at the rink | – · 12–13 · 55–56, 132 |
| 17 | `u17-cestujeme` | Cestujeme | B1 | verbs of motion (*ísť* / *chodiť*, *niesť* / *nosiť*, *viezť* / *voziť*; *pôjdem*); *prísť*, *odísť* | by train; the story is Dobšinský's *Ako šlo vajce na vandrovku* | – · 13–14 · 72, 88 |
| 18 | `u18-najlepsi` | Najlepší | B1 | comparison of adjectives and adverbs (*lepší*, *väčší*, *najkrajší*; *lepšie*, *viac*, *radšej*); *než*, *ako*; the points of the compass | Slovakia's towns, mountains and rivers compared | – · 14 · 49–50, 97 |
| 19 | `u19-keby` | Keby | B1 | the conditional (*by*: *chcel by som*, *mohli by ste*); *keby*, *aby* | polite requests; Tereza and Simona on a lottery win | – · 15 · 73–74 |
| 20 | `u20-rozpravky` | Rozprávky | B1 | the passive participle (*boli zapísané*, *bola vydaná*); *treba*; *nikto* with a negative verb; *vedieť* | how Dobšinský's tales were collected and published; babka's favourite | – · 14–16 · 72–73 |

KK's lesson 10 is a review; its grammar is in units 1–9 here. Units 1–7 are about A1, 8–15 A2, 16–20
the start of B1, as Naughton's course ends.

Left out of the plan's units, for a later pass: soft adjectives as a topic of their own (*cudzí*),
possessive adjectives (*otcov*, *mamin*), years and dates in full, *všetci*, the reflexive passive
(*predáva sa*), and eastern Slovak's stress. Each needs forms the generator did not make, or a reviewer's eye
on what the course's speakers would say.

## The passage (unit 17)

- **Source:** Pavol Dobšinský, *Prostonárodnie slovenské povesti* (Turčiansky Svätý Martin, 1880–1883),
  in Google's scan of a volume dated 1881 on archive.org (`prostonrodniesl01dobgoog`), page 75. Public
  domain: Dobšinský died in 1885.
- **One tale, not five.** The plan named a tale for each of units 16–20. Read on the page images,
  *Kozliatka* and *O dvanástich mesiačkoch* keep too many older and regional forms for a B1 reader (the
  others were not read closely); *Ako šlo vajce na vandrovku*, after a few words to the reader, tells its
  start in short lines a B1 learner can read, so unit 17's story is that paragraph (thirteen lines), and
  unit 20 says where it came from. Further passages can follow
  once ADR 0144's reading of passages is built.
- **Text:** read off the page image, word for word. **Spelling:** today's: *jim* is *im*; *tyže* and
  *vyže* are *ty že*, *vy že*; the nested quotation marks are „ “; a question mark after *A ty že kde*,
  which the page leaves without one. The words are the tale's, *kde* for
  where to (*Kde ty ideš?*) and *rečie* (says) among them; the lessons teach *kam*, and *riecť*'s note
  says the tales use it. The unit file's header lists the changes.
- Its new words (*vandrovka*, *rak*, *kačica*, *riecť*, *veď*, *tretica* …) are taught by unit 17's
  lessons before the story.

## Scenarios

| After | Scenario |
|---|---|
| u01 | Meeting pani Tóthová, the neighbour downstairs (formal) |
| u04 | Asking the way |
| u06 | Ordering at a *koliba* |
| u09 | Viewing a flat with its owner (formal) |
| u13 | Buying a present at a Christmas market |
| u15 | At the doctor's with Samko (formal) |
| u17 | Buying a train ticket |
| u18 | Choosing a trip at a travel agency |
| u19 | Making weekend plans with Tereza |
| u20 | Asking babka for the tale she liked best |
