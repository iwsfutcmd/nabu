# 0022. Generated CSS module declarations

- Status: Proposed
- Date: 2026-11-03

## Context

`vite/client` types a CSS module as an index signature. With `noUncheckedIndexedAccess` every class
becomes `string | undefined`, and a misspelled class name silently renders `undefined`.

## Decision

`packages/ui/scripts/css-module-types.ts` writes `Foo.module.d.css.ts` next to each
`Foo.module.css`, declaring exactly its classes (TypeScript's `allowArbitraryExtensions`
lookup). `pnpm codegen` writes them. `typecheck` and the CI codegen check fail if they are stale.

## Consequences

Class-name typos are type errors, and the compiler settings stay strict.
