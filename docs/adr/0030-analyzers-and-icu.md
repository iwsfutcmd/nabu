# 0030. Analyzers, ICU and tool availability

- Status: Proposed
- Date: 2026-11-03

## Context

Stage 3 (enrichment) and stage 4 (drills) depend on third-party tools of uneven weight:

- PyCantonese and hazm are pure Python.
- PyICU needs system ICU headers and a C++ build.

The fixture courses need them, but a contributor fixing a TS bug should not have to build ICU.

## Decision

**Analyzers**

- The `Analyzer` protocol has `segment(text)` and `reading(scheme, text)`.
- Adapters are keyed by the profile's `segmentation.content`:
  - `pycantonese` 5.0: segmentation, and Jyutping from `characters_to_jyutping`;
  - `hazm` 0.12.1: word tokenization.
- Both are MIT and live in the uv group `analyzers`, which is a default group.
- Analyzer output only fills gaps. Authored tokens and pinned readings always win, and a
  disagreement is a warning.

**ICU**

- PyICU 2.17 (MIT) is in the opt-in group `icu`: `apt install libicu-dev pkg-config`, then
  `uv sync --all-groups`. Ubuntu 24.04 has ICU 74.2.
- RBNF:
  - ICU 74 has no spellout rules for `uz` or `tg`. It silently falls back to English (`uz`) or to
    digits (`uz-Cyrl`).
  - `spellout()` detects both cases and returns None, which `drills.rbnf-unavailable` reports.
- Transforms (`uz_Latn-uz_Cyrl`) only check pinned forms.
- PyICU ships no types, so it is imported through `importlib` as `Any`.

**Availability**

- Tests that need a missing tool skip locally.
- CI installs every group and sets `NABU_REQUIRE_TOOLS=1`, so a missing tool fails there.
- `regex` (Apache-2.0) supplies Script properties for the mixed-script audit.

**Tooling**

- Ruff's RUF001–003 (ambiguous Unicode) are off. Cyrillic а, Arabic ه, Uzbek ʻ and Turkish ı are
  this project's data. Content confusables are checked by the compiler's `text.mixed-script`.

## Consequences

- `uv sync` alone builds fa without its numbers drill (`drills.rbnf-unavailable` warning) and
  builds yue fully.
- Analyzer lexicons carry their own data licences. Before publishing readings an analyzer filled
  in (rather than pinned ones), check the licence of the analyzer's lexicon. The manifest records
  each analyzer's version for that audit.
