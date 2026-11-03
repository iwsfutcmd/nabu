# 0019. Self-hosted OFL webfonts; no system fallback for language data

- Status: Proposed
- Date: 2026-11-03

## Context

§6.8 asks for per-script font stacks, lazy loading by `unicode-range`, and checks that no glyph is
clipped. System fonts differ between machines, which breaks both correctness (tofu, wrong Han
forms) and screenshot reproducibility. §6.8's "font stacks as `:lang()` rules" also has a gap.
`:lang()` matches language ranges, not scripts. `:lang(az)` cannot tell az-Latn from az-Arab, and
the wildcard `:lang("*-Arab")` is not reliably supported.

## Decision

- Fonts come from `@fontsource/*` (OFL-1.1, already split into `unicode-range` subsets): Noto Sans,
  Noto Sans Arabic, Noto Naskh Arabic, Vazirmatn and Noto Sans HK. They are bundled by Vite and
  downloaded per subset on demand.
- `<T>` sets `--nabu-text-font` and `--nabu-text-line-height` from the orthography profile's
  `fonts`, else from the script defaults in `packages/i18n/data/font-stacks.json`. The UI
  chrome uses `uiFontStack(locale)`.
- The visual suite asks Chromium (CDP `CSS.getPlatformFontsForNode`) which fonts it actually used.
  Any system-font fallback fails the test, and each language must render with its profile's
  primary family.

## Consequences

- Noto Sans HK is about 86 MB unpacked in `node_modules`. Only the subsets a page uses are downloaded.
- OFL is a font licence, not copyleft *code*, so §1 decision 12 allows it as an asset. Fonts need
  SPDX entries when bundles get manifests (Phase 2).
- Adding a script means adding a Fontsource family and a font-stacks entry. The font check then
  covers it automatically.
