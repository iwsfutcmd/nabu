# Answers the accept sets may be missing

In November 2026 every course's accept sets were checked against
[ADR 0085](../docs/adr/0085-what-the-prompt-leaves-open.md): what the prompt does not decide, the
learner may choose. A model read each sentence in both directions and proposed the answers its set
left out.

- **Applied.** The answers it was sure of are in the sets now:
  - yue 184, uz 193, fa 344, es 616, apc 996, lzh 734, tok 300.
  - Each one was graded before and after, so the sets still compile and accept their own text.
- **Listed here.** The answers it was not sure of are below, for a reviewer to decide. None of them
  is accepted now.
- **To accept one,** add it to its set: `reverse` for the target language, `translations` for
  English. Or answer it in the app and choose "My answer should have been accepted", then run
  `nabu reports promote`.
- **Fixed on the way.** A few answers the sets accepted were wrong:
  - es s.u06.24 took *de el autobús*;
  - apc s.child.8, s.child.13 and s.party.20 took أنا ("I") with a verb that says "you";
  - lzh s.07.17, s.07.36 and s.01.37 took ungrammatical English (*He did not came*, *She himself*,
    *I also know this too*).
- **How the tables are written.** Invisible characters are written as `\u` escapes. Toki Pona rows
  are given in sitelen Lasina only; each one stands for the same answer in sitelen pona.

## Questions of policy

These go beyond one sentence. Each answer settles a group of the rows below, or would be better
settled in a profile or the grader than in the sets.

1. **Contractions in English.** The grader does not equate *I'm* and *I am*, so every English set
   lists both (`(I'm|I am)`), and sets that forget one reject a right answer.
   - Folding contractions in the English profile would cover every course at once.
   - That needs an ADR and conformance vectors in both harnesses.
2. **Right answers graded as typos.** 19 right answers are accepted with a typo note, because they
   are one letter from a listed answer. They are in each course's "Graded as typos" table below:
   - apc *mersi*, *shokran*, *2ahwtein*; uz Cyrillic *кетаман*;
   - tok *She loved me*, *The lizards slept*; lzh *The sword has not moved*.
   - Listing them would make them plain CORRECT_ALT. Is the note acceptable?
3. **yue spellings.** Common informal typings are accepted in places (既, 野, 黎), not in others:
   - 果 for 嗰, 邊到 for 邊度, D for 啲, 宜家 for 而家;
   - 啊 for 呀, and a question's final 呀 left out.
   - A variant group in the profile would accept each one everywhere, not sentence by sentence.
4. **Register.** *usted* sentences whose prompt shows no register (es s.u01.18, s.u01.19, s.u01.27,
   s.u01.31) take only *usted*, though English "you" does not say which. The same goes for fa
   تو/شما and uz *sen/siz*, where the sets mostly take both.
   - Register is not modelled yet (CLAUDE.md, persons and register notes).
   - Either tag these prompts, or accept every form until a register tag exists.
5. **Digits.** Is *del 57* right where the sentence spells *del cincuenta y siete* (es s.u13.15),
   and are digits right in other number sentences?
6. **lzh names.** The English sets now take Wade–Giles spellings beside pinyin (*Lao Tzu*, *Tao*;
   applied as sure). Confirm.
7. **apc person readings.** Arabic كنت and رحت are "I" and also "you (m)"; بت- verbs are "you (m)"
   and also "she". Untagged sentences now take both readings in English (applied as sure). Confirm
   that reading the Arabic either way is right when nothing in the sentence decides it.
8. **tok.**
   - soweli as *cat* or *dog* (9 rows below), which REVIEW.md tok point 3 already asks about.
   - ali in sitelen Lasina. The sitelen pona profile maps a typed *ali* to the ale logograph, but
     the Latin profile does not know it. Making ali a variant of ale there would cover every
     sentence.
   - Not proposed:
     - pan as *rice* or *grain*;
     - the future tense for plain sentences;
     - leaving out pi (*tomo mama mi*).

<!-- tables -->

## apc (183)

### Word order (38)

| Sentence | Shown | Answer | Why |
| --- | --- | --- | --- |
| `s.14` (intro.yaml) | What's your name? | `اسمك شو` | colloquial question-word-last order |
| `s.14` (intro.yaml) | What's your name? | `esmak shu` | colloquial question-word-last order |
| `s.23` (intro.yaml) | What do you want? | `بدّك شو` | colloquial question-word-last order |
| `s.23` (intro.yaml) | What do you want? | `baddak shu` | colloquial question-word-last order |
| `s.fam.16` (u02-family.yaml) | What is his name? | `اسمه شو` | colloquial question-word-last order |
| `s.fam.16` (u02-family.yaml) | What is his name? | `esmo shu` | colloquial question-word-last order |
| `s.fam.19` (u02-family.yaml) | How is your father? | `بيّك كيفه` | topic first: bayyak kifo? |
| `s.fam.19` (u02-family.yaml) | How is your father? | `bayyak kifo` | topic first: bayyak kifo? |
| `s.fam.32` (u02-family.yaml) | What is your daughter's name? | `بنتك شو اسمها` | topic first: bentak shu esma? |
| `s.fam.32` (u02-family.yaml) | What is your daughter's name? | `bentak shu esma` | topic first: bentak shu esma? |
| `s.food.27` (u03-food.yaml) | Another cup of coffee? | `فنجان قهوة كمان` | kamen after the noun; but it can also read 'a coffee too?' |
| `s.food.27` (u03-food.yaml) | Another cup of coffee? | `fenjen ahwe kamen` | kamen after the noun; but it can also read 'a coffee too?' |
| `s.home.1` (u04-home.yaml) | Where is Sami? | `سامي وين` | topic first: Sami wen? |
| `s.home.1` (u04-home.yaml) | Where is Sami? | `Sami wen` | topic first: Sami wen? |
| `s.home.19` (u04-home.yaml) | Is there a shop here? | `في هون دكّانة` | fi hon dekkene: hon before the noun |
| `s.home.19` (u04-home.yaml) | Is there a shop here? | `fi hon dekkene` | fi hon dekkene: hon before the noun |
| `s.home.25` (u04-home.yaml) | Is there a room upstairs? | `فوق في غرفة` | fo2 fi ghorfe?: the place first |
| `s.home.25` (u04-home.yaml) | Is there a room upstairs? | `fo2 fi ghorfe` | fo2 fi ghorfe?: the place first |
| `s.num.14` (u05-numbers.yaml) | How much is the coffee? | `القهوة قدّيش` | topic first: el ahwe 2addesh? |
| `s.num.14` (u05-numbers.yaml) | How much is the coffee? | `el ahwe 2addesh` | topic first: el ahwe 2addesh? |
| `s.num.27` (u05-numbers.yaml) | How old are you? | `عمرك قدّيش` | question word last: 3omrak 2addesh? |
| `s.num.27` (u05-numbers.yaml) | How old are you? | `3omrak 2addesh` | question word last: 3omrak 2addesh? |
| `s.day.10` (u06-day.yaml) | Where do you work? | `بتشتغل وين` | question word last: btishteghel wen? |
| `s.day.10` (u06-day.yaml) | Where do you work? | `btishteghel wen` | question word last: btishteghel wen? |
| `s.time.12` (u08-time.yaml) | What time is it? | `الساعة قدّيش` | question word last: el sa3a 2addesh? |
| `s.time.12` (u08-time.yaml) | What time is it? | `el sa3a 2addesh` | question word last: el sa3a 2addesh? |
| `s.time.2` (u08-time.yaml) | When do you go to work? | `بتروح عالشغل إمتى` | question word last |
| `s.time.2` (u08-time.yaml) | When do you go to work? | `btru7 3al shoghl emta` | question word last |
| `s.past.12` (u09-past.yaml) | Sami went to work. | `راح سامي عالشغل` | verb before subject |
| `s.past.12` (u09-past.yaml) | Sami went to work. | `ra7 Sami 3al shoghl` | verb before subject |
| `s.past.15` (u09-past.yaml) | When did Maya arrive? | `إمتى مايا وصلت` | subject before the verb |
| `s.past.15` (u09-past.yaml) | When did Maya arrive? | `emta Maya weslet` | subject before the verb |
| `s.past.15` (u09-past.yaml) | When did Maya arrive? | `مايا إمتى وصلت` | topic first |
| `s.past.15` (u09-past.yaml) | When did Maya arrive? | `Maya emta weslet` | topic first |
| `s.past.23` (u09-past.yaml) | Was the party nice? | `كانت الحفلة حلوة` | verb first in a question |
| `s.past.23` (u09-past.yaml) | Was the party nice? | `kenet el 7afle 7elwe` | verb first in a question |
| `s.ppl.39` (u11-people.yaml) | The neighbours came back yesterday. | `رجعوا الجيران مبارح` | verb-subject order, natural in Lebanese narration |
| `s.ppl.39` (u11-people.yaml) | The neighbours came back yesterday. | `rej3o el jiren mbere7` | verb-subject order |

### Word choice (84)

