# Choices that ask one thing: what to check (ADR 0132)

Drafted by a model in November 2026 for [ADR 0132](../docs/adr/0132-a-choice-asks-one-thing.md), awaiting a
native reviewer, as [REVIEW.md](REVIEW.md) explains.

## Parts of speech

Every lexeme has a drafted UD `pos` and lexical `feats` (REVIEW). A word question offers only words with
exactly the answer's, so a wrong tag either offers a word that grammar rules out, or never offers one that
would be fair. These are the entries the drafts were least sure of; each line gives the choice made.

### es
- mucho ADV (adverb ~45 vs determiner ~40 uses); poco, otro PRON Ind; cuánto PRON Int (11 alone vs 8 before a noun).
- mañana, tarde ADV ("tomorrow", "late" outnumber the nouns); noche NOUN.
- primero ADJ NumType Ord (the only ordinal: no competitors); último plain ADJ; peor ADJ to match mejor.
- maduro NOUN (the dish); encantado, ojalá INTJ.
- como.like and que.than SCONJ; que SCONJ; a-pesar-de ADP.
- nunca ADV Polarity Neg (with no); ni plain CCONJ (with y, o, pero).
- se.impersonal PRON Prs Reflex, as reflexive se.
- centro, malecón, apóstol PROPN (always names); yuma NOUN.
- todo DET Tot; months PROPN, days NOUN; hay VERB, haber AUX.

### chg
- bol VERB (a third of uses copular); emas AUX Polarity Neg; bar ADJ, yoq ADJ Polarity Neg (never against each other).
- turk, qalmaq PROPN (peoples), so never against musulmān, mullā (NOUN) in "män ___män"; turki, farsi PROPN (languages).
- ul PRON Prs (~50 he/she vs ~15 "that" before a noun); oz PRON Prs Reflex; ne PRON Int.
- tola ADJ ("many" 2 of 3); nachcha DET Ind (also "how many?"); chand ADV Int; tamam DET Tot.
- ikkawlan NUM, no feature (collective); para NOUN Clf (chg's only classifier).
- kimarsa NOUN (with kiši); haqq, tangri PROPN (names of God), parwardigar NOUN.
- taqi CCONJ; ham, daghi ADV.

### tok
- toki VERB; tawa ADP (17 preposition vs 13 "go" uses); lon, tan, kepeken ADP; sama ADJ.
- musi ADJ; sitelen NOUN (3-3 tie); taso ADV; mu, pakala VERB.

### apc
- fi VERB (existential); bas CCONJ ("but" 11 vs "only" 6); ma-3ad PART Polarity Neg; ba3d.still ADV.
- seken, raye7, 2a3ed, wa2ef VERB (active participles).
- ta SCONJ (also hortative "let's").
- days NOUN, months PROPN; akid, mazbout, sa77, tfaddal, kifak, shu-bak INTJ.
- 2addesh ADV Int; kam DET Int; hayda, hayde PRON Dem, hal DET Dem; ba3dein ADV.
- lebnene, amerkene ADJ; 3arabe, englize NOUN (languages).

### grc
- chairo VERB (only greetings, but inflected imperatives).
- hellen PROPN while athenaios, barbaros ADJ: all three fill "ἆρα ___ εἶ;".
- hos PRON Prs (with ἐγώ); oude PART Polarity Neg; δή, γε, οὖν ADV; emos DET Prs Poss.
- hosper SCONJ; oudeis PRON Neg; houtos, hode, pas PRON; exo, plen ADP.

### hbo
- yesh, eyn VERB, no Polarity (so they stand against each other); zot DET Dem (to match zeh, elleh).
- meat DET Ind; hinneh INTJ; na PART Mod; bi INTJ.
- ivri, pelishti, elohim NOUN; yhwh PROPN.
- lemaan SCONJ; liqrat VERB; barukh ADJ; bilti PART Polarity Neg; koh ADV Dem; hatsi NOUN.

### lzh
- 上 下 中 前 ADP (postpositions; Kyoto tags them NOUN); 將 ADV (with 已); 無 VERB, no Polarity (against 有).
- 非 ADV Polarity Neg; 然 否 諾 INTJ (answers); 之.de PART Poss; 其 PRON Prs Poss.
- 所 者 PART; 而已 PART Mod; 則 因 ADV; 志 VERB; 順 ADJ; 若 VERB; 以 ADP; 何如 ADV Int; 多少 PRON Int.
- 兼 VERB; 里 NOUN Clf (the only classifier); 足 ADJ; 時 NOUN; 低 VERB; 利.profit NOUN; 江 NOUN.

### yue
- 咗 緊 過 晒 啲 PART, no features (UD Chinese tags aspect markers AUX; as AUX they would stand against 係).
- 好 ADV (mostly "very"); 咩 PRON Int (the "what" lexeme); 冇 VERB Polarity Neg (never against 有).
- 幾, 幾多 NUM Card (interrogative numerals in the numeral slot); 半 NUM Card.
- 蚊 歲 點 分鐘 次 NOUN Clf (they follow a numeral, as classifiers do).
- 紅色 黑色 白色 藍色 NOUN (used as nouns); 今日 聽日 尋日 而家 朝早 夜晚 每日 一陣 下次 ADV; 週末 NOUN.
- 呢度 嗰度 PRON Dem; 邊度 PRON Int; localizers (附近 對面 後面 …) NOUN.
- 八達通 NOUN (competes with 現金); 天文台 PROPN; 得 VERB (with 可以).

### fa
- chand NUM Card; nim NUM Card; na INTJ (Polarity dropped so yes and no stand against each other).
- days of the week PROPN (UD Persian tags them NOUN); chandshanbe PRON Int.
- ra PART (UD Persian: ADP; as ADP it would stand against be, dar, ba, az, ta, which never fit its slot).
- nazdik ADJ; kenar, ruye, zir ADP; rast, chap NOUN.
- sobh shab zohr asr NOUN; emruz farda dirooz dishab alan ADV.
- doost NOUN (the nominal half of doost dashtan); ahl NOUN.

### uz
- necha NUM Card; yo'q ADJ Polarity Neg, bor ADJ; days of the week PROPN.
- keyin ADV (only "then" in the course); kechirmoq VERB (only kechirasiz "excuse me").
- mana ADV Dem (with qani ADV Int); yosh NOUN ("age"); boshqa, ko'p, kerak ADJ; qancha ADV Int; bu PRON Dem.
- chap, o'ng NOUN.

## Story questions

All 200 story `complete` steps were redone so that each asks one thing. These are the steps the drafts
thought weakest.

### fa
- tomorrow 7 (khub against mehraban, khoshmaze): with vowel marks shown, the answer خوب has none while the options do.
- metro 6, shirt 7 kept as they were (false in context: "close", "the shirt is blue").

### grc
- two-sons 1: βαθύς comes from a line end (acute); in the gap before δέ it would be βαθὺς: an accent-savvy learner could notice.
- a-greek-boy, not-one-woman, a-rooster: the story titles translate the gap line (a-greek-boy is now a form question).

### hbo
- seeking-my-brothers 1: "and I will bless you to them" is wrong only because of אֲלֵיהֶם (the only two other words in that form).
- where-you-go 7: "and there I will eat / draw water" is absurd only after "I will die".
- where-are-you 0: קֹלְךָ could be misread as a vocative ("your voice, LORD God").

### lzh
- analects-1-1 /5: the answer 君子 is the only two-character option (no other two-character noun by u1).

### yue
- yum-cha /3 has one wrong option only: the intro unit teaches two plain nouns (學生, 老師). The speaker label
  學生 also shows the answer's characters.

### apc
- Words written with the article or و joined in Arabic script (السِّيّارَة, وإِخْت) were not used as gaps when
  the steps were redone; the compiler now takes an option from the same sentence in Arabizi, so they could be.

### uz
- book 3, family 9 and day 3 have one wrong option only: no second fair word or form is attested.

### es
- u01 #10: the only same-pos options this early are muy and también ("Muy muy", "Muy también": absurd, but
  close to ungrammatical).
