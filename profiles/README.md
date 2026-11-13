# profiles/

Orthography profiles (gameplan §6.3), one YAML file per orthography, validated against
`schemas/orthography-profile.schema.json` by both the TypeScript and Python test suites.

Phase 1: nine profiles, all executed by the engine in `@nabu/core` and pinned by
`conformance/`.
- `fa-Arab`, `yue-Hant-HK` and `uz-Latn` follow §6.3.
- The others (`uz-Cyrl`, `ar-Arab`, `apc-Arab`, `apc-Latn` Arabizi, `tg-Cyrl`, `tr-Latn`) are new.
- Policies marked **REVIEW** are proposals awaiting linguistic sign-off.
- Later: `es-Latn`, `hbo-Hebr` (Tiberian pointing), `lzh-Hant`, and Toki Pona's `tok-Latn` and `tok-Qaap`
  (sitelen pona in the UCSUR's private use block, a private-use script subtag until ISO 15924 assigns one; ADR 0086).

Also here:
- `tables/`: generated data tables (`pnpm tables`).
- `keyboards/`: interim layouts for the keyboard typo model (ADR 0025).
- `schemes/`: reading schemes (ADR 0109), one YAML file per scheme (`<id>.yaml`, validated against
  `schemas/reading-scheme.schema.json`): what a profile's reading layer and a course voice's `reading`
  name. `pnpm codegen` copies them into `@nabu/schema/schemes` for core; the pipeline reads them
  (`nabu.schemes`).

A profile with id `<lang>/<slug>` lives in `<lang>.<slug>.yaml`.
