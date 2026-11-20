# Every `form:` and `construction:` KC, and what it becomes

Written by `docs/prototypes/migration-inventory/inventory.py --table`; do not edit by hand. It belongs to
[the migration's design note](../migration-design.md), section "What each KC becomes".

"Used as" is counted from the course's sentences and story lines. "Becomes" is the rule the note states,
applied to that use: it says what kind of thing the KC turns into, not yet its name in the lexicon. The 24
constructions are decided one by one when their course is converted (ADR 0145).

## apc (49)

| KC | Gloss | Used as | Becomes |
|---|---|---|---|
| `form:fem` | feminine: a feminine noun (ahwe, madrase, teta), or the -e / -a ending on an adjective wit | a token's form 880× | feature values on the token (no letters of its own are marked) |
| `form:poss-1sg` | -i: my (ending on a noun) | a morph with letters 178× (i, ي) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:poss-2ms` | -ak: your (to a man) | a morph with letters 48× (ak, k, ك) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:poss-3ms` | -o: his | a morph with letters 20× (o, ه) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:poss-3fs` | -a: her | a morph with letters 22× (a, ya, ها) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:poss-2fs` | -ik: your (to a woman) | a token's form 14×; a morph with letters 42× (ik, iki, ك, كي) | feature values on the words that carry it; the morph is their exponent, a morpheme |
| `form:poss-2pl` | -kon: your (to several people) | a token's form 4×; a morph with letters 20× (kon, كن) | feature values on the words that carry it; the morph is their exponent, a morpheme |
| `form:pl` | plural: a plural noun (wlad, jiren), or the -in ending on an adjective with one (jou3an →  | a token's form 80× | feature values on the token (no letters of its own are marked) |
| `form:imp-2fs` | -i: telling a woman to do something | a token's form 24× | feature values on the token (no letters of its own are marked) |
| `form:imp-2pl` | -o: telling several people to do something | a token's form 14× | feature values on the token (no letters of its own are marked) |
| `form:poss-1pl` | -na: our | a morph with letters 20× (na, نا) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:impf-1sg` | b-: I (present) | a token's form 136× | feature values on the token (no letters of its own are marked) |
| `form:impf-2ms` | bt-: you (present, to a man) | a token's form 38× | feature values on the token (no letters of its own are marked) |
| `form:impf-3ms` | bi-: he (present) | a token's form 4× | feature values on the token (no letters of its own are marked) |
| `form:impf-3fs` | bt-: she (present) | a token's form 8× | feature values on the token (no letters of its own are marked) |
| `form:impf-1pl` | mn-: we (present) | a token's form 52× | feature values on the token (no letters of its own are marked) |
| `form:impf-2fs` | bt-…-i: you (present, to a woman) | a token's form 22× | feature values on the token (no letters of its own are marked) |
| `form:impf-2pl` | bt-…-o: you (present, to several people) | a token's form 16× | feature values on the token (no letters of its own are marked) |
| `form:subj-1sg` | e- / no b-: I (after baddi, b7ebb, 3am…) | a token's form 96× | feature values on the token (no letters of its own are marked) |
| `form:subj-2ms` | t-: you (after baddak, 3am…; to a man) | a token's form 32× | feature values on the token (no letters of its own are marked) |
| `form:subj-1pl` | n-: we (after badna, ta…) | a token's form 46× | feature values on the token (no letters of its own are marked) |
| `form:past-1sg` | -t: I (past) | a token's form 74× | feature values on the token (no letters of its own are marked) |
| `form:past-2ms` | -t: you (past, to a man) | a token's form 28× | feature values on the token (no letters of its own are marked) |
| `form:past-3ms` | he (past): the bare verb | a token's form 34× | feature values on the token (no letters of its own are marked) |
| `form:past-3fs` | -et: she (past) | a token's form 20× | feature values on the token (no letters of its own are marked) |
| `form:past-1pl` | -na: we (past) | a token's form 28× | feature values on the token (no letters of its own are marked) |
| `form:past-2fs` | -ti: you (past, to a woman) | a token's form 18× | feature values on the token (no letters of its own are marked) |
| `form:past-2pl` | -to: you (past, to several people) | a token's form 12× | feature values on the token (no letters of its own are marked) |
| `form:impf-3pl` | bi-…-o: they (present) | a token's form 16× | feature values on the token (no letters of its own are marked) |
| `form:poss-3pl` | -on: their (ending on a noun) | a morph with letters 20× (on, هن, هُن) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:past-3pl` | -o: they (past) | a token's form 16× | feature values on the token (no letters of its own are marked) |
| `form:subj-3ms` | y-: he (after ra7, baddo, lezem…) | a token's form 10× | feature values on the token (no letters of its own are marked) |
| `form:subj-3fs` | t-: she (after ra7, badda…) | a token's form 12× | feature values on the token (no letters of its own are marked) |
| `form:dual` | -en: two (on a noun) | a morph with letters 8× (en, ين) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:subj-2fs` | t-…-i: you (to a woman, after ra7, baddik…) | a token's form 26× | feature values on the token (no letters of its own are marked) |
| `form:subj-2pl` | t-…-o: you (to several people, after ra7, badkon…) | a token's form 14× | feature values on the token (no letters of its own are marked) |
| `form:subj-3pl` | y-…-o: they (after ra7, baddon…) | a token's form 8× | feature values on the token (no letters of its own are marked) |
| `form:la-1sg` | -li: to me; for me (on a verb) | a morph with letters 24× (elli, li, لي, لّي) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:obj-1sg` | -ni: me (on a verb) | a morph with letters 22× (ni, ني) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:obj-2ms` | -ak: you (on a verb, to a man) | a morph with letters 12× (ak, ك) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:obj-2fs` | -ik: you (on a verb, to a woman) | a morph with letters 8× (ik, ك) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:obj-3ms` | -o: him; it (on a verb) | a morph with letters 8× (o, ه) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:obj-3fs` | -a: her; it (on a verb) | a morph with letters 4× (a, ها) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `construction:used-to` | kent + a verb without b-: used to; would | named by 13 sentences | a rule, or a listed item with slots: decided when its course is converted (ADR 0145) |
| `construction:was-doing` | kent 3am + verb: was …ing | named by 6 sentences | a rule, or a listed item with slots: decided when its course is converted (ADR 0145) |
| `form:la-2ms` | -lak: to you; for you (on a verb, to a man) | a morph with letters 2× (lak, لك) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:obj-1pl` | -na: us (on a verb) | a morph with letters 2× (na, نا) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:obj-2pl` | -kon: you (on a verb, to several people) | a morph with letters 2× (kon, كن) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `construction:shu-excl` | shu + adjective: how …! | named by 5 sentences | a rule, or a listed item with slots: decided when its course is converted (ADR 0145) |

## chg (58)

| KC | Gloss | Used as | Becomes |
|---|---|---|---|
| `form:dur` | -dur (-tur after a voiceless consonant): is, are, on the end of a sentence | a morph with letters 96× (تور, دور) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:poss3` | -i (after a consonant), -si (after a vowel): his, her, its, their | a morph with letters 176× (سی, سی\u200c, ی, یی) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:loc` | -da, -dä (-ta, -tä after a voiceless consonant): in, at, on | a morph with letters 92× (ته, دا, ده) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:gen` | -niŋ: of, 's | a morph with letters 54× (نینک, ینک) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:pl` | -lar, -lär: the plural | a morph with letters 52× (لار) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:aor` | -ur, -ar (-r after a vowel): does, will do; is, as a rule | a morph with letters 46× (ار, ر, ور) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:aor-neg` | -mas, -mäs: does not, will not; is not, as a rule | a morph with letters 12× (ماس) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:abl` | -din (-dan, -tin): from; than | a morph with letters 45× (دین, دین\u200c) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:dat` | -ǧa, -gä (-qa, -kä): to, for | a morph with letters 110× (غا, غه, قه, نکا) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:cmp` | -raq, -räk: more ..., -er | a morph with letters 10× (راق) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:pres` | -a, -ä (-y after a vowel): the present-future: does, is doing, will do | a morph with letters 51× (ا, ی) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:p1s` | -män: I am (on the predicate); I (on the verb) | a morph with letters 24× (من) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:p2s` | -sän: you are, to a friend, a child, God (on the predicate); you (on the verb) | a morph with letters 7× (سن, سین) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:p2` | -siz: you are, politely, to one person or several; you (on the verb) | a morph with letters 12× (سیز) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:p1p` | -miz: we are (on the predicate); we (on the verb) | a morph with letters 13× (مز, میز) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:p2pl` | -sizlär: you are, to several people; you (on the verb) | a morph with letters 7× (سیزلار) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:q` | -mu: a yes-or-no question | a morph with letters 19× (مو) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:p3pl` | -lar, -lär: they (on the predicate or the verb) | a morph with letters 11× (لار) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:acc` | -ni: the object, when it is definite | a morph with letters 60× (ن, نی) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:poss1s` | -m (after a vowel), -im, -um, -üm: my | a morph with letters 26× (م, وم, یم) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:poss2s` | -ŋ (after a vowel), -iŋ, -uŋ, -üŋ: your, to a friend | a morph with letters 5× (نک, ینک) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:poss2` | -ŋiz (after a vowel), -iŋiz, -uŋiz, -üŋiz: your, politely or to several | a morph with letters 6× (نکیز, ینکز, ینکیز) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:poss1p` | -miz (after a vowel), -imiz, -umiz, -ümiz: our | a morph with letters 13× (مز, ومیز, یمز, یمیز) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:pres-neg` | -may, -mäy: does not, is not doing, will not (the present-future's negative) | a morph with letters 16× (مای) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:cv-may` | -may, -mäy: without doing, not doing (and) | a morph with letters 4× (مای) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:ca` | -čä: in the manner of; in a language | a morph with letters 2× (چه) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:cond` | -sa, -sä: if, when | a morph with letters 11× (سا, سه) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:past-1s` | -dim, -dum, -düm (-tim after a voiceless consonant): I did | a morph with letters 26× (تیم, دوم, دیم) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:past-2s` | -diŋ, -duŋ, -düŋ: you did, to a friend | a morph with letters 2× (دینک) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:past-2` | -diŋiz: you did, politely or to several | a morph with letters 2× (دینکیز) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:past-3` | -di (-ti): he, she, it did; they did | a morph with letters 163× (تی, دی) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:past-1p` | -duq, -dük: we did | a morph with letters 29× (توق, دوق, دوک) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:past-2pl` | -diŋlar, -duŋlar: you did, to several people | a morph with letters 1× (دینکلار) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:past-3pl` | -dilär, -dilar: they did | a morph with letters 34× (تیلار, دیلار, دی\u200cلار) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:neg` | -ma-, -mä-: not (inside the verb) | a morph with letters 22× (ما) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:liq` | -liq, -lik, -luq, -lük: with, having; of (a place); -ness | a morph with letters 19× (لیغ, لیق, لیک) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:ord` | -nči, -inči, -unči, -ünči: -th (ordinal numbers) | a morph with letters 8× (نچی, ونجی, ونچی, ینجی) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:cv-p` | -p, -ip, -up, -üp: and (then); having done | a morph with letters 78× (ب, وب, یب) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:cv-a` | -a, -ä (-y after a vowel): doing; with al-: can | a morph with letters 8× (ا, ی) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:nisba` | -ī: of, from (on Arabic and Persian words) | a morph with letters 7× (ی, ی\u200c) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:pcp` | -ǧan, -gän (-qan, -kän): who did, which was; (with -da) when | a morph with letters 24× (غان, قان, کان, کان\u200c) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:let` | -ali, -äli (-li after a vowel): let us …! | a morph with letters 7× (الی) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:cond-1s` | -sam, -säm: if I, when I | a morph with letters 1× (سم) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:mis` | -miš: did, it is said; (with er-) ermiš "was, they say" | a morph with letters 20× (میش) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:ci` | -či: a person who works with … | a morph with letters 15× (جی, چی, چی\u200c) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:narr` | -ptur (-iptur, -uptur, -üptur): did, it is told; is (found) | a morph with letters 15× (بتور, تور, وبتور, یب) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:daki` | -daki, -däki: that is in, of (a place) | a morph with letters 2× (داقی) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:cilik` | -čilik, -čülük: a … 's worth, lasting a … | a morph with letters 2× (جلوک) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:gac` | -ǧač, -gäč (-qač, -käč): as soon as, when | a morph with letters 4× (غاج, قاج, کاج) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:imp` | the imperative: -iŋ, -uŋ, -üŋ, -ŋ (politely, or to several); -ǧil, -gil (to one) | a morph with letters 16× (غیل, ونک, کل, کیل) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:cond-2s` | -saŋ, -säŋ: if you (one person); would you …? | a morph with letters 4× (سانک) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:ke` | -ke, -ki: that (after a verb of saying: eyttike "said (that)") | a morph with letters 8× (که) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:la` | -la, -lä: makes a verb of a noun | a morph with letters 3× (لا) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:pass` | -il-, -l-, -n-: the passive | a morph with letters 3× (ل, یل) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:vol-1s` | -ayin, -äyin: let me, I shall | a morph with letters 3× (این) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:gay` | -ǧay, -gäy (-qay, -käy): shall, will; let (with person endings: -ǧaymiz "we shall") | a morph with letters 6× (غای, کای, کای\u200c) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:gali` | -ǧali, -gäli (-qali, -käli): in order to; since | a morph with letters 4× (کالی) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:juss` | -sun, -sün: let him, her, them; may … | a morph with letters 1× (سون) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |

## es (23)

| KC | Gloss | Used as | Becomes |
|---|---|---|---|
| `form:pres-1s` | present tense: I (yo) | a token's form 290× | feature values on the token (no letters of its own are marked) |
| `form:pres-2s` | present tense: you (tú) | a token's form 131× | feature values on the token (no letters of its own are marked) |
| `form:pres-3s` | present tense: he, she, it, you (usted) | a token's form 615× | feature values on the token (no letters of its own are marked) |
| `form:fem` | feminine: la, una, cubana | a token's form 2041× | feature values on the token (no letters of its own are marked) |
| `form:pres-1p` | present tense: we (nosotros) | a token's form 64× | feature values on the token (no letters of its own are marked) |
| `form:pres-3p` | present tense: they, you all (ellos, ustedes) | a token's form 112× | feature values on the token (no letters of its own are marked) |
| `form:pl` | plural: los, unos, cubanos | a token's form 530× | feature values on the token (no letters of its own are marked) |
| `form:fem-pl` | feminine plural: las, unas, cubanas | a token's form 136× | feature values on the token (no letters of its own are marked) |
| `form:ger` | gerund, -ando, -iendo (estoy trabajando: I'm working) | a token's form 17× | feature values on the token (no letters of its own are marked) |
| `form:pret-1s` | past tense (preterite): I (yo) | a token's form 42× | feature values on the token (no letters of its own are marked) |
| `form:pret-3s` | past tense (preterite): he, she, it, you (usted) | a token's form 129× | feature values on the token (no letters of its own are marked) |
| `form:pret-2s` | past tense (preterite): you (tú) | a token's form 19× | feature values on the token (no letters of its own are marked) |
| `form:pret-1p` | past tense (preterite): we (nosotros) | a token's form 22× | feature values on the token (no letters of its own are marked) |
| `form:pret-3p` | past tense (preterite): they, you all (ellos, ustedes) | a token's form 31× | feature values on the token (no letters of its own are marked) |
| `form:impf` | imperfect: was …ing, used to (hablaba, comía, era, iba) | a token's form 192× | feature values on the token (no letters of its own are marked) |
| `form:imp-tu` | command, tú (¡habla!, ¡come!, ¡ven!) | a token's form 39× | feature values on the token (no letters of its own are marked) |
| `form:imp-ud` | command, usted or ustedes (¡hable!, ¡coman!) | a token's form 29× | feature values on the token (no letters of its own are marked) |
| `form:imp-neg` | negative command (¡no hables!, ¡no coma!) | a token's form 12× | feature values on the token (no letters of its own are marked) |
| `form:part` | past participle (hablado, comido, hecho; he hablado) | a token's form 64× | feature values on the token (no letters of its own are marked) |
| `form:cond` | conditional: would (hablaría, podría) | a token's form 42× | feature values on the token (no letters of its own are marked) |
| `form:subj-past` | imperfect subjunctive (si hablara, si tuviera) | a token's form 35× | feature values on the token (no letters of its own are marked) |
| `form:fut` | future: will (hablará, será) | a token's form 38× | feature values on the token (no letters of its own are marked) |
| `form:subj` | present subjunctive (que hable, que coma) | a token's form 78× | feature values on the token (no letters of its own are marked) |

## fa (20)

| KC | Gloss | Used as | Becomes |
|---|---|---|---|
| `form:1sg-am` | -am: I (verb ending) | a morph with letters 86× (م) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:2sg-i` | -i: you, one person (verb ending) | a morph with letters 23× (ی) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `construction:ezafe` | ezafe: the -e that links a noun to what describes or owns it | a morph with letters 7× (ی); a morph with no letters 105× | a rule, or a listed item with slots: decided when its course is converted (ADR 0145) |
| `form:2pl-id` | -id: you, polite or more than one (verb ending) | a morph with letters 50× (ید) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:3pl-and` | -and: they (verb ending) | a morph with letters 16× (ند) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:plural-ha` | -hā: plural | a morph with letters 13× (ها) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:poss-1sg` | -am: my (joined to a noun) | a morph with letters 15× (م) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:1pl-im` | -im: we (verb ending; هستیم: we are) | a morph with letters 25× (یم) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:plural-an` | -ān: plural (people and living things) | a morph with letters 1× (انِ) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:3sg-ad` | -ad: he, she, it (verb ending) | a morph with letters 26× (د) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:neg-na` | na-, ne-: not (verb prefix) | a morph with letters 10× (ن) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `construction:doost-dashtan` | دوست داشتن: to like, to love | named by 14 sentences | a rule, or a listed item with slots: decided when its course is converted (ADR 0145) |
| `form:poss-2sg` | -at: your (one person, familiar; joined to a noun) | a morph with letters 3× (ت) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `construction:existential-hast` | هست: there is, there are | named by 4 sentences | a rule, or a listed item with slots: decided when its course is converted (ADR 0145) |
| `form:mi-present` | mi-: present tense (verb prefix) | a morph with letters 85× (می\u200c) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:subj-be` | be-: imperative and subjunctive (verb prefix) | a morph with letters 15× (ب) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `construction:subjunctive` | the subjunctive: be- + present stem + ending after 'want' and 'can' | named by 5 sentences | a rule, or a listed item with slots: decided when its course is converted (ADR 0145) |
| `form:indef-i` | -i: a, some, any (indefinite ending) | a morph with letters 3× (ی) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:comparative-tar` | -tar: -er, more (comparative) | a morph with letters 3× (تر) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `construction:past` | the simple past: past stem + ending (رفتم, I went) | named by 16 sentences | a rule, or a listed item with slots: decided when its course is converted (ADR 0145) |

## grc (43)

| KC | Gloss | Used as | Becomes |
|---|---|---|---|
| `form:impv-2s` | the imperative, to one person: do! | a token's form 24× | feature values on the token (no letters of its own are marked) |
| `form:impv-2p` | the imperative, to several people: do! | a token's form 14× | feature values on the token (no letters of its own are marked) |
| `form:pres-1s` | the present, I: I do, I am doing | a token's form 59× | feature values on the token (no letters of its own are marked) |
| `form:pres-2s` | the present, you (one person): you do, you are doing | a token's form 25× | feature values on the token (no letters of its own are marked) |
| `form:pres-3s` | the present, he, she, it: does, is doing | a token's form 80× | feature values on the token (no letters of its own are marked) |
| `form:perf-2s` | the perfect, you (one person): you have done (and so it stands) | a token's form 10× | feature values on the token (no letters of its own are marked) |
| `form:f` | feminine, as subject: ἡ μήτηρ, the mother; νεωτέρα, younger (of a woman) | a token's form 114× | feature values on the token (no letters of its own are marked) |
| `form:f-voc` | feminine vocative: calling a woman (ὦ Ξανθίππη); in -η and -α as the subject form | a token's form 12× | feature values on the token (no letters of its own are marked) |
| `form:voc` | the vocative (masculine): the form for calling someone (Σώκρατες, from Σωκράτης) | a token's form 18× | feature values on the token (no letters of its own are marked) |
| `form:pres-3p` | the present, they: they do, they are doing | a token's form 16× | feature values on the token (no letters of its own are marked) |
| `form:f-acc` | feminine accusative: the object (ἀδελφὴν ἔχω, I have a sister; εἰς τὴν ἀγοράν) | a token's form 23× | feature values on the token (no letters of its own are marked) |
| `form:f-gen` | feminine genitive: of, from (ἐκ τῆς οἰκίας, out of the house; Παρυσάτιδος, of Parysatis) | a token's form 16× | feature values on the token (no letters of its own are marked) |
| `form:f-acc-pl` | feminine accusative plural: the objects (ἀδελφὰς, sisters) | a token's form 1× | feature values on the token (no letters of its own are marked) |
| `form:n` | neuter: one form as subject, as object and when called (τὸ τέκνον, the child; ἐπὶ τὸ ὄρος, | a token's form 60× | feature values on the token (no letters of its own are marked) |
| `form:acc` | the accusative (masculine; also με, σε): the object of a verb (ἀδελφὸν ἔχω, I have a broth | a token's form 23× | feature values on the token (no letters of its own are marked) |
| `form:gen` | the genitive (masculine): of, 's (Δαρείου, of Darius) | a token's form 32× | feature values on the token (no letters of its own are marked) |
| `form:pl` | the plural (masculine; also ἡμεῖς, ὑμεῖς), as subject or called: -οι, -ες (ἀδελφοί, brothe | a token's form 41× | feature values on the token (no letters of its own are marked) |
| `form:acc-pl` | the accusative plural (masculine; also ἡμᾶς, ὑμᾶς): the objects (παῖδας, children) | a token's form 5× | feature values on the token (no letters of its own are marked) |
| `form:f-dat` | feminine dative: to, for; on (a day); after ἐν, in (ἐν τῇ ἀγορᾷ, in the market place) | a token's form 27× | feature values on the token (no letters of its own are marked) |
| `form:n-gen` | neuter genitive: of; after ἔξω, outside (ἔξω τείχους, outside the wall) | a token's form 4× | feature values on the token (no letters of its own are marked) |
| `form:n-dat` | neuter dative: to, for; after ἐν, in (ἐν τῷ ἄστει, in the town) | a token's form 8× | feature values on the token (no letters of its own are marked) |
| `form:pres-1p` | the present, we: we do, we are doing | a token's form 7× | feature values on the token (no letters of its own are marked) |
| `form:pres-2p` | the present, you (several people): you do, you are doing | a token's form 5× | feature values on the token (no letters of its own are marked) |
| `form:aor-1s` | the aorist, I: I did (once, in the past) | a token's form 7× | feature values on the token (no letters of its own are marked) |
| `form:impf-3s` | the imperfect, he, she, it: was doing, did | a token's form 14× | feature values on the token (no letters of its own are marked) |
| `form:inf` | the infinitive: to do (κελεύει περιμεῖναι, he tells (you) to wait) | a token's form 8× | feature values on the token (no letters of its own are marked) |
| `form:fut-1p` | the future, we: we will do | a token's form 4× | feature values on the token (no letters of its own are marked) |
| `form:f-pl` | feminine plural, as subject or called: αἱ γυναῖκες, the women | a token's form 17× | feature values on the token (no letters of its own are marked) |
| `form:pres-3p-mid` | the present, they, with middle endings: -ονται (πορεύονται, they go) | a token's form 4× | feature values on the token (no letters of its own are marked) |
| `form:ptc` | the participle: -ing (βοώντων, shouting) | a token's form 6× | feature values on the token (no letters of its own are marked) |
| `form:impf-3p` | the imperfect, they: they were doing, they did | a token's form 5× | feature values on the token (no letters of its own are marked) |
| `form:dat` | the dative (masculine; also μοι, σοι): to, for (τῷ Ἀσκληπιῷ, to Asclepius; ὄνομά μοι, my n | a token's form 15× | feature values on the token (no letters of its own are marked) |
| `form:gen-pl` | the genitive plural (masculine): of (the) … (τῶν στρατιωτῶν, of the soldiers); also after  | a token's form 6× | feature values on the token (no letters of its own are marked) |
| `form:aor-subj-2p` | the aorist subjunctive, you (several): after μή, "don't (do it)!" | a token's form 4× | feature values on the token (no letters of its own are marked) |
| `form:fut-3s` | the future, he, she, it: will do, will be | a token's form 5× | feature values on the token (no letters of its own are marked) |
| `form:n-pl` | neuter plural: one form as subject and as object, in -α (τὰ ἄνω, the upstairs; ταῦτα, thes | a token's form 11× | feature values on the token (no letters of its own are marked) |
| `construction:esti-moi` | ἔστι μοι + a noun: I have (word for word, there is to me) | named by 3 sentences | a rule, or a listed item with slots: decided when its course is converted (ADR 0145) |
| `form:aor-3s` | the aorist, he, she, it: did (once, in the past) | a token's form 4× | feature values on the token (no letters of its own are marked) |
| `form:impf-1s` | the imperfect, I: I was doing, I used to do | a token's form 5× | feature values on the token (no letters of its own are marked) |
| `form:n-dat-pl` | neuter dative plural: to, for (τοῖς κάτω, to the downstairs rooms) | a token's form 2× | feature values on the token (no letters of its own are marked) |
| `form:dat-pl` | the dative plural (masculine; also ἡμῖν): to, for (ἡμῖν, to us) | a token's form 2× | feature values on the token (no letters of its own are marked) |
| `form:comp` | the comparative: more …, -er (σοφώτερος, wiser); the one compared in the genitive (than) | a token's form 5× | feature values on the token (no letters of its own are marked) |
| `form:comp-f` | the comparative, feminine: more …, -er (σοφωτέρα, wiser, of a woman) | a token's form 1× | feature values on the token (no letters of its own are marked) |

## hbo (51)

| KC | Gloss | Used as | Becomes |
|---|---|---|---|
| `construction:nominal` | a noun sentence: no verb 'to be' (הָאוֹר טוֹב 'the light is good') | named by 47 sentences | a rule, or a listed item with slots: decided when its course is converted (ADR 0145) |
| `form:wayyiqtol-3ms` | and he did: the narrative past (wayyiqtol), he or it | a token's form 156× | feature values on the token (no letters of its own are marked) |
| `form:juss` | let him (it) do: the jussive; with אַל, 'do not …!' | a token's form 25× | feature values on the token (no letters of its own are marked) |
| `form:qatal-3ms` | he did: the perfect (qatal), he or it | a token's form 29× | feature values on the token (no letters of its own are marked) |
| `form:qatal-3fs` | she did: the perfect (qatal), she or it (f.) | a token's form 12× | feature values on the token (no letters of its own are marked) |
| `form:f` | feminine: a feminine noun (אֶרֶץ 'land', אִשָּׁה 'woman'), or an adjective with one (-â or | a token's form 271× | feature values on the token (no letters of its own are marked) |
| `form:pl-cstr` | plural construct (-ê): 'the …s of'; also of nouns always plural (פְּנֵי 'the face of') | a token's form 33× | feature values on the token (no letters of its own are marked) |
| `form:ptc-fs` | participle, feminine singular: she/it is doing | a token's form 13× | feature values on the token (no letters of its own are marked) |
| `form:pl` | plural, masculine (-îm, some -ôṯ: גּוֹרָלוֹת 'lots'); also nouns always plural (שָׁמַיִם ' | a token's form 94× | feature values on the token (no letters of its own are marked) |
| `form:f-cstr` | feminine construct: 'X of …', the noun bound to the next (רוּחַ אֱלֹהִים 'the spirit of Go | a token's form 14× | feature values on the token (no letters of its own are marked) |
| `form:wayyiqtol-3mp` | and they did: the narrative past, they | a token's form 11× | feature values on the token (no letters of its own are marked) |
| `form:qatal-1cs` | I did: the perfect (qatal), I (-tî) | a token's form 16× | feature values on the token (no letters of its own are marked) |
| `form:ptc-ms` | participle, masculine singular: he/it is doing; one who does (of a verb of state, its adje | a token's form 45× | feature values on the token (no letters of its own are marked) |
| `form:sfx-3ms` | his; him (the suffix -ô, -w, -hû) | a morph with letters 67× (הוּ, ו, וֹ, נּוּ) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:sfx-2ms` | your; you (said to a man: the suffix -ḵā) | a morph with letters 150× (ךְ, ךָ, ךָּ, כָּה) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:wayyiqtol-1cs` | and I did: the narrative past, I | a token's form 10× | feature values on the token (no letters of its own are marked) |
| `form:cstr` | construct state: 'X of …', the noun bound to the next (בְּתוֹךְ הַגָּן 'in the middle of t | a token's form 44× | feature values on the token (no letters of its own are marked) |
| `form:qatal-2ms` | you did: the perfect (qatal), you (to a man: -tā) | a token's form 15× | feature values on the token (no letters of its own are marked) |
| `form:inf` | infinitive (construct): to do; doing (לֶאֱכֹל 'to eat') | a token's form 64× | feature values on the token (no letters of its own are marked) |
| `form:sfx-1cs` | my; me (the suffix -î, -nî) | a morph with letters 115× (י, יַ, נִי) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:qatal-2fs` | you did: the perfect (qatal), you (to a woman: -t) | a token's form 5× | feature values on the token (no letters of its own are marked) |
| `form:wayyiqtol-3fs` | and she did: the narrative past, she or it (f.) | a token's form 29× | feature values on the token (no letters of its own are marked) |
| `form:sfx-2fs` | your; you (said to a woman: the suffix -ēḵ, -ḵ) | a morph with letters 32× (ךְ) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:ptc-mp` | participle, masculine plural: they are doing; ones who do | a token's form 8× | feature values on the token (no letters of its own are marked) |
| `form:sfx-3mp` | their; them (the suffix -ām, -hem) | a morph with letters 16× (הֶם, ם) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:impv-ms` | imperative, to a man: do! | a token's form 53× | feature values on the token (no letters of its own are marked) |
| `form:impv-fs` | imperative, to a woman: do! | a token's form 15× | feature values on the token (no letters of its own are marked) |
| `form:impv-mp` | imperative, to several people: do! | a token's form 23× | feature values on the token (no letters of its own are marked) |
| `form:yiqtol-1cs` | I will do: the imperfect (yiqtol), I | a token's form 35× | feature values on the token (no letters of its own are marked) |
| `form:coh` | let me do, let us do: the cohortative (-â); 'I will …' after a command | a token's form 10× | feature values on the token (no letters of its own are marked) |
| `form:yiqtol-3ms` | he will do: the imperfect (yiqtol), he or it | a token's form 33× | feature values on the token (no letters of its own are marked) |
| `form:sfx-3fs` | her; it (f.) (the suffix -āh, -hā) | a morph with letters 24× (הָ, הּ) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:qatal-3cp` | they did: the perfect (qatal), they (-û) | a token's form 5× | feature values on the token (no letters of its own are marked) |
| `form:sfx-2mp` | your; you (said to several people: the suffix -ḵem) | a morph with letters 5× (כֶם) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:dir` | toward: the directional -â (שְׁכֶמָה 'to Shechem', הַבַּיְתָה 'home') | a morph with letters 9× (ה) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:yiqtol-2ms` | you will do: the imperfect (yiqtol), you (to a man); with לֹא, 'you shall not' | a token's form 13× | feature values on the token (no letters of its own are marked) |
| `form:yiqtol-2fs` | you will do: the imperfect (yiqtol), you (to a woman) | a token's form 7× | feature values on the token (no letters of its own are marked) |
| `form:ptc-pass` | passive participle: done, -ed (בָּרוּךְ 'blessed'; אֻכָּל 'consumed' is an older kind) | a token's form 7× | feature values on the token (no letters of its own are marked) |
| `form:du` | dual (-áyim): two of a pair (רַגְלַיִם 'feet') | a token's form 6× | feature values on the token (no letters of its own are marked) |
| `form:f-pl` | feminine plural (-ôṯ; some -îm: נָשִׁים 'women') | a token's form 8× | feature values on the token (no letters of its own are marked) |
| `form:inf-abs` | the infinitive absolute: in laws, 'you shall …' (כַּבֵּד 'honour'); before its own verb, ' | a token's form 4× | feature values on the token (no letters of its own are marked) |
| `form:yiqtol-3mp` | they will do: the imperfect (yiqtol), they | a token's form 7× | feature values on the token (no letters of its own are marked) |
| `form:yiqtol-2mp` | you will do: the imperfect (yiqtol), you (to several people) | a token's form 2× | feature values on the token (no letters of its own are marked) |
| `form:weqatal-2ms` | and you shall do: the converted perfect (weqatal), you | a token's form 10× | feature values on the token (no letters of its own are marked) |
| `form:sfx-1cp` | our; us (the suffix -ēnû, -nû) | a morph with letters 12× (נוּ) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:weqatal-3cp` | and they shall: the converted perfect (weqatal), they | a token's form 3× | feature values on the token (no letters of its own are marked) |
| `form:weqatal-3ms` | and he shall; and it will be: the converted perfect (weqatal), he or it | a token's form 5× | feature values on the token (no letters of its own are marked) |
| `construction:yesh-le` | יֵשׁ לְ…: … has (there is to …); אֵין לְ…: … has no | named by 3 sentences | a rule, or a listed item with slots: decided when its course is converted (ADR 0145) |
| `form:f-pl-cstr` | feminine plural construct (-ôṯ): 'the …s of' (מַעַרְכוֹת יִשְׂרָאֵל 'the ranks of Israel') | a token's form 6× | feature values on the token (no letters of its own are marked) |
| `form:wayyiqtol-3fp` | and they (f.) did: the narrative past, they (women) | a token's form 3× | feature values on the token (no letters of its own are marked) |
| `form:ptc-pass-fs` | passive participle, feminine singular: done, -ed, of a woman (בְּרוּכָה 'blessed') | a token's form 1× | feature values on the token (no letters of its own are marked) |

## lzh (5)

| KC | Gloss | Used as | Becomes |
|---|---|---|---|
| `construction:ye` | A，B也: “A is B”, a noun as the predicate | named by 1 sentences | a rule, or a listed item with slots: decided when its course is converted (ADR 0145) |
| `construction:neg-pronoun` | 不我知: after a negative, a pronoun object comes before the verb, “does not know me” | named by 1 sentences | a rule, or a listed item with slots: decided when its course is converted (ADR 0145) |
| `construction:buyi-hu` | 不亦…乎: “isn’t it …?”, a question that expects “yes” | named by 1 sentences | a rule, or a listed item with slots: decided when its course is converted (ADR 0145) |
| `construction:you-zhe` | X人有…者: “there was a man of X who …”, how a story brings in its hero | named by 1 sentences | a rule, or a listed item with slots: decided when its course is converted (ADR 0145) |
| `construction:wei-passive` | 為 A V: “be V-ed by A”, as in 為人笑 “be laughed at by people” | named by 3 sentences | a rule, or a listed item with slots: decided when its course is converted (ADR 0145) |

## tok (6)

| KC | Gloss | Used as | Becomes |
|---|---|---|---|
| `construction:x-ala-x` | X ala X?: a yes/no question | named by 10 sentences | a rule, or a listed item with slots: decided when its course is converted (ADR 0145) |
| `construction:pona-tawa` | X li pona tawa Y: Y likes X | named by 8 sentences | a rule, or a listed item with slots: decided when its course is converted (ADR 0145) |
| `construction:la-if` | X la Y as a condition: if X, Y; when X, Y | named by 4 sentences | a rule, or a listed item with slots: decided when its course is converted (ADR 0145) |
| `construction:preverb` | a preverb before a verb: mi wile moku (I want to eat) | named by 8 sentences | a rule, or a listed item with slots: decided when its course is converted (ADR 0145) |
| `construction:counting` | numbers that add up: tu wan (three), tu tu (four) | named by 2 sentences | a rule, or a listed item with slots: decided when its course is converted (ADR 0145) |
| `construction:ni-colon` | e ni: before a reported sentence (says that, thinks that) | named by 3 sentences | a rule, or a listed item with slots: decided when its course is converted (ADR 0145) |

## uz (28)

| KC | Gloss | Used as | Becomes |
|---|---|---|---|
| `form:cop-1sg-man` | -man: I am (suffix on the predicate) | a morph with letters 128× (man, ман) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:cop-2-siz` | -siz: you are (polite; suffix on the predicate) | a morph with letters 64× (siz, сиз) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:poss-1sg-im` | -(i)m: my | a morph with letters 156× (im, m, им, м) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:gen-ning` | -(n)ing: of, 's | a morph with letters 56× (ing, ning, инг, нинг) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:poss-2-ingiz` | -(i)ngiz: your (polite) | a morph with letters 36× (ingiz, ngiz, ингиз, нгиз) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:poss-3-si` | -(s)i: his, her, its | a morph with letters 70× (i, si, и, си) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:q-mi` | -mi: yes/no question | a morph with letters 70× (mi, ми) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:plural-lar` | -lar: plural (-s) | a morph with letters 24× (lar, лар) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:cop-1pl-miz` | -miz: we are (suffix on the predicate) | a morph with letters 30× (miz, миз) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:poss-1pl-imiz` | -(i)miz: our | a morph with letters 24× (imiz, miz, имиз, миз) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:part-chi` | -chi: and ...? what about ...? | a morph with letters 6× (chi, чи) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:loc-da` | -da: in, at, on | a morph with letters 192× (da, да) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:count-ta` | -ta: counting suffix | a morph with letters 16× (ta, та) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:imp-ing` | -(i)ng: please do (polite imperative) | a morph with letters 46× (ing, ng, инг, нг) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:pres-a` | -a / -y: present-future tense | a morph with letters 172× (a, y, а, й) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:pres-3sg-di` | -di: he, she, it (present tense) | a morph with letters 44× (di, ti, ди, ти) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:acc-ni` | -ni: the (definite object) | a morph with letters 6× (ni, ни) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:neg-ma` | -ma: not (on verbs) | a morph with letters 18× (ma, ма) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:dat-ga` | -ga: to, toward; for | a morph with letters 94× (ga, ka, га, ка) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:abl-dan` | -dan: from; out of | a morph with letters 14× (dan, дан) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:term-gacha` | -gacha: until, up to, as far as | a morph with letters 2× (gacha, гача) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:prog-yap` | -yap: right now (present continuous) | a morph with letters 18× (yap, яп) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:comp-roq` | -roq: -er, more (comparative) | a morph with letters 4× (roq, роқ) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:want-moqchi` | -moqchi: want to; be going to | a morph with letters 18× (moqchi, моқчи) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:past-di` | -di: past tense (he, she, it did) | a morph with letters 96× (di, ди) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:past-1sg-m` | -m: I (past tense) | a morph with letters 46× (m, м) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:past-2-ngiz` | -ngiz: you (past tense, polite) | a morph with letters 22× (ngiz, нгиз) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `form:past-1pl-k` | -k: we (past tense) | a morph with letters 14× (k, к) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |

## yue (3)

| KC | Gloss | Used as | Becomes |
|---|---|---|---|
| `construction:a-not-a` | X唔X: a yes-or-no question (係唔係, 'is it or not') | named by 36 sentences | a rule, or a listed item with slots: decided when its course is converted (ADR 0145) |
| `form:plural-dei` | -哋 (dei6): plural of a pronoun | a morph with letters 80× (dei6, 哋) | a morpheme: the exponent of a feature value, with these shapes as its allomorphs |
| `construction:cl-possessive` | pronoun + classifier + noun: possessive (我本書 my book, 你個仔 your son) | named by 5 sentences | a rule, or a listed item with slots: decided when its course is converted (ADR 0145) |
