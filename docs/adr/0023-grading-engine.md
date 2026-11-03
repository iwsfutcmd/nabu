# 0023. The deterministic grading engine

- Status: Proposed
- Date: 2026-11-03

## Context

Gameplan §7.4 and §8.3–8.6 describe the cascade but leave its mechanics open: units, costs,
how lenient comparisons combine, and which verdict wins when several apply.

## Decision

- **Units.** Tokens split at spaces when spaces survive the profile's normalization; grapheme
  clusters when the profile removes whitespace (yue). Typo distance runs over the profile's
  `letters` (longest match), falling back to clusters.
- **Lattice.** Notation is expanded in canonical order: first branches, optionals included.
  Each alternative is normalized and inserted into a prefix trie of units. The trie has one final
  node per distinct alternative, so duplicates after normalization are detected for free.
  Expansion is capped (10 000 paths is an error; over 1 000 per line, a warning). Profile ZWNJ
  equivalents become extra flagged paths. A ZWNJ spelling of the canonical answer counts as
  canonical, with the note.
- **Closest path.** Edit-distance DP over the trie in topological order: insert and delete cost 1,
  mismatch 1. Unit comparisons are tried in order and the first match wins:
  1. exact (0)
  2. locale case fold (0)
  3. profile equivalences, applied cumulatively (0.001 each)
  4. marks stripped in NFD (0.001)
  5. variant table (0.001)
  6. IME homophone, for grapheme units (0.5)
  7. weighted keyboard Damerau–Levenshtein, within `length × maxRatio` and at least `minLength`
     letters (0.3; adjacent keys and transpositions cost 0.5)

  Ties prefer the canonical answer, then the heavier one.
- **A fold counts only when it brings the two sides closer** (strictly smaller edit distance).
  A hamza seat both sides share earns no note.
- **Verdict precedence:** WRONG > SKIPPED > PARTIAL > WRONG_WORD > CORRECT_PROVISIONAL >
  CORRECT_WITH_TYPO > CORRECT_VARIANT > CORRECT_MARKS > CORRECT_ALT > CORRECT. Notes accumulate
  independently. Each one maps to `feedback.note.<id>`, and every verdict to `feedback.verdict.<v>`
  (tested).
- **Policies:**
  - `accept-with-note` keeps the answer correct and adds the note.
  - `partial-credit` gives PARTIAL.
  - `reject`/`reject-with-note` turn the fold into a mismatch; the latter's note explains a WRONG
    (Russian-keyboard letters in uz-Cyrl/tg).
  - A Simplified-only character in yue is a script mismatch, never an IME slip.
- **WRONG_WORD** needs a lexicon of folded word forms, passed in by the caller. Phase 2's compiler
  supplies it from the course.
- **Normalization always** applies NFC and strips bidi controls (ALM, LRM/RLM, embeddings,
  overrides, isolates) before the profile's steps, and NFC after. ZWNJ/ZWJ are left to the profile.
- **Caches** (unit comparisons per accept set; folds, letters and variant keys per profile) are
  pure and bounded. Cold, uncached grading is what the benchmark measures (ADR 0026).

## Consequences

The LLM judge (Phase 8) only ever sees what this engine calls WRONG. Changing a cost or the
precedence changes verdicts, so it needs new conformance vectors.
