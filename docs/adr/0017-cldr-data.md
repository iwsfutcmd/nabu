# 0017. CLDR data: pinned cldr-json, checked-in tables, our own likely subtags

- Status: Proposed
- Date: 2026-11-03

## Context

§6.2 says direction comes from `new Intl.Locale(tag).maximize()` plus a script table generated from
CLDR, with `getTextInfo()` as a runtime cross-check. §17 lists engine Unicode and CLDR drift as a risk.
These pull against each other: `maximize()` uses the engine's CLDR, so a tag such as `apc` can
maximize differently, or not at all, across browsers.

## Decision

- **Source:** the `cldr-core` and `cldr-misc-full` npm packages, pinned to an exact version (49.0.0;
  Unicode 16). `pnpm cldr` writes `packages/i18n/src/generated/*.json`, which is checked in, with a
  manifest of input SHA-256s. A test fails if the files differ from what the pinned packages produce.
- **Tables:** scriptMetadata (YES/NO/UNKNOWN → true/false/null), likely subtags (full), parent
  locales including the `nonlikelyScript → root` rule, and exemplars parsed from UnicodeSet syntax into
  NFC string arrays for the locales in `cldr.config.json`.
- **Our own `maximize()` (UTS #35 §4.3) and parent chain are the source of truth.**
  `Intl.Locale#maximize` and `getTextInfo()`/`textInfo` only cross-check in tests (Node 22 has only
  the older `textInfo` getter).
- **Vertical writing** is not in CLDR. A small hand-maintained overlay (`data/script-overlay.json`,
  sourced from CSS Writing Modes and the W3C jlreq/clreq/Mongolian requirements) records which
  scripts allow vertical-rl/-lr and which are always vertical. Profiles still opt in per course.
- Direction-detection vectors live in `conformance/direction.json` (Python joins in Phase 1).

## Consequences

- `likely-subtags.json` is about 160 KB raw (about 30 KB gzipped) and is bundled into the client. Subset it
  or lazy-load it when the client bundle budget is set.
- Bumping CLDR is one PR: change both versions, run `pnpm cldr`, review the diff (one entry per line).
