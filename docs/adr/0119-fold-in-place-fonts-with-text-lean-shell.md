# 0119. The fold changes its draft in place, the Han fonts come with their text, the worker keeps what the learner uses

- Status: Proposed
- Date: 2026-11-13
- Amends: [0036](0036-learner-model-and-planner.md) (the learner state's fold),
  [0019](0019-self-hosted-fonts.md) (how the fonts load), [0047](0047-offline.md) (the service
  worker's shell), [0070](0070-ui-catalogs.md) (which catalogs a device keeps)

## Context

Three speed findings of the 2026-11 review that ADR 0112 left: R2, R7 and R8.

- **Replaying a long log slowed down with every word met** (R2). Each first try copied the
  performance model's KC and item maps (`update` in performance.ts): about 2,300 keys after a
  year of es, 83% of `replay`'s time. `replay` runs when a course page opens, after a revision, in
  the daily check (in the worker and on the server's `GET /v1/state`) and in the AI routes. With a
  year of simulated es practice three times a day (39,346 events, an exercise_presented before
  each answer as the app logs them), `replay` took 4.4–5.3 s in Node, and tapping the course to
  its path took 15.7–16.1 s in Chromium at 4× CPU.
- **The stylesheet that blocks the first paint carried every Han font face** (R7). 217 of its
  263 `@font-face` rules were Noto Sans HK's and Noto Serif TC's unicode-range pieces: 113 kB of
  its 123 kB gzipped, for every learner of every course.
- **The service worker downloaded the app shell a second time on first visit** (R8). It fetched
  its shell past the HTTP cache (`cache: "reload"`), so the script and styles the page had just
  loaded came down again, and the shell held every UI catalog (five drafts; English is in the
  app's own script) and the demo card.

## Decision

**The fold changes its draft in place** (R2).

- `applyEvents` already folds into a private deep copy of the state it starts from (`draftOf`,
  structuredClone) and hands that back. `learn` (performance.ts) takes the SGD step on the draft's
  model in place; `update`, for a caller holding a state, is `learn` on a copy. Each parameter's
  new value depends only on its own old value and the error, which is worked out first, so the
  arithmetic and the order of the maps' keys are unchanged: the state is the same to the byte.
- `test/fold-before-r2.ts` keeps the fold as it was, and `replay-in-place.test.ts` checks the new
  one against it, as values and as JSON: three months of es (every word of the course met), whole
  and event by event as the app records it, shuffled with duplicates; a month of fa with hints,
  self-ratings, skips, claims, judge revisions, a placement test, a reset and stopped sessions
  (fast-check); and the state a fold starts from is never written (deep-frozen). A change of the
  last bit of one step fails it; the golden files alone did not. `pnpm --filter @nabu/core
  bench:replay` simulates the year and times `replay` (`--check` compares with the fold before).

**The Han fonts come with their text** (R7).

- `fonts.css` keeps every family but the Han ones; `fonts-han.css` holds Noto Sans HK and Noto
  Serif TC. `fonts.ts` loads it (a dynamic import, which Vite turns into a stylesheet of its own)
  when `<T>` or the chrome (`useChrome`) first sets text in a font stack that names one of them.
  The font files still come only for the characters on screen (ADR 0019).
- Whatever needs every font at once links it: Storybook's preview, so a screenshot never waits on
  a stylesheet, and the landing page, whose yue and lzh samples need it (`demoStylesheets` adds
  the build's `assets/fonts-*.css`). A page that already declares the families loads nothing more.
- Keeping a course offline first loads the stylesheets its orthographies' stacks name, so their
  faces are declared before the course's text fetches them, and keeps the page's stylesheets in
  the runtime cache where no cache holds them (one loaded before the worker took the page over).

**The worker keeps what the learner uses** (R8).

- Files under `assets/` are named by their content (Vite's `[name]-[hash]`): the worker fetches
  them with the default cache mode, so whatever the page has just loaded comes from the HTTP
  cache. Files whose names stay the same across builds (index.html, the web app manifest, the
  icons) still come past it.
- The page notes the UI catalogs it reads (the translator's new `catalogs`, by locale) in its
  META store (`ui-catalogs`) before registering the worker; the worker keeps those catalogs'
  files with the shell (vite-sw.ts gives it each locale's), and no other locale's. A reviewer on a
  draft UI starts offline in it; an English learner keeps no catalog file at all.
- Out of the shell, and kept as they are fetched, like the fonts: the other locales' catalogs, the
  Han fonts' stylesheet and the demo card (`?target=`), which no learner opens. A request under
  `assets/` looks in the shell's cache, then the runtime cache.

Alternatives considered:

- **Persistent maps for the model** (a HAMT): no copy per answer either, but a dependency in core
  and slower reads for the planner's predictions. The draft is already private; in place is enough.
- **Loading the Han fonts when a Han course opens**, in the app: Han text shown outside a course
  provider (a script default stack, the chrome of a UI whose stack named them) would fall back to
  system fonts. Loading by the font stack that is actually used covers every place.
- **The locale in the worker's URL** (`sw.js?ui=fa`): a locale change re-installs the worker, and
  every registration (push's too) would have to use the same URL. **Precaching no catalog**: a
  shipped non-English catalog would be missing on an offline start after a first visit (the page
  loads it before the worker controls it). **Telling the worker by message**: a new build's
  install would not know until a page sent it again.

## Consequences

Measured on this machine with the year of es above, the app built and served as GitHub Pages
serves it (gzip, `Cache-Control: max-age=600`, ETags), Chromium:

| | Before | After |
|---|---|---|
| `replay` of the year (Node, unthrottled; a shared machine) | 4.4–5.3 s sorted, 5.1–5.8 s shuffled | 0.50–0.61 s sorted, 0.67–0.77 s shuffled |
| Tap on es to its path, a year of history, 4× CPU | 15.7–16.1 s | 4.2–4.3 s |
| Stylesheet that blocks the first paint | 343.5 kB (128.6 kB gzipped) | 66.2 kB (9.6 kB gzipped) |
| First visit (home): the page | 487 kB in 13 requests | 374 kB in 13 requests |
| First visit (home): the worker's install | 654 kB in 26 requests | 92 kB in 13 requests |
| First contentful paint, 4× CPU, slow 4G (150 ms, 1.6 Mbps) | 2.68 s | 2.18 s |

- **What stays slow** opening a course with a year of history is reading the log from IndexedDB
  (39,346 events: about 1.3 s of the 4.2 s, in the request's result) and the replay's FSRS work
  (cards converted to and from their stored form for every rating, about 1 s at 4×).
- **The oracle is a copy of the fold.** A deliberate change to the fold changes
  `fold-before-r2.ts` too, as it changes the golden files.
- **Han learners** get the Han stylesheet (118 kB gzipped) when their course's text first shows,
  a moment after the first paint, and the worker keeps it once fetched. Offline, a Han course
  kept on the device renders in its fonts; Han text first seen offline, before the stylesheet was
  ever fetched, shows in a system font.
- **Another locale** chosen later is kept once its catalog is fetched, and with the shell from the
  next build on. Fonts loaded before the worker first took the page over are still not kept (as
  before): keeping a course offline fetches only the faces its text has not loaded yet.
- `@nabu/ui` exports `fonts-han.css`, `loadFonts` and `useFonts`; `@nabu/i18n`'s Translator has
  `catalogs`.
