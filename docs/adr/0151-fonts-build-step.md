# 0151. Fonts are built, never committed

- Status: Proposed
- Date: 2026-11-19
- Revised: 2026-11-20, after the review (what changed is listed at the end)
- Supersedes: sitelen pona's committed subset (packages/ui/src/fonts/sitelen-seli-kiwen, its README's
  pyftsubset command)
- Needed by: [ADR 0150](0150-pattern-display.md) (the pattern colour fonts)

## Context

The UI loads fonts from `@fontsource` packages, pinned in the lockfile, except sitelen pona, whose subset is
a committed binary made by hand with pyftsubset. The pattern display (ADR 0150) needs colour fonts derived
from the pinned script fonts. A committed binary drifts from its source and can't be updated by bumping a
package; the owner wants every font updatable from the repo, the same way.

## Decision

- **Every derived font is a build output, never a committed binary**, made from a pinned source by a script,
  sitelen pona included.
- **One font manifest** lists each derived font: its source (an `@fontsource` package from the lockfile, or a
  URL pinned by commit and sha256), its steps (subset to code points with every layout feature kept; colour
  the slot glyphs; rename the family) and its licence. Fetched sources are cached; OFL.txt ships beside each
  output. That pin is stricter than `nabu tables`, which pins a Unicode version and a git tag and checks no
  hash.
- **The manifest gets a licence check of its own,** with OFL-1.1 allowed for fonts. `pnpm license-check` reads
  package licences: it sees no font today, and OFL-1.1 is not in its allowed set.
- **A turbo task, `fonts`,** runs ahead of `dev`, `build` and Storybook, writing to a gitignored directory,
  with fontTools and HarfBuzz pinned in the pipeline's uv lock.
- **Every path that builds the app builds or fetches the fonts first.** Four have no Python today:
  deploy/web.Dockerfile, pages.yml, and ci.yml's android and visual jobs; and three of them call a package's
  script directly, where a turbo edge never runs. So the step belongs to the packages' own `build`, `dev` and
  `build-storybook` scripts, and each of those four sets up Python and uv, or fetches the fonts another job
  built.
- **Slot glyphs are found from the font, not by name:** by shaping the slot strings with HarfBuzz and by GSUB
  closure (what the subsetter keeps for the slot letter), so a contextual variant chosen by the next letter
  is found; marks are excluded by their character's Unicode category as well as by GDEF (DejaVu's GDEF
  doesn't class U+035C as a mark); glyphs with no outline are skipped; a ligature that takes in one of the
  pattern's own letters is never coloured; `buildCOLR` gets the `glyphMap`, so its records are sorted by glyph
  ID.
- **The Latin pattern font comes from the full Noto Sans**, pinned by URL and sha256: no `@fontsource`
  subset has both U+25CC and U+035C.
- **A test checks every generated colour font:** each slot glyph HarfBuzz produces has a colour record, and
  no mark does.
- **Subsetting stays where it pays:** sitelen pona's pinned source maps 2,519 code points (634 KB as WOFF2)
  of which the UCSUR block is 183; the subset is 280 KB, and `unicode-range` can't shrink a download.

## Consequences

- **Bumping a font package updates every font derived from it;** CI builds them, and the visual matrix
  catches a changed glyph.
- **A build that ships fails without its derived fonts:** the web build, Pages, the preview APK, the
  self-hosted image. sitelen pona is written in private-use code points, so without its font every word is a
  box.
- **Only `pnpm dev` may run without them,** on a machine without Python, and says so: pattern shapes fall
  back to plain dotless letters, and sitelen pona has no font until the task has run once.
- **The visual baselines gain an input.** The fonts a baseline is drawn with are built from the uv lock,
  never by whatever fontTools the host has.
- **The committed sitelen pona subset is removed** once the task builds the same file.

## Revision (2026-11-20): the review

After [the review](../review-adr-0145-0151.md) (finding 19). No answer of the owner's fifth round touches this
ADR.

**Corrected:** `nabu tables` pins a version and a tag, not a commit and a sha256; `pnpm license-check` sees no
font today.

**Restored from the prototype's notes:** a ligature that takes in one of the pattern's own letters is never
coloured.

**Proposed with this revision, not yet the owner's:**
1. The fonts are a step of the packages' own scripts, and the four build paths without Python get it or
   fetch the fonts.
2. A build that ships fails without its fonts; only `pnpm dev` may go without. (The ADR let every machine
   without Python run fontless, which would have shipped Toki Pona as boxes.)
3. A licence check for the font manifest, with OFL-1.1 allowed.
4. Baselines are drawn with fonts built from the uv lock.