| Sentence | Shown | Answer | Why |
| --- | --- | --- | --- |
| `s.1` (intro.yaml) | Hello! | `أهلا` | ahla is the everyday Lebanese hi |
| `s.1` (intro.yaml) | Hello! | `ahla` | ahla is the everyday Lebanese hi |
| `s.1` (intro.yaml) | Hello! | `ahlan` | ahla is the everyday Lebanese hi |
| `s.16` (intro.yaml) | Hello, Sami! | `أهلا سامي` | ahla Sami, as s.1 |
| `s.16` (intro.yaml) | Hello, Sami! | `ahla Sami` | ahla Sami, as s.1 |
| `s.4` (intro.yaml) | Goodbye! | `باي` | bye is everyday Beirut speech (code-switching like merci) |
| `s.4` (intro.yaml) | Goodbye! | `bye` | bye is everyday Beirut speech (code-switching like merci) |
| `s.5` (intro.yaml) | OK, bye! | `يلّا باي` | yalla bye is everyday Beirut speech |
| `s.5` (intro.yaml) | OK, bye! | `yalla bye` | yalla bye is everyday Beirut speech |
| `s.7` (intro.yaml) | Fine! | `تمام` | tamam is a common Lebanese 'fine' |
| `s.7` (intro.yaml) | Fine! | `tamam` | tamam is a common Lebanese 'fine' |
| `s.fam.21` (u02-family.yaml) | This is grandma. | `هيدي ستّي` | setti, my grandmother, beside teta |
| `s.fam.21` (u02-family.yaml) | This is grandma. | `hayde setti` | setti, my grandmother, beside teta |
| `s.fam.22` (u02-family.yaml) | And this is grandpa. | `وهيدا جدّي` | jeddi, my grandfather, beside jeddo |
| `s.fam.3` (u02-family.yaml) | Hello, Maya! | `أهلا مايا` | ahla Maya, as s.1 |
| `s.fam.3` (u02-family.yaml) | Hello, Maya! | `ahla Maya` | ahla Maya, as s.1 |
| `s.fam.5` (u02-family.yaml) | This is Sami's father. | `هيدا أبو سامي` | abu Sami: Sami's father (also the kunya, so it may read as a name) |
| `s.fam.5` (u02-family.yaml) | This is Sami's father. | `hayda abu Sami` | abu Sami: Sami's father (also the kunya, so it may read as a name) |
| `s.fam.6` (u02-family.yaml) | This is my father. | `هيدا بابا` | baba is how Lebanese refer to their own dad |
| `s.fam.6` (u02-family.yaml) | This is my father. | `hayda baba` | baba is how Lebanese refer to their own dad |
| `s.fam.8` (u02-family.yaml) | This is my mother. | `هيدي ماما` | mama is how Lebanese refer to their own mum |
| `s.fam.8` (u02-family.yaml) | This is my mother. | `hayde mama` | mama is how Lebanese refer to their own mum |
| `s.food.17` (u03-food.yaml) | Coffee without sugar. | `قهوة بدون سكّر` | bidun, without, beside bala |
| `s.food.17` (u03-food.yaml) | Coffee without sugar. | `ahwe bidun sukkar` | bidun, without, beside bala |
| `s.food.17` (u03-food.yaml) | Coffee without sugar. | `قهوة سادة` | ahwe sada is how a Lebanese orders coffee without sugar |
| `s.food.17` (u03-food.yaml) | Coffee without sugar. | `ahwe sada` | ahwe sada is how a Lebanese orders coffee without sugar |
| `s.food.18` (u03-food.yaml) | The food is delicious! | `الأكل زاكي` | zaki, tasty, very common in Lebanon |
| `s.food.18` (u03-food.yaml) | The food is delicious! | `el akl zaki` | zaki, tasty, very common in Lebanon |
| `s.food.4` (u03-food.yaml) | Enjoy your meal! | `بالهنا والشفا` | bel hana wel shifa: the other set wish for a meal |
| `s.food.4` (u03-food.yaml) | Enjoy your meal! | `bel hana wel shifa` | bel hana wel shifa: the other set wish for a meal |
| `s.home.19` (u04-home.yaml) | Is there a shop here? | `في محل هون` | ma7al, shop, for the prompt's shop/store |
| `s.home.19` (u04-home.yaml) | Is there a shop here? | `fi ma7al hon` | ma7al, shop, for the prompt's shop/store |
| `s.like.7` (u07-likes.yaml) | I like the mountains more. | `بفضّل الجبل` | bfaddel, I prefer; the English set has I prefer the mountains |
| `s.like.7` (u07-likes.yaml) | I like the mountains more. | `bfaddel el jabal` | bfaddel, I prefer; the English set has I prefer the mountains |
| `s.time.10` (u08-time.yaml) | This week I'm busy. | `هالأسبوع أنا مشغول` | esbou3, week, beside jem3a |
| `s.time.10` (u08-time.yaml) | This week I'm busy. | `hal esbou3 ana mashghoul` | esbou3, week, beside jem3a |
| `s.time.24` (u08-time.yaml) | How many days? | `قدّيش يوم` | 2addesh also asks how many |
| `s.time.24` (u08-time.yaml) | How many days? | `2addesh yom` | 2addesh also asks how many |
| `s.plans.16` (u10-plans.yaml) | Hi, my dear! | `أهلا حبيبي` | ahla for hi, as s.1 |
| `s.plans.16` (u10-plans.yaml) | Hi, my dear! | `ahla 7abibi` | ahla for hi, as s.1 |
| `s.plans.20` (u10-plans.yaml) | I don't know. | `مش عارف` | mish 3aref, I don't know (a man) |
| `s.plans.20` (u10-plans.yaml) | I don't know. | `مش عارفة` | mish 3arfe, I don't know (a woman) |
| `s.plans.20` (u10-plans.yaml) | I don't know. | `mish 3aref` | mish 3aref, I don't know (a man) |
| `s.plans.20` (u10-plans.yaml) | I don't know. | `mish 3arfe` | mish 3arfe, I don't know (a woman) |
| `s.plans.34` (u10-plans.yaml) | Hi, my dear! | `أهلا حبيبتي` | ahla for hi, as s.1 |
| `s.plans.34` (u10-plans.yaml) | Hi, my dear! | `ahla 7abibti` | ahla for hi, as s.1 |
| `s.plans.4` (u10-plans.yaml) | Come on, let's go! | `يلّا فينا` | yalla fina, let's go |
| `s.plans.4` (u10-plans.yaml) | Come on, let's go! | `yalla fina` | yalla fina, let's go |
| `s.plans.7` (u10-plans.yaml) | How is the weather? | `كيف الجوّ` | el jaww, the weather (also the mood) |
| `s.plans.7` (u10-plans.yaml) | How is the weather? | `kif el jaww` | el jaww, the weather (also the mood) |
| `s.trip.1` (u12-trip.yaml) | I'll go to the beach tomorrow. | `حروح عالبحر بكرا` | 7a- future prefix; heard in Beirut but less usual than ra7 |
| `s.trip.1` (u12-trip.yaml) | I'll go to the beach tomorrow. | `7a ru7 3al ba7r bukra` | 7a- future prefix; heard in Beirut but less usual than ra7 |
| `s.trip.17` (u12-trip.yaml) | Next week we're going to the village. | `الأسبوع الجاي رح نروح عالضيعة` | el esbou3 for 'week', used in Beirut beside jem3a |
| `s.trip.17` (u12-trip.yaml) | Next week we're going to the village. | `el esbou3 el jey ra7 nru7 3al day3a` | el esbou3 for 'week' |
| `s.trip.29` (u12-trip.yaml) | Maya, are you going to come with us? | `مايا رح تجي معنا` | the prompt says 'come with us': tiji ma3na |
| `s.trip.29` (u12-trip.yaml) | Maya, are you going to come with us? | `Maya ra7 tiji ma3na` | the prompt says 'come with us': tiji ma3na |
| `s.health.13` (u13-health.yaml) | No, I can't go. | `لأ ما بقدر روح` | b2der, 'I can', also Lebanese though fiyyi is the usual Beirut form |
| `s.health.13` (u13-health.yaml) | No, I can't go. | `la2 ma b2der ru7` | b2der, 'I can' |
| `s.phone.14` (u14-phone.yaml) | Did you understand me? | `فهمت عليّي` | fhemt 3alayyi, the idiomatic Levantine 'did you understand me' |
| `s.phone.14` (u14-phone.yaml) | Did you understand me? | `fhemt 3layyi` | fhemt 3alayyi |
| `s.phone.15` (u14-phone.yaml) | I didn't understand you. | `ما فهمت عليك` | fhemt 3alek, the idiomatic 'understand you' |
| `s.phone.15` (u14-phone.yaml) | I didn't understand you. | `ma fhemt 3alek` | fhemt 3alek |
| `s.phone.28` (u14-phone.yaml) | I have a message. | `3endi message` | the Arabic set takes مسج; Arabizi has no spelling of it |
| `s.shop.27` (u15-shopping.yaml) | Can I try it on? | `فيّي قيسه` | 2iso, 'try (clothes) on', the shop word |
| `s.shop.27` (u15-shopping.yaml) | Can I try it on? | `fiyyi 2iso` | 2iso, 'try (clothes) on' |
| `s.date.15` (u16-dates.yaml) | In March it rains. | `بآذار بتشتّي` | btshatti, 'it rains', the verb for the English verb |
| `s.date.15` (u16-dates.yaml) | In March it rains. | `b adar btshatti` | btshatti, 'it rains' |
| `s.date.32` (u16-dates.yaml) | Once a week. | `مرّة بالأسبوع` | el esbou3 for 'week', used in Beirut beside jem3a |
| `s.date.32` (u16-dates.yaml) | Once a week. | `marra bel esbou3` | el esbou3 for 'week' |
| `s.child.2` (u17-childhood.yaml) | We used to eat at grandma's on Sunday. | `كنّا ناكل عند تيتا يوم الأحد` | yom el a7ad beside nhar el a7ad (REVIEW apc 7 'nhar vs yom'; s.time.6 takes yom) |
| `s.child.2` (u17-childhood.yaml) | We used to eat at grandma's on Sunday. | `kenna nekol 3end teta yom el a7ad` | yom el a7ad beside nhar el a7ad |
| `s.child.5` (u17-childhood.yaml) | We used to live in the village. | `كنّا ساكنين بالضيعة` | kenna seknin, 'we lived (were living)' |
| `s.child.5` (u17-childhood.yaml) | We used to live in the village. | `kenna seknin bel day3a` | kenna seknin |
| `s.child.9` (u17-childhood.yaml) | Where did you use to live? | `وين كنتي ساكنة` | kenti sekne, 'where did you live' |
| `s.child.9` (u17-childhood.yaml) | Where did you use to live? | `wen kenti sekne` | kenti sekne |
| `s.road.22` (u18-getting-around.yaml) | Turn right! | `برّم عاليمين` | barrem, 'turn', very common in Lebanese directions |
| `s.road.22` (u18-getting-around.yaml) | Turn right! | `barrem 3al yamin` | barrem, 'turn' |
| `s.road.7` (u18-getting-around.yaml) | I'm on the way. | `ana bel tari2` | bel tari2 |
| `s.work.15` (u19-work.yaml) | What do you do for work? | `شو شغلك` | shu shoghlak, 'what's your job' |
| `s.work.15` (u19-work.yaml) | What do you do for work? | `shu shoghlak` | shu shoghlak |
| `s.work.16` (u19-work.yaml) | The boss isn't here. | `المدير مانه هون` | manno, Lebanese 'he isn't' |
| `s.work.16` (u19-work.yaml) | The boss isn't here. | `el mudir manno hon` | manno, 'he isn't' |
| `s.party.2` (u20-celebrations.yaml) | Thank you! | `شكرا` | the prompt 'Thank you!' does not say it answers mabrouk; better to change the prompt |
| `s.party.2` (u20-celebrations.yaml) | Thank you! | `shukran` | as above: 'Thank you!' alone does not ask for allah ybarek fik |

