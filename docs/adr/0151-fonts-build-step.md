# 0151. Fonts are built, never committed

- Status: Proposed
- Date: 2026-11-19
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
  URL pinned by commit and sha256, as `nabu tables` pins Unihan and OpenCC), its steps (subset to code points
  with every layout feature kept; colour the slot glyphs; rename the family) and its licence for
  `pnpm license-check`. Fetched sources are cached; OFL.txt ships beside each output.
- **A turbo task, `fonts`,** runs ahead of `dev`, `build` and Storybook, writing to a gitignored directory,
  with fontTools and HarfBuzz pinned in the pipeline's uv lock.
- **Slot glyphs are found from the font, not by name:** by shaping the slot strings with HarfBuzz and by GSUB
  closure (what the subsetter keeps for the slot letter), so a contextual variant chosen by the next letter
  is found; marks are excluded by their character's Unicode category as well as by GDEF (DejaVu's GDEF
  doesn't class U+035C as a mark); glyphs with no outline are skipped; `buildCOLR` gets the `glyphMap`, so its
  records are sorted by glyph ID.
- **The Latin pattern font comes from the full Noto Sans**, pinned by URL and sha256: no `@fontsource`
  subset has both U+25CC and U+035C.
- **A test checks every generated colour font:** each slot glyph HarfBuzz produces has a colour record, and
  no mark does.
- **Subsetting stays where it pays:** sitelen pona's pinned source maps 2,519 code points (634 KB as WOFF2)
  of which the UCSUR block is 183; the subset is 280 KB, and `unicode-range` can't shrink a download.

## Consequences

- **Bumping a font package updates every font derived from it;** CI builds them, and the visual matrix
  catches a changed glyph.
- **A machine without Python** (a bare `pnpm dev`) gets no derived fonts: pattern shapes fall back to plain
  dotless letters, and sitelen pona has no font until the task has run once. The task says so rather than
  failing silently.
- **The committed sitelen pona subset is removed** once the task builds the same file.
