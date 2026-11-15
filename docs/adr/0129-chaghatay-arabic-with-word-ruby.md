# 0129. Chaghatay in Arabic only, Schluessel's transliteration as ruby over the word; Nastaliq

- Status: Proposed
- Date: 2026-11-15
- Amends: [0128](0128-chaghatay.md) (one orthography, not two),
  [0109](0109-names-and-schemes-are-data.md) (a scheme says what its ruby stands over),
  [0117](0117-pinned-readings-on-kc-forms.md) (a KC may give its own reading in a word scheme)

## Context

ADR 0128 gave Chaghatay two orthographies, the Arabic script and Schluessel's transliteration, every sentence
pinned in both. Ben, trying it on a phone: "These should show the transliteration, if that's turned on. I don't see
an option at all", and "We don't actually need a separate course in Latin script… Just Arabic, with the
transliteration as an aide (like lzh)". He also asked for the Nastaliq face, Noto Nastaliq Urdu, if it has the
letters.

Ruby today stands over characters: a Han character's syllable (Jyutping, Pinyin, Baxter), a logograph's word
(sitelen Lasina), a syllable of the script's own scheme. An Arabic word's letters do not line up with its sounds
(most vowels are unwritten: بار is bar, باردی bardi, بیردی bärdi), so a transliteration can only stand over the whole
word.

## Decision

**One orthography, `chg-Arab/standard`.** `chg-Latn/schluessel` leaves the course's `orthographies`: learners are
offered the Arabic only. Its profile stays as the alphabet track's Latin side (the chg-Arab profile's `romanize`,
as `grc-Latn/romanized` is grc's): the KCs keep their chg-Latn forms for it, and its grading and notes
(`translit-marks`) serve the track's Latin answers. Its `transliterate` field goes.

**Schluessel's transliteration is a reading scheme, `schluessel`** (profiles/schemes/schluessel.yaml), shown as a
ruby layer on request, as lzh shows Pinyin: the chg-Arab profile's `annotations` has `{id: schluessel, kind:
reading, scheme: schluessel, lang: chg-Latn, toggle, default off, render: ruby}`. It is shown, never asked for (no
`answer`). One layer, so the display menu offers a switch.

- Every word token of every sentence and story line pins `readings: {schluessel: …}`: Schluessel's reading of that
  word as the course wrote it before (names keep their capitals; a sentence's first word does not take one).
- **A scheme says what its ruby stands over** (`ruby`, schemas/reading-scheme.schema.json): `character`, the
  default and what every scheme did so far, or `word`. `schluessel` is `word`: the compiler (`text.ruby_bearing`,
  `text.ruby_segments` with `whole`) gives every word with a letter one segment, the word, under its reading, in
  sentences, story lines and KC forms alike. `<T>` already renders a token's segments; a one-segment ruby over a
  cursive word keeps the word whole, its half-spaces included.
- **A KC may give its own reading in a word scheme** (amending 0117): a word card's ruby comes from the tokens that
  spell the KC's form, but a verb's stem never stands alone in a sentence (بار in باردی). In a `ruby: word` scheme a
  KC's `readings` may add a reading no token gives (`_refused` allows it); every chg sense KC pins its own, so
  every KC form carries its transliteration (بار- reads bar).
- Over Arabic-script text the reading stands clear of the word (`padding-block-end` on its `rt`): Nastaliq stacks
  dots and tall strokes high above the line.

**Nastaliq.** The chg-Arab profile sets `fonts: {stack: [Noto Nastaliq Urdu, Noto Naskh Arabic], lineHeight: 2.6,
scale: 1.5}`; `@fontsource/noto-nastaliq-urdu` (OFL-1.1) joins packages/ui's fonts.css. Its Arabic face covers every
letter, mark and digit the course uses (checked against the woff2's cmap, not its unicode-range); « » and … come from
its Latin face. Its letters reach 1.9 em above the line and 0.6 below, hence the line height; at the size of the
text around it Nastaliq reads small, hence the scale.

## Consequences

- One chg orthography to learn, with the transliteration a toggle away; nothing asks for it. The alphabet track is
  unchanged.
- The course's YAML holds the transliteration twice over (token readings, KC forms), both written by the generator
  in the reference library (`nabu/notes/chg/generator`); `pipeline/tests/test_courses.py` checks every word's reading
  is in Schluessel's letters and its ruby the whole word.
- Another script whose letters do not line up with a transliteration (Hebrew with a romanization, Syriac) can use
  `ruby: word` with no new code.
- The Nastaliq face is about 160 KB, fetched only when chg text is on screen (its faces are declared in fonts.css as
  the others are).
- A parallel design (a reading layer naming another orthography of the course, its ruby taken from that orthography's
  words) was considered in another session and left aside: it keeps the Latin orthography a course a learner can
  pick, which is what Ben asked to drop.
