# @nabu/lint

ESLint plugin and stylelint config for the rules in gameplan §11.9. They are wired up in the repo's
`eslint.config.js` and `stylelint.config.js`. Every rule has a fixture in `fixtures/` that is linted
with those real configs (`test/`), so a rule that stops firing fails CI.

Design notes: [docs/adr/0021-lint-tooling.md](../../docs/adr/0021-lint-tooling.md).

## nabu/no-literal-ui-strings

UI code only. Text users see or hear goes through MF2 messages (`packages/i18n/messages`), never literals.
It flags strings that contain a letter in:
- JSX text and JSX child expressions (through `?:`, `&&`, `||`)
- user-facing attributes (`aria-label`, `title`, `placeholder`, `alt`, `label`, `valueLabel`…)
- DOM text properties (`textContent`, `title`…) and `setAttribute` on those attributes
- `alert`/`confirm`/`prompt`

## nabu/no-manual-tagged-text

UI code only, type-aware. Language data reaches the DOM only through `<T>`. It reports reading
`TaggedText.tokens`, or a token's `surface`/`ruby`/`readings`/`variants`/`ipa`/`morphs`, outside
`packages/ui/src/T.tsx`. Use `<T>`, or `tileGroups()` from `@nabu/core/text`.

## nabu/no-code-unit-text-ops

Type-aware, everywhere. On language data (values from TaggedText, Token, RubySegment or Morph,
including `const` aliases and `surfaceOf()`), it reports:
- `.length` and `s[i]`
- `.charAt`, `.charCodeAt`, `.codePointAt` and `.at`
- `.slice`, `.substring` and `.substr`
- `.split("")`, `[...s]` and `Array.from(s)`

Use `graphemes()`/`graphemeCount()` from `@nabu/core/text`.

## nabu/locale-case

`toLowerCase()`/`toUpperCase()` take no locale, so they are always reported.
`toLocaleLowerCase()`/`toLocaleUpperCase()` must be given one. For ASCII identifiers such as BCP 47
subtags, use `asciiLowercase()` from `@nabu/i18n`.

## Stylelint: strict logical properties

`stylelint-use-logical` (`always`), plus built-in rules for the physical properties it does not map:
- per-side borders, `overflow-x`/`-y`, `scroll-*` sides
- three- and four-value shorthands
- `left`/`right` in positions
- `rotate`
- `[dir=…]` selectors

Introducing any of them fails `pnpm lint`.

## The license check (`pnpm license-check`)

What ships (the web app, the API, the mobile shell) carries no copyleft code (gameplan §17). The
check reads `pnpm licenses list --prod --json` for those three and fails on any package whose SPDX
expression cannot be satisfied with the permissive licenses in `src/licenses.ts` (one side of an
OR, both sides of an AND). Unknown and missing licenses fail too, so a new license is a decision:
add it to `ALLOWED`, with why, or drop the dependency. `test/licenses.test.ts` is the fixture that
proves it fires.
