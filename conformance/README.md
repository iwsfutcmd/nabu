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
| `normalize.json` | Every profile's normalization pipeline (sitelen pona: typed Latin words as logographs, cartouches read as names, joiners and long glyphs dropped, ADR 0086) |
| `segmentation.json` | Runtime units and orthographic letters |
| `accept.json` | Accept-set notation, expansion and errors |
| `grade.json` | Grading verdicts, notes, alignments, miss labels and correspondences across the profiles (ADR 0148's order of grading: the slip, the sound question by a profile's statement, whose form by lexeme, `lexemes` giving each word's form keys; order; a free correspondence or a sound read off pinned readings stated for the vector with `statement` and `readings`; each unit that raised a note carries it, so feedback can name the words: cómo and como; Slovak: every mark required, length and letter notes, a mark that makes another word, sound-alike spellings orthographic, the apostrophe never a caron, ending contrasts, ADR 0155; Biblical Hebrew: points, accents and maqaf ignored, pronoun and suffix contrasts, and the sets limited by form: person prefixes, verb endings, agreement, ADR 0084; Toki Pona: Latin typed into sitelen pona, names against their cartouches, ADR 0086) |
| `tagged-text.json` | TaggedText invariants |
| `form-key.json` | A form's key (ADR 0146): a token's lexemes, each with the feature values chosen there, as one string, and back (the pipeline's `nabu.formkey` passes these too, `tests/test_formkey.py`) |
| `gloss.json` | Tap-for-gloss: longest match, exact and folded passes side by side, token spans |
| `pronounce.json` | A word's pronunciation as the script leaves it out: vowel marks on abjad words, typed Jyutping (ADR 0054); a typed reading's syllables and a syllable's tone as a reading scheme's data shapes them (ADR 0109: the pipeline's `nabu.schemes` passes these too, `tests/test_schemes.py`) |
| `projection.json` | Projections (ADR 0148): what a spelling says by the profile's stated correspondences (es: seseo, yeísmo, b/v, silent h, contexts, longest match, stress by mark and by rule; fa: ADR 0142's sets, marks left aside; sk: i/y, the soft d t n l, ä, voicing, -ov/-ou, rare spellings never offered), two spellings compared by sound, a word's other spellings of its sound; a scheme's relation to the spelling it annotates (Schluessel and chg-Arab, by dynamic programming), the pieces a script leaves open and minimal ruby (Schluessel, Pinyin, Baxter) |
| `spell.json` | A lexical form spelled by an orthography's `spell` statement (docs/rules-design.md, stage 1): apc's Arabic, its vocalization layer and Arabizi with its free alternatives, each by the variations it took, one vector or more per rule from the course's words (a few constructed where the course has none); with `expected`, whether the course's spelling is the spelling or an alternative; the pattern language on a statement of the vector's own; errors |

Harnesses:
- TypeScript: `packages/core-cli/test/conformance.test.ts` (in-process)
- Python: `pipeline/tests/test_conformance.py` (through the core-cli subprocess)

`pnpm conformance` runs both.
