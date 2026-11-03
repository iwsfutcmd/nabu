# 0021. `packages/lint`: rule semantics and strict logical CSS

- Status: Proposed
- Date: 2026-11-03

## Context

§5.1 has no home for lint tooling. §11.9 names the rules but not their exact scope.

## Decision

- **`packages/lint` (`@nabu/lint`)** holds the ESLint plugin and the stylelint config, plus fixtures
  and tests. The fixtures are linted with the repo's *real* configs, so dropping a rule from
  `eslint.config.js` or `stylelint.config.js` fails a test.
- **Stylelint "strict"** means `stylelint-use-logical` (`always`) plus built-in rules for what it misses:
  - `border-left` and the other per-side border properties
  - `overflow-x`/`-y`, `scroll-margin-*`/`scroll-padding-*`, `overscroll-behavior-x`/`-y`
  - three- and four-value `margin`/`padding`/`inset`/`border-*` shorthands
  - `background-position`/`object-position`/`transform-origin` with left/right
  - `transform: rotate` and the `rotate` property (vertical text uses writing-mode, never rotation)
  - `[dir=…]` selectors

  The plugin itself exempts selectors containing `:dir()`. We allow `:dir()` only for mirroring icons.
- **`nabu/no-literal-ui-strings`** (UI code): flags strings containing a letter (`\p{L}`) where a user
  sees or hears them:
  - JSX text and JSX child expressions, through `?:` and `&&`
  - user-facing attributes (`aria-label`, `title`, `placeholder`, `alt`, `label`…)
  - DOM text properties, `setAttribute` on those attributes, and `alert`/`confirm`/`prompt`

  Symbol-only strings (`·`, `→`) pass.
- **`nabu/no-manual-tagged-text`** (UI code, type-aware): reading `TaggedText.tokens` or a token's
  text fields (`surface`, `ruby`, `readings`…) is an error. `packages/ui/src/T.tsx` is the one exemption.
  Tile splitting lives in `@nabu/core/text` (`tileGroups`).
- **`nabu/no-code-unit-text-ops`** (everywhere, type-aware): "language data" means a value from
  TaggedText/Token/RubySegment/Morph, directly or via a `const` alias, destructuring,
  string-returning methods, or `surfaceOf()`. On language data it flags:
  - `.length`, `s[i]`
  - `.charAt`/`.charCodeAt`/`.codePointAt`/`.at`, `.slice`/`.substring`/`.substr`
  - `.split("")`, `[...s]`, `Array.from(s)`

  Ordinary strings are untouched.
- **`nabu/locale-case`** (everywhere): `toLowerCase()`/`toUpperCase()` are always errors, because
  they take no locale. `toLocale*Case()` needs one. ASCII identifiers use `asciiLowercase()` from
  `@nabu/i18n`, which is also what RFC 5646 specifies for subtags.
- **`packages/core` purity** (CLAUDE.md) is enforced as well: no `Date.now()`, `new Date()`,
  `Math.random()`, `performance.now()`, `fetch` or storage globals.
