# apc: what the course pins that the projections do not give back

Written by `docs/prototypes/apc-lexical-forms/build.py`; do not edit by hand. The schema is in
[apc.md](apc.md), the entries in [apc.yaml](apc.yaml).

This is the review list Task B asks for. Nothing in `courses/apc` was changed to make it shorter.
Each line is a word as the course writes it (Arabic / Arabizi), where it first stands, and what does
not come back when its drafted lexical form is projected. A line is a question for a reader of
Lebanese, not a verdict: the course may be right and the convention wrong.

## In numbers

- **1025** distinct words in the sentences and stories (Arabic, its marks and its Arabizi together).
- **951** come back exactly in all three: the Arabic spelling, the vowel marks, and the Arabizi among the spellings the correspondences give.
- **65** have a lexical form and do not come back in one of the three.
- **9** have no lexical form.
- **352** lexemes with **354** listed forms: 314 come back, 34 do not, 2 have no form, 4 are written in one script only.
- **41** verbs with citation forms, 40 of them with radicals and a Form and 1 a listed stem; 256 of their forms in the sentences are pinned, since no conjugation rule is written yet.
- **74** clips a listener marked right: for 58 the projection writes the very marks the voice was given; for 16 it writes other marks for a word; 0 were given text the sentences no longer hold.

## 1. Not paired by the prototype's reader (10)

Not a finding about the course: in these sentences the two scripts order or split their words differently (a phrase that is one lexeme), and the reader took the wrong Arabizi token for the Arabic word. They are counted among the words that do not come back.

