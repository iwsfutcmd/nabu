# 0033. Fixture courses: scope and modelling conventions

- Status: Proposed
- Date: 2026-11-03

## Context

§16 Phase 2 asks for one unit each in fa, yue-Hant-HK, uz (Latin plus Cyrillic, with a
script-convert demo) and apc (Arabic script or Arabizi, with a script-convert track): about 20
sentences and 30 KCs, kept green from then on (CLAUDE.md).

## Decision

**The courses** (`courses/<id>/`, one unit `intro` each, CEFR A1)

| Course | Target | Orthographies | Sentences | KCs | Shows |
|---|---|---|---|---|---|
| `fa` | `fa-Arab-IR` | fa-Arab | 29 + 10 drill | 25 + 1 | Ezafe (unwritten, then ی after -hā), copula endings as morphs, -hā with ZWNJ, RBNF numbers |
| `yue` | `yue-Hant-HK` | yue-Hant-HK | 27 + 10 drill | 23 + 1 | Pinned Jyutping as ruby, sentence-final particles, A-not-A, -哋 plurals, colloquial characters |
| `uz` | `uz-Latn-UZ` | uz-Latn, uz-Cyrl | 26 | 26 | Every sentence pinned in both scripts, predicate/possessive/genitive suffixes, a Latin→Cyrillic script node |
| `apc` | `apc-Arab-LB` | apc-Arab, apc-Latn (Arabizi) | 24 | 24 | Learner-selectable script, Arabizi spelling variants in accept sets, an Arabic→Arabizi script node (7 3 2) |

**Conventions**

- **i+1 with k = 1.**
  - Each sentence brings in at most one new countable KC.
  - A stem is met bare before its suffixes (*Aziz* before *Azizman*).
  - Where a stem never occurs bare, as in Levantine بدّي "I want" and اسمي "my name", the form is
    a chunk sense. Splitting it would need two new KCs at once.
  - The suffix paradigm is a later unit's KC.
- **About 30 KCs at k = 1.** A unit of about 20 sentences can bring in only about 20 countable KCs.
  The rest are `grapheme:` KCs taught by script nodes (uz ҳ ў қ; apc 7 3 2; fa ZWNJ) and the
  generated `construction:numbers` (errata 23).
- **Pro-drop and optional words** go in the reverse set (`[من] مریم هستم`), never in the
  displayed text.
- **Gender.**
  - apc second-person forms are the masculine ones (كيفك kifak). KC notes give the feminine.
  - Translations of 佢 accept she, he and they.
- **Accept sets.** They hold real variant spellings (خداحافظ / خدا حافظ, mar7aba / marhaba,
  我哋 / 我地) but no alternatives that only differ after normalization (`grading.duplicate`).
- **Provenance.** All taught sentences are `llm:claude@<prompt-hash>`, `status: draft`,
  CC-BY-SA-4.0, until a native speaker reviews them. Drill sentences are
  `generated:cldr-rbnf@icu<version>`, Unicode-3.0.

**Known diagnostics**

- yue warns six times that PyCantonese reads sentence-final 呀 as aa4 and 嗎 as maa5. The pinned
  aa3 and maa3 win (§7.5).
- uz gets info notes where ICU's transform differs from the pinned Cyrillic (errata 19).

## Consequences

- `pnpm courses` and the CI step build all four.
- Tests (`tests/test_courses.py`) assert:
  - no errors;
  - no warnings beyond the known ones;
  - at least 20 sentences and KCs per course;
  - both orthographies on every uz and apc sentence;
  - the ZWNJ in the Persian plural;
  - ruby on every yue word;
  - draft status.
- The tg↔fa script-convert stretch goal is not done.
