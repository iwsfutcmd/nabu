# 0080. apc grows to twenty units, checked against a reference grammar

- Status: Accepted (2026-11-18)
- Date: 2026-11-07
- Amends: [0050](0050-ten-unit-courses.md) (apc's size), [0053](0053-vocalization.md) (new words)

## Context

apc had ten units, A1 to early A2 ([ADR 0050](0050-ten-unit-courses.md)). They were drafted
without a reference grammar, and a model reading as a native speaker had checked them once.
Several points were left open for a reviewer (courses/REVIEW.md, apc 1–12).

The reference library ([ADR 0079](0079-reference-library.md)) now holds Richard A. Kline,
*The Fundamentals of Lebanese Grammar* (Routledge, 2022). It is a grammar of Beirut speech, in
English, and it writes every example twice: in Arabic script and in the Arabizi Lebanese use.
It is the first reference a course has been checked against.

- **Reading it.** The PDF's text layer keeps the Latin transcriptions intact. Its Arabic comes
  out as presentation forms, with shaddas cut loose and multi-word lines out of order. So:
  - Latin facts were read from the text;
  - every Arabic spelling this ADR relies on was read from page images.
- **What the book settles.** Several of REVIEW's open points:
  - 3am + a verb without b- (ch. 16);
  - the b- present spellings (ch. 13);
  - Sar / Sarli (ch. 10);
  - numbers and the nouns after them (ch. 25);
  - the Arabizi digits (ch. 2), 8 for غ among them.

## Decision

**Fix what the reference shows to be wrong in units 1–10.** Each fix is small; the accept sets
keep the old forms.

| Where | Was | Now | Kline |
|---|---|---|---|
| badd- before -na, -kon (s.like.18, s.like.33, the u07 story) | baddna, baddkon; بدّنا, بدّكن | badna, badkon; بدنا, بدكن | p. 110: the dd is single before a consonant ending (baddo, badda, baddon keep it) |
| ken, he was (the كان word card, the u09 story) | kan, with كنت as the Arabic card | ken, كان | ch. 10: ken, kent, kenet, kenna, keno |
| reje3, he came back (s.past.14, the KC; vocalization رِجِع) | rje3 | reje3 | ch. 11: reje3 / yerja3 |
| Arabizi accept sets | — | + msh (mish), re7et / ri7t (I went), eshtarayt / shtarayt (I bought) | the book's own spellings |

**The Arabizi profile folds 8 into gh** (`gh-8`, REVIEW), as it already folds 5 into kh. Kline's
alphabet gives *5 (kh)* and *8 (gh)*. Conformance vectors `grade/apc-latn/gh-8*` pass in both
harnesses.

**The -o / -a endings are written ـه / ـها, as Kline writes them.** He says most native speakers
do (ch. 2). The course had written them phonetically, ـو / ـا (بيّو, إمّا).
- **What changed.** Every word whose ending is the 3rd person singular pronoun:
  - possessives (بيّه, إمّها, عمره, بدّه, معها), the morphs tagged `form:poss-3ms` / `poss-3fs`;
  - objects on verbs (شفته, شفتها, بتعرفه), tagged `form:obj-3ms` / `obj-3fs`;
  - enno and la2anno, enn- and la2ann- with the same ending: إنّه, لأنّه (pp. 65–66).
- **What did not.** Verb plurals end in -o too, but are not this ending: بتعرفوا (you all know)
  keeps its spelling, and its accept set keeps بتعرفو.
- **Accept sets** put the new spelling first and keep the old one, so ـو / ـا are still right.
- **Vowel marks.** ـه takes a damma on the letter before it (بَيُّه, شِفْتُه), and the voice says -o
  from it. Before ـها that letter stays unmarked (إِمّها).

**Spelling choices the reference does not overturn stay, and are listed for review:**
- **3rd person plural.** New in unit 11, the -on ending is written ـهن (بيتهن), as Kline writes it,
  and ـن is accepted. A bare ـن reads like other words (بدن).
- **Sun letters.** Kline counts ج as a sun letter in Lebanese. New vocalizations mark the shadda
  (الجّيران, الجّايِة). The older ones (الجِمْعَة, بِالجَبَل) are left for the reviewer, since
  changing them changes their clips.

**Units 11–20, A2.** Ten units, each with its own grammar point from the book, a story (both
`complete` and `arrange` lines), a roleplay scenario, and vowel marks for every new word.

| Unit | Theme | Grammar (Kline chapter) |
|---|---|---|
| u11-people | friends and neighbours | huwwe, hiyye, henne; -on (their); by-…-o, -o (they); seken, lebnene (3, 7, 12, 13, 17) |
| u12-trip | up to the village | ra7 + the imperfect (the verb without b-), every person; el jey; the dual (14, 22, 4) |
| u13-health | I don't feel well | fi- + ending (can), lezem (must), ma lezem; a7san (15, 3) |
| u14-phone | call me! | object endings -ni, -ak, -ik, -o, -a; -li (to me) (7, 8) |
| u15-shopping | at the clothes shop | colours and their feminines; comparatives with men (3) |
| u16-dates | when's your birthday? | 11–19 (r before a noun), 30; the months; awwal, tene; marra (25) |
| u17-childhood | when I was little | kent + verb (used to), kent 3am (was …ing); lamma; ba3dni (still); la7ali; ma 3ad (6, 16, 22, 26) |
| u18-getting-around | getting around | participles 2a3ed, wa2ef, jey, nezel; the service, traffic; liff, wa22ef (17, 23) |
| u19-work | work and study | iza, la2anno, enno; Sar and Sarli (10, 21) |
| u20-celebrations | congratulations! | mabrouk; -na, -kon objects; 3ajabni; feelings; lesh; shu + adjective (28, 30) |

- **Size.** The course grows from 348 to 685 sentences, from 258 to 410 KCs and from 59 to 99
  lessons. It now has 20 stories and 16 scenarios.
- **Facts, not sentences.** Every sentence was written for the course. The book's example
  sentences are not copied (ADR 0079).
- **Conventions.**
  - Senses spelled alike get a suffix, as in lzh: `ra7.fut` (رح) beside `ra7` (go),
    `fi.can` beside `fi`, `men.than`, `ba3d.still`, `jem3a.uni`.
  - Patterns that are not one word are `construction:` KCs on their sentences: `used-to`,
    `was-doing`, `shu-excl`.
  - The verb without b- (badna nru7, ra7 tru7) is Kline's imperfect (ch. 22). It is a
    subjunctive only in some uses (after 7atta, ta, la-). Its KCs keep the ids they had,
    `form:subj-1pl` and the like, because learners' cards are keyed on them.
- **Persons** ([ADR 0075](0075-persons-coverage.md)). The new units tag:
  - 47 sentences to a man, 33 to a woman and 19 to several people;
  - a man speaking in 14, a woman in 13.
  - Across the course: 103 / 54 / 48 and 25 / 21, and one to one person (s.day.24: بتحكي is a
    man's and a woman's).
- **Drafts.** Everything new is an LLM draft (`llm:claude@<hash>`, status draft) and waits for a
  native speaker, starting with courses/REVIEW.md (apc 13).

## Consequences

- **The planner holds.** With CALIBRATION_WEIGHT unchanged, the 30-day simulations stay within
  ±5pp of 85% (apc-Arab 86.4%, apc-Latn 83.9%) and present every new KC in its lesson. A simulated
  month is 60 lessons; units 1–10 have 59, so the new units barely enter it. A longer simulation
  would test them.
- **Audio.** The new units are read by the course's two Lahgtna voices (ADR 0058, 0078). The
  round-trip check holds back the doubtful clips, as before. Six older clips were made again
  (s.like.18, s.like.33, s.past.14, the ken and reje3 word cards, a line of the u07 story):
  the fixes above changed what they read.
  - The ـه / ـها spelling made 37 clips again, every item with the endings. The round-trip check
    holds back 9 of them (10 before).
  - Six of the 37 a listener had checked (s.fam.15–19, s.like.16). They are drafts again. A
    voice's `spoken` could have kept the old takes, but it ties an item to one voice, and an
    unchecked item's voice can change (ADR 0078); `nabu audio generate` then refuses.
  - A phoneme recognizer run on the old and new clips heard the same -o and -a endings. None says
    the h of ـها. Two old clips that said -o for -a (عِنْدا, بَعْدا) now say -a.
- **Open for the reviewer:** the damma before ـه; ج as a sun letter in the older vowel marks;
  the new words a native speaker should check first (REVIEW, apc 13).
- **Not yet:** a `sources` field that cites the reference and page on each item (ADR 0079 leaves
  it for its own ADR). This ADR and REVIEW name the chapters instead.

## Amendment (2026-11-25): units 21–30, B1

A learner (the owner) placed out of all twenty units and asked for more. Ten more units take the rest of Kline's
chapters, built in the lexical model: every token is a lexeme and the feature values it chooses, realised and spelled
through apc's rules by a generator (kept in the reference library, `nabu/notes/apc/generator`, not the repo), then
checked by the compiler as any course source is.

| Unit | Theme | Grammar (Kline chapter) |
|---|---|---|
| u21-weather | the weather and the seasons | 3am tshatti (shatta, Form II), the seasons; kell, ba3d (some), wala (4, 13, 24) |
| u22-kitchen | in the kitchen | the imperative to a man, a woman and several people; ma with the bare present; -li (22, 23) |
| u23-who | the one who | yalli as subject and object, with its returning pronoun; the genitive construct; nafs (7, 9) |
| u24-if-only | if only… | law with the b-present and with ken; iza; ya reit; ken lezem (15, 21) |
| u25-how-long | how long? | sar with -la- and an ending (sarlo sa3a); ba3dni wasel (just), ba3dni ma akalt (not yet); shi marra, wala marra; 2abelma, ba3dma (4, 18) |
| u26-closed | closed today | passive participles: maftu7, msakkar, maksur, ma3zum, mamnu3; ken with them (19) |
| u27-keep-going | keep going | dall, sar 3am, ballash, khallas, rje3 + a verb, ma 3ad, tele3 (turn out) (10, 15) |
| u28-except | without sugar | illa, ghayr (ghayrak), bala, bidoun, w bas; shu and 2addesh-a in exclamations (27, 28) |
| u29-while | when I was little | hiyye w raj3a (the accusative of circumstance), lamma kent; ya; dakhlak; ya3ni, lek, w hek (26, 30) |
| u30-mountains | a weekend in the mountains | 3assoul, tayyoub (diminutives); a review of units 21–29 (31) |

- **Size.** 245 new sentences, 11 stories (no new scenarios), 46 lessons and 76 lexemes: the course has 906
  sentences, 30 stories and 141 lessons.
- **Facts, not sentences.** Where a Kline example would have been the natural sentence, it was changed (his Sarla sene
  ma zaret emma became sarlo shahr ma zar teta); the book's sentences are not copied (ADR 0079).
- **The rules grew where the units needed them** (docs/rules-design.md, "apc's units 21 to 30"), each with
  conformance vectors: the passive participle (`Voice=Pass` beside `Aspect=Part`, a new feature value), a doubled verb
  whose present is in a (yDall), and ة as t after a doubled letter (marra, marrten). Six dative endings joined -li and
  -lak (-lo, -la, -lik, -lna, -lkon, -lon).
- **Homographs.** Where a new form is spelled like an older word with other marks (صارلك, sarlak and sarlik), it is in
  vocalization.yaml's `ambiguous` and every token pins its marks; elsewhere a sentence was reworded rather than make
  a new homograph (دقلي, قرا, رجع, سافرت, وصلت, طلعت each already read one way).
- **Persons** (ADR 0075): 36 sentences to a man, 20 to a woman, 15 to several people; a man speaking in 29, a woman
  in 28.
- **Drafts.** Everything new is an LLM draft and waits for a native speaker: courses/REVIEW.md (apc 14).

