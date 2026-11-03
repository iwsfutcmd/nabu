# 0016. OrthographyProfile v0 shape, profile files, corrections to §6.3

- Status: Proposed
- Date: 2026-11-03

## Context

The v0 schema had to accept the three §6.3 examples verbatim. Some needs were not in them, and
two of them contain bugs.

## Decision

- **Closed vocabularies.** Normalization steps, policies and annotation kinds are enums, and each
  step is a single-key mapping so order is explicit. NFKC is not a step, and runtime segmentation
  can only be `grapheme`. A new value needs an engine implementation and conformance vectors first.
- **`layout.verticalPolicy: toggle | always`.** §11.4 says traditional Mongolian is always
  vertical, but the profile shape had no way to say so.
- **`exemplars` accepts `cldr:yue_Hant` and `cldr:yue-Hant`.** The doc uses CLDR underscores,
  while cldr-json and BCP 47 use hyphens. Prefer hyphens in new profiles.
- **File naming:** `profiles/<lang>.<slug>.yaml` holds the profile with id `<lang>/<slug>`.
- **uz-Latn fixes (applied):**
  - The apostrophe map now covers capital `O`/`G`. As written in §6.3, `O'zbekiston` fell through
    to the second map and became `O` + U+02BC (tutuq belgisi) instead of U+02BB.
  - `letters` gains U+02BC. CLDR 49's `uz` main exemplars list it.
- **Open for Ben:**
  - `letters` lists `ng` as one letter, but CLDR 49's `uz` exemplars do not (they list `sh`, `ch`,
    `oʻ`, `gʻ`). Keep it as the profile's letter, or follow CLDR?
  - CLDR spells oʻ/gʻ with U+02BB, which matches the profile; that answers the doc's "check how CLDR spells" note.
- **apc-Arab** is a layout-and-fonts-only draft. CLDR 49 has no `apc` locale, so there is no
  `cldr:apc` exemplar set; the §7.5 script audit needs a hand-made set for `apc`. CLDR's likely
  subtags give `apc → apc-Arab-SY`, so Lebanese content should say `apc-Arab-LB` / `apc-Latn-LB`.

## Consequences

The profiles in `profiles/` are validated by both the TS (Ajv) and Python (Pydantic + jsonschema)
suites. Phase 1 completes them and implements the engine that executes them.
