# 0150. Showing a pattern: faint slots in a colour font

- Status: Proposed
- Date: 2026-11-19
- Revised: 2026-11-20, after the review (what changed is listed at the end)
- Amends: [ADR 0083](0083-themes.md) (a colour that carries text has an AA pairing in both themes: the slot
  colour is below AA on purpose)
- Builds on: [ADR 0145](0145-lexical-model.md) (a pattern is a head: a function head, or a value head as
  apc's participle is; its allomorphs are templates)
- Font build: [ADR 0151](0151-fonts-build-step.md)

## Context

A pattern lexeme (فاعِل, مَفْعَل, piʿel) has templates for allomorphs, with slots its base's radicals fill. Shown
on a dummy root (فعل, פעל) it hides what it should show: Hebrew פִּעֵל can't show the piʿel's doubling (ע takes
no dagesh), and in اِفْتَعَلَ the ت looks like a fourth radical. Greying placeholders with CSS greys their marks
too: Chromium paints a letter and its marks in one colour.

## Decision

- **A pattern is shown with placeholder letters for its slots, faint, and everything else at full strength:**
  the pattern's own letters and marks, and a letter a root class fixes (hollow faʿala ڡَـاڡَ, *qāla*; defective
  ڡَـڡَـى, *ramā*; Hebrew III‑he סָסָה, *bānâ*).
- **The slot letter is each profile's data**, never code:

  | Script | Slot |
  |---|---|
  | Arabic | dotless feh ڡ U+06A1, with tatweel beside every slot (never between two of the pattern's own letters, only where both sides join) |
  | Hebrew | samekh ס, no tatweel |
  | Syriac | qoph ܩ U+0729, with tatweel beside every slot |
  | Latin (Arabizi, SBL) | dotted circle ◌, a doubled slot tied with U+035C (◌a◌͜◌a◌) |
  | Samaritan, Ugaritic, Old North and Old South Arabian, Phoenician | ʿayin (U+080F, U+10393, U+10A92, U+10A72, U+1090F) |
  | Tifinagh | yar ⵔ U+2D54 |
  | Imperial Aramaic | teth 𐡈 U+10848 |
  | Hatran | ʿe 𐣯 U+108EF |
  | Mandaic | al ࡋ U+084B, with tatweel beside every slot (it joins, and U+0640 is Mandaic's too) |
  | Nabataean, Palmyrene | zayin (U+10889, U+10866) |
  | Elymaic | mem 𐿬 U+10FEC |
  | Cuneiform | none: patterns in Latin transliteration |

  Ethiopic is open until it arrives (ʿäyn ዐ in principle, but its vowels are fused into the glyph). Nastaliq
  is not used for patterns.
- **The slots are 6% of the way from the background to the text colour**, in each theme (light #f1f1f1 on
  #fff; dark #2d2b28 on #211f1c), the tatweel exactly as faint, with no bar under bare slots.
  Below AA on purpose: the shape's accessible name carries the pattern.
- **That is an exception to ADR 0083,** whose rule is that a colour carrying text has an AA pairing in both
  themes. The token test names the slot token as exempt, and tests instead that it is 6% in each theme and at
  least AA under `prefers-contrast: more`.
- **A shape stands on the surface token only.** An opaque grey is tuned to one background, and the two
  pairs above are the surface's: on the page token the same grey would be 2% from the background in light
  and 10% in dark. A shape set anywhere else needs a palette for that background.
- **A bare slot is only a gap.** A slot with a vowel is found by its vowel; one without leaves nothing at
  6%, so a shape no longer shows by itself how many radicals it has. The owner weighed a bar under each slot
  and a stronger tatweel, and chose neither.
- **One slot letter can't say which radical is which.** A pattern that repeats a radical or moves one
  (Hebrew polel and pilpel, the hitpaʿel's metathesis before a sibilant; an Arabic reduplicated quadriliteral,
  whose first two consonants repeat) looks like any shape with as many slots. Until slots are numbered (below), such a pattern is shown beside an
  aligned word, and its traditional name stays its label.
- **Under `prefers-contrast: more` the slots come up to a visible grey;** forced-colours modes already draw
  them at full strength. No per-device setting for slot strength.
- **A colour font does it:** a renamed copy of the script's font with COLRv0 + CPAL painting only the slot
  glyphs (every contextual form) and the tatweel, in an opaque palette colour (a translucent one doubles at
  the joins). Marks are separate glyphs and stay in the text colour. The colour is a theme token set per
  theme with `@font-palette-values`, which a test keeps equal to the token.
- **The shape has an accessible name:** its traditional name and meaning ("مَفْعَل: place of …"), since a
  screen reader would read the slots as letters. The tradition's names stay as labels.
- **A placeholder string is display only.** The pattern's lexical form stores its slots abstractly; learners
  never type a shape (building a word from a pattern uses buttons, as vocalize-build does).
- **Teaching order:** two or three words first (مَكْتَب, مَلْعَب, مَطْبَخ), aligned; then the shape beneath them
  with its meaning; then cards that build (a base into the slots), extract (word to root) and decode ("what
  might مَدْخَل be?").

## Consequences

- **apc and hbo profiles gain a slot letter;** Syriac and the rest wait for a course.
- **New theme token** for the slot colour, light and dark, with its contrast-mode value, its exemption in
  the token test (ADR 0083) and a test that the palette values match it.
- **`prefers-contrast`, `forced-colors` and `font-palette` are used nowhere in the app today,** so the visual
  matrix gains a pass for each on pattern shapes.
- **The pattern font is generated, never committed** (ADR 0151). Without it, shapes fall back to the plain
  font: dotless letters at full strength, still readable.
- **Later, with our own font:** a designed joining slot glyph, spacing in the font instead of tatweel,
  numbered slots by contextual alternates. Not decided here.

## Revision (2026-11-20): the review

After [the review](../review-adr-0145-0151.md) (findings 10, 18; C14, C15). No answer of the owner's fifth
round touches this ADR.

**Restored from the notes:** an opaque grey is tuned to one background; what a bare slot costs, which the
owner weighed when deciding against a bar and a stronger tatweel.

**Checked since, in the reference library:** the hitpaʿel's metathesis and the polel and pilpel (Joüon–Muraoka
§§ 53 and 59); reduplicated quadriliteral verbs (Ryding 2005, ch. 33), which replaces "a quadriliteral from a
doubled root", written from memory.

**Proposed with this revision, not yet the owner's:**
1. The slot token's exemption in the token test, with a test of its own (ADR 0083 is listed as amended).
2. A shape stands on the surface token only.
3. A pattern that repeats or moves a radical is shown beside an aligned word until slots are numbered.
4. Mandaic takes the tatweel, as Arabic and Syriac do (Unicode's Script_Extensions give it U+0640).
5. A pass of the visual matrix for contrast, forced colours and the palette.
