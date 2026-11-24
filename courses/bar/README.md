# bar: South Tyrolean

A course in the South Tyrolean dialect (`bar-Latn-IT`: Bavarian, as ISO 639-3 counts the South Bavarian dialects) for
adult English speakers starting from nothing, A1 to early A2 in ten units
([ADR 0156](../../docs/adr/0156-south-tyrolean.md), Proposed; the owner left its questions to Claude, 2026-11-23:
"whatever, just go wild"). This file is the brief the drafts were written from;
[docs/gameplan-bar.md](../../docs/gameplan-bar.md) is the build order. All ten units are drafted (374 sentences, 269
lexemes; LLM drafts, status draft) and compile clean; [REVIEW.md](../REVIEW.md#bar-south-tyrolean) lists what a
native reviewer should look at first.

The unit files and the lexicon were first written by a generator kept in the library (`nabu/notes/bar/generator`: a
compact source per unit, the lexicon with every form, and the rules that analyse each token); they are sources now,
edited here directly, as every course's are.

Facts come from the library's two books (facts only, never their sentences or definitions), and the rest is Claude's,
marked REVIEW:

- **Moser**, *Wörterbuch der Südtiroler Mundarten* (Haymon, 2015): the spelling (its appendix), the words Standard
  German lacks (Marende, Knedl, Schittlbrot, lei, decht, gell, Pfinztig, Mamme, Tatte, Bua, Madl), and the forms its
  examples show (bisch, hosch, isch; es and enk with -ts; kimm, kimp; gian, geat; war, which the course writes wor; tat, hatt). Cited by headword.
- **Weiß**, *Syntax des Bairischen* (1998): Central Bavarian, not Tyrolean; only where it states a rule for Bavarian as
  a whole (no genitive; the article with names; clitic pronouns).

What neither book gives, and so Claude drafted: full paradigms (woaß, kinnen, the oblique pronouns), the numbers,
attributive adjective endings, word order beyond Standard German's. A reviewer should start there.

## Who it is for, and what follows from that

- **An English speaker who wants to talk with South Tyroleans**, in the language they speak to one another. Standard
  German is what South Tyroleans write and hear on the news; the dialect is what they speak, at home, at work, in
  the bar and in text messages. A German course would not teach it.
- **No norm, so no spelling is "wrong" that people really write.** The course writes one spelling per word (Moser's,
  without his stress marks), and the profile accepts the everyday variants as free spellings (ADR 0148): gessen for
  gessn, griass for griaß, wie for wia, bischt for bisch, an å for the course's o. Standard German forms (Tag for Tog,
  ich habe for i hon) are another variety and wrong.
- **The central forms.** Every valley says things its own way (Moser: Stoan, Stuan, Stan). The course writes the
  forms Moser files his entries under, the most widespread, which come to Bozen's and the Eisacktal's; the other
  valleys' forms are notes, and a learner who meets them will understand them.
- **The voices are real South Tyroleans' voices**, cloned (ADR 0156): a woman from Bozen and a man from Meran, from
  the VinKo Corpus. No model speaks the dialect, so the clips are a stopgap (`audio.quality: iffy`): heard once a card
  is answered, never asked to be understood alone.

## The people

Everyday scenes in Bozen and on a farm on the Ritten, the plateau above it, with people who come back from unit to
unit: no stand-in for the learner and no plot to follow.

| Who | |
|---|---|
| **Lena** | 26, a nurse at the hospital in Bozen. Lives in a flat in an apartment building (a Kondominium). |
| **Giulia** | 25, her new colleague, from an Italian-speaking family in Bozen; learning the dialect, as the learner is. |
| **Hannes** | 23, Lena's brother; comes home at weekends and turns up late to every Marende. |
| **Oma** | Lena's grandmother, on a farm on the Ritten: Marende in the Stube, a dog, a cat. |
| **Luis** | About fifty, runs the coffee bar on the corner and knows his regulars by name. |
| **Flori** | A neighbours' boy, nine. |
| **Frau Pichler**, **Herr Gruber** | The neighbours downstairs and across the landing; everyone says Sie to them. |
| **Der Wirt** | The innkeeper at Törggelen, unit 10. |

*Du* among friends, family and children; *es* (with -ts) to several people; *Sie* to Frau Pichler, Herr Gruber, the
innkeeper and strangers.

## Conventions

