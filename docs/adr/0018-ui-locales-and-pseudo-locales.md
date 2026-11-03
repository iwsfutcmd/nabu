# 0018. Catalog format, negotiation and pseudo-locales

- Status: Proposed
- Date: 2026-11-03

## Decision

- **Catalog format:** `packages/i18n/messages/<locale>.json` =
  `{ locale, messages: { "<dotted.key>": { message: "<MF2 source>", description } } }`, validated by
  `schemas/message-catalog.schema.json`. The source catalog (`en`) must give every message a
  translator note. `MessageId` is typed from `en.json`, so a misspelled key fails typecheck.
- **Formatting:** messageformat 4.1 (LDML 48.2) with `bidiIsolation: "default"`, and `dir` set from
  the UI locale's script. Placeholders come out FSI/RLI…PDI-isolated; catalogs never contain bidi
  controls (tested).
- **Negotiation:** the user's setting, then Accept-Language / `navigator.languages`, then the default.
  Each request walks its CLDR parent chain (en-IN → en-001 → en). Candidates are compared after
  likely-subtag expansion, so zh-TW → zh-Hant and never zh-Hans. `-u-` extensions such as `nu-arabext`
  carry into the *formatting* locale only. §11.2's "then CLDR likely subtags" is read as this
  matching step: likely subtags are not a source of preferences.
- **Pseudo-locales are derived, not stored.** en-XA and ar-XB are built at load time from `en`
  by transforming only the literal text nodes of the MF2 data model. Placeholders, markup and
  plural keys are untouched.
  - en-XA: accented look-alikes, `[…]` brackets, about 40% padding.
  - ar-XB: every word wrapped as RLM RLO … PDF RLM, as Android does.
  - They are selected only on exact request and never as a fallback for a real locale.
- **Formatting locale of ar-XB is `ar-XB`.** Both Node and Chromium then format digits as Latin
  (`5`, not `٥`), so ar-XB does **not** exercise Arabic-Indic digits. A real `ar`/`fa` UI locale will;
  the matrix must add one when it ships.
- **Course and language names are messages** (`course.name.apc = "Lebanese Arabic"`), not
  `Intl.DisplayNames`. Its output varies by engine, and it cannot say "Lebanese".
