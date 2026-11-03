# 0032. Exemplar gaps and the Simplified-only table

- Status: Proposed
- Date: 2026-11-03

## Context

Writing the yue fixture course hit two data problems.

1. **CLDR 49's `yue_Hant` main exemplars are essentially the `zh_Hant` set.** They lack everyday
   Cantonese characters: 佢 哋 嘅 咗 嘢 冇 咩 啲 嚟 喺 噉 乜 嗰 啱 搵 睇 … The §7.5 script audit
   (main ∪ auxiliary ∪ punctuation ∪ numbers) would therefore reject almost any colloquial
   Cantonese sentence.
2. **`hans-only` (Phase 1, from OpenCC STCharacters) marked HK characters as Simplified.**
   - OpenCC's "Traditional" is the orthodox Kangxi standard. To it, HK and TW standard forms
     (群 床 峰 秘) and characters HK Cantonese writes as they are (晒 saai3, "all") look
     Simplified-only.
   - `唔該晒！` graded WRONG against its own reverse set (`grading.canonical-missing`).

## Decision

1. **`OrthographyProfile.exemplarsExtra`**: characters the orthography uses that its CLDR exemplars
   lack.
   - The script audit treats them as main exemplars.
   - `yue-Hant-HK/standard` lists 30 everyday Cantonese characters, marked REVIEW.
   - Each one is a gap to report to CLDR, not a licence to widen the audit.
2. **`hans-only` subtracts** every character in OpenCC HKVariants/TWVariants, and every CLDR
   `yue_Hant` main and auxiliary exemplar. This removed 41 characters, among them 晒 群 床 峰 秘 痴
   静 奥 温 税 脱 悦.

## Consequences

- Cantonese courses can use colloquial characters without disabling the audit.
- A character outside both CLDR and `exemplarsExtra` is still an error.
- Learners typing 晒 are no longer told to use Traditional.
- Other orthodox-vs-standard pairs that CLDR also lacks could still be misflagged. Conformance
  vectors are the place to pin them as they are found.
