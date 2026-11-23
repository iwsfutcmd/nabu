# sk: Slovak (plan)

A course in standard Slovak (`sk-Latn`) for adult English speakers starting from nothing, A1 to B1 in
twenty units ([ADR 0155](../../docs/adr/0155-slovak.md), Proposed; the owner's answers of 2026-11-23 are
in it). This file is the brief the drafts will be written from;
[docs/gameplan-sk.md](../../docs/gameplan-sk.md) is the build order. Nothing here is built yet: the
course has no `course.yaml`, so no tool reads this directory.

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
- **Real Slovak to read at the end.** Units 16–20 each read a short passage of Dobšinský's folk tales
  (1881, public domain) beside their own story: the first Slovak a learner reads that was not written
  for learners.

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
| **Babka Betka** (Alžbeta) | 78, Lucka and Tereza's grandmother, in a village under the Malá Fatra. Keeps hens, cooks, and knows Dobšinský's tales by heart (units 16–20). |
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
    Gender: Masc}` (the -o default says neuter); *Banská Bystrica* is two
    tokens of one lexeme, both declining.
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
    Gender: Fem, Number: Sing}`, `n`, `head` and `rel` (UD's relation) written where a word agrees
    with another.
  - **Verbs:**

    | Token | `feats` |
    |---|---|
    | *Volám* (sa Lucka) | `{Mood: Ind, Number: Sing, Person: '1', Tense: Pres, VerbForm: Fin}` |
    | *nerozumiem* | `{Mood: Ind, Number: Sing, Person: '1', Polarity: Neg, Tense: Pres, VerbForm: Fin}` |
    | *urobím* (perfective: "I will do") | `{Mood: Ind, Number: Sing, Person: '1', Tense: Pres, VerbForm: Fin}` |
    | *varila* (som) | `{Gender: Fem, Number: Sing, Tense: Past, VerbForm: Part}` |
    | *som* (in *varila som*), AUX `lexeme:byť` | `{Mood: Ind, Number: Sing, Person: '1', Tense: Pres, VerbForm: Fin}` |
    | *budem* (robiť), AUX | `{Mood: Ind, Number: Sing, Person: '1', Tense: Fut, VerbForm: Fin}` |
    | *by* (som robil), AUX `lexeme:by` | `{Mood: Cnd}` |
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
  first teaches a case introduces it (`feature:Case=Acc` in `sk.u05.…`), as do the first plural
  (`feature:Number=Plur`, u04), the first past (`feature:Tense=Past`, u08) and the first
  masculine animate form that differs from an inanimate one (`feature:Animacy=Anim`, u04's
  *študenti*).
- **i+1:** at most two new lexemes or feature values a sentence (`iPlusOne: 2`); order each node's
  sentences so that each adds one or two.
- **Sentences:** about 30 a unit, short in units 1–10, longer from unit 11. Every sentence has
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
- **Provenance and license:** the course default (`llm:claude@…`, draft; CC-BY-SA-4.0). A Dobšinský
  passage keeps its own provenance (public domain; the 1881 edition, its page) and says what the
  course changed in it.

## The units

KK lessons, N units and M pages are where the grammar is described; nothing is copied from them.

| # | File | Title | CEFR | Grammar | Life | KK · N · M |
|---|---|---|---|---|---|---|
| 1 | `u01-ahoj` | Ahoj! | A1 | *byť* in the present (*som, si, je, sme, ste, sú*); personal pronouns; *volať sa*; *ty* and *vy*; yes-no questions; the letters and their marks | Lucka meets her new neighbours on the stairs, and pani Tóthová (*vy*): *Dobrý deň*, *Ahoj*, *Ďakujem*, *Prosím* | 1–2 · 1 · 12–16, 55 |
| 2 | `u02-odkial-si` | Odkiaľ si? | A1 | the present of the regular classes (*volám*, *hovorím*, *rozumiem*, *študujem*); negation with *ne-*, and *nie som*; numbers 0–10 | Tereza's classmates in Bratislava: countries, nationalities (*Poľka*, *Maďar*, *Slovenka*), languages (*po slovensky*) | 2 · 1–2 · 78–84 |
| 3 | `u03-u-nas-doma` | U nás doma | A1 | gender; adjectives in the nominative (*pekný*, *cudzí*); *ten, tá, to*; *môj, tvoj, jeho, jej, náš, váš, ich*; *čí? aký? ktorý?* | the sisters' flat: rooms and furniture | 3 · 3 · 46–53, 57–58 |
| 4 | `u04-zilina` | Žilina | A1 | the nominative plural (*študenti*, *domy*, *ženy*, *mestá*); *dva, dve, dvaja*, *tri*, *štyri*; *mať* | the square, shops, jobs (*učiteľ* / *učiteľka*, *lekár* / *lekárka*) | 4 · 10 · 27–45 |
| 5 | `u05-narodeniny` | Narodeniny | A1 | the accusative singular (*vidím brata*, *vidím dom*); *mať rád* / *rada*; *chcieť*, *môcť*, *musieť*; *ísť* and *na* + accusative; colours | Samko's birthday: buying a present | 5 · 3, 5 · 99–105 |
| 6 | `u06-koliba` | V kolibe | A1 | the instrumental (*s*, *pred*, *za*, *nad*, *pod*, *medzi*; *vlakom*); *žiť*, *niesť*, *pozvať* | lunch in the Vrátna valley: *bryndzové halušky*, *kapustnica*, *kofola* | 6 · 6–7 · 27–45 |
| 7 | `u07-moj-den` | Môj deň | A1 | reflexive verbs (*umývať sa*, *učiť sa*); *spať*, *vidieť*, *stretnúť*; the time (*o ôsmej*); days | Lucka's shift at the hospital; Samko's school day | 7, 9 · 12 · 56, 72 |
| 8 | `u08-vcera` | Včera | A2 | the past (*bol som*, *bola som*, *boli sme*); *už*, *ešte*; the past negated | Lucka's and Dominik's weekend | 7 · 6 · 73, 85 |
| 9 | `u09-kde-byvas` | Kde bývaš? | A2 | the locative (*v*, *na*, *o*, *po*, *pri*); where and where to (*na námestí*, *na námestie*); months, dates, ordinals | Tereza looks for a flat in Bratislava | 8 · 5, 15 · 99–105 |
| 10 | `u10-tatry` | Výlet do Tatier | A2 | the genitive singular (*do*, *z*, *od*, *u*, *bez*, *okolo*, *vedľa*); weather and seasons (*je teplo*, *je zima*; *je mi zima* waits for the dative) | a weekend in the High Tatras: Štrbské Pleso, a mountain hut | 10 · 4, 6 · 27–45 |
| 11 | `u11-zajtra` | Čo urobíš zajtra? | A2 | aspect pairs; the future (*budem robiť*, *urobím*) | the week ahead; phoning | – · 8 · 75–76, 88 |
| 12 | `u12-darcek` | Darček pre babku | A2 | the dative (*k*, *proti*, *vďaka*); *páčiť sa*, *chutiť*; *mi, ti, mu, jej, nám, vám, im*; *dať*, *pomôcť* | visiting babka Betka: her hens, her garden | – · 4–5 · 55 |
| 13 | `u13-vianoce` | Vianoce | A2 | the genitive plural (*päť bratov*, *veľa ľudí*, *málo času*); numbers 5–100 | Christmas Eve at babka's: *oblátky*, *kapustnica*, *kapor*, *koledy* | – · 10–11 · 31–45 |
| 14 | `u14-trh` | Na trhu | A2 | the dative, locative and instrumental plural; quantities (*kilo*, *desať deka*, *fľaša*); euros and cents | the market | – · 11 · 31–45 |
| 15 | `u15-chod-rovno` | Choď rovno! | A2 | the imperative (*choď*, *poď*, *daj*, *sadni si*; *poďme*, *robte*); *sedieť* / *sadnúť si*, *ležať* / *ľahnúť si* | directions; Easter Monday | – · 9–10 · 91 |
| 16 | `u16-hokej` | Hokej | B1 | the pronouns in every case, long and short (*mňa* / *ma*, *jeho* / *ho* / *neho*); the order of clitics | Dominik's Thursday game, Samko's first match; the world title of 2002. Passage: *Kozliatka* | – · 12–13 · 55–56, 132 |
| 17 | `u17-cestujeme` | Cestujeme | B1 | verbs of motion (*ísť* / *chodiť*, *niesť* / *nosiť*, *viezť* / *voziť*); prefixes (*prísť*, *odísť*, *vyjsť*, *prejsť*, *dôjsť*) | by train to Košice; eastern Slovak's stress, a note. Passage: *Ako šlo vajce na vandrovku* | – · 13–14 · 72, 88 |
| 18 | `u18-najlepsi` | Lepší, najlepší | B1 | comparison of adjectives and adverbs (*lepší*, *väčší*, *najkrajší*; *lepšie*, *radšej*); soft adjectives; the points of the compass | Bratislava, Košice and Žilina compared. Passage: *Múdra žena* | – · 14 · 49–50, 97 |
| 19 | `u19-keby` | Keby som… | B1 | the conditional (*by*); *keby*, *aby*; possessive adjectives (*otcov*, *mamin*); years | Tereza after her studies; Simona's plans for the café. Passage: *O dvanástich mesiačkoch* | – · 15 · 51–53, 73–74 |
| 20 | `u20-rozpravky` | Rozprávky | B1 | the passive (*boli zapísané*, *predáva sa*); verbal adjectives; *všetci*, *každý*, *treba*; letters | how the tales were collected and written down; Dobšinský, Štúr and standard Slovak. Passage: *Kubove príhody* | – · 14–16 · 72–73 |

KK's lesson 10 is a review; its grammar is in units 1–9 here. Units 1–10 are about A1, 11–15 A2, 16–20
the start of B1, as Naughton's course ends.

## The passages (units 16–20)

- **Source:** Pavol Dobšinský, *Prostonárodnie slovenské povesti* (Turčiansky Svätý Martin, 1880–1883),
  in Google's scans of two of its volumes dated 1881 on archive.org (`prostonrodniesl00dobgoog`,
  `prostonrodniesl01dobgoog`). Public domain: Dobšinský died in 1885. The tales named above are in
  those scans (*Kozliatka* in the first's contents, the other four as headings in the second); which
  tale goes with which unit is settled when the unit is drafted, by its grammar and its length.
- **Text:** taken from the scan's text and every word checked on the page image, then written into the
  unit by a script, never typed from memory (as es's Martí verses were).
- **Spelling:** today's. The 1881 spelling differs in places (*jich* for *ich*; the rest is read off the
  page, since the scan's OCR loses marks as well), and some lines keep a dialect's forms: the course
  modernizes the spelling, keeps the words, and lists each change in the story's notes. A tale written in
  a dialect is not used.
- **Size:** an excerpt of about 12–25 lines, a story of its own on the unit's last node, after the
  unit's own story. Its new words are taught by the unit's lessons until ADR 0144's passages are built;
  then they are read first.

## Scenarios

| After | Scenario |
|---|---|
| u01 | Introducing yourself to pani Tóthová, the neighbour downstairs (formal) |
| u04 | Asking the way to the square |
| u06 | Ordering at a *koliba* |
| u09 | Viewing a flat with its owner (formal) |
| u12 | Buying a present at a Christmas market |
| u15 | At the doctor's with Samko (formal) |
| u17 | Buying a train ticket to Košice |
| u20 | Asking babka for the tale she liked best as a girl |
