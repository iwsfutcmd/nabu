# 0092. Cantonese checked against Matthews and Yip

- Status: Proposed
- Date: 2026-11-11
- Amends: [0050](0050-ten-unit-courses.md) (yue's units), [0085](0085-what-the-prompt-leaves-open.md) (yue's accept sets)

## Context

yue was drafted without a reference grammar. A model reading as a native speaker had checked it once,
and several points were left open for a reviewer (courses/REVIEW.md, yue 1–11). PyCantonese, the
compiler's analyzer, disagrees with 190 of its pinned readings (`enrich.reading-mismatch`).

The reference library ([ADR 0079](0079-reference-library.md), [0090](0090-reference-roots.md)) holds
Stephen Matthews and Virginia Yip, *Cantonese: A Comprehensive Grammar* (2nd ed., Routledge, 2011),
a grammar of Hong Kong speech. It is now yue's reference, as Kline (2022) is apc's.

- **Reading it.** The PDF's text layer keeps the English and the Yale romanization, with ā ē ī ō ū
  garbled into capitals. Its Chinese characters are wrong: the font's mapping is broken (我 comes out
  as a Thaana letter). Every character this ADR relies on was read from page images.
- **Its romanization.** M&Y transcribe Hong Kong speech as they hear it, with the n/l merger (léih
  for 你). The course keeps standard Jyutping (nei5); only tones and changed tones were compared.
- **Notes.** Page-referenced notes are in the library (`nabu/notes/yue/`), not here. Pages are the
  book's printed pages.

## Decision

**Readings: M&Y confirm every one compared, and settle the analyzer's disagreements.** The course
keeps them, and the warnings stay visible ([ADR 0028](0028-compiler-lints.md)):

| Course | PyCantonese | M&Y |
|---|---|---|
| 呀 aa3 (144 tokens) | aa4 | *a*, mid tone, and *àh* is another particle (18.3.1, p. 398) |
| demonstrative 呢 ni1 (34) | ne1 | *nī* (also *lēi*, *lī*); the particle is *nē* (1.1.3 p. 22; 6.1.2 p. 107) |
| 平 peng4 "cheap" | ping4 | *pèhng*; *pìhng* in 公平 (pp. 147, 182) |
| 名 meng2 | ming4 | *méng* (p. 108) |
| 英文, 中文 man2 (the languages) | man4 | *Yīngmán*, *Jūngmán*; *màhn* only in 中文字, 中文大學 (pp. 57, 199, 212) |
| 弟弟 dai4 dai2 | dai6 dai6 | *dàih-dái*, the everyday form (1.4.2 p. 33) |
| 嗎 maa3 | maa5 | *ma* (17.1.1 p. 359) |

M&Y never write 女兒; their "daughter" is 女 *léui* (neoi2), which the KC's note gives.

**What M&Y show to be wrong is fixed.**

| Where | Was | Now | M&Y |
|---|---|---|---|
| s.11 係你呀？ | 呀 aa3 | aa4: *àh* turns a statement into a question; *a* alone cannot | 17.1.1 p. 359; 18.3.1 p. 398 |
| The intro story's question | 你係學生嗎？ | 你係唔係學生呀？: Cantonese has no general yes/no particle, and 嗎 is formal, mostly in 你好嗎 | 17.1.1 p. 359 |
| s.u03.15, s.u03.21, s.u08.23 | …你嘅呀？, …大啲嘅呀？ | …你嘅？, …大啲嘅？: *ge* + *a* contracts to *ga*, so "ge a" does not occur (the course has no 㗎) | 18.2.3 p. 392 |
| s.u08.36 and the market story | 俾你一百蚊, 俾你八十蚊 | 俾一百蚊你, 俾八十蚊你: with 俾 the thing given comes first, the person only when the thing is long or stressed. The other order is still accepted | 8.2.2 p. 154 |
| The book-stall story | the seller says 唔該 | 多謝: the buyer says 唔該 on getting the goods, the seller 多謝 on being paid | 20.1.2 p. 425 |
| s.u02.14 個老師好好 | the accept set took 老師好好 | 個 is required: a bare noun is generic ("teachers") | 6.2.1 p. 110 |

Two sentences turned out to be examples in the book, word for word: s.u03.20 你個仔好高 and s.u02.36
我好攰呀. Both were drafted before the book was read, but a course takes facts from references, never
their examples. They are now 我個仔好高 "My son is tall" and 佢好攰呀 "She's so tired".

**Glosses and notes.**

