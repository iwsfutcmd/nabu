# conformance/

Shared JSON test vectors (gameplan §15). The same files run in the TypeScript (Vitest) and Python
(pytest via `core-cli`) harnesses, so the two halves cannot drift.

| File | What | TS harness | Python harness |
|---|---|---|---|
| `direction.json` | Script and direction from a language tag | `packages/i18n/test/conformance.test.ts` | Phase 1 (`core-cli`) |

Phase 1 adds normalization, matching, typo-model, grapheme and lattice vectors plus the torture
strings listed in §15.
