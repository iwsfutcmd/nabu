# 0127. Classical Chinese checked against Baxter & Sagart, Kroll and Pulleyblank

- Status: Proposed
- Date: 2026-11-14
- Amends: [0071](0071-classical-chinese.md) (lzh's readings, words and grammar),
  [0085](0085-what-the-prompt-leaves-open.md) (lzh's accept sets)

## Context

lzh was drafted from open data ([ADR 0071](0071-classical-chinese.md)): readings from Unihan and the
Guangyun, checked against Wiktionary, and glosses and grammar without a reference. The reference
library ([ADR 0079](0079-reference-library.md), [0090](0090-reference-roots.md)) now holds the
Chinese shelf (`books/ling/sit/zho`), and lzh is checked against three of its books, as yue was
against Matthews and Yip ([ADR 0092](0092-yue-matthews-yip.md)):

- **William H. Baxter and Laurent Sagart**, *Old Chinese reconstruction*, version 1.1 (2015-10-13),
  the list behind *Old Chinese: A New Reconstruction* (2014): one row per reading, with Pinyin,
  Middle Chinese in Baxter's notation and a gloss. The Baxter layer is their transcription.
- **Paul W. Kroll**, *A Student's Dictionary of Classical and Medieval Chinese* (rev. ed., Brill,
  2017): senses by reading, each with Pinyin and Middle Chinese in Baxter's notation.
- **Edwin G. Pulleyblank**, *Outline of Classical Chinese Grammar* (UBC Press, 1995).
- For the literary Jyutping, the glossary of Bryan W. Van Norden's *Classical Chinese for
  Everyone* (2019), Cantonese edition.

Reading them:

- Kroll's text layer is clean. Pulleyblank's PDF is a scan: it was read through OCR, and every
  example this ADR relies on was checked on a page image.
- Notes with page references are in the library (`nabu/notes/lzh/`), not here. Pages are printed
  pages.
- As with every reference, the course takes facts from them, never their examples or wording.

## Decision

**Readings: the Baxter layer is Baxter & Sagart's own transcription, checked row by row.** B&S's list
(version 2015-10-13) gives one row per reading with its gloss. Before this change, 230 of the
course's 246 characters-by-sense matched a row, and Kroll gave the same Middle Chinese for 237 (he
writes Baxter's notation). What they show to be wrong is fixed:

| Word | Was | Now | Source |
|---|---|---|---|
| 盾 "shield" | zywinX (the Guangyun's 食尹切, the reading of 楯 shǔn) | dwonX, as dùn and teon5 already were | B&S row 750; Kroll p. 96 |
| 鯈 "minnow" | drjuw (chóu) | dew, as tiáo and tiu4 already were | Kroll p. 453 |
| 大 "big" | dajH | daH: B&S list both for "big"; Kroll gives dajH only to dài (= 代) | B&S rows 560–561; Kroll p. 73 |
| 從容 | cóng róng | cōng róng, the reading the pinned tshjowng and sung1 already follow; the note says today's Mandarin is cóngróng | Kroll p. 66 |
| 見 "have an audience with" | jiàn / gin3 / kenH, the reading of 見 "see" | xiàn / jin6 / henH: presenting oneself to a superior is the word "appear" (later 現). A sense takes one reading in all three layers; the note says many readers today say jiàn | Kroll p. 199 (xiàn, sense 2); B&S row 3744 |

- **Borrowings** take the borrowed character's row: 女 "you" nyoX (汝), 知 "wise" trjeH (智), 有
  "and" hjuwH (又). Kroll lists the first two under 女 and 知 themselves (pp. 329, 604). He files the third under
  yǒu hjuwX (p. 565), but Pulleyblank reads 有 "and" in numbers in the departing tone (VI.4, p. 60),
  as the course does.
- **One reading per sense, in every layer.** Each sense's Pinyin, Jyutping and Baxter were checked
  against each other: Pinyin with Baxter by B&S's rows and Kroll's entries, Pinyin with Jyutping by
  Unihan's kSMSZD2003Readings. Only 見 mixed two readings; 耕 gang1 and 頸 ging2 are literary
  readings of the same word, where SMSZD gives only the colloquial ones.
- **Senses B&S's list leaves out** (應 "answer" 'ingH, 從容 tshjowng) agree with Kroll.
- **劍** is kjaemH, as B&S have it and the owner confirms; Kroll's kjomH (the Guangyun's 梵 rhyme)
  is not followed.
- **Literary Jyutping**: Van Norden's glossary (Cantonese edition) agrees on the 104 characters it
  shares with the course, except:
  - 曰: jyut6, the regular reflex of 王伐切, where the course has joek6. 曰 is read joek6,
    irregularly (the owner confirms; Unihan's kSMSZD2003Readings lists it first). Kept.
  - 生: the colloquial saang1 against the course's literary sang1. 生 is sang1 throughout (the owner
    confirms).

**Words: Kroll's dictionary for senses and glosses.** 207 of the 220 senses Kroll has agree. Kroll
has no entry for 誰 or 濠. Every homograph (知, 說, 女, 有, 子, 之, 從, 見, 利, 是, 自, 強) is tagged
with the right sense in every sentence and story line.