| KC | Was | Now | M&Y |
|---|---|---|---|
| 呀 | "softens a statement, marks a question" | softens a statement or question (aa3); turns a statement into one that expects yes (aa4) | p. 398 |
| 嗎 | "yes-or-no question" | + formal, mostly in 你好嗎; everyday questions use X唔X | p. 359 |
| 啦 | "suggestion, 'let's'" | suggestions, requests and instructions | Table 18.1 p. 391; pp. 404, 413 |
| 個 | "before a noun alone: the" | with a noun before the verb: the; after it, "a" (我有個哥哥) | 6.1.1 pp. 105–106 |
| 多謝 | "for a gift or a compliment" | + a treat, and a seller being paid | p. 425 |
| 對唔住, 唔好意思 | 對唔住 "stronger", 唔好意思 "lighter" | 對唔住 the everyday apology (also "excuse me" to ask the way); 唔好意思, "embarrassed", owns up to a fault. M&Y rank neither | 20.1.3 p. 426 |
| 俾 | "(after a verb) to, for" | to; "for" is 幫. The thing given comes first | pp. 154, 161 |
| 想 | "want to; to think" | want to ("think" is 諗) | 8.1.4 p. 152 |
| 名, 錢, 呢, 尋日, 先生 | notes | meng2 in everyday words, ming4 in literary ones and ranks; 錢 cin2 throughout; 呢's variants as M&Y list them; 噚日 kam4 the commoner "yesterday"; 陳生 the usual form of address | pp. 108, 395; 107; 456; 429 |

**Accept sets: forms M&Y give that translate the same ([ADR 0085](0085-what-the-prompt-leaves-open.md)).**

- **English: 好 is a weak intensifier.** 好 before a predicative adjective is "much weaker than English
  *very*" (9.1.1 p. 179). In 25 sentences "very/really/so" becomes optional: 佢好高 is "She's tall".
- **English: an imperative without a subject** is "you" as well as "we" (19.1 p. 414; 不如 p. 416):
  七點喺中環等啦 also takes "Meet me in Central at seven"; 不如去飲茶啦 "Why don't you go…".
- **Cantonese:**
  - 叫做 beside 叫 for names (p. 156);
  - 係 optional in "X is mine" and in prices (pp. 94, 145);
  - 裏面 beside 入面 (pp. 133–134);
  - 喺香港住 beside 住喺香港 (p. 132);
  - 對唔住(，請問) for "excuse me, where's…" (p. 426);
  - 唔好客氣 and 唔使唔該 for "you're welcome" (pp. 423, 425);
  - 我要杯咖啡 without 一, and 唔該俾杯水我 (p. 423);
  - 十點踏二 for ten past ten (p. 459);
  - 唔識英文 without 講 (p. 171);
  - 唔係幾遠 (pp. 181, 286);
  - 可能會 and 或者 for "might" (pp. 213, 274);
  - 好唔得閒 for "very busy" (p. 285);
  - 太過 (p. 195);
  - 我尋日見美玲 without 咗, since a past time word is enough (p. 228);
  - 落住雨 and 而家落雨 (pp. 225, 228–229);
  - 唔准 and 唔試得 for "can't try it on here" (pp. 266, 277).

**Spelling.** M&Y write as the course does: 哋, 咗, 俾 (never 畀), 嘅, 喇 *la* against 啦 *lā*,
晒, 鍾意, 冇, 乜嘢 and 呢. They write "yesterday" 噚日 *kàhmyaht*, with 尋日 *chàhmyaht* as the other
form. The course keeps 尋日 cam4, which matches M&Y's pairing, and accepts 噚日 and 琴日.

## Consequences

- **The course.**
  - 60 sentences change: 7 in their text or a reading, the rest in their accept sets or English.
  - 3 story lines change.
  - The KCs are the same 263; 14 have a new gloss or note.
  - One more reading agrees with PyCantonese (s.11), so 186 warnings remain. Each is a reading M&Y
    confirm.
- **Audio.** Nine eSpeak clips were made again, with the round trip check. They fail it, as all but
  17 of yue's 724 clips do, so they stay out of the bundle.
- **Left for a reviewer** (courses/REVIEW.md, yue):
  - 要 + verb taken as "want to" (M&Y: "need to");
  - 住邊度 without 喺 (M&Y: location questions take 喺邊度, p. 378);
  - 左邊 and 右邊 bin6 (M&Y write the tone-6 localizer 便);
  - 細佬 and 㗎 (M&Y's own forms) outside the script audit;
  - 嗎 in 38 accept sets.
