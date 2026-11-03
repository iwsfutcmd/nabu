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
   space includes constructions. Undecided; Phase 2.
9. **`apc` in CLDR 49:** there is no locale data, so `cldr:apc` exemplars don't exist for the §7.5
   script audit, and likely subtags give `apc → apc-Arab-SY`. Lebanese content should be tagged
   `apc-Arab-LB` / `apc-Latn-LB` ([ADR 0016](adr/0016-orthography-profile-v0.md)).
10. **§5.1 has no home for lint tooling.** Added `packages/lint` ([ADR 0021](adr/0021-lint-tooling.md)).
11. **§5.2 / tooling:** the current TypeScript (7.0) cannot run the type-aware rules §11.9 requires, so
    TS is pinned to 6.0 ([ADR 0013](adr/0013-typescript-6.md)).