| Where | Was | Now | Kroll |
|---|---|---|---|
| s.07.24 | 劍折 "The sword broke": an intransitive 折, which is read dzyet | 折之 "He broke it", the transitive tsyet the passage's 折頸 has | p. 596 |
| s.10.36 and 春曉 | 夜 + 來 "come" | 夜來, one word, "in the night" (`sense:夜來`) | 來 sense 4 (medieval), p. 251 |
| 罔 | lost, confused; in vain | lost, confused, bewildered | pp. 469–470 |
| 遊 | …; to swim about | to roam, to stroll, to wander. Swimming is 游; the note says so, and fish that 出遊 may roam, wander or swim about in English | pp. 563–564 |
| 覺 | …; to wake | to become aware of, to notice; to realize. "Wake" is the other reading, kaewH | p. 232 |
| 復 | note: read as 又 | note: fù/fau6/bjuwH is 復's own adverbial reading ("again"); the verb "return" is bjuwk | p. 123 |

**Grammar: Pulleyblank's rules.** Most of the course holds up: its noun predicates with 也 and 非,
不亦…乎, the fable opener 楚人有涉江者 (a partitive 有…者, IV.7 p. 31), 之 in 吾劍之所從墜 (the
subject of a 所 phrase, VII.2d p. 68), numbers as predicates (吾年十有五), 矣 for a new situation,
and its negatives. What he shows to be wrong is fixed.

- **A pronoun object after a negative comes before the verb** (IX.1e, pp. 84–85): 不我知 "does
  not know me". After 不 the object 之 is usually left out; after 莫 and 未 it comes before the verb
  (莫之能知). The course taught the rarer, emphatic order, and its accept sets refused the regular
  one. A new construction, `construction:neg-pronoun`, teaches it in unit 1 (on s.01.30), and four
  sentences change:

  | Id | Was | Now | Still accepted |
  |---|---|---|---|
  | s.01.30 | 王不知我 | 王不我知 | 王不吾知, 王不知我 |
  | s.02.3 | 吾不知汝 | 吾不汝知 | 吾不知汝, 吾不知子 (子 is a noun of address, not a pronoun) |
  | s.03.37 | 吾不踰之 | 吾不踰 | 吾弗踰, 吾不踰之 |
  | s.08.13 | 人莫能知之 | 人莫之能知也 | 人莫能知之 |

  s.08.15 無人知之 also accepts 莫之知.
- **吾 stands only before the word it goes with** (IX.1a, p. 76): as subject, possessive, or an
  object between a negative and its verb. As the predicate or after 非 only 我 can stand: 吾也,
  非吾也 and 子非吾 are no longer accepted. The gloss said 吾 is "never an object"; it now says
  where it stands.
- **為 + agent + verb is a passive** (IV.9b, pp. 36–38), and Pulleyblank rejects the reading
  "became X's laughingstock". 身為宋國笑 (s.07.36, s.07.37 and the Han Feizi story) is shown as "he
  himself was laughed at by the people of Song", and both sentences carry
  `construction:wei-passive`. "Laughingstock" is still accepted.
- **Mencius 1A1**: 亦 in a question is "surely" (XIV.2b, p. 142), and 亦有仁義而已矣 has an
  understood "I" (II.2, p. 13). s.09.13, s.09.14, s.09.21 and s.09.23 are shown that way; "also"
  and "there is" are still accepted.
- **于 is not 於** (V.6b, pp. 53–54): two words, 于 the older; writing 於 as 于 is today's
  simplified spelling. 于 is no longer accepted for 於 (the course rejects simplified characters);
  於 is still accepted for the Analects' 于 (志于學).
- **English**: 不善 also takes "bad" (不 + adjective is the contrary, p. 141); 弟子十人 also takes
  "the disciples were ten".
- **Glosses and notes**:

  | KC | Now says | Pulleyblank |
  |---|---|---|
  | 也 | closes a noun predicate; after a verb, states a settled fact (not "it is") | III.1f p. 20; XII.2b p. 118 |
  | 者 | also marks a topic after a noun (仁者，人也), and counts after a number (二者) | VIII.5c p. 74; VII.2c p. 67; Kroll p. 597 |
  | 之.de | also makes a clause a noun between subject and verb (吾盾之堅, 魚之樂) | VII.2b p. 64 |
  | 莫 | says none of the subject does it (not itself the subject) | XI.2e p. 109 |
  | 弗 | a stronger 不, mostly where an object is understood | XI.1c pp. 104–106 |
  | 可 | "possible"; a verb after it is passive (兔不可得); "I can" is 能 | IV.1 p. 23; V.4a p. 42 |
  | 安 | how? where? | IX.3c p. 96 |
  | 哉 | also ends a question said with feeling (天何言哉) | XIV.3a p. 146 |
  | 亦 | also; surely | XIV.2b p. 142 |
  | 為 | to do, to make; to be, to act as, to become | Kroll p. 472 |
  | 其 | his, her, its, their; the (one just mentioned): Kroll gives no demonstrative, Pulleyblank an article-like use, with this very 其人 | IX.1c p. 80 |
  | 是.cop | a copula in speech by the Han, as Tang poems use it; classical prose says 此霜也 | III.1b p. 17; IX.2b p. 86 |
  | 有 "and" | between a round number and what it adds | VI.4 p. 60 |

## Consequences

- **The course.**
  - 31 sentences change beyond their readings: five in their text (four reordered, s.07.24
    replaced), the rest in their accept sets, shown English or construction tags.
  - 19 more change only a reading (盾, 大, 鯈, 見, 從容), and s.10.36 takes the word 夜來.
  - Six story lines change: the Han Feizi line's English, the rest in readings or 夜來.
  - There are 232 KCs: 夜來 and `construction:neg-pronoun` are new, and 20 have a new gloss or note.
- **Settled by the owner**: 見 "have an audience" xiàn / jin6 / henH, 劍 kjaemH, 曰 joek6 (irregular)
  and 生 sang1. No reading is left open for the reviewer.
- **No other course changes.** lzh has no audio, so no clip is made again.
