# 0020. Storybook + Playwright in a pinned container; structural checks

- Status: Proposed
- Date: 2026-11-03

## Decision

- **Storybook 10, not Ladle.** It has first-class toolbar globals (UI locale, pseudo-locale, target,
  dir, writing mode) and a static `index.json`, so CI can enumerate every story.
- **Visual tests drive the static Storybook build through the same globals** as the toolbar
  (`iframe.html?…&globals=pseudoLocale:ar-XB;target:yue-Hant-HK;writingMode:vertical-rl`).
- **The matrix is computed:**
  - UI: en, en-XA, ar-XB
  - targets: the four demo targets
  - writing modes: horizontal, plus each profile's `layout.vertical`; only yue allows vertical-rl
  - viewports: mobile 390 px, desktop 1280 px
  - That is 30 cells today. Adding vertical support to a profile adds its cells automatically.
- **"Renders correctly" is checked structurally in every cell:**
  - `lang`/`dir` for the UI, support and target contexts
  - target writing mode, and the chrome staying horizontal
  - ruby present in horizontal, hidden by default in vertical
  - direction icons mirrored and media icons not
  - the progress bar filling from inline-start
  - only self-hosted fonts actually used
  - **no glyph ink outside its tile or prompt** (a 3 px pixel ring outside each container)
  - no page overflow, axe with no serious or critical violations, no console errors
- **Each detector has a deliberately broken fixture that it must catch**
  (`Fixtures/Visual checks`): cramped vocalized Arabic, and an Ethiopic word no bundled font covers.
- **Pixels are compared only inside `mcr.microsoft.com/playwright:v1.63.0-noble`.**
  - CI runs the job in that image.
  - `pnpm test:visual:docker` and `pnpm test:visual:update` run it locally.
  - A bare host run still does every structural check.
  - CI refuses to run outside the container.
- `@playwright/test` is pinned exactly (1.63.0) to match the image tag.

## Consequences

Baselines (about 1.2 MB of PNGs) are only ever regenerated in the container, and every changed
PNG is reviewed in the PR.
