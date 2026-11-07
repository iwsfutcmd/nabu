# 0080. apc grows to twenty units, checked against a reference grammar

- Status: Proposed
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

**Spelling choices the reference does not overturn stay, and are listed for review:**
- **3rd person singular endings.** The course writes the -o / -a endings ـو / ـا (بيّو, إمّا) and
  accepts ـه / ـها.
  - Kline writes ـه / ـها, and says most native speakers do (ch. 2).
  - Switching is a reviewer's call. The phonetic spelling also tells the voice to say -o.
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
| u12-trip | up to the village | ra7 + subjunctive; the subjunctive for every person; el jey; the dual (14, 22, 4) |
| u13-health | I don't feel well | fi- + ending (can), lezem (must), ma lezem; a7san (15, 3) |
| u14-phone | call me! | object endings -ni, -ak, -ik, -o, -a; -li (to me) (7, 8) |
| u15-shopping | at the clothes shop | colours and their feminines; comparatives with men (3) |
| u16-dates | when's your birthday? | 11–19 (r before a noun), 30; the months; awwal, tene; marra (25) |
| u17-childhood | when I was little | kent + verb (used to), kent 3am (was …ing); lamma; ba3dni (still); la7ali; ma 3ad (6, 16, 22, 26) |
| u18-getting-around | getting around | participles 2a3ed, wa2ef, jey, nezel; the service, traffic; liff, wa22ef (17, 23) |
| u19-work | work and study | iza, la2anno, enno; Sar and Sarli (10, 21) |
| u20-celebrations | congratulations! | mabrouk; -na, -kon objects; 3ajabni; feelings; lesh; shu + adjective (28, 30) |

- **Size.** The course grows from 348 to 685 sentences, from 258 to 410 KCs and from 55 to 99
  lessons. It now has 20 stories and 16 scenarios.
- **Facts, not sentences.** Every sentence was written for the course. The book's example
  sentences are not copied (ADR 0079).
- **Conventions.**
  - Senses spelled alike get a suffix, as in lzh: `ra7.fut` (رح) beside `ra7` (go),
    `fi.can` beside `fi`, `men.than`, `ba3d.still`, `jem3a.uni`.
  - Patterns that are not one word are `construction:` KCs on their sentences: `used-to`,
    `was-doing`, `shu-excl`.
- **Persons** ([ADR 0075](0075-persons-coverage.md)). The new units tag:
  - 46 sentences to a man, 33 to a woman and 19 to several people;
  - a man speaking in 14, a woman in 13.
  - Across the course: 102 / 54 / 48 and 25 / 21.
- **Drafts.** Everything new is an LLM draft (`llm:claude@<hash>`, status draft) and waits for a
  native speaker, starting with courses/REVIEW.md (apc 13).

## Consequences

- **The planner holds.** With CALIBRATION_WEIGHT unchanged, the 30-day simulations stay within
  ±5pp of 85% (apc-Arab 86.4%, apc-Latn 83.9%) and present every new KC in its lesson. A simulated
  month is 60 lessons; units 1–10 have 55, so the new units barely enter it. A longer simulation
  would test them.
- **Audio.** The new units are read by the course's two Lahgtna voices (ADR 0058, 0078). The
  round-trip check holds back the doubtful clips, as before. Seven older clips were made again:
  the fixes above changed what they read.
- **Open for the reviewer:** the ـو / ـه question; ج as a sun letter in the older vowel marks;
  the new words a native speaker should check first (REVIEW, apc 13).
- **Not yet:** a `sources` field that cites the reference and page on each item (ADR 0079 leaves
  it for its own ADR). This ADR and REVIEW name the chapters instead.