- u17 #12: Tranque kept: a tranque can end in a win; it is false here only because the line before says the
  tile fits at both ends (capicúa).
- Gender and number (ADR 0132 amendment): every agreeing adjective, determiner and pronoun chooses its
  gender and number in its token's `feats` (`{Gender: Fem, Number: Sing}`, `{Gender: Masc, Number: Plur}`,
  `{Gender: Fem, Number: Plur}` …) by its agreement in the line, and a noun's token its number; a noun's
  gender is its lexeme's, stored in `lexicons/es/lexemes.yaml` where `language.yaml`'s `defaults` do not
  give it. Drafted from the spelling and a parse. Check first the choices made by hand:
  - a noun's own gender where its articles misled: ave feminine (el ave: `lexeme:ave` `{Gender: Fem}`), alma
    feminine by its -a (el alma); azúcar feminine in "el azúcar alta", masculine elsewhere, and yuma
    masculine in "un yuma" (both `chooses: [Gender]`, so their tokens choose);
  - a lemma covering both genders (tío/tía, don/doña, doctor/doctora, vecino/vecina, mi'jo/mi'ja): the
    masculine is the lemma, its entry says `chooses: [Gender]`, and the feminine is a token
    `{Gender: Fem, Number: Sing}`;
  - invariable adjectives with no noun to agree with (es posible, es importante, mejor and peor as adverbs)
    are masculine singular, `{Gender: Masc, Number: Sing}`, and quién, cuál choose nothing; an untagged
    first or second person is masculine singular too (Cuando yo era joven: both genders accepted), and a
    mixed group masculine plural (Éramos pobres, pero muy felices: `{Gender: Masc, Number: Plur}`);
  - feminine by hand: muy feliz (su familia), la más grande (Celia Cruz), tu música, ¡Feliz Nochebuena!,
    que Cuba fuera libre.
  - Pronouns and names (a later amendment): *ella* `{Gender: Fem, Number: Sing}`; *ustedes*, *nos*, *les*
    `{Number: Plur}`; single-word names by their gender, in their entries (*Cuba*, *la Habana*, *la
    Guantanamera*, *la Navidad*, *la Nochebuena*, the women's names: `{Gender: Fem}`). Cities the course
    writes with no article (*Miami*, *Matanzas*, *Hialeah*) and teams (*los Marlins*) are `{Gender: Masc}`;
    names of several words (*la Calle Ocho*) store no gender and are never asked alone.
  - Story questions with new wrong options: u01 #5 (Daniel, Miami for Yasiel), u15 #3 (Matanzas, Varadero for
    Miami), u16 #17 (Daniel, Miami for Pepe).

