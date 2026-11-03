# Gameplan errata (found during Phase 0)

Corrections to [gameplan.md](gameplan.md) that Phase 0 turned up. Where a fix changed a decision, the
ADR is linked. The gameplan text itself is left as written.

1. **§6.3 uz-Latn: the apostrophe map only covers lowercase o/g.** `O'zbekiston` falls through to the
   second map and becomes `O` + U+02BC (tutuq belgisi) instead of U+02BB. Fixed in
   `profiles/uz-Latn.standard.yaml` ([ADR 0016](adr/0016-orthography-profile-v0.md)).
2. **§6.3 uz-Latn `letters`: U+02BC (ʼ) is missing, and `ng` is listed although CLDR 49's `uz`
   exemplars don't list it.** ʼ added; `ng` left for Ben to decide. CLDR spells oʻ/gʻ with U+02BB, as the
   profile does.
3. **§6.3 fa-Arab comment "U+FE70–U+FEFF".** U+FEFF is ZWNBSP/BOM, not an Arabic presentation form.
   Presentation Forms-B end at U+FEFC, and U+FDD0–U+FDEF in the other range are noncharacters.
4. **§6.2: `Intl.Locale#maximize()` as the first step** conflicts with the §17 risk about engine
   data drift. CLDR likely subtags generated at build time are the source of truth; the engine only
   cross-checks ([ADR 0017](adr/0017-cldr-data.md)). Node 22 has only the older `textInfo` getter, not
   `getTextInfo()`.
5. **§11.2 "…then CLDR likely subtags"** reads as a third source of preferences. Likely subtags are a
   matching aid inside negotiation (zh-TW → zh-Hant), not a source ([ADR 0018](adr/0018-ui-locales-and-pseudo-locales.md)).
6. **§6.8 "font stacks … as `:lang()` rules generated from the script metadata."** `:lang()` matches
   language ranges, not scripts, and `:lang("*-Arab")` is not reliable. `<T>` sets the stack from the
   profile or script instead ([ADR 0019](adr/0019-self-hosted-fonts.md)).
7. **§11.9 "`stylelint-use-logical` (strict)" is not enough on its own.** It misses per-side borders,
   `overflow-x/y`, `scroll-*` sides, three- and four-value shorthands and `rotate`, and it exempts
   `:dir()` selectors ([ADR 0021](adr/0021-lint-tooling.md)).
8. **§7.3: a token's `sense: sfp-aa3` refers to a construction KC** (`construction:sfp-aa3` in
   `introduces`), but `Token.sense` is a `SenseId`. Either tokens get a general KC link, or the sense id
   space includes constructions. *Phase 2:* source tokens link any KC through `form` or `morphs[].kc`;
   `sense` stays a lexeme, and particles are lexemes (`sense:呀`) ([ADR 0027](adr/0027-course-source-format.md)).
9. **`apc` in CLDR 49:** there is no locale data, so `cldr:apc` exemplars don't exist for the §7.5
   script audit, and likely subtags give `apc → apc-Arab-SY`. Lebanese content should be tagged
   `apc-Arab-LB` / `apc-Latn-LB` ([ADR 0016](adr/0016-orthography-profile-v0.md)).
10. **§5.1 has no home for lint tooling.** Added `packages/lint` ([ADR 0021](adr/0021-lint-tooling.md)).
11. **§5.2 / tooling:** the current TypeScript (7.0) cannot run the type-aware rules §11.9 requires, so
    TS is pinned to 6.0 ([ADR 0013](adr/0013-typescript-6.md)).

## Phase 1

12. **§6.3 uz-Latn has no `whitespace: collapse` step** (fa-Arab does). Added; without it, a dropped
    optional word leaves double spaces in normalized accept-set text.
13. **§6.3 profiles name tables implicitly** (`variants: { table: hk-tw-variants }`,
    `homophones: { model: jyutping-ime }`, `scriptMismatch: { detect: Hans }`). Homophones and script
    detection now name their data tables too ([ADR 0024](adr/0024-profile-data.md)).
14. **§6.3 "Courses for Arabic itself … give a note for each" fold** cannot be written with
    normalization steps, which fold silently. Profiles gained `match.equivalences` with per-fold
    policies ([ADR 0024](adr/0024-profile-data.md)).
15. **§6.7 "touch keyboards are compiled from CLDR Keyboard 3.0"**: not done yet. The typo model runs
    on interim hand-encoded layouts ([ADR 0025](adr/0025-interim-keyboards.md)).
16. **Unihan `kCantonese` is not a full Cantonese reading list** (行 is only hang4). The IME-homophone
    model also uses kSMSZD2003Readings, and still lacks colloquial readings ([ADR 0024](adr/0024-profile-data.md)).

## Phase 2

17. **§7.5 script audit vs CLDR 49 `yue_Hant`:** the exemplars are essentially `zh_Hant` and lack
    everyday Cantonese characters (佢 哋 嘅 咗 嘢 冇 咩 啲 嚟 喺 …), so the audit as written rejects
    colloquial Cantonese. Profiles gained `exemplarsExtra` ([ADR 0032](adr/0032-exemplar-gaps.md)).
18. **§7.6 RBNF drills for `uz` and `tg`:** ICU 74 has no spellout rules for either and silently falls
    back to English (`uz`) or digits (`uz-Cyrl`). The compiler detects the fallback and reports
    `drills.rbnf-unavailable` ([ADR 0030](adr/0030-analyzers-and-icu.md)).
19. **§6.3 uz-Latn `transliterate: … via: cldr-transform` "powers script-convert exercises":** ICU's
    `uz_Latn-uz_Cyrl` writes *Men* as Мэн (not Мен) and *Yoʻq* as Ёʻқ (not Йўқ). It can check pinned
    Cyrillic (`enrich.transliteration-mismatch`, info) but cannot generate it; every Cyrillic form is
    pinned ([ADR 0027](adr/0027-course-source-format.md)).
20. **Phase 1's `hans-only` table (OpenCC STCharacters)** treated OpenCC's orthodox Traditional as the
    only Traditional, flagging HK standard characters (群 床 峰, and 晒 saai3) as Simplified. It now
    subtracts HK/TW variants and CLDR `yue_Hant` exemplars ([ADR 0032](adr/0032-exemplar-gaps.md)).
21. **§7.5 "record the Unicode version":** there are two. CLDR 49 is Unicode 16.0, but Python 3.12's
    `unicodedata` (used for NFC checks in the compiler) is 15.1. The manifest records both
    ([ADR 0029](adr/0029-bundle-format.md)).
22. **§7.5 "readings pinned in the source always win; the compiler warns":** PyCantonese reads the
    sentence-final particles 呀 and 嗎 as aa4 and maa5. The yue fixture pins aa3 and maa3 and carries
    six expected warnings; there is no way yet to mark a disagreement as reviewed.
23. **§16 Phase 2 "about 20 sentences and 30 knowledge components" vs i+1 with *k* = 1:** if every
    KC counted, 30 KCs would need at least 30 sentences. Only sense, form and construction KCs count;
    grapheme KCs are taught by script nodes ([ADR 0033](adr/0033-fixture-courses.md)).
