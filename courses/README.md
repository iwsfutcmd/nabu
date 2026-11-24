# Fixture courses

Ten units each, from A1 to early A2 (es: thirty, to B2; hbo: twenty, to A2; tok: ten, to A2; grc: ten, to A2; chg: nineteen, to B1; sk: twenty, to early B1; bar: ten, to early A2), built by `pnpm courses` and kept green by CI (CLAUDE.md).
- **The format** is in [ADR 0027](../docs/adr/0027-course-source-format.md).
- **The choices behind the first four** (fa, yue, uz, apc) are in [ADR 0033](../docs/adr/0033-fixture-courses.md) and
  [ADR 0050](../docs/adr/0050-ten-unit-courses.md); each later course has an ADR of its own (CLAUDE.md names them).

| Course | Orthographies | Size | What it exercises |
|---|---|---|---|
| [`fa`](fa/) | fa-Arab | 328 sentences, 253 lexemes, 60 lessons | RTL; the plural -hā joined with a ZWNJ (written `\u200c` in YAML); ezafe, with the small hamza after a silent -e; copula endings as lexemes of their own in a token's `lexemes`; the می‌ present, imperative, subjunctive and simple past; an RBNF numbers drill; plural "you" (شما) tagged apart from تو |
| [`yue`](yue/) | yue-Hant-HK | 364 sentences, 262 lexemes, 58 lessons | Pinned Jyutping shown as ruby; sentence-final particles; A-not-A questions; classifiers; 咗 未 過 and 緊; colloquial characters missing from CLDR (`exemplarsExtra`); an RBNF numbers drill; 你 and 你哋 tagged "to one person" / "to several people" |
| [`uz`](uz/) | uz-Latn, uz-Cyrl | 325 sentences, 241 lexemes, 58 lessons | Every sentence pinned in both scripts; ʻ (U+02BB) in oʻ; person, possessive, case and tense suffixes as lexemes in a token's `lexemes` (`lexeme:dat`, `lexeme:past`); a Latin→Cyrillic script-convert node; plural *sizlar* tagged apart from *sen* |
| [`apc`](apc/) | apc-Arab, apc-Latn (Arabizi) | 685 sentences, 370 lexemes, 99 lessons (20 units) | Learner-selectable script; Arabizi spelling variants in accept sets; possessive endings as lexemes in a token's `lexemes`, verb persons as feature values; the b- present, subjunctive and past; vocalized stories; an Arabic→Arabizi script-convert node teaching 7, 3 and 2; a man or a woman speaking, and "you" to a man, a woman or several people ([ADR 0075](../docs/adr/0075-persons-coverage.md)) |
| [`lzh`](lzh/) | lzh-Hant | 379 sentences, 227 lexemes, 50 lessons | Classical Chinese, read and written only (`facets: [recognize, produce]`, no audio, ADR 0071); every unit ends in an authentic passage (Analects, Laozi, Zhuangzi, Mencius, Han Feizi, Tang poems); readings pinned by lexeme in three layers shown on request: Pinyin, Jyutping, Baxter's Middle Chinese |
| [`es`](es/) | es-Latn/standard | 1062 sentences, 721 lexemes, 169 lessons (thirty units, A1–B2) | Cuban Spanish for heritage speakers (ADR 0076): Cuban answers canonical, pan-Hispanic accepted; verb tenses as feature values (`feature:Tense=Past`); accent marks that make another word graded wrong; typed adaptive placement (ADR 0077); a Cuban voice cloned from a CC0 recording |
| [`hbo`](hbo/) | hbo-Hebr (Tiberian pointing) | 696 sentences, 320 lexemes, 90 lessons (20 units) | Biblical Hebrew, not Modern (ADR 0082; checked against Khan, Joüon–Muraoka and Holladay, ADR 0084): text pointed as the Masoretic text is, points shown by default and hidden on request; every unit reads a passage of the Hebrew Bible (WLC); every word pins its Tiberian reading, and the audio says it as Tiberian vowels with Arabic-bent consonants through Piper's Arabic voice (ADR 0089), never Modern Hebrew, once a card is answered (no listening exercises: its facets leave out listen); verb forms as feature values; Eve, Rebekah and the women of the stories speaking and spoken to |
| [`tok`](tok/) | tok-Latn (sitelen Lasina), tok-Qaap (sitelen pona) | 375 sentences, 126 lexemes, 52 lessons | Toki Pona in two scripts, every sentence pinned in both ([ADR 0086](../docs/adr/0086-toki-pona-and-sitelen-pona.md)): sitelen pona as UCSUR logographs under a private-use script subtag, words run together, names in cartouches, each logograph's word as ruby on request; Latin typed into sitelen pona graded as logographs; the 120 words of pu (but unpa) and kin; no person, gender or number marked, so English accept sets give I/we, she/he/they/it and the tenses; voices saying the Latin as eSpeak NG phonemes |
| [`grc`](grc/) | grc-Grek (polytonic) | 376 sentences, 170 lexemes, 48 lessons | Attic Greek ([ADR 0087](../docs/adr/0087-attic-greek.md)): polytonic text, missing accents and breathings noted unless they make another word; every unit reads a public-domain Attic passage (Plato, Xenophon, Lysias, Aristophanes); an alphabet track beside the units (ADR 0088: letters, diphthongs, breathings, each drilling course words); every word pins its vowel lengths, and the audio says reconstructed Attic (CGCG) as IPA through a Piper voice, never Modern Greek text; no listening exercises |
| [`chg`](chg/) | chg-Arab (Nastaliq) | 679 sentences, 455 lexemes, 90 lessons (19 units) | Chaghatay, the literary Turki of Central Asia ([ADR 0128](../docs/adr/0128-chaghatay.md), [0129](../docs/adr/0129-chaghatay-arabic-with-word-ruby.md)), read and written only (no audio): the Arabic script, with Schluessel's transliteration of every word as ruby on request; an Arabic alphabet track beside the units, its Latin spellings the course's own transliteration; suffixes as lexemes in a token's `lexemes` (case, person, tense); every unit reads a public-domain passage (Babur, the Tadhkira of Jalāl ud-Dīn Katakī, Abu 'l-Ghazi, Navai, Qasim Beg, the Stories of the Prophets, a blacksmiths' manual) in its source's spellings; sän, siz and sizlär tagged and accepted as they fit |
| [`sk`](sk/) | sk-Latn/standard | 555 sentences, 459 lexemes, 89 lessons (20 units) | Standard Slovak for English speakers ([ADR 0155](../docs/adr/0155-slovak.md); forms from Mistrík, the order from Krížom-krážom and Naughton): six cases brought in one at a time, animacy, aspect partners as two lexemes, the past that agrees with who speaks, clitics second, the conditional and the passive participle as feature values; acutes and carons required, and the right sound with the wrong letter (i/y, soft d t n l, ä, voicing) an orthographic miss; unit 17 reads Dobšinský's *Ako šlo vajce na vandrovku* (1881); a woman and a man speaking, and *vy* to one person politely |
| [`bar`](bar/) | bar-Latn/moser | 374 sentences, 269 lexemes (10 units) | South Tyrolean, the dialect South Tyroleans speak every day ([ADR 0156](../docs/adr/0156-south-tyrolean.md); spelling and words from Moser's *Wörterbuch der Südtiroler Mundarten*, 2015): a language with no norm, one spelling written and the everyday variants (-n/-en, ia/ie, ß/ss, -sch/-scht, å for o) accepted as free spellings; the central forms canonical; the 2nd person's -sch and the plural's es/enk with -ts; the perfect as the past and wor; tat + infinitive (`rule:tian-would`); fused forms (geat's, gip's, afn, mitn) as tokens writing two lexemes; voices cloned from two speakers of the VinKo Corpus (Bozen, Meran), iffy |

Every unit ends in a story, and each course has six roleplay scenarios (lzh has seven; es one about every three units; hbo nine; tok ten; grc six; chg nineteen; sk ten; bar nine).

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
- the lzh readings (Pinyin, literary Jyutping, Baxter's Middle Chinese), chosen by lexeme;
- the tok sentences in both scripts, and the cartouche spellings of the names;
- the chg sentences and their transliteration, and the passages against their manuscripts.

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