## Agreement in apc, hbo and grc

The same model as es (ADR 0132's second amendment). Genders were chosen by hand; check these first.

### apc
- Feminine without ة: *emm*, *ekht*, *bent*, *shams*, *teta*; masculine with -e/-a: *zalame*, *masa*, *ghada*,
  *dawa*, *may*. *Beirut* feminine (a city), *Lebnen* masculine. *3arabe* and *englize* (the languages)
  masculine, as their spelling (عربي): or feminine, as Arabic treats a language (اللغة)? Nothing in the course
  agrees with them yet.
- Plural lexemes (their tokens `{Number: Plur}`): *wlad*, *jiren*, *shabeb*, *masari*, *tyeb*, *ahl* (my
  parents: *ahli mabsoutin*).
- Invariable adjectives that take a feminine noun's form: *Beirut akbar men el day3a*, *ekhti azghar menni*,
  *awwal marra*, *tene marra*. *mish ghali* (the cheese, apc dekkene #8) is masculine singular as written
  (`{Gender: Masc, Number: Sing}`): is it the cheese (ghalye) or "it" in general?
- Grading: a feminine noun without its ة is now WRONG_WORD (the agreement contrast), no longer a typo.
- Story questions with new wrong options: cafe #5 (اسمك, اسمي), dekkene #5 (jeddo, fenjen), my-day #1 (jebne,
  ghorfe), saturday-night #9 (ghorfe, jebne), sick-day #3 (dollar, ktab), teta-calls #3 (talj, matar),
  service #3 (jebne, man2oushe). cafe #5 is weakest: by the café story only "your name" and "my name" are
  masculine nouns besides tea.

### hbo
- Common gender, the usual one taken: דֶּרֶךְ, אֵשׁ, עֵת, רוּחַ, תְּהוֹם, צֹאן feminine; גַּיְא, שֶׂה masculine.
- Cities and lands feminine (נִינְוֵה, חֶבְרוֹן, מִצְרַיִם, תַּרְשִׁישׁ, יָפוֹ, שְׁכֶם, מֹרִיָּה); יִשְׂרָאֵל masculine.
- רָעָה "evil" feminine, and its masculine רָע (Psalm 23) is the same lexeme (`lexeme:raah.evil`,
  `chooses: [Gender]`), its token `{Gender: Masc, Number: Sing}`.
- Always plural, plural: מַיִם, שָׁמַיִם, פָּנִים (also with a suffix: פָּנָיו), רַחֲמִים. אֱלֹהִים as God stays
  singular; אֱלֹהֵי keeps `pl-cstr` (its spelling), as ADR 0084 has it.
- The duals (רַגְלַיִם, עֵינַי) are feminine and keep `du`: no masculine dual is written yet.
- Story questions: in-the-beginning asks יְהִי אוֹר (חֹשֶׁךְ, תֹהוּ), no longer הַמָּיִם; at-the-well #2 asks the
  form of מִכַּדֵּךְ (כַּדָּהּ, כַּד); my-brothers-keeper #2 and a-time-for-everything #6 ask the form (אָחִי,
  אָחִיךָ; פָּנָיַ, מִפְּנֵי); the-ten-words #3 asks הָאֲדָמָה (the wind, the woman), as אִמֶּךָ and אִמֵּךְ
  read alike unpointed. Weakest: my-shepherd #5 (your brother, your father for your rod: absurd only because
  the psalm speaks to God), here-i-am #6 and go-forth #1 (your voice, your name).

### grc
- A neuter is one form as subject, object or address (`Case: 'Acc,Nom,Voc'`): Greek always writes them
  alike, so ἐπὶ τὸ ὄρος is `{Case: 'Acc,Nom,Voc', Gender: Neut, Number: Sing}` on τὸ, not `Case: Acc`. A plural
  vocative is its nominative (ὦ παῖδες, ὦ ἄνδρες Ἀθηναῖοι: `Case: 'Nom,Voc'`).
- παῖς by its article (ἡ παῖς feminine); τοῖς κάτω neuter (the article makes a noun of the adverb).
- τι (something) `{Case: 'Acc,Nom,Voc', Gender: Neut, Number: Sing}`; τί (what) stays bare, a lexeme of its
  own (`lexeme:ti`); τίς (who) chooses case, gender and number (`{Case: Nom, Gender: Masc, Number: Sing}`).
- Story question: a-rooster #0 offers περίπατον and ἀδελφόν (we owe Asclepius a walk, a brother).
