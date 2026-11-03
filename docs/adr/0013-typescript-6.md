# 0013. Pin TypeScript to 6.0.x

- Status: Proposed
- Date: 2026-11-03

## Context

The latest TypeScript (7.0) is the native Go port. Its npm package exposes only `tsc` and an
`unstable/*` API; the classic compiler API (`ts.createProgram`, the type checker) is gone.
typescript-eslint 8.72 declares `typescript >=4.8.4 <6.1.0`, and the custom rules in gameplan
§11.9 that must be type-aware (language data vs. ordinary strings, TaggedText vs. any object)
are built on that API.

## Decision

Pin `typescript` to `~6.0.3` in every package. Revisit when typescript-eslint supports TS 7's API.

## Consequences

- We miss TS 7's speed-up for now. Typechecking the whole repo takes seconds, so this is cheap.
- TS 6 deprecations apply (`baseUrl`, `moduleResolution: node10`…); the base config avoids them.
