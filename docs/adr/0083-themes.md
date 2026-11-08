# 0083. Light and dark themes, matching the browser by default

- Status: Proposed
- Date: 2026-11-08

## Context

Ben asked for a dark mode, and for a mode that matches the browser. Every colour in the UI already
came from a dozen tokens in `packages/ui/src/tokens.css`. Only a few places did not use them: two
modal backdrops, the tick and cross inside the feedback icons (white on the status colour), and
the word pictures. The pictures are drawn for a light page, with near-black outlines.

## Decision

- **Three choices, on the device** (Preferences, `nabu.theme` in localStorage): *Match the
  browser* (the default, `prefers-color-scheme`), *Light* and *Dark*. Like the text size, it is a
  per-device convenience: it is not an event, and it does not sync.
- **The theme is CSS only.** `tokens.css` keeps light on `:root`. Dark redefines the same colour
  tokens in two blocks that must say the same thing:
  - `:root[data-theme="dark"]` when the learner chooses dark;
  - `:root:not([data-theme="light"])` inside `@media (prefers-color-scheme: dark)` when they have
    chosen nothing.

  Each theme sets `color-scheme`, so native controls and scrollbars follow it. No component knows
  which theme is on. (`light-dark()` would avoid the second block, but Safari before 17.5 has
  none.)
- **No flash.** `index.html` applies a chosen theme in a small inline script before the first
  paint. `<meta name="theme-color">` gives the browser's own chrome each theme's page colour: one
  per media query, switched to the chosen theme when there is one.
- **New tokens**, for the places that had their own colours:
  - `--nabu-color-on-status`: the mark inside a filled status icon;
  - `--nabu-color-backdrop`;
  - `--nabu-color-picture`: a light plate behind pictures in dark (transparent in light). The
    pictures keep their own colours, and a picture never needs a dark version.
- **Dark palette.** Warm near-black surfaces and the same green accent, lightened. Text is dark on
  the accent and on the wrong colour. Every pairing the components use meets WCAG 2.2 AA in both
  themes: 4.5:1 for text, 3:1 for icon marks and the focus ring. `packages/ui/test/tokens.test.ts`
  checks this, and that the two dark blocks agree and override every light colour.
- **Tests.**
  - Storybook's toolbar has a Theme switch.
  - `tests/visual/theme.spec.ts` renders every story in dark, with chrome left to right, right to
    left, and a vertical Cantonese target. It checks `color-scheme`, the page colour and axe's
    colour-contrast rule; pixels in the pinned container.
  - The light matrix is unchanged, pixel for pixel.
  - The e2e test covers:
    - matching the browser, live;
    - a chosen theme overriding the browser either way;
    - the choice surviving a reload;
    - the first paint with no app script at all;
    - axe on a course page and a Persian lesson in dark.

## Consequences

- A new colour is a token with a value in both themes and, if it carries text, a pairing in the
  token test. Hard-coded colours in components are a bug.
- Pictures are shown on a light plate in dark mode. If a course ships pictures drawn for dark
  pages, it will need a picture-level flag; nothing needs one yet.
- The native shells (Capacitor) follow the WebView's `prefers-color-scheme`. A chosen theme
  applies there as on the web.
