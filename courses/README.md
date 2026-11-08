# Fixture courses

Ten units each, from A1 to early A2 (es: thirty, to B2; hbo: twenty, to A2; tok: ten, to A2), built by `pnpm courses` and kept green by CI (CLAUDE.md).
- **The format** is in [ADR 0027](../docs/adr/0027-course-source-format.md).
- **The choices behind these four** are in [ADR 0033](../docs/adr/0033-fixture-courses.md) and
  [ADR 0050](../docs/adr/0050-ten-unit-courses.md).

Real courses can live in separate repositories.

| Course | Orthographies | Size | What it exercises |
|---|---|---|---|
| [`fa`](fa/) | fa-Arab | 328 sentences, 259 KCs, 60 lessons | RTL; the plural -hā joined with a ZWNJ (written `\u200c` in YAML); ezafe, with the small hamza after a silent -e; copula endings as morphs; the می‌ present, imperative, subjunctive and simple past; an RBNF numbers drill; plural "you" (شما) tagged apart from تو |
| [`yue`](yue/) | yue-Hant-HK | 363 sentences, 263 KCs, 58 lessons | Pinned Jyutping shown as ruby; sentence-final particles; A-not-A questions; classifiers; 咗 未 過 and 緊; colloquial characters missing from CLDR (`exemplarsExtra`); an RBNF numbers drill; 你 and 你哋 tagged "to one person" / "to several people" |
| [`uz`](uz/) | uz-Latn, uz-Cyrl | 325 sentences, 244 KCs, 58 lessons | Every sentence pinned in both scripts; ʻ (U+02BB) in oʻ; person, possessive, case and tense suffixes as morphs; a Latin→Cyrillic script-convert node; plural *sizlar* tagged apart from *sen* |
| [`apc`](apc/) | apc-Arab, apc-Latn (Arabizi) | 348 sentences, 258 KCs, 59 lessons | Learner-selectable script; Arabizi spelling variants in accept sets; possessive endings and verb persons as morphs; the b- present, subjunctive and past; vocalized stories; an Arabic→Arabizi script-convert node teaching 7, 3 and 2; a man or a woman speaking, and "you" to a man, a woman or several people ([ADR 0075](../docs/adr/0075-persons-coverage.md)) |
| [`lzh`](lzh/) | lzh-Hant | 379 sentences, 230 KCs, 50 lessons | Classical Chinese, read and written only (`facets: [recognize, produce]`, no audio, ADR 0071); every unit ends in an authentic passage (Analects, Laozi, Zhuangzi, Mencius, Han Feizi, Tang poems); readings pinned by sense in three layers shown on request: Pinyin, Jyutping, Baxter's Middle Chinese |
| [`es`](es/) | es-Latn/standard | 1062 sentences, 741 KCs, 169 lessons (thirty units, A1–B2) | Cuban Spanish for heritage speakers (ADR 0076): Cuban answers canonical, pan-Hispanic accepted; verb tenses as `form:` KCs; accent marks that make another word graded wrong; typed adaptive placement (ADR 0077); a Cuban voice cloned from a CC0 recording |
| [`hbo`](hbo/) | hbo-Hebr (Tiberian pointing) | 696 sentences, 358 KCs, 90 lessons (20 units) | Biblical Hebrew, not Modern (ADR 0082; checked against Khan, Joüon–Muraoka and Holladay, ADR 0084): text pointed as the Masoretic text is, points shown by default and hidden on request; every unit reads a passage of the Hebrew Bible (WLC); every word pins its Tiberian reading, and the audio says it as Tiberian phonemes (Khan), never Modern Hebrew, once a card is answered (no listening exercises: its facets leave out listen); verb forms as `form:` KCs; Eve, Rebekah and the women of the stories speaking and spoken to |
| [`tok`](tok/) | tok-Latn (sitelen Lasina), tok-Qaap (sitelen pona) | 375 sentences, 132 KCs, 52 lessons | Toki Pona in two scripts, every sentence pinned in both ([ADR 0085](../docs/adr/0085-toki-pona-and-sitelen-pona.md)): sitelen pona as UCSUR logographs under a private-use script subtag, words run together, names in cartouches, each logograph's word as ruby on request; Latin typed into sitelen pona graded as logographs; the 120 words of pu (but unpa) and kin; no person, gender or number marked, so English accept sets give I/we, she/he/they/it and the tenses; voices saying the Latin as eSpeak NG phonemes |

Every unit ends in a story, and each course has six roleplay scenarios (lzh has seven; es one about every three units; hbo nine; tok ten).

## Review status

Every taught sentence was drafted by an LLM. Its provenance is `llm:claude@<prompt-hash>` with
`status: draft`, and it is licensed CC-BY-SA-4.0. Generated drill sentences are
`generated:cldr-rbnf@icu<version>` (Unicode-3.0).

Before any of this is published, a native speaker should check the following. The points the
drafts were least sure of are listed course by course in [REVIEW.md](REVIEW.md).

- the sentences;
- the translations and accept sets;
- the glosses;
- the yue readings;
- the lzh readings (Pinyin, literary Jyutping, Baxter's Middle Chinese), chosen by sense;
- the tok sentences in both scripts, and the cartouche spellings of the names.

Promote reviewed items with `status: reviewed` (or `published`, which requires `reviewedBy` and
`reviewedAt`).

## Building

```sh
pnpm courses                                        # all courses, lint only
cd pipeline && uv run nabu build ../courses/fa      # one course → dist/fa/
```

Expected diagnostics:

- yue warns that PyCantonese reads the particles 呀 and 嗎 as aa4 and maa5. The pinned aa3 and maa3
  win. It also warns about three colloquial readings that PyCantonese lacks: 名 meng2, 弟弟 dai4
  dai2 and 平 peng4 "cheap".
- uz gets info notes where ICU's Latin→Cyrillic transform disagrees with the pinned Cyrillic
  (Мэн vs Мен).
