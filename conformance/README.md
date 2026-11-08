# conformance/

Shared JSON test vectors (gameplan §15). The same files run in the TypeScript (Vitest) and Python
(pytest via `core-cli`) harnesses, so the two halves cannot drift.

Format: `{ "vectors": [{ "id", "op", "args", "expected" | "error", "note"? }] }`. `op` is a
core-cli operation. `expected` pins only the keys it lists, and `error` expects a failure containing
it.

| File | What |
|---|---|
| `graphemes.json` | Extended grapheme clusters for the §15 torture strings |
| `unicode-set.json` | CLDR exemplar UnicodeSet syntax |
| `direction.json` | Script and direction from a language tag (also cross-checked against the engine's Intl) |
| `case-fold.json` | Locale-aware case folding: Turkish/Azerbaijani i, Greek final sigma, ẞ, Lithuanian |
| `normalize.json` | Every profile's normalization pipeline |
| `segmentation.json` | Runtime units and orthographic letters |
| `accept.json` | Accept-set notation, expansion and errors |
| `grade.json` | Grading verdicts, notes and alignments across the profiles (Biblical Hebrew: points, accents and maqaf ignored, pronoun and suffix contrasts, and the sets limited by form: person prefixes, verb endings, agreement, ADR 0084) |
| `tagged-text.json` | TaggedText invariants |
| `gloss.json` | Tap-for-gloss: longest match, exact and folded passes side by side, token spans |
| `pronounce.json` | A word's pronunciation as the script leaves it out: vowel marks on abjad words, typed Jyutping (ADR 0054) |

Harnesses:
- TypeScript: `packages/core-cli/test/conformance.test.ts` (in-process)
- Python: `pipeline/tests/test_conformance.py` (through the core-cli subprocess)

`pnpm conformance` runs both.