### Optional words (12)

| Sentence | Shown | Answer | Why |
| --- | --- | --- | --- |
| `s.fam.17` (u02-family.yaml) | His name is Sami. | `هو اسمه سامي` | topic pronoun as in ana esmi Sami |
| `s.fam.17` (u02-family.yaml) | His name is Sami. | `huwwe esmo Sami` | topic pronoun as in ana esmi Sami |
| `s.time.9` (u08-time.yaml) | On Friday I work. | `الجمعة بشتغل` | nhar dropped; but el jem3a alone can read as this week |
| `s.time.9` (u08-time.yaml) | On Friday I work. | `el jem3a bishteghel` | nhar dropped; but el jem3a alone can read as this week |
| `s.plans.8` (u10-plans.yaml) | It's very hot! | `الدني شوب كتير` | el dene shob, the idiomatic it's hot |
| `s.plans.8` (u10-plans.yaml) | It's very hot! | `el dene shob ktir` | el dene shob, the idiomatic it's hot |
| `s.date.34` (u16-dates.yaml) | It's my first time in Lebanon. | `هيدي أوّل مرّة بلبنان` | 'It's my first time': hayde before it |
| `s.date.34` (u16-dates.yaml) | It's my first time in Lebanon. | `hayde awwal marra b Lebnen` | 'It's my first time': hayde before it |
| `s.road.27` (u18-getting-around.yaml) | Straight on, and then turn left. | `كمّل دغري وبعدين لفّ عالشمال` | kammel dighri, 'go straight on' |
| `s.road.27` (u18-getting-around.yaml) | Straight on, and then turn left. | `kammel dighri w ba3dein liff 3al shmel` | kammel dighri |
| `s.road.8` (u18-getting-around.yaml) | There's a lot of traffic. | `في عجقة سير كتير` | 3aj2et sir, 'traffic jam', with the optional sir |
| `s.road.8` (u18-getting-around.yaml) | There's a lot of traffic. | `fi 3aj2et sir ktir` | 3aj2et sir |

### Forms and spellings (7)

| Sentence | Shown | Answer | Why |
| --- | --- | --- | --- |
| `s.home.1` (u04-home.yaml) | Where is Sami? | `وينه سامي` | weno Sami? with the resumptive -o, very common |
| `s.home.1` (u04-home.yaml) | Where is Sami? | `weno Sami` | weno Sami? with the resumptive -o, very common |
| `s.home.7` (u04-home.yaml) | I'm in Beirut. | `أنا ب بيروت` | b written apart, as s.home.20 accepts ب هيدا |
| `s.num.13` (u05-numbers.yaml) | How much? | `بقدّيش` | b2addesh, for how much, the usual price question |
| `s.day.18` (u06-day.yaml) | What are you doing today? | `شو عم تعمل اليوم` | 3am progressive for what are you doing, as s.day.22 takes |
| `s.day.18` (u06-day.yaml) | What are you doing today? | `shu 3am ta3mel el yom` | 3am progressive for what are you doing, as s.day.22 takes |
| `s.shop.28` (u15-shopping.yaml) | Try it on! | `jarrbiya` | 'Try it' with the object (it: f); jarrbi already takes the m |

### Persons (21)

