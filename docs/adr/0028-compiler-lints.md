# 0028. Compiler lints and diagnostics

- Status: Proposed
- Date: 2026-11-03

## Context

§7.5 lists checks per compiler stage and requires each lint to have a fixture that makes it fire.
Phase 2 acceptance adds that i+1 violations are reported with file and line.

## Decision

**Diagnostics**

- Format: `<file>:<line>: <severity> <lint-id>: <message>`. The path is relative to the courses
  directory, and the line is the YAML node's line.
- The loader composes the YAML node tree and keeps a line for every path. A schema error is
  reported at the deepest path Pydantic resolves. For unions, only the most specific branch's
  errors are kept.

**Severities**

- `error`: no bundle is written.
- `warning`: printed; `--strict` fails on it.
- `info`: printed, never fails.

**Catalogue**

- There are 36 lints in nine families: `parse.*`, `text.*`, `enrich.*`, `drills.*`,
  `curriculum.*`, `grading.*`, `glossary.*`, `script.*` and `package.*`.
- The registry is [`pipeline/src/nabu/compiler/diagnostics.py`](../../pipeline/src/nabu/compiler/diagnostics.py),
  and `uv run nabu lints` prints it.
- Mapping to §7.5:
  - The UTS #39 confusables audit is `text.mixed-script` (a word mixing scripts) plus
    `text.non-canonical` (content using a character its own profile folds away: Arabic ي in
    Persian, ASCII `'` for ʻ).
  - Beyond §7.5:
    - `enrich.transliteration-mismatch` (info)
    - `drills.rbnf-unavailable`
    - `curriculum.unused-kc`
    - `glossary.shadowed`
    - `glossary.tile-split`
    - `script.missing-form`
    - `package.unreviewed-published`

**Runtime semantics, not substring checks**

- Normalization, accept-set expansion, grading of the canonical answer and glossary units all go
  through `core-cli`, the same engine the client runs (§7.5 stage 7).

**Fixtures**

- `pipeline/tests/fixtures/clean.yaml` compiles with no diagnostics at all.
- `make_lint_fixtures.py` writes `lints/<lint-id>.yaml` as one mutation of it per lint, or of a
  small yue base for reading lints.
- `tests/test_lints.py` asserts:
  - every lint has a fixture;
  - each fixture fires its lint with that file and a line > 1;
  - errors stop the build;
  - the i+1 diagnostic points at the exact `- id: s.4` line.
- Fixtures that need PyCantonese or PyICU skip locally when the tool is missing. With
  `NABU_REQUIRE_TOOLS=1`, which CI sets, they fail instead.

## Consequences

- A new lint needs a registry entry and a fixture, or `test_every_lint_has_a_fixture` fails.
- Severity is per lint, not per course.
- Analyzer disagreements (`enrich.reading-mismatch`) stay visible as warnings. The yue fixture
  expects exactly its two known ones (`tests/test_courses.py`).
