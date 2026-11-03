# 0035. Course bundles in the client

- Status: Proposed
- Date: 2026-11-03

## Context

The player needs compiled courses: units, profiles, tables and pictures. Three consumers need them:
- the web app;
- Storybook (the visual matrix);
- the e2e tests.

The Playwright container and Pages have Node but no Python toolchain (uv, PyCantonese, ICU).

## Decision

**Committed bundles.**
- `pnpm bundles` (`nabu build ../courses --out ../apps/web/public/bundles`) writes every course's
  bundle plus an `index.json` of courses.
- The output is checked in, like the other generated data.
- CI's checks job, which has every tool, regenerates it and fails if anything differs. Builds are
  deterministic (ADR 0029).

**One loader.**
- `fetchCourse` and `fetchCourseIndex` (`@nabu/ui/player`) fetch the manifest and its files.
- Core's pure `assembleCourse` compiles the profiles; images stay URLs.
- The web app serves `public/bundles/`; Storybook serves the same directory (`staticDirs`).
- Core's tests and the e2e solver read the same files from disk.

**Routes.**
- The web app routes in the URL hash (`#/<course>/<orthography>/<node>`), so the static build
  works on Pages.
- `?seed=` makes lessons reproducible; `?ui=` picks the UI locale.
- `?target=` still opens the Phase 0 demo card.

**Data additions (Phase 3 prep):**
- **Pictures.** KCs carry a licensed picture (`ImageAsset`: file, SPDX licence, provenance,
  source).
  - The compiler copies it content-addressed into the bundle (role `image`).
  - A missing file is `parse.missing-asset`.
  - Ten CC0 SVGs in `courses/images`, with no text inside, give each fixture course three to five
    pictured senses for `select-image`.
- **Vocalization.**
  - apc-Arab gets a vocalization layer (shadda in بدّي).
  - fa writes the ezafe kasra (کتابِ من), which the harakat toggle hides.
  - Glossary lookup (`glossUnits`, `fold-units`) strips the marks a profile ignores, so کتابِ finds
    کتاب. Conformance vectors cover it.
- **Contractions.** English contractions are one word token (I'm, name's), so one tile.

## Consequences

- Courses and profiles cannot change without `pnpm bundles`; CI says so.
- About 950 KB of bundles live in the repository. Cantonese is most of it (its Jyutping table).
- Images are served from the bundle directory, so they need no build step.
