# profiles/

Orthography profiles (gameplan §6.3), one YAML file per orthography, validated against
`schemas/orthography-profile.schema.json` by both the TypeScript and Python test suites.

Phase 0 status: `fa-Arab`, `yue-Hant-HK` and `uz-Latn` are the §6.3 examples; `apc-Arab` is a
layout-and-fonts-only draft. Only `layout` and `fonts` are read by anything yet (the `<T>`
component and the visual matrix). The normalization engine that executes `normalize` and
`match` arrives in Phase 1.
