# 0070. UI catalogs: provenance, fingerprints and the catalog check

- Status: Proposed
- Date: 2026-11-06
- Amends: [0018](0018-ui-locales-and-pseudo-locales.md)

## Context

Phase 12 brings the interface to the fixture courses' communities: Persian, Arabic, Traditional
Chinese (Hong Kong) and Uzbek in both scripts. The catalogs will be drafted by a model and shipped
only once a native reviewer signs them off, the same gate as course content (§7.1). Until now only
the English source catalog existed, and nothing checked a translation against it.

## Decision

**A translated catalog says who wrote it.** `provenance` (the course content's Provenance: an
`llm:` or `human:` author, a status, the reviewer) is required in every catalog but English.

**A catalog ships only when it is reviewed and complete.** `CATALOGS` in `src/catalog.ts` lists the
shipped locales by hand, and the check refuses a shipped catalog that is a draft or lacks a
message. A draft can sit in `messages/` and be checked without reaching anyone.

**Each translated message records the English it was made from:** `source`, a 14-digit fingerprint
of the English message's NFC text (`sourceHash`). `check-catalogs.ts --stamp <locale>` writes it.
- **A change of wording** makes the translation stale: the check lists it until a translator has
  looked and stamped it again. The app keeps showing the translation: English in the middle of a
  Persian or Arabic screen would be worse, for the reader and for the layout.
- **A change of meaning** gets a new key, so no translation can say the old thing.

**The catalog check** (`pnpm check:catalogs`, in CI) holds every catalog to these rules, message
by message:
- **Syntax:** it parses as MF2, and its data model is valid.
- **Placeholders:** it uses exactly the English message's variables.
- **Plurals:** a plural selector (`:number`/`:integer`, cardinal or ordinal) has a variant for each
  of the locale's CLDR categories, `other` through `*`. A category the locale never selects is a
  warning. A language that needs no plural forms (Persian after numerals, Chinese) drops the
  `.match` and writes a plain pattern.
- **Invisibles:** none literal in the file (ZWNJ is written `\u200c`). Bidi embedding, override or
  isolate controls are refused even escaped, because the formatter isolates placeholders.
- **Keys:** every key is one English has. Untranslated messages are a warning in a draft and an
  error in a shipped catalog.

## Consequences

- **Drafting a locale:** write `messages/<locale>.json` with `llm:` provenance and status draft, run
  `--stamp`, then `pnpm check:catalogs` until it has no errors. The English descriptions are the
  translators' notes.
- **Shipping one:** a reviewer sets status `reviewed` (with `reviewedBy` and `reviewedAt`), the
  locale joins `CATALOGS`, and the visual matrix gains it (§15).
- **A missing message falls back to English,** as before; the check keeps shipped catalogs from
  needing it.
