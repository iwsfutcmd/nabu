# 0031. LibreLingo importer

- Status: Proposed
- Date: 2026-11-03

## Context

§7.7 names LibreLingo's YAML courses as an import source. Its reference loader
(`librelingo-yaml-loader`) is AGPL-3.0, which cannot be a dependency of MIT/Apache code.

## Decision

- **Our own parser** of the documented layout:
  - `course.yaml` (Course, Modules);
  - `<module>/module.yaml` (Module, Skills);
  - `<module>/skills/<skill>.yaml` (Skill, New words, Phrases with alternative versions and
    translations).
- Mapping:
  - each skill becomes a lesson node;
  - each new word becomes a `sense:` KC;
  - each phrase becomes a sentence with word tokens, a reverse set from its alternatives, and a
    translation accept set.
- Characters that mean something in accept notation (`( ) [ ] | \ #`) are escaped.
- Output:
  - `status: draft`;
  - `author: human:librelingo-<language>`;
  - the licence from `course.yaml` (or `NOASSERTION`).
- Readings cannot be recovered. The compiler's `enrich.missing-reading` flags them.
- Command: `uv run nabu import-librelingo <dir> --out <course-dir> --course-id <id> --orthography <id>`.
- Tested on a synthetic CC0 course in `pipeline/tests/fixtures/librelingo/`.

## Consequences

- An imported course compiles straight away and then shows its gaps as lints (i+1, glossary,
  readings) rather than failing to import.
- Check each upstream course's content licence before importing. LibreLingo courses vary.
