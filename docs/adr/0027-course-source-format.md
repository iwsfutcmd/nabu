# 0027. Course source format

- Status: Proposed
- Date: 2026-11-03

## Context

§7.1–7.3 sketch the content model (knowledge components, path nodes, sentences with tokens) but
leave several things open:

- how a sentence carries more than one orthography (uz Latin and Cyrillic, apc Arabic script and
  Arabizi);
- how tokens relate to the displayed text;
- what support-language translations look like;
- how a token links to a KC that is not a lexeme (errata 8).

## Decision

Schema: [`schemas/course-source.schema.json`](../../schemas/course-source.schema.json).

**Files**

- A course is `courses/<id>/course.yaml`. Its units are files listed by path (`units/intro.yaml`) or
  given inline.
- `orthographies` lists the orthographies taught; the first is the default and learners may switch.
- `support` lists support-language layers as orthography ids (`en-Latn/standard`).

**Forms per orthography**

- `sentence.forms` is keyed by orthography id. Each form has:
  - `text`: exactly what is displayed, in NFC;
  - optional `tokens`;
  - `reverse`: the accept set for L1→L2 production, in §7.4 notation.
- Every orthography's form is authored and pinned. A CLDR transform never generates one; it only
  checks one (`enrich.transliteration-mismatch`, info).

**Tokens are aligned to the text, not a replacement for it**

- Authors list word tokens only. The compiler finds them in order in `text`. Gaps become `space` or
  `punct` tokens, one per grapheme cluster.
- Tokens that do not spell the text out are `parse.token-mismatch`.
- With no tokens, the compiler falls back to the profile's analyzer for grapheme-unit scripts
  (PyCantonese), or else to word runs.
- Token fields:
  - `sense`: the lexeme;
  - `form`: any other `KcId`;
  - `morphs[].kc`: per-morph KCs (`کتاب‌` + `ها` → `form:plural-ha`);
  - `readings` per annotation scheme;
  - `variants`;
  - `tile`: an explicit word-bank group.

**Knowledge components of a sentence**

- They are `sense:<token.sense>`, each `token.form`, each `morphs[].kc` and
  `sentence.constructions`, deduplicated across all the sentence's orthographies.
- This answers errata 8: a token links a non-lexeme KC through `form` or `morphs`, and `sense`
  stays a `SenseId`. Sentence-final particles are lexemes (`sense:呀`).
- **i+1 counts only `sense`, `form` and `construction` KCs.** `grapheme`, `reading`, `phone` and
  `tone` KCs are taught by nodes (a script node introduces `grapheme:ў`), not discovered in
  sentences. Each sentence brings in at most `iPlusOne` new countable KCs (default 1). Sentences
  are ordered by their node's position on the path, then by source order.

**Glossary**

- `kc.forms[<orthography>]` lists the surfaces the runtime glossary should find, inflected forms
  included (`talabaman`, `کتاب‌ها`).
- In space-delimited scripts the runtime units are whole words, so a stem alone never matches an
  inflected word.

**Translations**

- `sentence.translations` is keyed by support language (`en`). The value is an accept set: the
  canonical line, as written, is what the learner sees; the rest is what L2→L1 answers may be.

**Script tracks**

- A `script` node has `convert: {from, to, sentences}`. It reuses existing sentences, so it adds
  no content to keep in sync.

**Licensing and provenance**

- Both are set per sentence, with course-level defaults.
- `provenance.author` is one of:
  - `human:<id>`;
  - `llm:<model>@<prompt-hash>`;
  - `generated:<generator>@<version>` (RBNF drills: `generated:cldr-rbnf@icu74.2`, licence
    `Unicode-3.0`).
- `status` is `draft`, `reviewed` or `published`. Publishing needs `reviewedBy` and `reviewedAt`.

## Consequences

- Each orthography is reviewed as text a person wrote. Transliteration errors (ICU gives Мэн for
  *Men*) cannot leak into content.
- Authoring cost grows with the orthographies. The apc and uz fixtures pin every sentence twice.
- `token.form` accepts any KC kind, so a construction can sit on the word that carries it.
