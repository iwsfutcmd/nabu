# Converting `courses/chg` to the lexical model

Written by `nabu migrate ../courses/chg`; do not edit by hand. It belongs to
[the migration's design note](../migration-design.md), deliverable 2. Nothing here is
decided:
the converter applies the course's conversion plan
(`pipeline/src/nabu/migrate/plans/chg.yaml`, drafted, REVIEW) and lists what it found.

## What was converted

|  | Count |
|---|---|
| Sense KCs | 397 |
| `form:` KCs | 58 |
| `construction:` KCs | 0 |
| `grapheme:` KCs | 33 |
| Sentences and story lines | 794 |
| Tokens | 2689 |
| Lexemes in `lexicons/chg/lexemes.yaml` | 455 |
| Pinned forms (rule debt, ADR 0145) | 0 |
| Listed forms | 0: no statement that a form has no rule is drafted yet |

**Checks** (docs/migration-design.md, "What must not change"):

- every sentence and story line as displayed: text, tokens, readings, accept sets and translations are unchanged, item by item;
- no two annotations of the course became one;
- every lexeme a token writes is written as its entry, or as a form or allomorph the lexicon has;
- every name points at something, and every file fits its schema.

## What each KC id became

| Kind | KCs |
|---|---|
| a form written as a morph: a lexeme | 58 |
| a letter of a script track: unchanged | 33 |
| a sense: the lexeme of its name | 397 |

**`form:` and `construction:` KCs** (the plan's statements, REVIEW):

| KC | Gloss | Becomes | Note |
|---|---|---|---|
| `form:dur` | -dur (-tur after a voiceless consonant): is, are, on the end of a sent | `lexeme:dur` (AUX) |  |
| `form:p1s` | -män: I am (on the predicate); I (on the verb) | `lexeme:p1s` (realises Number=Sing, Person=1) |  |
| `form:p2s` | -sän: you are, to a friend, a child, God (on the predicate); you (on t | `lexeme:p2s` (realises Number=Sing, Person=2) |  |
| `form:p2` | -siz: you are, politely, to one person or several; you (on the verb) | `lexeme:p2` (realises Person=2, Polite=Form) |  |
| `form:p1p` | -miz: we are (on the predicate); we (on the verb) | `lexeme:p1p` (realises Number=Plur, Person=1) |  |
| `form:p2pl` | -sizlär: you are, to several people; you (on the verb) | `lexeme:p2pl` (realises Number=Plur, Person=2) |  |
| `form:p3pl` | -lar, -lär: they (on the predicate or the verb) | `lexeme:p3pl` (realises Number=Plur, Person=3) |  |
| `form:poss1s` | -m (after a vowel), -im, -um, -üm: my | `lexeme:poss1s` (realises Number[psor]=Sing, Person[psor]=1) |  |
| `form:poss2s` | -ŋ (after a vowel), -iŋ, -uŋ, -üŋ: your, to a friend | `lexeme:poss2s` (realises Number[psor]=Sing, Person[psor]=2) |  |
| `form:poss2` | -ŋiz (after a vowel), -iŋiz, -uŋiz, -üŋiz: your, politely or to severa | `lexeme:poss2` (realises Person[psor]=2, Polite=Form) |  |
| `form:poss3` | -i (after a consonant), -si (after a vowel): his, her, its, their | `lexeme:poss3` (realises Person[psor]=3) |  |
| `form:poss1p` | -miz (after a vowel), -imiz, -umiz, -ümiz: our | `lexeme:poss1p` (realises Number[psor]=Plur, Person[psor]=1) |  |
| `form:pl` | -lar, -lär: the plural | `lexeme:pl` (realises Number=Plur) |  |
| `form:gen` | -niŋ: of, 's | `lexeme:gen` (realises Case=Gen) |  |
| `form:acc` | -ni: the object, when it is definite | `lexeme:acc` (realises Case=Acc) |  |
| `form:dat` | -ǧa, -gä (-qa, -kä): to, for | `lexeme:dat` (realises Case=Dat) |  |
| `form:loc` | -da, -dä (-ta, -tä after a voiceless consonant): in, at, on | `lexeme:loc` (realises Case=Loc) |  |
| `form:abl` | -din (-dan, -tin): from; than | `lexeme:abl` (realises Case=Abl) |  |
| `form:ca` | -čä: in the manner of; in a language | `lexeme:ca` (realises Case=Equ) |  |
| `form:aor` | -ur, -ar (-r after a vowel): does, will do; is, as a rule | `lexeme:aor` (realises Aspect=Hab, Tense=Pres) |  |
| `form:aor-neg` | -mas, -mäs: does not, will not; is not, as a rule | `lexeme:aor-neg` (realises Aspect=Hab, Polarity=Neg, Tense=Pres) |  |
| `form:pres` | -a, -ä (-y after a vowel): the present-future: does, is doing, will do | `lexeme:pres` (realises Tense=Pres) |  |
| `form:pres-neg` | -may, -mäy: does not, is not doing, will not (the present-future's neg | `lexeme:pres-neg` (realises Polarity=Neg, Tense=Pres) |  |
| `form:neg` | -ma-, -mä-: not (inside the verb) | `lexeme:neg` (realises Polarity=Neg) |  |
| `form:pass` | -il-, -l-, -n-: the passive | `lexeme:pass` (realises Voice=Pass) |  |
| `form:cond` | -sa, -sä: if, when | `lexeme:cond` (realises Mood=Cnd) |  |
| `form:cond-1s` | -sam, -säm: if I, when I | `lexeme:cond-1s` (realises Mood=Cnd, Number=Sing, Person=1) |  |
| `form:cond-2s` | -saŋ, -säŋ: if you (one person); would you …? | `lexeme:cond-2s` (realises Mood=Cnd, Number=Sing, Person=2) |  |
| `form:past-1s` | -dim, -dum, -düm (-tim after a voiceless consonant): I did | `lexeme:past-1s` (realises Number=Sing, Person=1, Tense=Past) |  |
| `form:past-2s` | -diŋ, -duŋ, -düŋ: you did, to a friend | `lexeme:past-2s` (realises Number=Sing, Person=2, Tense=Past) |  |
| `form:past-2` | -diŋiz: you did, politely or to several | `lexeme:past-2` (realises Person=2, Polite=Form, Tense=Past) |  |
| `form:past-3` | -di (-ti): he, she, it did; they did | `lexeme:past-3` (realises Person=3, Tense=Past) |  |
| `form:past-1p` | -duq, -dük: we did | `lexeme:past-1p` (realises Number=Plur, Person=1, Tense=Past) |  |
| `form:past-2pl` | -diŋlar, -duŋlar: you did, to several people | `lexeme:past-2pl` (realises Number=Plur, Person=2, Tense=Past) |  |
| `form:past-3pl` | -dilär, -dilar: they did | `lexeme:past-3pl` (realises Number=Plur, Person=3, Tense=Past) |  |
| `form:mis` | -miš: did, it is said; (with er-) ermiš "was, they say" | `lexeme:mis` (realises Evident=Nfh, Tense=Past) |  |
| `form:narr` | -ptur (-iptur, -uptur, -üptur): did, it is told; is (found) | `lexeme:narr` (realises Aspect=Perf, Evident=Nfh) | the told past, -p and tur: REVIEW against mis |
| `form:gay` | -ǧay, -gäy (-qay, -käy): shall, will; let (with person endings: -ǧaymi | `lexeme:gay` (realises Tense=Fut) | shall, will; with a person ending also a wish: REVIEW |
| `form:imp` | the imperative: -iŋ, -uŋ, -üŋ, -ŋ (politely, or to several); -ǧil, -gi | `lexeme:imp` (realises Mood=Imp, Person=2) |  |
| `form:juss` | -sun, -sün: let him, her, them; may … | `lexeme:juss` (realises Mood=Jus, Person=3) |  |
| `form:let` | -ali, -äli (-li after a vowel): let us …! | `lexeme:let` (realises Mood=Opt, Number=Plur, Person=1) |  |
| `form:vol-1s` | -ayin, -äyin: let me, I shall | `lexeme:vol-1s` (realises Mood=Opt, Number=Sing, Person=1) |  |
| `form:pcp` | -ǧan, -gän (-qan, -kän): who did, which was; (with -da) when | `lexeme:pcp` (realises Tense=Past, VerbForm=Part) |  |
| `form:cv-p` | -p, -ip, -up, -üp: and (then); having done | `lexeme:cv-p` (realises Aspect=Perf, VerbForm=Conv) |  |
| `form:cv-a` | -a, -ä (-y after a vowel): doing; with al-: can | `lexeme:cv-a` (realises Aspect=Imp, VerbForm=Conv) |  |
| `form:cv-may` | -may, -mäy: without doing, not doing (and) | `lexeme:cv-may` (realises Polarity=Neg, VerbForm=Conv) |  |
| `form:gac` | -ǧač, -gäč (-qač, -käč): as soon as, when | `lexeme:gac` (realises VerbForm=Conv) | as soon as: REVIEW, no value tells it from the other converbs |
| `form:gali` | -ǧali, -gäli (-qali, -käli): in order to; since | `lexeme:gali` (realises Mood=Prp, VerbForm=Conv) |  |
| `form:cmp` | -raq, -räk: more ..., -er | `lexeme:cmp` (realises Degree=Cmp) |  |
| `form:ord` | -nči, -inči, -unči, -ünči: -th (ordinal numbers) | `lexeme:ord` (realises NumType=Ord) |  |
| `form:liq` | -liq, -lik, -luq, -lük: with, having; of (a place); -ness | `lexeme:liq` (a function head) | with, having; of a place; -ness: it makes adjectives too |
| `form:nisba` | -ī: of, from (on Arabic and Persian words) | `lexeme:nisba` (a function head) |  |
| `form:ci` | -či: a person who works with … | `lexeme:ci` (a function head) |  |
| `form:daki` | -daki, -däki: that is in, of (a place) | `lexeme:daki` (a function head) |  |
| `form:cilik` | -čilik, -čülük: a … 's worth, lasting a … | `lexeme:cilik` (a function head) |  |
| `form:la` | -la, -lä: makes a verb of a noun | `lexeme:la` (a function head) |  |
| `form:q` | -mu: a yes-or-no question | `lexeme:q` (PART) |  |
| `form:ke` | -ke, -ki: that (after a verb of saying: eyttike "said (that)") | `lexeme:ke` (SCONJ) |  |

## Dimensions

What every member of a category must choose (ADR 0145), as the plan declares it, and
how many tokens say a value of each: on themselves, or by an ending written on them.
A token that leaves one unsaid is the unmarked form, or one the course's annotation
has no name for.

| Category | Dimension | Tokens that say it | Tokens that do not |
|---|---|---|---|
| NOUN | Number | 41 | 999 |
| NOUN | Case | 267 | 773 |
| VERB | Tense | 382 | 155 |
| VERB | Person | 304 | 233 |
| VERB | Number | 162 | 375 |

## Other spellings of an entry (21)

A token names the lexeme, is spelled otherwise than its entry and pins the entry's own reading: the same word as its source spells it (ADR 0145: a source's spelling is the utterance's). Kept among the entry's spellings; when the orthography's free correspondences are stated (ADR 0148), they should give each of these.

| Where | What |
|---|---|
| `lexeme:qizil` | also spelled قزیل (1×, first in chg.story.the-red-tent#0) |
| `lexeme:bir` | also spelled بر (13×, first in chg.story.at-dawn#2) |
| `lexeme:yatti` | also spelled ییتی (1×, first in chg.story.seven-towns#0) |
| `lexeme:sakkiz` | also spelled سیکیز (1×, first in chg.story.king-at-twelve#0) |
| `lexeme:kishi` | also spelled کیشی (5×, first in chg.story.four-men-and-a-pheasant#2) |
| `lexeme:turk` | also spelled ترک (2×, first in chg.story.the-orphan#4) |
| `lexeme:biz` | also spelled پز (2×, first in chg.story.do-you-have-a-king#5) |
| `lexeme:padishah` | also spelled بادشاه (1×, first in chg.story.king-at-twelve#0) |
| `lexeme:allik` | also spelled اللیک (1×, first in chg.story.where-are-you-from#1) |
| `lexeme:ming` | also spelled منک (1×, first in chg.story.the-call-at-dawn#2) |
| `lexeme:yil` | also spelled یل (2×, first in chg.story.the-seven-sleepers#5) |
| `lexeme:kim.that` | also spelled کم (2×, first in chg.story.where-are-you-from#6) |
| `lexeme:ikkawlan` | also spelled ایکولان (2×, first in chg.story.at-dawn#0) |
| `lexeme:keyin` | also spelled کین (1×, first in chg.story.at-dawn#2) |
| `lexeme:turur` | also spelled ترور (2×, first in chg.story.where-are-you-from#7) |
| `lexeme:agarcha` | also spelled اکرچه (1×, first in chg.story.the-pavilion-at-osh#6) |
| `lexeme:chapan` | also spelled چافان (1×, first in chg.story.the-kalmyks-came#3) |
| `lexeme:qattiq` | also spelled قاتتیق (1×, first in chg.story.the-kalmyks-came#4) |
| `lexeme:songra` | also spelled سونکرا (1×, first in chg.story.a-coin-of-decius#2) |
| `lexeme:ozga` | also spelled اوزکا (2×, first in chg.story.a-coin-of-decius#3) |
| `lexeme:kecha` | also spelled کجه (1×, first in chg.story.the-call-at-dawn#4) |

## Written otherwise than the entry (48)

A token names the lexeme, no feature value tells it from the entry's own form, and it is spelled differently: an allomorph by context (gran before a noun), or a form the course's annotation has no name for. Kept as an allomorph of the entry.

| Where | What |
|---|---|
| `lexeme:su` | joined to another lexeme, written سوی (4×, first in s.01.45) |
| `lexeme:emas` | written ایرماس (1×, first in chg.story.the-orphan#7): an allomorph, or a form no value names |
| `lexeme:bu` | joined to another lexeme, written مون (7×, first in s.03.37) |
| `lexeme:shahar` | joined to another lexeme, written شهری (1×, first in chg.story.at-dawn#6) |
| `lexeme:bash` | joined to another lexeme, written بیش (4×, first in chg.story.seven-towns#1) |
| `lexeme:yatti` | written یته (2×, first in chg.story.the-call-at-dawn#2): an allomorph, or a form no value names |
| `lexeme:ul` | joined to another lexeme, written ا (14×, first in s.04.40) |
| `lexeme:bazar` | joined to another lexeme, written بازار (2×, first in s.07.35) |
| `lexeme:man` | written مین (3×, first in chg.story.king-at-twelve#3): an allomorph, or a form no value names |
| `lexeme:man` | joined to another lexeme, written م (2×, first in s.18.9) |
| `lexeme:san` | joined to another lexeme, written س (2×, first in s.18.11) |
| `lexeme:san` | written سین (2×, first in chg.story.the-old-womans-box#9): an allomorph, or a form no value names |
| `lexeme:biz` | joined to another lexeme, written بز (1×, first in chg.story.the-first-smith#3) |
| `lexeme:ular` | written الار (3×, first in chg.story.the-seven-sleepers#3): an allomorph, or a form no value names |
| `lexeme:yigit` | joined to another lexeme, written یکت (1×, first in chg.story.where-are-you-from#2) |
| `lexeme:at.name` | joined to another lexeme, written ات (3×, first in chg.story.do-you-have-a-king#3) |
| `lexeme:padishah` | written فادشاه (3×, first in chg.story.do-you-have-a-king#0): an allomorph, or a form no value names |
| `lexeme:de` | joined to another lexeme, written تی (4×, first in s.09.25) |
| `lexeme:bil` | joined to another lexeme, written پل (1×, first in chg.story.do-you-have-a-king#5) |
| `lexeme:qil` | joined to another lexeme, written قل (2×, first in chg.story.at-dawn#1) |
| `lexeme:eyt` | joined to another lexeme, written ای (7×, first in chg.story.the-old-womans-box#6) |
| `lexeme:sal` | joined to another lexeme, written سالیب (1×, first in chg.story.the-pavilion-at-osh#4) |
| `lexeme:ay.month` | joined to another lexeme, written ای (1×, first in chg.story.king-at-twelve#0) |
| `lexeme:ye` | joined to another lexeme, written ی (2×, first in s.13.24) |
| `lexeme:bila` | written بیلان (2×, first in s.08.4): an allomorph, or a form no value names |
| `lexeme:bila` | written بلان (1×, first in chg.story.at-dawn#0): an allomorph, or a form no value names |
| `lexeme:bila` | written بله (1×, first in chg.story.the-seven-sleepers#6): an allomorph, or a form no value names |
| `lexeme:bila` | written پله (1×, first in chg.story.the-giant#7): an allomorph, or a form no value names |
| `lexeme:chiq` | joined to another lexeme, written جق (2×, first in chg.story.at-dawn#0) |
| `lexeme:kir` | joined to another lexeme, written کر (3×, first in chg.story.at-dawn#4) |
| `lexeme:nachcha` | written نچنده (2×, first in s.08.12): an allomorph, or a form no value names |
| `lexeme:nachcha` | written نجنده (1×, first in chg.story.at-dawn#2): an allomorph, or a form no value names |
| `lexeme:qop` | joined to another lexeme, written قوف (2×, first in chg.story.at-dawn#6) |
| `lexeme:tap` | joined to another lexeme, written تاب (2×, first in chg.story.the-orphan#0) |
| `lexeme:ishit` | joined to another lexeme, written اشت (1×, first in chg.story.the-call-at-dawn#8) |
| `lexeme:shajara` | written شجرهٔ (2×, first in s.09.38): an allomorph, or a form no value names |
| `lexeme:yaghach` | joined to another lexeme, written یغا (1×, first in chg.story.the-old-womans-box#6) |
| `lexeme:ayaq` | joined to another lexeme, written ایاغ (3×, first in s.13.17) |
| `lexeme:oghul` | joined to another lexeme, written اوغل (6×, first in s.13.2) |
| `lexeme:jangal` | joined to another lexeme, written جنکال (1×, first in chg.story.the-old-womans-box#2) |
| `lexeme:pishur` | joined to another lexeme, written فیشور (1×, first in chg.story.the-giant#6) |
| `lexeme:chiqar` | joined to another lexeme, written جیقار (1×, first in chg.story.a-coin-of-decius#0) |
| `lexeme:bar.give` | joined to another lexeme, written بر (1×, first in chg.story.the-old-womans-box#9) |
| `lexeme:aw` | joined to another lexeme, written او (1×, first in chg.story.the-call-at-dawn#3) |
| `lexeme:yat.lie` | joined to another lexeme, written یات (1×, first in chg.story.the-red-tent#2) |
| `lexeme:kongul` | joined to another lexeme, written کونکل (2×, first in s.16.26) |
| `lexeme:pahlawan` | written فهلوان (2×, first in chg.story.where-are-you-from#1): an allomorph, or a form no value names |
| `lexeme:parwardigar` | joined to another lexeme, written فروردیکار (1×, first in chg.story.the-first-smith#3) |

## Left for a reviewer by the plan

What the plan's drafter saw and did not decide.

- The aorist (-ur) is drafted as the present with the habitual aspect, as Universal Dependencies' Turkish treebanks tag theirs: the name aorist is no value of its own there.
- A source's spelling of a word is kept on its token; where the token is read as the entry is, the spelling joins the entry's (other spellings of an entry). When the orthography's free correspondences are stated (ADR 0148), they should give each.
- Pronouns take another stem before a case ending (ul, a-; bu, mun-; män, men-): listed as written otherwise.
- The three converbs in -p, -a and -ǧač and the purposive in -ǧali are told apart only in part by their values: REVIEW.
- Endings that make another word (-liq, -či, -daki, -čilik, -la, the nisba) are function heads (ADR 0145); what each takes and makes is the drafter's.

## What no finding above covers

- **Projections:** no orthography of this course has a stated projection yet, so every
  spelling and reading stays pinned as it is; there is nothing to compare them with
  (ADR 0148).
- **Credits by sentence:** an old credit for a `form:` KC that is feature values now has
  no
  part to go to: a feature's uses are not authored, and nothing old counts towards a rule
  (ADR 0146).