| Sentence | Shown | Answer | Why |
| --- | --- | --- | --- |
| `s.past.26` (u09-past.yaml) | مبارح كنت مشغول، صحّ؟ | `Yesterday I was busy, right?` | kent mashghoul is also I was busy |
| `s.ppl.11` (u11-people.yaml) | وين ساكن؟ | `Where does he live?` | a participle with no pronoun is also he/she/they |
| `s.ppl.13` (u11-people.yaml) | وين ساكنة؟ | `Where does she live?` | a participle with no pronoun is also he/she/they |
| `s.ppl.22` (u11-people.yaml) | وين ساكنين؟ | `Where do they live?` | a participle with no pronoun is also he/she/they |
| `s.trip.27` (u12-trip.yaml) | رح تروح عالضيعة بالسيّارة؟ | `Is she going to the village by car?` | unvocalized t- is also 'she' (REVIEW: English sets take only the course's reading; s.plans.2 takes both) |
| `s.trip.3` (u12-trip.yaml) | شو رح تعمل بكرا؟ | `What is she going to do tomorrow?` | unvocalized t- is also 'she' (REVIEW: English sets take only the course's reading; s.plans.2 takes both) |
| `s.health.22` (u13-health.yaml) | لازم ترتاح. | `She has to rest.` | unvocalized t- is also 'she' (REVIEW: English sets take only the course's reading; s.plans.2 takes both) |
| `s.health.24` (u13-health.yaml) | لازم تشرب مي كتير. | `She has to drink a lot of water.` | unvocalized t- is also 'she' (REVIEW: English sets take only the course's reading; s.plans.2 takes both) |
| `s.health.25` (u13-health.yaml) | ما لازم تشتغل اليوم. | `She shouldn't work today.` | unvocalized t- is also 'she' (REVIEW: English sets take only the course's reading; s.plans.2 takes both) |
| `s.health.26` (u13-health.yaml) | لازم تروح عالحكيم. | `She has to go to the doctor.` | unvocalized t- is also 'she' (REVIEW: English sets take only the course's reading; s.plans.2 takes both) |
| `s.phone.13` (u14-phone.yaml) | لأ، ما فهمت. | `No, you didn't understand.` | -t past is also 'you (m)' (REVIEW: s.plans.2 takes both readings) |
| `s.phone.19` (u14-phone.yaml) | شفته مبارح. | `You saw him yesterday.` | -t past is also 'you (m)' (REVIEW: s.plans.2 takes both readings) |
| `s.phone.20` (u14-phone.yaml) | ما شفتها. | `You didn't see her.` | -t past is also 'you (m)' (REVIEW: s.plans.2 takes both readings) |
| `s.phone.21` (u14-phone.yaml) | بتعرفه؟ | `Does she know him?` | unvocalized t- is also 'she' (REVIEW: English sets take only the course's reading; s.plans.2 takes both) |
| `s.shop.31` (u15-shopping.yaml) | شو رح تلبس الليلة؟ | `What is she going to wear tonight?` | unvocalized t- is also 'she' (REVIEW: English sets take only the course's reading; s.plans.2 takes both) |
| `s.road.15` (u18-getting-around.yaml) | وين قاعدين؟ | `Where are they staying?` | a participle with no pronoun is also he/she/they |
| `s.road.19` (u18-getting-around.yaml) | نازل ع بيروت؟ | `Is he going down to Beirut?` | a participle with no pronoun is also he/she/they |
| `s.road.20` (u18-getting-around.yaml) | رايحة عالشغل؟ | `Is she going to work?` | a participle with no pronoun is also he/she/they |
| `s.work.15` (u19-work.yaml) | شو بتشتغل؟ | `What does she do for a living?` | unvocalized t- is also 'she' (REVIEW: English sets take only the course's reading; s.plans.2 takes both) |
| `s.work.24` (u19-work.yaml) | ما رحت عالشغل لأنّه كنت مريض. | `You didn't go to work because you were sick.` | -t past is also 'you (m)' (REVIEW: s.plans.2 takes both readings) |
| `s.work.5` (u19-work.yaml) | شو بتدرس؟ | `What does she study?` | unvocalized t- is also 'she' (REVIEW: English sets take only the course's reading; s.plans.2 takes both) |

### English answers (10)

| Sentence | Shown | Answer | Why |
| --- | --- | --- | --- |
| `s.20` (intro.yaml) | بدّك شاي؟ | `You want tea?` | declarative question, informal English like the accepted 'Want tea?' |
| `s.fam.36` (u02-family.yaml) | كيفكن؟ | `How are you guys?` | kifkon is plural; informal English plural you |
| `s.food.35` (u03-food.yaml) | تفضّلوا! | `Come in, everyone!` | tfaddalo is plural |
| `s.ppl.15` (u11-people.yaml) | سامي ساكن بهيدي البناية. | `Sami lives in that building.` | the course renders hayda as this or that (s.ppl.5, s.ppl.7) |
| `s.ppl.22` (u11-people.yaml) | وين ساكنين؟ | `Where do you all live?` | plural you spelled out |
| `s.health.25` (u13-health.yaml) | ما لازم تشتغل اليوم. | `You don't have to work today.` | ma lezem also reads 'no need to'; Kline gives 'must not' for it |
| `s.shop.22` (u15-shopping.yaml) | خيّي أكبر منّي. | `My brother is bigger than me.` | akbar is also bigger; the sentence does not decide |
| `s.shop.23` (u15-shopping.yaml) | إختي أزغر منّي. | `My sister is smaller than me.` | azghar is also smaller |
| `s.child.5` (u17-childhood.yaml) | كنّا نعيش بالضيعة. | `We lived in the village.` | English simple past for the habitual kenna n3ish |
| `s.child.9` (u17-childhood.yaml) | وين كنتي تعيشي؟ | `Where did you live?` | English simple past for the habitual kenti t3ishi |

### Graded as typos (11)

| Sentence | Shown | Answer | Why |
| --- | --- | --- | --- |
| `s.2` (intro.yaml) | Thank you! | `مرسي` | merci is the course's other thanks (s.3); the prompt cannot tell them apart |
| `s.2` (intro.yaml) | Thank you! | `mersi` | merci is the course's other thanks (s.3); the prompt cannot tell them apart |
| `s.21` (intro.yaml) | No, thanks. | `la2 shokran` | shukran for merci; the prompt cannot tell them apart (s.24 takes both) |
| `s.3` (intro.yaml) | Thanks! | `shokran` | shukran is the course's other thanks (s.2); the prompt cannot tell them apart |
| `s.fam.2` (u02-family.yaml) | Who is this? | `hayde meen` | the other order, for a woman |
| `s.food.20` (u03-food.yaml) | Very tasty! | `ktir tayybe` | ktir before the adjective is as natural as after |
| `s.home.27` (u04-home.yaml) | The shop is next to the house. | `el dekkene janb el bet` | jamb, next to, as common as 7add |
| `s.num.2` (u05-numbers.yaml) | Two coffees. | `2ahwtein` | the dual, ahwtein, as natural as tnen ahwe at a cafe |
| `s.num.2` (u05-numbers.yaml) | Two coffees. | `ahwetein` | the dual, ahwtein, as natural as tnen ahwe at a cafe |
| `s.plans.19` (u10-plans.yaml) | Maybe tomorrow. | `yemken bukra` | yimken, maybe, as common as mumken |
| `s.child.14` (u17-childhood.yaml) | I was sleeping when you called. | `kent nayme lamma da22et` | the speaker is untagged: nayme |

## es (62)

### Word order (3)

| Sentence | Shown | Answer | Why |
| --- | --- | --- | --- |
| `s.u01.20` (u01-que-bola.yaml) | Are you okay? | `¿Estás bien tú?` | subject after the adjective |
| `s.u02.7` (u02-la-familia.yaml) | Is she your mom? | `¿Es tu mami ella?` | subject last, marked |
| `s.u05.3` (u05-los-numeros.yaml) | How many tostones do you want? | `¿Tú cuántos tostones quieres?` | topicalized subject before the question word, as s.u13.28 accepts (tú qué dijiste); also the usted/ustedes forms |

### Word choice (27)

| Sentence | Shown | Answer | Why |
| --- | --- | --- | --- |
| `s.u01.10` (u01-que-bola.yaml) | What's up, man? | `¿Qué bolá, hermano?` | hermano without mi, common vocative |
| `s.u01.16` (u01-que-bola.yaml) | How are you? | `¿Qué tal estás?` | How are you? in another word |
| `s.u01.16` (u01-que-bola.yaml) | How are you? | `¿Cómo te va?` | How are you doing? |
| `s.u01.38` (u01-que-bola.yaml) | Nice to meet you. | `Un placer.` | A pleasure is in the English set |
| `s.u01.38` (u01-que-bola.yaml) | Nice to meet you. | `Es un placer.` | It's a pleasure |
| `s.u02.1` (u02-la-familia.yaml) | This is my mom. | `Esta es mi madre.` | mother is in the English set; prompt shows mom |
| `s.u02.2` (u02-la-familia.yaml) | This is my dad. | `Este es mi padre.` | father is in the English set; prompt shows dad |
| `s.u02.26` (u02-la-familia.yaml) | We have a big family. | `Tenemos una gran familia.` | gran before the noun: big or great |
| `s.u02.34` (u02-la-familia.yaml) | How are your folks? | `¿Qué tal tus padres?` | qué tal = how are |
| `s.u03.2` (u03-la-casa.yaml) | My house is in Hialeah. | `Mi casa queda en Hialeah.` | quedar for where a place is, common in Cuba |
| `s.u03.22` (u03-la-casa.yaml) | The kitchen is next to the living room. | `La cocina está junto a la sala.` | junto a = next to |
| `s.u04.26` (u04-la-comida.yaml) | What do you want to drink? | `¿Qué tú quieres de tomar?` | de tomar, common Latin American and Cuban |
| `s.u05.27` (u05-los-numeros.yaml) | It's two dollars. | `Cuesta dos dólares.` | It costs two dollars |
| `s.u05.32` (u05-los-numeros.yaml) | Happy birthday! | `¡Felicidades!` | what Cubans sing at birthdays (REVIEW u04-05), but literally congratulations |
| `s.u06.1` (u06-el-barrio.yaml) | Coming, Mom! | `¡Ahí voy, mami!` | ahí voy = coming |
| `s.u06.23` (u06-el-barrio.yaml) | I walk to the bus stop. | `Voy caminando a la parada.` | I'm walking to the stop |
| `s.u06.9` (u06-el-barrio.yaml) | The bus is here! | `¡Ahí viene la guagua!` | Here comes the bus is in the English set; prompt shows The bus is here |
| `s.u06.9` (u06-el-barrio.yaml) | The bus is here! | `¡Llegó la guagua!` | the everyday way to say the bus is here |
| `s.u07.34` (u07-el-dia.yaml) | Lili is sleeping. | `Lili está dormida.` | Lili is asleep is in the English set; prompt shows sleeping |
| `s.u08.25` (u08-de-compras.yaml) | No, no! I'll pay. | `¡No, no! Yo invito.` | It's on me is in the English set |
| `s.u08.27` (u08-de-compras.yaml) | Are you paying for the T-shirts? | `¿Ustedes pagan por los pulóveres?` | pagar por = pay for |
| `s.u10.28` (u10-el-viaje.yaml) | What's the weather like in Havana? | `¿Qué tal el tiempo en La Habana?` | How's the weather in Havana? is in the English set |
| `s.u12.7` (u12-cuando-era-nino.yaml) | Every day I played baseball in the street with my friends. | `Todos los días jugaba a la pelota en la calle con mis amigos.` | jugar a la pelota beside jugar pelota and al béisbol |
| `s.u14.3` (u14-la-cocina-cubana.yaml) | First, chop this onion. | `Primero, corta esta cebolla.` | cortar = cut (up); picar is the cooking word |
| `s.u16.1` (u16-la-musica.yaml) | I love Cuban music. | `Amo la música cubana` | amar for things translates "I love"; some teachers call it an anglicism |
| `s.u16.15` (u16-la-musica.yaml) | I'm very interested in Cuban music. | `Estoy muy interesado en la música cubana` | literal translation of the prompt; interesarse construction |
| `s.u26.6` (u26-el-campo.yaml) | In the countryside people work hard, but people eat well. | `En el campo la gente trabaja mucho, pero come bien` | "people work" with la gente instead of impersonal se (unit teaches se) |

### Optional words (2)

| Sentence | Shown | Answer | Why |
| --- | --- | --- | --- |
| `s.u04.16` (u04-la-comida.yaml) | Water, please. | `Un poco de agua, por favor.` | Some water, please is in the English set |
| `s.u15.24` (u15-la-carta.yaml) | We live well, but we miss you. | `Vivimos bien, pero nosotros te extrañamos.` | pronoun in the second clause |

### Forms and spellings (8)

| Sentence | Shown | Answer | Why |
| --- | --- | --- | --- |
| `s.u08.11` (u08-de-compras.yaml) | So expensive! | `¡Qué cara!` | feminine referent (it rule), but also means What nerve! |
| `s.u13.15` (u13-los-cuentos-de-abuela.yaml) | It was a 1957 car. | `Era una máquina del 57.` | digits for the year |
| `s.u17.12` (u17-pelota-y-domino.yaml) | I've never been to Cuba. | `Nunca fui a Cuba` | LatAm/Cuban speech uses the preterite for "never" experience; course accepts preterite only in some u17 sentences |
| `s.u17.18` (u17-pelota-y-domino.yaml) | Grandma has never been back to Matanzas. | `Abuela nunca volvió a Matanzas` | preterite for "has never been back" (Cuban usage); unit teaches the perfect |
| `s.u17.19` (u17-pelota-y-domino.yaml) | Yunior has never been to Miami. | `Yunior nunca vino a Miami` | preterite for experiential "never" (Cuban usage) |
| `s.u17.9` (u17-pelota-y-domino.yaml) | I haven't talked to Aunt Marisol yet. | `Todavía no hablé con tía Marisol` | preterite with todavía no is common in LatAm speech; unit teaches the perfect |
| `s.u24.35` (u24-la-historia.yaml) | Antes, Daniel no sabía cómo su familia había llegado a Miami. | `Before, Daniel didn't know how his family got to Miami.` | English often keeps the simple past in a reported clause; unit teaches the pluperfect |
| `s.u29.35` (u29-quien-soy.yaml) | She told me that they would call me next week. | `Me dijo que me llamarán la semana que viene` | unshifted future in reported speech |

### Persons (8)

| Sentence | Shown | Answer | Why |
| --- | --- | --- | --- |
| `s.u01.18` (u01-que-bola.yaml) | How are you? | `¿Cómo estás?` | register formal is not shown: prompt How are you? is the same as s.u01.16 |
| `s.u01.19` (u01-que-bola.yaml) | Very well, and you? | `Muy bien, ¿y tú?` | register formal is not shown: prompt gives no cue for usted |
| `s.u01.19` (u01-que-bola.yaml) | Very well, and you? | `Muy bien, ¿y ustedes?` | register formal; ustedes is the formal plural too |
| `s.u01.27` (u01-que-bola.yaml) | Are you Cuban? | `¿Tú eres cubana?` | register formal is not shown: prompt Are you Cuban? (to a woman) |
| `s.u01.31` (u01-que-bola.yaml) | What's your name? | `¿Cómo te llamas?` | register formal is not shown: prompt What's your name? is the same as s.u01.29 |
| `s.u13.34` (u13-los-cuentos-de-abuela.yaml) | We got married a year later. | `Nosotras nos casamos un año después.` | untagged we: nosotras (odd in context: Cachita and Pepe) |
| `s.u13.35` (u13-los-cuentos-de-abuela.yaml) | When we came to Miami, the car didn't come with us. | `Cuando nosotras vinimos a Miami, la máquina no vino con nosotras.` | untagged we: nosotras (odd in context) |
| `s.u14.9` (u14-la-cocina-cubana.yaml) | First you chop the onion and the pepper. | `Primero tú picas la cebolla y el ají.` | generic tú with its pronoun |

### English answers (14)

| Sentence | Shown | Answer | Why |
| --- | --- | --- | --- |
| `s.u01.1` (u01-que-bola.yaml) | ¡Hola! | `Hey!` | informal hello |
| `s.u01.18` (u01-que-bola.yaml) | ¿Cómo está usted? | `How do you do?` | formal greeting, but not a real question about wellbeing |
| `s.u01.38` (u01-que-bola.yaml) | Mucho gusto. | `Nice meeting you.` | common, though usually said on parting |
| `s.u01.42` (u01-que-bola.yaml) | Yasiel es cubano. Yo también. | `Yasiel is Cuban. Me as well.` | colloquial Me as well |
| `s.u01.7` (u01-que-bola.yaml) | ¡Adiós! | `See you!` | Nos vemos is accepted for Goodbye in the reverse set; Adiós itself is goodbye |
| `s.u01.9` (u01-que-bola.yaml) | ¿Qué bolá? | `What's new?` | casual greeting, close to What's up |
| `s.u08.16` (u08-de-compras.yaml) | Necesito un pulóver. | `I need a t shirt.` | spelling with a space; if taken, every T-shirt sentence of u08 needs it |
| `s.u09.3` (u09-ayer.yaml) | Abuela compró mangos. | `Grandma has bought mangoes.` | preterite covers the present perfect when no time is named |
| `s.u09.9` (u09-ayer.yaml) | ¿Tú fuiste a Cuba? | `Have you been to Cuba?` | preterite for experience in Latin American Spanish; ha estado would be the usual |
| `s.u10.17` (u10-el-viaje.yaml) | ¿Tú tienes el pasaporte? | `Do you have your passport?` | Spanish article for one's own things |
| `s.u14.10` (u14-la-cocina-cubana.yaml) | Después, todo se fríe en aceite. | `Then fry everything in oil.` | recipe imperative for impersonal se |
| `s.u14.9` (u14-la-cocina-cubana.yaml) | Primero se pican la cebolla y el ají. | `First, chop the onion and the pepper.` | recipe imperative for impersonal se |
| `s.u17.3` (u17-pelota-y-domino.yaml) | Abuelo Pepe ha ganado tres veces hoy. | `Grandpa Pepe won three times today` | US English uses the simple past for a perfect with "today"; unit teaches the perfect |
| `s.u25.20` (u25-la-habana.yaml) | El mojito que tomé en la Bodeguita del Medio estaba muy rico. | `The mojito I had at the Bodeguita del Medio was delicious` | "muy rico" is naturally just "delicious" (English rarely says "very delicious") |

## fa (20)

### Word order (3)

| Sentence | Shown | Answer | Why |
| --- | --- | --- | --- |
| `s.20` (intro.yaml) | My name's Maryam. | `من اسمم مریم است` | topic + اسمم: 'my name is Maryam', very common |
| `s.family.3` (u02-family.yaml) | My mother's name's Maryam. | `مادرم اسمش مریم است` | topic + اسمش: 'my mother's name is Maryam', common |
| `s.family.9` (u02-family.yaml) | My brother's name's Ali. | `برادرم اسمش علی است` | topic + اسمش: 'my brother's name is Ali', common |

### Word choice (6)

| Sentence | Shown | Answer | Why |
| --- | --- | --- | --- |
| `s.1` (intro.yaml) | Hello! | `درود` | درود = hello (formal/literary greeting) |
| `s.food.14` (u04-food.yaml) | Some cold water, please. | `آب خنک لطفا` | آب خنک is how one asks for cold drinking water; literally 'cool' |
| `s.day.1` (u06-day.yaml) | I'm busy. | `من سرم شلوغ است` | idiom 'I'm busy'; prompt is 'I'm busy.' |
| `s.day.32` (u06-day.yaml) | Do you speak Persian? | `شما فارسی بلدید` | 'do you know Persian', the usual way to ask |
| `s.time.8` (u07-time.yaml) | I'm busy today. | `امروز سرم شلوغ است` | idiom 'I'm busy'; prompt is 'I'm busy today.' |
| `s.city.24` (u08-city.yaml) | Turn here. | `از اینجا بپیچید` | 'turn here' in directions |

### Optional words (1)

| Sentence | Shown | Answer | Why |
| --- | --- | --- | --- |
| `s.day.15` (u06-day.yaml) | We have lunch at the university. | `ما ناهار را در دانشگاه می\u200cخوریم` | را on a generic meal; same sentence |

### Forms and spellings (6)

| Sentence | Shown | Answer | Why |
| --- | --- | --- | --- |
| `s.family.13` (u02-family.yaml) | Who's this? | `این کی است` | کیست written apart (کجا است is accepted beside کجاست); doubt: کی is also 'when', and کیست is the usual spelling |
| `s.family.18` (u02-family.yaml) | Who's she? | `او کی است` | کیست written apart (کجا است is accepted beside کجاست); doubt: کی is also 'when', and کیست is the usual spelling |
| `s.family.26` (u02-family.yaml) | Who's that girl? | `آن دختر کی است` | کیست written apart (کجا است is accepted beside کجاست); doubt: کی is also 'when', and کیست is the usual spelling |
| `s.day.22` (u06-day.yaml) | The children are sleeping. | `بچه\u200cها خوابیده\u200cاند` | stative perfect = 'are asleep/sleeping' |
| `s.day.22` (u06-day.yaml) | The children are sleeping. | `بچه\u200cها خواب هستند` | خواب بودن = be asleep |
| `s.shopping.30` (u09-shopping.yaml) | I'll buy this one. | `این را خواهم خرید` | formal future; stiff for a purchase decision |

### Persons (1)

| Sentence | Shown | Answer | Why |
| --- | --- | --- | --- |
| `s.city.13` (u08-city.yaml) | Excuse me! | `ببخش` | untagged: تو imperative; 'sorry/excuse me' to one person |

### English answers (3)

| Sentence | Shown | Answer | Why |
| --- | --- | --- | --- |
| `s.time.13` (u07-time.yaml) | عصر چای می\u200cخوریم. | `We drink tea in the evening.` | عصر is late afternoon to early evening |
| `s.past.10` (u10-past.yaml) | چه خریدی؟ | `What have you bought?` | Persian simple past for a just-finished purchase |
| `s.past.11` (u10-past.yaml) | یک کتاب خریدم. | `I've bought a book.` | Persian simple past for a just-finished purchase |

## lzh (37)

### Word order (1)

| Sentence | Shown | Answer | Why |
| --- | --- | --- | --- |
| `s.07.35` (u07-waiting-for-rabbits.yaml) | 為人笑。 | `People laughed at him.` | active for the 為…笑 passive; same meaning, but the construction is the lesson |

### Word choice (26)

| Sentence | Shown | Answer | Why |
| --- | --- | --- | --- |
| `s.01.21` (u01-the-master-said.yaml) | 孔子，君子也。 | `Confucius is an exemplary person.` | 君子 'exemplary person' (Ames & Rosemont) |
| `s.01.36` (u01-the-master-said.yaml) | 學而時習之。 | `Learn it and practise it from time to time.` | 時 'from time to time' (a common reading of the line) |
| `s.01.47` (u01-the-master-said.yaml) | A friend comes from afar. | `有朋從遠方來` | 從 'from' (s.06.27) |
| `s.01.49` (u01-the-master-said.yaml) | 有朋自遠方來，不亦樂乎？ | `Is it not a pleasure to have friends come from afar?` | 樂 'pleasure' |
| `s.02.17` (u02-to-know-what-you-know.yaml) | 何也？ | `What is it?` | 何也 out of context can be 'What is it?' |
| `s.02.18` (u02-to-know-what-you-know.yaml) | 此何人也？ | `What kind of man is this?` | 何人 'what (kind of) man' |
| `s.02.23` (u02-to-know-what-you-know.yaml) | 諾。 | `Okay!` | 諾 as a casual assent |
| `s.02.34` (u02-to-know-what-you-know.yaml) | I will teach you. | `吾誨子` | 子 'you' as elsewhere in the course |
| `s.03.37` (u03-at-fifteen.yaml) | 吾不踰之。 | `I do not exceed it.` | 踰 'exceed' |
| `s.03.38` (u03-at-fifteen.yaml) | Do not overstep the bounds. | `勿踰矩` | the displayed English is a prohibition ('Do not ...'), which is 勿/毋 in Classical Chinese |
| `s.04.11` (u04-who-knows-others.yaml) | 王來矣。 | `Here comes the king.` | 王來矣 'the king is coming (now)' |
| `s.04.21` (u04-who-knows-others.yaml) | 知人者智。 | `Knowing others is wisdom.` | the usual nominal rendering in Laozi translations |
| `s.04.23` (u04-who-knows-others.yaml) | 自知者明。 | `Knowing yourself is enlightenment.` | nominal rendering, as in Laozi translations |
| `s.05.15` (u05-the-joy-of-fish.yaml) | 王出。 | `The king left.` | 出 'go out, leave' |
| `s.05.20` (u05-the-joy-of-fish.yaml) | 魚出遊。 | `The fish come out to play.` | 遊 'play' |
| `s.05.25` (u05-the-joy-of-fish.yaml) | 鯈魚出遊。 | `The minnows come out and play.` | 遊 'play' |
| `s.05.30` (u05-the-joy-of-fish.yaml) | Do you know it? | `女知之乎` | 女 'you' (= 汝) is accepted in unit 2's sets but not in units 5-8 |
| `s.06.15` (u06-the-sword-and-the-boat.yaml) | What are you looking for? | `女何求` | 女 'you' (= 汝), accepted in unit 2's sets but not in units 5-8 |
| `s.06.29` (u06-the-sword-and-the-boat.yaml) | From where he had marked, he went into the water to look for it. | `自其所契者入水求之` | 自 'from', paired with 從 (s.06.27) |
| `s.06.34` (u06-the-sword-and-the-boat.yaml) | 上善若水。 | `The highest virtue is like water.` | 善 'virtue' |
| `s.06.34` (u06-the-sword-and-the-boat.yaml) | The highest good is like water. | `上善如水` | 如 'be like', as 若 |
| `s.08.26` (u08-spear-and-shield.yaml) | How is this spear? | `是矛何如` | 是 as a demonstrative before a noun |
| `s.08.4` (u08-spear-and-shield.yaml) | This spear is sharp. | `是矛利` | 是 as a demonstrative before a noun ('this spear') |
| `s.09.31` (u09-fish-and-bears-paw.yaml) | 義，亦我所欲也。 | `What is right is also what I want.` | 義 'what is right' |
| `s.09.32` (u09-fish-and-bears-paw.yaml) | 舍生而取義者也。 | `I would sacrifice my life for righteousness.` | 'give up life and choose righteousness' |
| `s.10.11` (u10-moonlight.yaml) | 疑是地上霜。 | `Could it be frost on the ground?` | a common rendering of 疑是 |

### Optional words (6)

| Sentence | Shown | Answer | Why |
| --- | --- | --- | --- |
| `s.01.34` (u01-the-master-said.yaml) | It is not the time. | `非時` | 非 sentences need no 也 |
| `s.02.12` (u02-to-know-what-you-know.yaml) | This is not my friend. | `是非吾朋` | 是 for 此 without 也; but unpunctuated 是非 can read 'right and wrong' |
| `s.04.10` (u04-who-knows-others.yaml) | 吾知之矣。 | `Now I understand.` | English may drop the object of 'understand' |
| `s.05.32` (u05-the-joy-of-fish.yaml) | 子安知之？ | `How do you know?` | English may drop the object of 'know' |
| `s.05.33` (u05-the-joy-of-fish.yaml) | 吾安知之？ | `How would I know?` | English may drop the object of 'know' |
| `s.06.14` (u06-the-sword-and-the-boat.yaml) | I have lost my sword. | `吾失劍` | possessive left out, as 吾求劍 'I am looking for my sword' |

### Persons (2)

| Sentence | Shown | Answer | Why |
| --- | --- | --- | --- |
| `s.01.33` (u01-the-master-said.yaml) | 學而知之。 | `One learns it and knows it.` | no subject in the Chinese; generic 'one' |
| `s.01.44` (u01-the-master-said.yaml) | 自魯來。 | `I come from Lu.` | no subject in the Chinese; first person as possible as third |

### Graded as typos (2)

| Sentence | Shown | Answer | Why |
| --- | --- | --- | --- |
| `s.01.40` (u01-the-master-said.yaml) | 學而時習之，不亦說乎？ | `Is it not pleasing to learn and practise it at the right times?` | s.01.39 takes 'pleasing' |
| `s.06.31` (u06-the-sword-and-the-boat.yaml) | 劍不行。 | `The sword has not moved.` | the Chinese marks no tense |

## tok (39)

### Word order (10)

| Sentence | Shown | Answer | Why |
| --- | --- | --- | --- |
| `s.u03.10` (u03-mi-moku-e-kili.yaml) | Pita wants fruit and bread. | `jan Pita li wile e pan e kili` | order of coordinated objects; the course swaps en-subjects in u05.19-21 reverse sets |
| `s.u03.10` (u03-mi-moku-e-kili.yaml) | jan Pita li wile e kili e pan. | `Pita wants bread and fruit.` | order of objects joined by e (u05.19 English set treats such orders as one sentence?) |
| `s.u03.38` (u03-mi-moku-e-kili.yaml) | Lina loves books and plants. | `jan Lina li olin e kasi e lipu` | order of coordinated objects; the course swaps en-subjects in u05.19-21 reverse sets |
| `s.u03.6` (u03-mi-moku-e-kili.yaml) | She's having fruit and water. | `ona li moku e telo e kili` | order of coordinated objects; the course swaps en-subjects in u05.19-21 reverse sets |
| `s.u07.5` (u07-tenpo-ni-la.yaml) | She's at home now. | `ona li lon tomo lon tenpo ni` | time as a final lon phrase instead of a la-phrase, as u09.29 accepts (mi lape lon tenpo pimeja) |
| `s.u08.17` (u08-o-kama.yaml) | She's buying fruit and bread. | `ona li esun e pan e kili` | order of coordinated words; the course swaps en-subjects in u05.19-21 reverse sets |
| `s.u08.35` (u08-o-kama.yaml) | The man and the woman are arguing. | `meli en mije li utala kepeken toki` | order of coordinated words; the course swaps en-subjects in u05.19-21 reverse sets |
| `s.u09.31` (u09-sijelo-en-kule.yaml) | Black and white are nice colours. | `walo en pimeja li kule pona` | order of coordinated words; the course swaps en-subjects in u05.19-21 reverse sets |
| `s.u09.5` (u09-sijelo-en-kule.yaml) | This animal has a big head and a small mouth. | `soweli ni li jo e uta lili e lawa suli` | order of coordinated words; the course swaps en-subjects in u05.19-21 reverse sets |
| `s.u09.8` (u09-sijelo-en-kule.yaml) | My hands and feet are cold. | `noka mi en luka mi li lete` | order of coordinated words; the course swaps en-subjects in u05.19-21 reverse sets |

### Word choice (8)

| Sentence | Shown | Answer | Why |
| --- | --- | --- | --- |
| `s.u01.11` (u01-toki.yaml) | I'm Lina. | `nimi mi li Lina` | 'I'm Lina' as an introduction; the English set of this sentence accepts 'My name is Lina' (and u05.15 the converse) |
| `s.u01.7` (u01-toki.yaml) | I speak Toki Pona. | `mi toki kepeken toki pona` | 'speak (in) Toki Pona' as toki kepeken toki pona |
| `s.u04.29` (u04-pona-ala-pona.yaml) | Bye, Pita! | `awen pona jan Pita` | 'Bye' does not say who leaves; awen pona is bye to the one staying |
| `s.u05.29` (u05-jan-pi-toki-pona.yaml) | I'm a member of this group. | `mi lon kulupu ni` | 'a member of this group': the English set accepts 'I'm in this group' |
| `s.u05.4` (u05-jan-pi-toki-pona.yaml) | This is very good! | `ni li pona a` | 'very good!' with a: u01.35 (pona a!) accepts Very good! |
| `s.u06.29` (u06-mi-lon-tomo.yaml) | I'm Canadian. | `mi tan ma Kanata` | 'I'm Canadian': the English set accepts 'I'm from Canada' |
| `s.u06.37` (u06-mi-lon-tomo.yaml) | I go to the city by car. | `mi tawa ma tomo kepeken ilo tawa` | car/vehicle as ilo tawa beside tomo tawa (both in common use) |
| `s.u08.12` (u08-o-kama.yaml) | Maybe Tomasi is coming. | `jan Tomasi li ken kama` | 'Tomasi may come' as preverb ken; the English set accepts may/might come |

### Optional words (3)

| Sentence | Shown | Answer | Why |
| --- | --- | --- | --- |
| `s.u01.38` (u01-toki.yaml) | I'm eating! | `mi moku` | prompt 'I'm eating!': the ! alone may not need a (toki! has reverse toki) |
| `s.u08.33` (u08-o-kama.yaml) | Mila, the bug isn't dead. It's just sleeping. | `jan Mila pipi li moli ala ona li lape taso` | vocative without o as in u01.31; but jan Mila pipi may read as 'Mila's bug' |
| `s.u09.19` (u09-sijelo-en-kule.yaml) | I like the colour red. | `loje li pona tawa mi` | 'the colour red' as loje alone; the English set accepts 'I like red' |

### English answers (13)

| Sentence | Shown | Answer | Why |
| --- | --- | --- | --- |
| `s.u01.16` (u01-toki.yaml) | mi moku. | `I'm drinking.` | moku covers eating and drinking (u08.2 accepts Drink this!); bare mi moku reads as eating first |
| `s.u01.38` (u01-toki.yaml) | mi moku a! | `I eat!` | simple present as in u01.16 |
| `s.u02.18` (u02-soweli-li-lape.yaml) | jan Mila li jan lili. | `Mila is a little kid.` | jan lili = little kid |
| `s.u02.27` (u02-soweli-li-lape.yaml) | soweli ni li suwi. | `This cat is cute.` | soweli = land mammal; other sets accept cat/dog (u05.27, u06.11, u07.14); REVIEW flags soweli as cat/dog |
| `s.u02.35` (u02-soweli-li-lape.yaml) | seli li suli. | `The fire is huge.` | suli = big; u02.19 accepts huge |
| `s.u02.38` (u02-soweli-li-lape.yaml) | soweli li seli. kala li lete. | `The dog is warm. The fish is cold.` | soweli = land mammal; other sets accept cat/dog (u05.27, u06.11, u07.14); REVIEW flags soweli as cat/dog |
| `s.u02.8` (u02-soweli-li-lape.yaml) | soweli li lape. | `The cat is sleeping.` | soweli = land mammal; other sets accept cat/dog (u05.27, u06.11, u07.14); REVIEW flags soweli as cat/dog |
| `s.u02.8` (u02-soweli-li-lape.yaml) | soweli li lape. | `The dog is sleeping.` | soweli = land mammal; other sets accept cat/dog (u05.27, u06.11, u07.14); REVIEW flags soweli as cat/dog |
| `s.u03.13` (u03-mi-moku-e-kili.yaml) | mi jo e soweli. | `I have a dog.` | soweli = land mammal; other sets accept cat/dog (u05.27, u06.11, u07.14); REVIEW flags soweli as cat/dog |
| `s.u03.20` (u03-mi-moku-e-kili.yaml) | mi lukin e soweli. | `I see a dog.` | soweli = land mammal; other sets accept cat/dog (u05.27, u06.11, u07.14); REVIEW flags soweli as cat/dog |
| `s.u03.3` (u03-mi-moku-e-kili.yaml) | soweli li moku e kili. | `The dog is eating fruit.` | soweli = land mammal; other sets accept cat/dog (u05.27, u06.11, u07.14); REVIEW flags soweli as cat/dog |
| `s.u03.36` (u03-mi-moku-e-kili.yaml) | soweli li moku e kasi. | `The dog is eating grass.` | soweli = land mammal; other sets accept cat/dog (u05.27, u06.11, u07.14); REVIEW flags soweli as cat/dog |
| `s.u03.37` (u03-mi-moku-e-kili.yaml) | mi olin e soweli mi. | `I love my dog.` | soweli = land mammal; other sets accept cat/dog (u05.27, u06.11, u07.14); REVIEW flags soweli as cat/dog (the set has pet) |

### Graded as typos (5)

| Sentence | Shown | Answer | Why |
| --- | --- | --- | --- |
| `s.u02.20` (u02-soweli-li-lape.yaml) | akesi li lape. | `The lizards slept.` | plural past missing |
| `s.u03.18` (u03-mi-moku-e-kili.yaml) | jan Lina li jo e soweli e waso e kala. | `Lina had a pet, a bird and a fish.` | no tense; u03.14 accepts had |
| `s.u03.33` (u03-mi-moku-e-kili.yaml) | ona li olin e mi. | `She loved me.` | no tense; u05.8 accepts loved |
| `s.u03.35` (u03-mi-moku-e-kili.yaml) | jan Mila li olin e kasi. | `Mila loved plants.` | no tense |
| `s.u03.38` (u03-mi-moku-e-kili.yaml) | jan Lina li olin e lipu e kasi. | `Lina loved books and plants.` | no tense |

## uz (68)

### Word order (16)

| Sentence | Shown | Answer | Why |
| --- | --- | --- | --- |
| `s.6` (intro.yaml) | Hello, Aziz! | `Aziz, salom` | vocative before the greeting; natural, but the English puts the name last |
| `s.6` (intro.yaml) | Hello, Aziz! | `Азиз, салом` | vocative before the greeting; natural, but the English puts the name last |
| `s.home.10` (u03-home.yaml) | Who's at home? | `Kim uyda` | 'Who is at home?' without bor; colloquial |
| `s.home.10` (u03-home.yaml) | Who's at home? | `Ким уйда` | 'Who is at home?' without bor; colloquial |
| `s.home.30` (u03-home.yaml) | There's nobody at home. | `Hech kim uyda yoʻq` | subject before the locative ('Nobody is at home'), grammatical, less usual |
| `s.home.30` (u03-home.yaml) | There's nobody at home. | `Ҳеч ким уйда йўқ` | subject before the locative ('Nobody is at home'), grammatical, less usual |
| `s.day.18` (u07-day.yaml) | I go to work every day. | `Men ishga har kuni boraman` | time adverbial before the verb (focus on 'every day') |
| `s.day.18` (u07-day.yaml) | I go to work every day. | `Мен ишга ҳар куни бораман` | time adverbial before the verb (focus on 'every day') |
| `s.bazaar.19` (u08-bazaar.yaml) | I like grapes. | `Uzum menga yoqadi` | subject before the experiencer |
| `s.bazaar.19` (u08-bazaar.yaml) | I like grapes. | `Узум менга ёқади` | subject before the experiencer |
| `s.past.3` (u09-past.yaml) | I came to Tashkent yesterday. | `Men Toshkentga kecha keldim` | time adverbial before the verb (focus on 'yesterday') |
| `s.past.3` (u09-past.yaml) | I came to Tashkent yesterday. | `Мен Тошкентга кеча келдим` | time adverbial before the verb (focus on 'yesterday') |
| `s.travel.12` (u10-travel.yaml) | Which season do you like? | `Qaysi fasl sizga yoqadi` | subject before the experiencer |
| `s.travel.12` (u10-travel.yaml) | Which season do you like? | `Қайси фасл сизга ёқади` | subject before the experiencer |
| `s.travel.8` (u10-travel.yaml) | It snows in winter. | `Qor qishda yogʻadi` | subject before the time adverbial |
| `s.travel.8` (u10-travel.yaml) | It snows in winter. | `Қор қишда ёғади` | subject before the time adverbial |

### Word choice (18)

| Sentence | Shown | Answer | Why |
| --- | --- | --- | --- |
| `s.26` (intro.yaml) | What's your name? | `Ismingiz kim` | colloquial 'what is your name' with kim; heard often, less standard than nima |
| `s.26` (intro.yaml) | What's your name? | `Исмингиз ким` | colloquial 'what is your name' with kim; heard often, less standard than nima |
| `s.home.5` (u03-home.yaml) | Your house is very beautiful! | `Uyingiz juda goʻzal` | go'zal = beautiful; fine of a house but less usual than chiroyli |
| `s.home.5` (u03-home.yaml) | Your house is very beautiful! | `Уйингиз жуда гўзал` | go'zal = beautiful; fine of a house but less usual than chiroyli |
| `s.food.22` (u05-food.yaml) | I'll take this apple. | `Shu olmani olaman` | shu = this (the one here), natural when buying |
| `s.food.22` (u05-food.yaml) | I'll take this apple. | `Шу олмани оламан` | shu = this (the one here), natural when buying |
| `s.city.19` (u06-city.yaml) | Excuse me, where's the bazaar? | `Kechirasiz, bozor qani` | qani = qayerda, as s.11 and s.home.14 take; a little blunt for asking a stranger |
| `s.city.19` (u06-city.yaml) | Excuse me, where's the bazaar? | `Кечирасиз, бозор қани` | qani = qayerda, as s.11 and s.home.14 take; a little blunt for asking a stranger |
| `s.city.30` (u06-city.yaml) | Where's the metro station? | `Metro bekati qani` | qani = qayerda |
| `s.city.30` (u06-city.yaml) | Where's the metro station? | `Метро бекати қани` | qani = qayerda |
| `s.bazaar.9` (u08-bazaar.yaml) | These grapes are very sweet. | `Shu uzum juda shirin` | shu = this |
| `s.bazaar.9` (u08-bazaar.yaml) | These grapes are very sweet. | `Шу узум жуда ширин` | shu = this |
| `s.past.10` (u09-past.yaml) | My friend and I had tea. | `Oʻrtogʻim bilan choy ichdik` | o'rtoq = friend (colloquial) |
| `s.past.10` (u09-past.yaml) | My friend and I had tea. | `Ўртоғим билан чой ичдик` | o'rtoq = friend (colloquial) |
| `s.travel.2` (u10-travel.yaml) | What's the weather like today? | `Bugun havo qalay` | qalay = qanday 'how', colloquial |
| `s.travel.2` (u10-travel.yaml) | What's the weather like today? | `Бугун ҳаво қалай` | qalay = qanday 'how', colloquial |
| `s.travel.24` (u10-travel.yaml) | Where's the hotel? | `Mehmonxona qani` | qani = qayerda |
| `s.travel.24` (u10-travel.yaml) | Where's the hotel? | `Меҳмонхона қани` | qani = qayerda |

### Optional words (12)

| Sentence | Shown | Answer | Why |
| --- | --- | --- | --- |
| `s.family.33` (u02-family.yaml) | He's not my older brother. | `Mening akam emas` | 3rd-person subject dropped, as s.home.9 takes [u] uyda emas |
| `s.family.33` (u02-family.yaml) | He's not my older brother. | `Менинг акам эмас` | 3rd-person subject dropped, as s.home.9 takes [u] uyda emas |
| `s.city.18` (u06-city.yaml) | I'll go with my older brother. | `Akam bilan birga boraman` | birga 'together' is a natural optional word with bilan |
| `s.city.18` (u06-city.yaml) | I'll go with my older brother. | `Акам билан бирга бораман` | birga 'together' is a natural optional word with bilan |
| `s.bazaar.13` (u08-bazaar.yaml) | I need some bread. | `Non kerak` | menga dropped as s.bazaar.16 does; but kerak has no person ending, so 'I' is lost |
| `s.bazaar.13` (u08-bazaar.yaml) | I need some bread. | `Нон керак` | menga dropped as s.bazaar.16 does; but kerak has no person ending, so 'I' is lost |
| `s.bazaar.14` (u08-bazaar.yaml) | What do you need? | `Nima kerak` | the shopkeeper's 'What do you need?'; kerak has no person ending |
| `s.bazaar.14` (u08-bazaar.yaml) | What do you need? | `Нима керак` | the shopkeeper's 'What do you need?'; kerak has no person ending |
| `s.travel.18` (u10-travel.yaml) | I'll go with my family. | `Oilam bilan birga boraman` | birga 'together' with bilan |
| `s.travel.18` (u10-travel.yaml) | I'll go with my family. | `Оилам билан бирга бораман` | birga 'together' with bilan |
| `s.travel.22` (u10-travel.yaml) | What time does the train leave? | `Poyezd nechada ketadi` | soat dropped, colloquial |
| `s.travel.22` (u10-travel.yaml) | What time does the train leave? | `Поезд нечада кетади` | soat dropped, colloquial |

### Forms and spellings (13)

| Sentence | Shown | Answer | Why |
| --- | --- | --- | --- |
| `s.family.24` (u02-family.yaml) | This is our family. | `Bu bizning oila` | colloquial 1pl possessive without the suffix; spoken, not standard written |
| `s.family.24` (u02-family.yaml) | This is our family. | `Бу бизнинг оила` | colloquial 1pl possessive without the suffix; spoken, not standard written |
| `s.home.31` (u03-home.yaml) | I don't have my key. | `Kalitim menda yoʻq` | 'I don't have my key (on me)', literal for the prompt |
| `s.home.31` (u03-home.yaml) | I don't have my key. | `Калитим менда йўқ` | 'I don't have my key (on me)', literal for the prompt |
| `s.numbers.9` (u04-numbers.yaml) | How many older brothers do you have? | `Akangiz nechta` | colloquial 'how many older brothers do you have' |
| `s.numbers.9` (u04-numbers.yaml) | How many older brothers do you have? | `Акангиз нечта` | colloquial 'how many older brothers do you have' |
| `s.city.5` (u06-city.yaml) | Where are you going? | `Siz qayerga ketasiz` | aorist of ketmoq beside ketyapsiz; natural but more 'where will you go off to' |
| `s.day.33` (u07-day.yaml) | My younger brother is sleeping. | `Ukam uxlab yotibdi` | colloquial progressive 'is (lying) asleep' |
| `s.day.33` (u07-day.yaml) | My younger brother is sleeping. | `Укам ухлаб ётибди` | colloquial progressive 'is (lying) asleep' |
| `s.past.25` (u09-past.yaml) | I came last week. | `Oʻtgan haftada keldim` | locative on the time noun; both forms are used |
| `s.past.25` (u09-past.yaml) | I came last week. | `Ўтган ҳафтада келдим` | locative on the time noun; both forms are used |
| `s.travel.5` (u10-travel.yaml) | It's raining. | `Yomgʻir yogʻmoqda` | literary progressive -moqda |
| `s.travel.5` (u10-travel.yaml) | It's raining. | `Ёмғир ёғмоқда` | literary progressive -moqda |

### English answers (7)

| Sentence | Shown | Answer | Why |
| --- | --- | --- | --- |
| `s.13` (intro.yaml) | Bu kitob juda yaxshi. | `This book is really good.` | juda = very; 'really good' is the common English intensifier |
| `s.9` (intro.yaml) | Bu nima? | `What's that?` | s.family.7 takes 'Who's that?' for Bu kim? |
| `s.numbers.4` (u04-numbers.yaml) | U yaxshi kishi. | `He's a good man.` | kishi can be 'man'; only fits the 'he' reading |
| `s.food.24` (u05-food.yaml) | Men goʻsht yemayman. | `I won't eat meat.` | aorist negative also reads as a refusal |
| `s.day.34` (u07-day.yaml) | Nima qilyapsizlar? | `What are you guys doing?` | informal plural you |
| `s.day.6` (u07-day.yaml) | Ertalab nima qilasiz? | `What will you do in the morning?` | the aorist is also future |
| `s.past.20` (u09-past.yaml) | Toʻydim, rahmat. | `I've had enough, thank you.` | to'ymoq = be full, sated |

### Graded as typos (2)

| Sentence | Shown | Answer | Why |
| --- | --- | --- | --- |
| `s.city.4` (u06-city.yaml) | I'm going to the bazaar. | `Мен бозорга кетаман` | s.city.3 takes ketaman for 'I'm going home'; ketyapman is already here; already passes only as CORRECT_WITH_TYPO in this orthography, listed for parity with the Latin set |
| `s.city.5` (u06-city.yaml) | Where are you going? | `Сиз қаерга кетасиз` | aorist of ketmoq beside ketyapsiz; natural but more 'where will you go off to'; already passes only as CORRECT_WITH_TYPO in this orthography, listed for parity with the Latin set |

## yue (25)

### Word order (3)

| Sentence | Shown | Answer | Why |
| --- | --- | --- | --- |
| `s.u03.31` (u03-numbers.yaml) | I'll buy this book. | `呢本書我買` | object topicalized, common when choosing in a shop |
| `s.u04.14` (u04-food.yaml) | I don't drink coffee. | `咖啡我唔飲` | object topicalized; natural but contrastive |
| `s.u04.7` (u04-food.yaml) | I don't eat beef. | `牛肉我唔食` | object topicalized; natural but contrastive ("beef, I don't eat") |

### Word choice (3)

| Sentence | Shown | Answer | Why |
| --- | --- | --- | --- |
| `s.u04.33` (u04-food.yaml) | I'd like to have dim sum. | `我想去飲茶` | 飲茶 = having dim sum (s.22); adds "go" |
| `s.u07.11` (u07-transport.yaml) | Let's walk there. | `我哋行過去啦` | 行過去 = walk (over) there |
| `s.u07.2` (u07-transport.yaml) | I take the MTR to work. | `我坐地鐵返工` | 坐 for 搭 with transport is heard, but 搭 is the Cantonese norm |

### Optional words (6)

| Sentence | Shown | Answer | Why |
| --- | --- | --- | --- |
| `s.u04.1` (u04-food.yaml) | What are you eating? | `你想食啲咩呀` | 啲 "some" is optional in 想食啲咩; the set already takes 你想食咩呀 |
| `s.u04.33` (u04-food.yaml) | I'd like to have dim sum. | `我想去食點心` | "I'd like to (go and) have dim sum"; 去 adds "go" |
| `s.u04.43` (u04-food.yaml) | What are you eating? | `你哋想食啲咩呀` | as u04.1 (set already takes 你哋想食咩) |
| `s.u07.31` (u07-transport.yaml) | Get on! | `上車` | bare imperative "Get on!"; curt without 啦 |
| `s.u10.18` (u10-plans.yaml) | Take an umbrella! | `帶遮` | bare imperative "Take an umbrella!"; curt without 啦 |
| `s.u10.29` (u10-plans.yaml) | Next time, then. | `下次` | "Next time." without 啦 |

### Forms and spellings (11)

| Sentence | Shown | Answer | Why |
| --- | --- | --- | --- |
| `s.11` (intro.yaml) | 係你呀？ | `Was it you?` | no tense marked; but 係咪你 is likelier for a past question |
| `s.u03.16` (u03-numbers.yaml) | That cat is very pretty. | `果隻貓好靚` | 果 for 嗰 is a common informal typing (cf. accepted 既/野/黎) |
| `s.u04.41` (u04-food.yaml) | You're welcome! | `唔洗客氣` | 洗 for 使 (sai2) is a very common typing, like the accepted 駛 |
| `s.u05.1` (u05-places.yaml) | Where are you going? | `你去邊到呀` | 到 for 度 is a common informal typing |
| `s.u06.2` (u06-time.yaml) | What time is it now? | `宜家幾點呀` | 宜家 is a common spelling of 而家 (依家 already accepted) |
| `s.u06.3` (u06-time.yaml) | It's three o'clock now. | `宜家三點` | 宜家 spelling of 而家 |
| `s.u06.4` (u06-time.yaml) | It's half past three now. | `宜家三點半` | 宜家 spelling of 而家 |
| `s.u06.5` (u06-time.yaml) | It's ten past ten now. | `宜家十點兩個字` | 宜家 spelling of 而家 |
| `s.u06.6` (u06-time.yaml) | It's half past twelve now. | `宜家十二點半` | 宜家 spelling of 而家 |
| `s.u08.22` (u08-shopping.yaml) | Do you have a smaller one? | `有冇細D呀` | D for 啲 is a very common informal typing |
| `s.u10.10` (u10-plans.yaml) | It's raining now. | `宜家落緊雨` | 宜家 spelling of 而家 |

### English answers (2)

| Sentence | Shown | Answer | Why |
| --- | --- | --- | --- |
| `s.u05.9` (u05-places.yaml) | 我嚟喇！ | `Here I come!` | 我嚟喇 announces one's coming |
| `s.u10.30` (u10-plans.yaml) | 我一定去！ | `I'll definitely come!` | English "come" toward the listener's event where Cantonese says 去 |
