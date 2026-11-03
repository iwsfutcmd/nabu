# 0014. Workspace packages ship TypeScript source; Node runs it directly

- Status: Proposed
- Date: 2026-11-03

## Context

§5.1 lists the packages but not how they are consumed. A build step per package (tsc → dist)
adds watch processes, stale-output bugs and source-map indirection, and buys nothing while every
consumer (Vite, Vitest, Storybook, Playwright, Node ≥ 22.18 with type stripping) reads TypeScript.

## Decision

- `package.json#exports` points at `src/*.ts`. There is no per-package build.
- Relative imports carry explicit `.ts`/`.tsx` extensions (`allowImportingTsExtensions`), and
  JSON imports use `with { type: "json" }`, so Node can run scripts (`codegen`, `generate-cldr`,
  `core-cli`) without a loader.
- `erasableSyntaxOnly` is on: no enums, namespaces or parameter properties.
- The Python pipeline joins the pnpm workspace through a thin `pipeline/package.json`, so
  `pnpm lint|typecheck|test` also run ruff, pyright and pytest.
- Turbo runs in strict env mode; tasks that need environment variables declare them
  (`test:visual` passes `NABU_VISUAL_ENV`, `CI`, `PLAYWRIGHT_BROWSERS_PATH`).

## Consequences

- Publishing a package to npm later needs a build step for that package only.
- `core-cli` starts with plain `node src/main.ts`, which keeps the Phase 1 subprocess simple.