- **Course:** `id: bar`, target `bar-Latn-IT`, `variety: bar-IT`, one orthography `bar-Latn/moser`, support `en`,
  lexicon `bar`. `iPlusOne: 2`, `wordParts: true`.
- **Unit files:** `units/uNN-<slug>.yaml`, node ids `bar.uNN.<slug>`, sentence ids `s.uNN.<n>`, stories `bar.story.uNN`
  on a node `bar.uNN.story`, the last of its unit; scenarios `bar.<id>`.
- **Spelling (Moser's appendix):** long a as o (Tog, Johr, schlofn); the dark short a as o too (Wosser, olt, hot;
  Moser's å, which the voice reads as o, ADR 0156); ia, ua, oa, ea diphthongs (wia, Bua, koan, geasch); unrounded
  umlauts (Hittn, Heiser, Briader); -scht-, -schp- inside a word, St-, Sp- at its start; ss after a short vowel and
  after au, ei, ß after a long one (Griaß, Goaß); nouns capitalized; clitics with an apostrophe ('s, geat's, gip's).
- **Lexemes** (lexicons/bar): UD tags. Nouns store their gender (no defaults: the dialect drops the endings that tell
  it in German); a noun's token chooses case and number, its case its phrase's (the article shows it: der, in; di,
  der; 's, in). Articles, possessives and attributive adjectives choose case, gender and number; a predicative
  adjective carries nothing (des isch guat). Pronouns are a lexeme each (i: mi, mir; du: di, dir; mir: ins; es: enk;
  Sie: Eana), their tokens choosing case.
- **Verbs** choose Mood, Number, Person, Tense, VerbForm. The 2nd person's -sch (bisch, kimmsch) and the plural's -ts
  (seids, hobts) are endings. The past is the perfect (VerbForm=Part with hobm or sein); sein alone has a past of its
  own (wor, Tense=Past). The subjunctive is tat, hatt (Mood=Sub, Tense=Past), and tat + infinitive is a rule
  (`rule:tian-would`).
- **Fused forms** are one token writing two lexemes: geat's, gip's, isch's, regnet's (a verb and its 's); afn (af + the
  article), mitn (mit + the article), the article written as its n.
- **Persons:** gender is marked only where German marks it (er, sie; der, di), so few sentences need tags: those
  addressed to one woman or man politely (Frau Pichler, Herr Gruber), to several people (es, enk), and those where the
  speaker names herself or himself.

## Syllabus

| Unit | Title | Grammar | Story |
|---|---|---|---|
| 1 | Griaß di! | greetings, hoaßn, wia geat's?, sein (singular), Sie | Lena meets Giulia, and Frau Pichler |
| 2 | Wo bisch her? | va + place, sein (plural: mir, es, sie), redn, nit, wohnen | At Luis's bar |
| 3 | Mei Familie | hobm, der/di/'s, a/an, koan, mei/dei/sei/ihr, wia olt | A photo of Lena's family |
| 4 | Marende | essn, trinkn, megn, welln, gearn, liaber, adjectives | Marende at Oma's |
| 5 | Dahoam | the dative after in, af, bei; afn; do gip's; schian, nui | Lena's flat |
| 6 | Der Tog | the time, days (Pfinztig), work and school, mochn, kemmen | A morning at the hospital |
| 7 | In der Stodt | the way, miassn, kinnen, derfn + infinitive, mitn, kafn | Shopping in Bozen |
| 8 | Geschter | the perfect with hobm and sein, wor | Monday morning |
| 9 | Af der Olm | the weather (es regnet, es schneibt), af di / af der | A hike to the Alm |
| 10 | Törggelen | tat + infinitive, hatt gearn, gfolln | Törggelen |

Nine scenarios (units 1, 2, 3, 4, 5, 7, 8, 9 and 10: Frau Pichler, Luis's bar, family photos, Oma's table, a room to rent,
asking the way, the weekend, the mountain hut, the Törggelen inn).

## Not in it yet

The valleys' own grammar (Vinschgau's one-form pronouns, the Pustertal's partitive -a), complementizer agreement
(neither book attests it), relative clauses, the numbers past twelve, *am* and *im* (an and in fused with the
article; the course says in der, afn, mitn), the oa/ua and on-/un- variants as free spellings (ADR 0156 says why), and
the `scope` label for Standard German answers (ADR 0148).
