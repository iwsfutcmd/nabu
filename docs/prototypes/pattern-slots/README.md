# Pattern slots: a colour font that fades the slots and nothing else

Prototype for [ADR 0150](../../adr/0150-pattern-display.md) (what a pattern looks like) and [ADR
0151](../../adr/0151-fonts-build-step.md) (fonts are built). Written 2026-11-19; the decisions and the reasons
behind them are in [lexemes.md](../../lexemes.md) §9.

## Why a font

A pattern shows its slots as placeholder letters (Arabic ڡ, Hebrew ס, Syriac ܩ, Latin ◌) faded to 6% of the way
from the background to the text colour, with its own letters and every mark at full strength. CSS can't do it:
Chromium paints a letter and its marks in one colour, so a slot's vowel fades with it. A colour font can: marks
are separate glyphs, and COLRv0 + CPAL paints only the glyphs it lists.

## The scripts

- **`build_slot_fonts.py <fontsource dir> <out dir>`** builds `slots-arabic`, `slots-hebrew`, `slots-syriac` and
  `slots-latin` (WOFF2) and an `index.html` showing sample patterns in both themes, with a fade slider (it
  rewrites `@font-palette-values`; it doesn't work in Firefox, which the owner noted and set aside).
- **`root_class_forms.py <fontsource dir>`** renders one pattern's forms by root class (Arabic faʿala and yafʿulu,
  Hebrew qal: sound, geminate, hollow, defective, assimilated, I‑nun) to `roots-light.html` and
  `roots-dark.html`: the letter a root class fixes (qāla's ا, ramā's ى, bānâ's ה) stays dark with no extra work.

## Inputs, as used

- Python 3.13 with `fonttools` 4.68.0, `uharfbuzz` 0.57.0 and `brotli` 1.2.1 (in a venv of its own).
- `npm install` of `@fontsource/noto-naskh-arabic`, `@fontsource/noto-serif-hebrew` and
  `@fontsource/noto-sans-syriac-western`, all 5.3.0; pass their `node_modules/@fontsource` directory.
- Latin: DejaVu Sans from Debian's `fonts-dejavu-core` 2.37 (`/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf`),
  a stand-in: no `@fontsource/noto-sans` subset has both U+25CC and U+035C, so the real build takes the full
  Noto Sans by URL and sha256 (ADR 0151).

## How it finds the glyphs, and what it learned

1. Each sample pattern is written out with its slot letter, tatweel only where both neighbours join (never
   after ا, د, ذ, ر, ز, و, or in Hebrew), and NFC.
2. HarfBuzz shapes it; every output glyph whose cluster is the slot letter or the tatweel is kept, except:
   marks by GDEF class **and** by their character's Unicode category (DejaVu's GDEF doesn't class the tie
   U+035C as a mark, so it faded with its slot), `.notdef`, and glyphs with no outline (a ZWJ merged into a
   slot's cluster got a colour record).
3. `buildCOLR` gets `glyphMap=font.getReverseGlyphMap()`, so its records are sorted by glyph ID; without it
   they are sorted by name, which only works while no glyphs are added.
4. The palette colour is **opaque**. Joined glyphs overlap at their joins, and each is painted on its own, so a
   translucent colour doubles there (dark ticks along the baseline at every join).
5. The CPAL default is the light theme's 6% (#f0f0f0 here; ADR 0150 fixes #f1f1f1 from the tokens); each
   theme overrides it with `@font-palette-values`, which takes no `var()`, so the real build needs a test that
   keeps the palette values equal to the theme token.

## What the real build (ADR 0151) must add

- **GSUB closure as well as shaping**: a font that picks a contextual form by the next letter (Nastaliq does)
  defeats sample strings; Syriac's isolated qoph is missing here because no sample uses it.
- **Never colour a ligature** that takes in one of the pattern's own letters.
- **A font manifest** with pinned sources and licences, a turbo `fonts` task into a gitignored directory, and
  a test that every slot glyph has a colour record and no mark has one.
