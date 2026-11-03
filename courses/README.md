# Fixture courses

One unit each, built by `pnpm courses` and kept green by CI (CLAUDE.md). The format is in
[ADR 0027](../docs/adr/0027-course-source-format.md); the choices behind these four are in
[ADR 0033](../docs/adr/0033-fixture-courses.md). Real courses can live in separate repositories.

| Course | Orthographies | What it exercises |
|---|---|---|
| [`fa`](fa/) | fa-Arab | RTL; the plural -hā joined with a ZWNJ (written `‌` in YAML); ezafe; copula endings as morphs; an RBNF numbers drill |
| [`yue`](yue/) | yue-Hant-HK | Pinned Jyutping shown as ruby; sentence-final particles; A-not-A questions; colloquial characters missing from CLDR (`exemplarsExtra`); an RBNF numbers drill |
| [`uz`](uz/) | uz-Latn, uz-Cyrl | Every sentence pinned in both scripts; ʻ (U+02BB) in oʻ; predicate and possessive suffixes as morphs; a Latin→Cyrillic script-convert node |
| [`apc`](apc/) | apc-Arab, apc-Latn (Arabizi) | Learner-selectable script; Arabizi spelling variants in accept sets; an Arabic→Arabizi script-convert node teaching 7, 3 and 2 |

## Review status

Every taught sentence was drafted by an LLM. Its provenance is `llm:claude@<prompt-hash>` with
`status: draft`, and it is licensed CC-BY-SA-4.0. Generated drill sentences are
`generated:cldr-rbnf@icu<version>` (Unicode-3.0).

Before any of this is published, a native speaker should check:

- the sentences;
- the translations and accept sets;
- the glosses;
- the yue readings.

Promote reviewed items with `status: reviewed` (or `published`, which requires `reviewedBy` and
`reviewedAt`).

## Building

```sh
pnpm courses                                        # all courses, lint only
cd pipeline && uv run nabu build ../courses/fa      # one course → dist/fa/
```

Expected diagnostics:

- yue warns that PyCantonese reads the particles 呀 and 嗎 as aa4 and maa5. The pinned aa3 and maa3
  win.
- uz gets info notes where ICU's Latin→Cyrillic transform disagrees with the pinned Cyrillic
  (Мэн vs Мен).
