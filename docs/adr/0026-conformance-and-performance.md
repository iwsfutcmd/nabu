# 0026. Conformance harnesses and the performance budget

- Status: Proposed
- Date: 2026-11-03

## Decision

- **One implementation, two harnesses.** Vectors are `{id, op, args, expected | error}` in
  `conformance/*.json`. The TypeScript harness calls core-cli's protocol in-process. The Python
  harness drives a long-lived `core-cli` subprocess over JSON lines, exactly as the compiler will.
  The Python run also proves Unicode survives the Python↔Node boundary. Expected values pin only the
  keys they list. Both harnesses assert that there are at least 300 vectors.
- **Properties.** fast-check over every compiled profile (core-cli) and Hypothesis through the
  subprocess (pipeline):
  - normalization is idempotent;
  - NFC and NFD answers grade the same;
  - every alternative, including from random generated notation, is accepted, and the canonical
    one is CORRECT;
  - the alignment conserves the answer's units;
  - grading is deterministic.
- **Performance budget (§16 Phase 1).**
  - Chromium runs the esbuild-bundled core with CDP CPU throttling at 4×, Lighthouse's mid-tier
    mobile setting.
  - Every sample is cold: the profile and accept set are freshly compiled, untimed, so no cache is
    warm.
  - p95 of `grade()` must stay under 5 ms. CI runs it in the pinned Playwright container
    (`pnpm test:perf`). Phase 1 measured p95 at 1.2–1.7 ms.
