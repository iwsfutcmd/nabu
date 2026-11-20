# Converting `courses/hbo` to the lexical model

Written by `nabu migrate ../courses/hbo`; do not edit by hand. It belongs to
[the migration's design note](../migration-design.md), deliverable 2. Nothing here is
decided:
the converter applies the course's conversion plan
(`pipeline/src/nabu/migrate/plans/hbo.yaml`, drafted, REVIEW) and lists what it found.

## What was converted

|  | Count |
|---|---|
| Sense KCs | 311 |
| `form:` KCs | 49 |
| `construction:` KCs | 2 |
| `grapheme:` KCs | 0 |
| Sentences and story lines | 879 |
| Tokens | 2452 |
| Lexemes in `lexicons/hbo/lexemes.yaml` | 320 |
| Pinned forms (rule debt, ADR 0145) | 326 |
| Listed forms | 0: no statement that a form has no rule is drafted yet |

**Checks** (docs/migration-design.md, "What must not change"):

- every sentence and story line as displayed: text, tokens, readings, accept sets and translations are unchanged, item by item;
- no two annotations of the course became one;
- every lexeme a token writes is written as its entry, or as a form or allomorph the lexicon has;
- every name points at something, and every file fits its schema.

## What each KC id became

| Kind | KCs |
|---|---|
| a construction: a rule, not written yet | 2 |
| a form pinned on tokens: feature values, no part | 40 |
| a form written as a morph: a lexeme | 9 |
| a sense: the lexeme of its name | 311 |

**`form:` and `construction:` KCs** (the plan's statements, REVIEW):

| KC | Gloss | Becomes | Note |
|---|---|---|---|
| `form:qatal-3ms` | he did: the perfect (qatal), he or it | values Aspect=Perf, Gender=Masc, Mood=Ind, Number=Sing, Person=3, VerbForm=Fin |  |
| `form:qatal-3fs` | she did: the perfect (qatal), she or it (f.) | values Aspect=Perf, Gender=Fem, Mood=Ind, Number=Sing, Person=3, VerbForm=Fin |  |
| `form:qatal-2ms` | you did: the perfect (qatal), you (to a man: -tā) | values Aspect=Perf, Gender=Masc, Mood=Ind, Number=Sing, Person=2, VerbForm=Fin |  |
| `form:qatal-2fs` | you did: the perfect (qatal), you (to a woman: -t) | values Aspect=Perf, Gender=Fem, Mood=Ind, Number=Sing, Person=2, VerbForm=Fin |  |
| `form:qatal-1cs` | I did: the perfect (qatal), I (-tî) | values Aspect=Perf, Mood=Ind, Number=Sing, Person=1, VerbForm=Fin |  |
| `form:qatal-3cp` | they did: the perfect (qatal), they (-û) | values Aspect=Perf, Mood=Ind, Number=Plur, Person=3, VerbForm=Fin |  |
| `form:yiqtol-3ms` | he will do: the imperfect (yiqtol), he or it | values Aspect=Imp, Gender=Masc, Mood=Ind, Number=Sing, Person=3, VerbForm=Fin |  |
| `form:yiqtol-2ms` | you will do: the imperfect (yiqtol), you (to a man); with לֹא, 'you sh | values Aspect=Imp, Gender=Masc, Mood=Ind, Number=Sing, Person=2, VerbForm=Fin |  |
| `form:yiqtol-2fs` | you will do: the imperfect (yiqtol), you (to a woman) | values Aspect=Imp, Gender=Fem, Mood=Ind, Number=Sing, Person=2, VerbForm=Fin |  |
| `form:yiqtol-1cs` | I will do: the imperfect (yiqtol), I | values Aspect=Imp, Mood=Ind, Number=Sing, Person=1, VerbForm=Fin |  |
| `form:yiqtol-3mp` | they will do: the imperfect (yiqtol), they | values Aspect=Imp, Gender=Masc, Mood=Ind, Number=Plur, Person=3, VerbForm=Fin |  |
| `form:yiqtol-2mp` | you will do: the imperfect (yiqtol), you (to several people) | values Aspect=Imp, Gender=Masc, Mood=Ind, Number=Plur, Person=2, VerbForm=Fin |  |
| `form:wayyiqtol-3ms` | and he did: the narrative past (wayyiqtol), he or it | values Gender=Masc, Mood=Ind, Number=Sing, Person=3, Tense=Past, VerbForm=Fin |  |
| `form:wayyiqtol-3fs` | and she did: the narrative past, she or it (f.) | values Gender=Fem, Mood=Ind, Number=Sing, Person=3, Tense=Past, VerbForm=Fin |  |
| `form:wayyiqtol-1cs` | and I did: the narrative past, I | values Mood=Ind, Number=Sing, Person=1, Tense=Past, VerbForm=Fin |  |
| `form:wayyiqtol-3mp` | and they did: the narrative past, they | values Gender=Masc, Mood=Ind, Number=Plur, Person=3, Tense=Past, VerbForm=Fin |  |
| `form:wayyiqtol-3fp` | and they (f.) did: the narrative past, they (women) | values Gender=Fem, Mood=Ind, Number=Plur, Person=3, Tense=Past, VerbForm=Fin |  |
| `form:weqatal-3ms` | and he shall; and it will be: the converted perfect (weqatal), he or i | values Gender=Masc, Mood=Ind, Number=Sing, Person=3, Tense=Fut, VerbForm=Fin |  |
| `form:weqatal-2ms` | and you shall do: the converted perfect (weqatal), you | values Gender=Masc, Mood=Ind, Number=Sing, Person=2, Tense=Fut, VerbForm=Fin |  |
| `form:weqatal-3cp` | and they shall: the converted perfect (weqatal), they | values Mood=Ind, Number=Plur, Person=3, Tense=Fut, VerbForm=Fin |  |
| `form:juss` | let him (it) do: the jussive; with אַל, 'do not …!' | values Aspect=Imp, Mood=Jus, VerbForm=Fin |  |
| `form:coh` | let me do, let us do: the cohortative (-â); 'I will …' after a command | values Aspect=Imp, Mood=Opt, VerbForm=Fin |  |
| `form:impv-ms` | imperative, to a man: do! | values Gender=Masc, Mood=Imp, Number=Sing, Person=2, VerbForm=Fin |  |
| `form:impv-fs` | imperative, to a woman: do! | values Gender=Fem, Mood=Imp, Number=Sing, Person=2, VerbForm=Fin |  |
| `form:impv-mp` | imperative, to several people: do! | values Gender=Masc, Mood=Imp, Number=Plur, Person=2, VerbForm=Fin |  |
| `form:inf` | infinitive (construct): to do; doing (לֶאֱכֹל 'to eat') | values VerbForm=Inf |  |
| `form:inf-abs` | the infinitive absolute: in laws, 'you shall …' (כַּבֵּד 'honour'); be | values VerbForm=InfAbs |  |
| `form:ptc-ms` | participle, masculine singular: he/it is doing; one who does (of a ver | values Gender=Masc, Number=Sing, VerbForm=Part |  |
| `form:ptc-fs` | participle, feminine singular: she/it is doing | values Gender=Fem, Number=Sing, VerbForm=Part |  |
| `form:ptc-mp` | participle, masculine plural: they are doing; ones who do | values Gender=Masc, Number=Plur, VerbForm=Part |  |
| `form:ptc-pass` | passive participle: done, -ed (בָּרוּךְ 'blessed'; אֻכָּל 'consumed' i | values Gender=Masc, Number=Sing, VerbForm=Part, Voice=Pass |  |
| `form:ptc-pass-fs` | passive participle, feminine singular: done, -ed, of a woman (בְּרוּכָ | values Gender=Fem, Number=Sing, VerbForm=Part, Voice=Pass |  |
| `form:f` | feminine: a feminine noun (אֶרֶץ 'land', אִשָּׁה 'woman'), or an adjec | values Gender=Fem, Number=Sing |  |
| `form:pl` | plural, masculine (-îm, some -ôṯ: גּוֹרָלוֹת 'lots'); also nouns alway | values Gender=Masc, Number=Plur; on DET: Number=Plur |  |
| `form:f-pl` | feminine plural (-ôṯ; some -îm: נָשִׁים 'women') | values Gender=Fem, Number=Plur |  |
| `form:cstr` | construct state: 'X of …', the noun bound to the next (בְּתוֹךְ הַגָּן | values Definite=Cons, Gender=Masc, Number=Sing |  |
| `form:f-cstr` | feminine construct: 'X of …', the noun bound to the next (רוּחַ אֱלֹהִ | values Definite=Cons, Gender=Fem, Number=Sing |  |
| `form:pl-cstr` | plural construct (-ê): 'the …s of'; also of nouns always plural (פְּנֵ | values Definite=Cons, Gender=Masc, Number=Plur |  |
| `form:f-pl-cstr` | feminine plural construct (-ôṯ): 'the …s of' (מַעַרְכוֹת יִשְׂרָאֵל 't | values Definite=Cons, Gender=Fem, Number=Plur |  |
| `form:du` | dual (-áyim): two of a pair (רַגְלַיִם 'feet') | values Number=Dual |  |
| `form:sfx-1cs` | my; me (the suffix -î, -nî) | `lexeme:sfx-1cs` (PRON) |  |
| `form:sfx-2ms` | your; you (said to a man: the suffix -ḵā) | `lexeme:sfx-2ms` (PRON) |  |
| `form:sfx-2fs` | your; you (said to a woman: the suffix -ēḵ, -ḵ) | `lexeme:sfx-2fs` (PRON) |  |
| `form:sfx-3ms` | his; him (the suffix -ô, -w, -hû) | `lexeme:sfx-3ms` (PRON) |  |
| `form:sfx-3fs` | her; it (f.) (the suffix -āh, -hā) | `lexeme:sfx-3fs` (PRON) |  |
| `form:sfx-1cp` | our; us (the suffix -ēnû, -nû) | `lexeme:sfx-1cp` (PRON) |  |
| `form:sfx-2mp` | your; you (said to several people: the suffix -ḵem) | `lexeme:sfx-2mp` (PRON) |  |
| `form:sfx-3mp` | their; them (the suffix -ām, -hem) | `lexeme:sfx-3mp` (PRON) |  |
| `form:dir` | toward: the directional -â (שְׁכֶמָה 'to Shechem', הַבַּיְתָה 'home') | `lexeme:dir` (realises Case=Lat) |  |
| `construction:nominal` | a noun sentence: no verb 'to be' (הָאוֹר טוֹב 'the light is good') | `rule:nominal`, not written | a rule: a sentence with a noun, an adjective or a participle as its predicate and no verb |
| `construction:yesh-le` | יֵשׁ לְ…: … has (there is to …); אֵין לְ…: … has no | `rule:yesh-le`, not written | a rule: "there is to" says "has"; its meaning is its parts' (ADR 0145) |

## Defaults

A default is a rule, and what it gives is no part of a lexeme (ADR 0146). These are
the plan's, drafted (REVIEW); the counts are this course's lexemes.

|  | Lexemes |
|---|---|
| default gender-ah: broken | 3 |
| default gender-ah: gives | 14 |
| default gender-none-name: broken | 7 |
| default gender-none-name: gives | 13 |
| default gender-none: broken | 15 |
| default gender-none: gives | 64 |
| default gender-t: broken | 3 |
| default gender-t: gives | 10 |
| lexical feature chosen by the token | 2 |
| lexical feature unknown | 2 |

## Lexemes that break a default (28)

The entry stores the feature, and it is a part to learn (ADR 0146). Check each: a wrong default makes parts of regular words, a missing one hides an exception.

| Where | What |
|---|---|
| `lexeme:layla` | Gender=Masc: gender-ah would give Fem for לַיְלָה |
| `lexeme:erets` | Gender=Fem: gender-none would give Masc for אֶרֶץ |
| `lexeme:tehom` | Gender=Fem: gender-none would give Masc for תְּהוֹם |
| `lexeme:ruach` | Gender=Fem: gender-none would give Masc for רוּחַ |
| `lexeme:yhwh` | Gender=Masc: gender-ah would give Fem for יְהוָה |
| `lexeme:bayit` | Gender=Masc: gender-t would give Fem for בַּיִת |
| `lexeme:esh` | Gender=Fem: gender-none would give Masc for אֵשׁ |
| `lexeme:kad` | Gender=Fem: gender-none would give Masc for כַּד |
| `lexeme:yad` | Gender=Fem: gender-none would give Masc for יָד |
| `lexeme:beer` | Gender=Fem: gender-none would give Masc for בְּאֵר |
| `lexeme:tson` | Gender=Fem: gender-none would give Masc for צֹאן |
| `lexeme:hevron` | Gender=Fem: gender-none-name would give Masc for חֶבְרוֹן |
| `lexeme:shekhem` | Gender=Fem: gender-none-name would give Masc for שְׁכֶם |
| `lexeme:naal` | Gender=Fem: gender-none would give Masc for נַעַל |
| `lexeme:mitsrayim` | Gender=Fem: gender-none-name would give Masc for מִצְרַיִם |
| `lexeme:em` | Gender=Fem: gender-none would give Masc for אֵם |
| `lexeme:nefesh` | Gender=Fem: gender-none would give Masc for נֶפֶשׁ |
| `lexeme:derekh` | Gender=Fem: gender-none would give Masc for דֶּרֶךְ |
| `lexeme:naomi` | Gender=Fem: gender-none-name would give Masc for נׇעֳמִי |
| `lexeme:mawet` | Gender=Masc: gender-t would give Fem for מָוֶת |
| `lexeme:paam` | Gender=Fem: gender-none would give Masc for פַּעַם |
| `lexeme:herev` | Gender=Fem: gender-none would give Masc for חֶרֶב |
| `lexeme:yonah` | Gender=Masc: gender-ah would give Fem for יוֹנָה |
| `lexeme:ninveh` | Gender=Fem: gender-none-name would give Masc for נִינְוֵה |
| `lexeme:ir` | Gender=Fem: gender-none would give Masc for עִיר |
| `lexeme:tarshish` | Gender=Fem: gender-none-name would give Masc for תַּרְשִׁישׁ |
| `lexeme:yafo` | Gender=Fem: gender-none-name would give Masc for יָפוֹ |
| `lexeme:tsalmawet` | Gender=Masc: gender-t would give Fem for צַלְמָוֶת |

## Lexical features the tokens choose (2)

The feature is declared lexical for the category, and this lexeme's tokens have more than one value of it, or the entry itself is written in another (tía under tío). By ADR 0145 a noun's feminine is a derivative, a lexeme of its own where it is listed. The values stay on the tokens until that is decided.

| Where | What |
|---|---|
| `lexeme:raah.evil` | Gender is Fem and Masc on its tokens: kept on the tokens, not on the entry |
| `lexeme:ivri` | Gender is Fem and Masc on its tokens: kept on the tokens, not on the entry |

## Lexemes whose lexical feature no token says (2)

Mostly entries written as several tokens, on which the course pins no form.

| Where | What |
|---|---|
| `lexeme:regel` | no token says its Gender |
| `lexeme:ayin.eye` | no token says its Gender |

## Written otherwise than the entry (40)

A token names the lexeme, no feature value tells it from the entry's own form, and it is spelled differently: an allomorph by context (gran before a noun), or a form the course's annotation has no name for. Kept as an allomorph of the entry.

| Where | What |
|---|---|
| `lexeme:elohim` | joined to another lexeme, written אֱלֹהֶי (14×, first in s.11.6) |
| `lexeme:elohim` | joined to another lexeme, written אֱלֹהָ (2×, first in s.13.25) |
| `lexeme:ehad` | joined to another lexeme, written אַחַת (3×, first in s.16.23) |
| `lexeme:beyn` | joined to another lexeme, written בֵּינִ (8×, first in s.13.33) |
| `lexeme:erets` | joined to another lexeme, written אַרְצְ (6×, first in s.06.16) |
| `lexeme:al` | joined to another lexeme, written עָלָי (3×, first in s.10.36) |
| `lexeme:ishah` | joined to another lexeme, written אִשְׁתּ (4×, first in s.03.25) |
| `lexeme:el` | joined to another lexeme, written אֵלֶי (18×, first in s.06.39) |
| `lexeme:qol` | joined to another lexeme, written קֹלְ (3×, first in s.03.33) |
| `lexeme:min` | joined to another lexeme, written מִ (36×, first in s.03.23) |
| `lexeme:min` | joined to another lexeme, written מִמֶּ (2×, first in s.04.20) |
| `lexeme:ah` | joined to another lexeme, written אָחִי (14×, first in s.05.3) |
| `lexeme:ahot` | joined to another lexeme, written אֲחֹתִ (2×, first in s.05.8) |
| `lexeme:lo` | joined to another lexeme, written לוֹא (1×, first in hbo.story.seeking-my-brothers#1) |
| `lexeme:av` | written אָבִי (13×, first in s.06.13): an allomorph, or a form no value names |
| `lexeme:gadol` | joined to another lexeme, written גָּדֹל (2×, first in s.10.19) |
| `lexeme:shem` | joined to another lexeme, written שְׁמ (7×, first in s.06.27) |
| `lexeme:ahar` | written אַחֲרָיִ (3×, first in s.13.19): an allomorph, or a form no value names |
| `lexeme:hinneh` | joined to another lexeme, written הִנֵּ (7×, first in s.07.8) |
| `lexeme:hinneh` | joined to another lexeme, written הִנֵּנִ (2×, first in hbo.story.here-i-am#4) |
| `lexeme:ben` | joined to another lexeme, written בְּנִ (21×, first in s.07.11) |
| `lexeme:moriyyah` | joined to another lexeme, written מֹּרִיָּה (2×, first in s.07.34) |
| `lexeme:shnayim` | joined to another lexeme, written שְׁנֵי (3×, first in s.07.40) |
| `lexeme:shnayim` | written שְׁתַּיִם (1×, first in s.16.11): an allomorph, or a form no value names |
| `lexeme:yahdav` | written יַחְדָּו (3×, first in s.07.41): an allomorph, or a form no value names |
| `lexeme:liqrat` | joined to another lexeme, written קְרָאתָ (3×, first in s.08.4) |
| `lexeme:adon` | joined to another lexeme, written אֲדֹנִ (5×, first in s.08.18) |
| `lexeme:bo` | written בָא (1×, first in s.15.17): an allomorph, or a form no value names |
| `lexeme:shekhem` | joined to another lexeme, written שְׁכֶמָ (3×, first in s.09.25) |
| `lexeme:eyn` | joined to another lexeme, written אֵינֶ (3×, first in s.10.10) |
| `lexeme:sur` | written סָר (2×, first in s.10.22): an allomorph, or a form no value names |
| `lexeme:maqom` | joined to another lexeme, written מְקוֹמ (2×, first in s.14.15) |
| `lexeme:em` | joined to another lexeme, written אִמֶּ (7×, first in s.11.15) |
| `lexeme:lemaan` | written לְמַעַן (5×, first in s.11.19): an allomorph, or a form no value names |
| `lexeme:am` | joined to another lexeme, written עַמֵּ (8×, first in s.13.6) |
| `lexeme:am` | written עַמִּי (4×, first in s.13.5): an allomorph, or a form no value names |
| `lexeme:raah.evil` | written רָע (2×, first in s.19.22): an allomorph, or a form no value names |
| `lexeme:im.with` | joined to another lexeme, written עִמָּ (6×, first in s.17.25) |
| `lexeme:melakhah` | joined to another lexeme, written מְּלַאכְתְּ (2×, first in s.18.16) |
| `lexeme:sachaq` | joined to another lexeme, written שְׂחוֹק (1×, first in s.20.21) |

## Feature values that do not tell forms apart (15)

Several spellings share one set of values: the course's form KC names less than the forms differ by. Each is pinned; a tie is an authoring error once a rule reads it (ADR 0145).

| Where | What |
|---|---|
| `lexeme:yom` | Number=Plur is written 2 ways: ימי, ימים |
| `lexeme:panim` | Number=Plur is written 2 ways: פנ, פני |
| `lexeme:yare` | Aspect=Imp\|Mood=Jus\|VerbForm=Fin is written 3 ways: תירא, תיראו, תיראי |
| `lexeme:hi` | Gender=Fem\|Number=Sing is written 2 ways: הוא, היא |
| `lexeme:natan` | Gender=Masc\|Mood=Ind\|Number=Sing\|Person=3\|Tense=Fut\|VerbForm=Fin is written 2 ways: ונתן, נתן |
| `lexeme:ah` | Number=Plur is written 3 ways: אח, אחי, אחים |
| `lexeme:halakh` | Gender=Masc\|Mood=Imp\|Number=Sing\|Person=2\|VerbForm=Fin is written 2 ways: לך, לכה |
| `lexeme:shatah` | VerbForm=Inf is written 2 ways: שתות, שתת |
| `lexeme:gamal` | Number=Plur is written 2 ways: גמלי, גמלים |
| `lexeme:hem` | Gender=Masc\|Number=Plur is written 2 ways: הם, המה |
| `lexeme:raah.graze` | Gender=Masc\|Number=Sing\|VerbForm=Part is written 2 ways: רע, רעה |
| `lexeme:regel` | Number=Dual is written 2 ways: רגלי, רגלים |
| `lexeme:rahamim` | Number=Plur is written 2 ways: רחמי, רחמים |
| `lexeme:raah.evil` | Gender=Fem\|Number=Sing is written 2 ways: רעה, רעת |
| `lexeme:ayin.eye` | Number=Dual is written 2 ways: עינ, עיני |

## Nodes that introduce less (2)

What the node introduced is introduced earlier in the new shape (a sense that was built of lexemes an earlier node now names), or was a form KC whose values name nothing new.

| Where | What |
|---|---|
| `hbo.u14.speak` | introduces form:weqatal-3ms: all of it is introduced earlier now, or is a form no value introduces |
| `hbo.u16.two-women` | introduces form:wayyiqtol-3fp: all of it is introduced earlier now, or is a form no value introduces |

## What no finding above covers

- **Projections:** no orthography of this course has a stated projection yet, so every
  spelling and reading stays pinned as it is; there is nothing to compare them with
  (ADR 0148).
- **Credits by sentence:** an old credit for a `form:` KC that is feature values now has
  no
  part to go to: a feature's uses are not authored, and nothing old counts towards a rule
  (ADR 0146).