- وسهلا / w (u10-plans:s.plans.28)
- التاني / el (u16-dates:s.date.13)
- وإنت / w (u16-dates:s.date.29)
- سالم / enta (u16-dates:s.date.29)
- وإنتي / w (u16-dates:s.date.30)
- سالمة / enti (u16-dates:s.date.30)
- وإنتو / w (u16-dates:s.date.31)
- سالمين / ento (u16-dates:s.date.31)
- وإِنْتي / w (u16-dates:apc.story.birthday#7)
- سالْمِة / enti (u16-dates:apc.story.birthday#7)

## 2. No lexical form (8)

The Arabic and the Arabizi could not be read as one word, letter by letter.

- `lexeme:miyye` مية / mit: مِيِّة cannot be read as mit
- `lexeme:inshalla` إن شاء الله / inshalla: إِن شاء الله is 3 words and inshalla is 1
- الفوتبول / el football (u07-likes:s.like.23): الفوتْبول cannot be read as el football
- بالتاكسي / bel taxi (u18-getting-around:s.road.3): بِالتّاكْسي cannot be read as bel taxi
- التاكسي / el taxi (u18-getting-around:s.road.4): التّاكْسي cannot be read as el taxi
- الباص / el bus (u18-getting-around:s.road.5): الباص cannot be read as el bus
- بِالسِّرْفيس / bel servees (u18-getting-around:apc.story.service#1): بِالسِّرْفيس cannot be read as bel servees
- الامتحان / el emte7an (u19-work:s.work.11): drafted ا\u06dfلْاِمْتِحَان, which is not a form: 'ا\u06dfلْاِمْتِحَان': an alef inside a word is a length letter, a seat, or silent

## 3. The article before a sun letter, with the letter not doubled (12)

These come back, since the form was drafted from the marks: but the marks have no shadda on a sun letter after the article, where other words of the course have one (السَّلامِة, الجّامْعَة). Kline counts jim a sun letter in Lebanese (p. 8).

- الجِبْنِة / el jebne (u05-numbers:apc.story.dekkene#8): no shadda on ج
- والجِبْنِة / w el jebne (u05-numbers:apc.story.dekkene#10): no shadda on ج
- الجَبَل / el jabal (u07-likes:s.like.5): no shadda on ج
- الجَبَل / el jabal (u07-likes:apc.story.sea-or-mountain#1): no shadda on ج
- الجِمْعَة / el jem3a (u08-time:s.time.9): no shadda on ج
- هَالجِمْعَة / hal jem3a (u08-time:s.time.10): no shadda on ج
- عَالجَبَل / 3al jabal (u08-time:apc.story.free-on-saturday#2): no shadda on ج
- عَالجَبَل / 3al jabal (u09-past:s.past.17): no shadda on ج
- الجِمْعَة / el jem3a (u09-past:apc.story.weekend#0): no shadda on ج
- بِالجَبَل / bel jabal (u11-people:s.ppl.35): no shadda on ج
- بِالجِمْعَة / bel jem3a (u16-dates:s.date.32): no shadda on ج
- هَالجِمْعَة / hal jem3a (u19-work:apc.story.new-job#6): no shadda on ج

## 4. The Arabizi is not this word's sounds in Arabizi's letters (5)

A loan kept in its French or English spelling (merci, football, taxi), or two different forms of a word in the two scripts (the teens: Arabic with -ar, Arabizi without). No correspondence gives the spelling; it has to be listed with the word, or the Arabizi changed.

- فوتبول / football (u07-likes:s.like.24): Arabizi not read: فوتْبول cannot be read as football: arabizi: football is not among the projected spellings (futbul first)
- حدعشر / 7da3sh (u16-dates:s.date.1): Arabizi not read: حْدَعْشَر cannot be read as 7da3sh: arabizi: 7da3sh is not among the projected spellings (7da3shar first)
- تنعشر / tna3sh (u16-dates:s.date.4): Arabizi not read: تْنَعْشَر cannot be read as tna3sh: arabizi: tna3sh is not among the projected spellings (tna3shar first)
- تْلاتَعْشَر / tleta3sh (u16-dates:apc.story.birthday#1): Arabizi not read: تْلاتَعْشَر cannot be read as tleta3sh: arabizi: tleta3sh is not among the projected spellings (tlata3shar first)
- سرفيس / servees (u18-getting-around:s.road.1): Arabizi not read: سِرْفيس cannot be read as servees: arabizi: servees is not among the projected spellings (serfis first)

## 5. The marks and the Arabizi give different vowels (17)

One of the two is wrong, or the word is said both ways. The drafted form follows the Arabizi where it has a vowel and the marks where it has none.

- عندكن / 3endkon (u02-family:s.fam.37): vowel: marked i, none in Arabizi: arabizi: 3endkon is not among the projected spellings (3enedkon first)
- بنتكن / bentkon (u02-family:s.fam.38): vowel: marked i, none in Arabizi: arabizi: bentkon is not among the projected spellings (benetkon first)
- بقرا / b2ra (u06-day:s.day.15): vowel: marked i, none in Arabizi: arabizi: b2ra is not among the projected spellings (be2ra first)
- بحكي / b7ki (u06-day:s.day.23): vowel: marked i, none in Arabizi: arabizi: b7ki is not among the projected spellings (be7ki first)
- بتحكي / bt7ki (u06-day:s.day.24): vowel: marked i, none in Arabizi: arabizi: bt7ki is not among the projected spellings (bte7ki first)
- بِقْرا / b2ra (u06-day:apc.story.my-day#8): vowel: marked i, none in Arabizi: arabizi: b2ra is not among the projected spellings (be2ra first)
- بْتِحْكي / bt7ki (u11-people:apc.story.neighbours#3): vowel: marked i, none in Arabizi: arabizi: bt7ki is not among the projected spellings (bte7ki first)
- تحكي / t7ki (u13-health:s.health.16): vowel: marked i, none in Arabizi: arabizi: t7ki is not among the projected spellings (te7ki first)
- سمعتني / sme3tni (u14-phone:s.phone.11): vowel: marked i, none in Arabizi: arabizi: sme3tni is not among the projected spellings (sme3etni first)
- فهمتني / fhemtni (u14-phone:s.phone.14): vowel: marked i, none in Arabizi: arabizi: fhemtni is not among the projected spellings (fhemetni first)
- بعتلي / ba3atli (u14-phone:s.phone.30): vowel: Arabizi a where the marks have a sukun: marks: projected بَعَتْلي, pinned بْعَتْلي
- سْمِعِتْني / sme3tni (u14-phone:apc.story.teta-calls#1): vowel: marked i, none in Arabizi: arabizi: sme3tni is not among the projected spellings (sme3etni first)
- خمستعشر / khamsta3shar (u16-dates:s.date.7): vowel: marked i, none in Arabizi: arabizi: khamsta3shar is not among the projected spellings (khamesta3shar first)
- تسعتعشر / tsa3ta3shar (u16-dates:s.date.11): vowel: marked i, none in Arabizi: arabizi: tsa3ta3shar is not among the projected spellings (tesa3ta3shar first)
- بعدني / ba3dni (u17-childhood:s.child.20): vowel: marked i, none in Arabizi: arabizi: ba3dni is not among the projected spellings (ba3edni first)
- عملي / 3emli (u18-getting-around:s.road.26): vowel: Arabizi e where the marks have a sukun; vowel: marked i, none in Arabizi: marks: projected عِمِلي, pinned عْمِلي; arabizi: 3emli is not among the projected spellings (3emeli first)
- بَعِدْني / ba3dni (u19-work:apc.story.new-job#5): vowel: marked i, none in Arabizi: arabizi: ba3dni is not among the projected spellings (ba3edni first)

## 6. Doubled in one script and not in the other (10)

A doubled letter tells words apart (mara, a woman; marra, once), so the projection writes it twice and takes nothing else. Here the marks have a shadda and the Arabizi one letter (bas, nos), or the Arabizi doubles a letter the marks leave single (a loan's spelling: dollar).

- صحتين / sa77tein (u03-food:s.food.4): doubled in Arabizi, no shadda in the course's marks: marks: projected صَحّْتين, pinned صَحْتين
- بسّ / bas (u03-food:s.food.22): doubled in the marks, written once in Arabizi: arabizi: bas is not among the projected spellings (bass first)
- صَحْتين / sa77tein (u03-food:apc.story.teta-lunch#2): doubled in Arabizi, no shadda in the course's marks: marks: projected صَحّْتين, pinned صَحْتين
- بَسّ / bas (u03-food:apc.story.teta-lunch#5): doubled in the marks, written once in Arabizi: arabizi: bas is not among the projected spellings (bass first)
- بالدولار / bel dollar (u05-numbers:s.num.11): doubled in Arabizi, no shadda in the course's marks: marks: projected بِالدّولّار, pinned بِالدّولار
- دولار / dollar (u05-numbers:s.num.17): doubled in Arabizi, no shadda in the course's marks: marks: projected دولّار, pinned دولار
- هلّق / hala2 (u06-day:s.day.22): doubled in the marks, written once in Arabizi: arabizi: hala2 is not among the projected spellings (halla2 first)
- ونصّ / w nos (u08-time:s.time.14): doubled in the marks, written once in Arabizi: arabizi: w nos is not among the projected spellings (wnoss first)
- ونُصّ / w nos (u08-time:apc.story.free-on-saturday#6): doubled in the marks, written once in Arabizi: arabizi: w nos is not among the projected spellings (wnoss first)
- هَلَّق / hala2 (u19-work:apc.story.new-job#0): doubled in the marks, written once in Arabizi: arabizi: hala2 is not among the projected spellings (halla2 first)

## 7. A letter is written and the Arabizi does not say it (1)

Arabizi writes the word as it is said, Arabic as it is built (3enna, written with its d).

- عندنا / 3enna (u12-trip:s.trip.13): written, not said: د: marks: projected عِنْدنا, pinned عِنْدْنا

## 8. A letter with two sounds, said as the one the projection does not write (1)

The course spells a stop with its own letter nearly everywhere, so each of these letters has one sound in it; here the letter is the fricative's and the Arabizi the stop's. Either the word is respelled or the lexical form needs a sign for it (the note, 'Letters whose sound is not their letter's').

- بآذار / b adar (u16-dates:s.date.15): letter and sound: ذ written d in Arabizi: arabizi: b adar is not among the projected spellings (bazar first)

## 9. ay and aw: the marks and the Arabizi differ, or the glide has no sukun (11)

The course writes a diphthong's glide with a sukun in some words (عَيْلِة) and without in others (هَيدا); and the marks write ay where the Arabizi has a long e (7zeiran).

- هيدا / hayda (u02-family:s.fam.1): marks: projected هَيْدا, pinned هَيدا
- هيدي / hayde (u02-family:s.fam.4): marks: projected هَيْدي, pinned هَيدي
- وهيدي / w hayde (u02-family:s.fam.18): marks: projected وهَيْدي, pinned وهَيدي
- وهيدا / w hayda (u02-family:s.fam.22): marks: projected وهَيْدا, pinned وهَيدا
- هَيدا / hayda (u02-family:apc.story.family#0): marks: projected هَيْدا, pinned هَيدا
- وهَيدي / w hayde (u02-family:apc.story.family#1): marks: projected وهَيْدي, pinned وهَيدي
- وهَيدا / w hayda (u02-family:apc.story.family#2): marks: projected وهَيْدا, pinned وهَيدا
- هَيدي / hayde (u02-family:apc.story.family#6): marks: projected هَيْدي, pinned هَيدي
- بهيدا / b hayda (u04-home:s.home.20): marks: projected بْهَيْدا, pinned بْهَيدا
- بهيدي / b hayde (u11-people:s.ppl.15): marks: projected بْهَيْدي, pinned بْهَيدي
- بحزيران / b 7zeiran (u16-dates:s.date.18): diphthong: the marks write ay, Arabizi ei: marks: projected بْحْزيران, pinned بْحْزَيْران

## 10. The marks do not follow the convention the other words follow (13)

Each differs from what the projection writes in its own way: the difference is on the line.

- ميرسي / merci (intro:s.3): arabizi: merci is not among the projected spellings (mersi first)
- الحمدلله / el7amdella (intro:s.8): marks: projected الحَمْدِلْلَه, pinned الحَمْدِلله
- كِيفَك / kifak (intro:apc.story.cafe#1): marks: projected كيفَك, pinned كِيفَك
- الحَمْدِلله / el7amdella (intro:apc.story.cafe#2): marks: projected الحَمْدِلْلَه, pinned الحَمْدِلله
- مية / mit (u05-numbers:s.num.18): marks: projected مية, pinned مِية
- والله / walla (u10-plans:s.plans.25): marks: projected والْلَه, pinned والله
- هو / huwwe (u11-people:s.ppl.1): marks: projected هُوِّ, pinned هُوّ
- هي / hiyye (u11-people:s.ppl.2): marks: projected هِيِّ, pinned هِيّ
- هنّ / henne (u11-people:s.ppl.23): marks: projected هِنِّ, pinned هِنّ
- هِيّ / hiyye (u11-people:apc.story.neighbours#1): marks: projected هِيِّ, pinned هِيّ
- هُوّ / huwwe (u11-people:apc.story.neighbours#6): marks: projected هُوِّ, pinned هُوّ
- فيها / fiya (u13-health:s.health.16): marks: projected فِيها, pinned فيها
- الله / allah (u20-celebrations:s.party.2): marks: projected اَلْلَه, pinned الله

## 11. Deduced, not found in a source (11)

A citation form the course does not write and Kline does not list, or a radical no form shows. The
owner's ruling (2026-11-20) is to deduce what needs to be deduced, so each is filled in, and its line
says from what. They are listed for a speaker to correct, not for a ruling.

- `lexeme:fi2` fe2 / yfi2: Kline does not list it. The course writes only bfi2, which gives the present. The past is a hollow verb's, and its long a is cited e, as in shef, ken and nem. Where the course's hollow verbs keep a, a back consonant stands before it (ra7, 2al, sar, 3ash) or ر after it (zar); whether ق after it does the same is for a speaker. The course never writes the form.
- `lexeme:2ara` 2ara / ye2ra: The third radical is stored as ي, as the verb is conjugated: Kline classes it with the defective verbs, and where a defective verb's last radical shows it is ي. Standard Arabic's hamza shows in no form of the verb.
- `lexeme:nem` nem / ynem: The middle radical shows in no form of the verb, and no form depends on which it is. It is stored as و, the letter Arabic dictionaries file the word under; the course has no other word of the root, and shared radicals link nothing (ADR 0145).
- `lexeme:ra2as` ra2as / yer2os: Kline does not list it. The course writes only or2os (I dance): the present vowel is o, and the past is the one the course names the verb by. The prefix is cited ye-, as the course writes its other verbs of this class (edros, elbos, ekol, ekhod); in or2os it writes o.
- `lexeme:stanna` stanna / yestanna: Kline does not list it. The course writes its commands (stanna, stanni, stanno): the stem is stann- with a defective verb's endings, and a command in -a goes with a present in -a (yestanna). No form shows a third radical or a Form's prefix apart from st-, so no radicals and no Form are stored: the usual account (form X of ʔ-n-y) is etymology, which the model does not formalise (ADR 0145).
- `lexeme:seken`, of sakan / yeskon: The verb is cited sakan / yeskon: its radicals are the participle's own, and its vowels are cited as those of 2a3ad / ye23od (Kline, p. 75), by analogy. No form of the course depends on them.
- `lexeme:rte7` rte7 / yerte7: The middle radical shows in no form of a hollow form VIII verb, and no form depends on which it is. It is stored as و, the letter Arabic dictionaries file the word under; that links it to nothing, ra7 (go) included (ADR 0145: shared radicals only sort together).
- `lexeme:jarrab` jarrab / yjarreb: Kline gives its participle mjarreb (p. 125), not the verb. A form II verb's citation forms follow from its radicals, as Kline cites them (p. 80: wa22af / ywa22ef), and the course's jarrbi and jarrbo agree.
- `lexeme:fakkar` fakkar / yfakker: Kline does not list it. A form II verb's citation forms follow from its radicals, as Kline cites them (p. 80: wa22af / ywa22ef), and the course's bfakker and btfakkri agree.
- `lexeme:3azam` 3azam / ye3zem: Kline does not list it. The course writes the past (3azamni) and e3zmak, where the present vowel has dropped: a vowel that drops there is i or u, never a (ta3mli, tedrso; yitla3o keeps its a), and it is cited i, as in 3emel and 3eref. The prefix is the course's e-; Kline's ya- before ع (p. 75) is what the course writes in ba3mel and ba3ref.
- `lexeme:3ajab` 3ajab / ye3jeb: Kline does not list it. The course writes the past (3ajabni, 3ajabetni) and no present: the present is cited as 3azam's, the one other verb of its shape, and no form of the course depends on it.

## 12. The reviewed clips whose marks the projection does not write (16)

A reviewed clip depends on the exact text its voice was given (the handoff's Task C). These would be read
from other marks if the projection replaced the course's vocalization as it stands.

- `s.8`: مْنيح، الحَمْدِلله.: the projection writes other marks for الحَمْدِلله
- `s.fam.1`: هَيدا سامي.: the projection writes other marks for هَيدا
- `s.fam.10`: هَيدا خَيّي.: the projection writes other marks for هَيدا
- `s.fam.11`: هَيدي إِخْتي.: the projection writes other marks for هَيدي
- `s.fam.2`: مين هَيدا؟: the projection writes other marks for هَيدا
- `s.fam.21`: هَيدي تيتا.: the projection writes other marks for هَيدي
- `s.fam.22`: وهَيدا جِدّو.: the projection writes other marks for وهَيدا
- `s.fam.23`: هَيدي عَيِلْتي.: the projection writes other marks for هَيدي
- `s.fam.27`: هَيدا إِبْني.: the projection writes other marks for هَيدا
- `s.fam.28`: وهَيدي بِنْتي.: the projection writes other marks for وهَيدي
- `s.fam.4`: هَيدي مايا.: the projection writes other marks for هَيدي
- `s.fam.5`: هَيدا بَيّ سامي.: the projection writes other marks for هَيدا
- `s.fam.6`: هَيدا بَيّي.: the projection writes other marks for هَيدا
- `s.fam.7`: هَيدي إِمّ سامي.: the projection writes other marks for هَيدي
- `s.fam.8`: هَيدي إِمّي.: the projection writes other marks for هَيدي
- `s.fam.9`: مين هَيدا؟ بَيَّك؟: the projection writes other marks for هَيدا

## 13. How the course's Arabizi spells what is left free

Not a list of faults: each row is a correspondence with more than one spelling, and how often the
course's sentences use each (distinct words). The projection writes the commoner one first.

| What | Spelling | Words |
|---|---|---|
| last, long a written ا | a | 70 |
| last, long a written ى | a | 8 |
| last, long i written ي | i | 119 |
| last, long i written ي | e | 16 |
| last, long u written و | o | 47 |
| last, long u written و | u | 2 |
| long a written ا | a | 110 |
| long e written ا | e | 87 |
| long e written ي | e | 40 |
| long e written ي | ei | 10 |
| long i written ي | i | 109 |
| long i written ي | ee | 1 |
| long o written و | o | 21 |
| long u written و | u | 32 |
| long u written و | ou | 27 |
| short i | e | 263 |
| short i | i | 109 |
| short u | o | 78 |
| short u | u | 22 |

