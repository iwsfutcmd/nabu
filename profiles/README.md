# profiles/

Orthography profiles (gameplan §6.3), one YAML file per orthography, validated against
`schemas/orthography-profile.schema.json` by both the TypeScript and Python test suites.

Phase 1: nine profiles, all executed by the engine in `@nabu/core` and pinned by
`conformance/`.
- `fa-Arab`, `yue-Hant-HK` and `uz-Latn` follow §6.3.
- The others (`uz-Cyrl`, `ar-Arab`, `apc-Arab`, `apc-Latn` Arabizi, `tg-Cyrl`, `tr-Latn`) are new.
- Policies marked **REVIEW** are proposals awaiting linguistic sign-off.

Also here:
- `tables/`: generated data tables (`pnpm tables`).
- `keyboards/`: interim layouts for the keyboard typo model (ADR 0025).

A profile with id `<lang>/<slug>` lives in `<lang>.<slug>.yaml`.
