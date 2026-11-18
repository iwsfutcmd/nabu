# 0133. Script tracks ask the course's reading, in Latin

- Status: Accepted (2026-11-18)
- Date: 2026-11-17
- Amends: [0088](0088-script-tracks.md), [0124](0124-script-tracks-from-the-profile.md) (the profile's
  `romanize`), [0128](0128-chaghatay.md) (the romanization scheme `forms`), [0117](0117-pinned-readings-on-kc-forms.md)
  (a KC's own reading)

## Context

An alphabet track teaches what a script's letters and words sound like to a learner who cannot read the
script yet. It needs to show that sound in letters the learner already reads, so every letter and word
carries a Latin spelling. Until now a profile named a "romanization" for it (`romanize: {scheme,
orthography}`), and the two courses with a track filled it in two different ways:

- **grc** computed it from the spelling, letter by letter (`nabu.greek_translit`). Because it came from
  the spelling, it said nothing the spelling doesn't: α was always *a*, though the course pins every
  word's vowel lengths in its Attic reading (ADR 0087). χώρα came out *chōra* while the voice says χώρᾱ.
- **chg** took each KC's own form in Schluessel's transliteration (`scheme: forms`). That is the course's
  reading of the word (ADR 0128/0129), kept a second time as a KC form.

The sources-of-truth study (docs/sources-of-truth.md) found that this "romanization" layer is not a layer
of its own. In chg it is the reading. In grc it is a weaker copy of the reading, computed from the
spelling. What a track asks is spelling ↔ reading. The only open question is how a reading is shown to
someone who can't yet read the script. That is a way of displaying the reading, and it belongs to the
reading scheme. The project owner agreed: drop the romanization, and have the track ask the course's
reading.

## Decision

**A profile names the reading its track asks:** `scriptTrack: {reading: <scheme>}` replaces `romanize`.
- grc-Grek/polytonic: `scriptTrack: {reading: attic}`.
- chg-Arab/standard: `scriptTrack: {reading: schluessel}`.

**A reading scheme names its Latin:** `latin: <orthography>` (schemas/reading-scheme.schema.json).
- The track's letters and words are tagged with that orthography.
- Its profile grades them and ships in the bundle beside the course's own.
- attic: `latin: grc-Latn/romanized`.
- schluessel: `latin: chg-Latn/schluessel`.

Where a scheme's own text is not Latin, a plug-in writes a reading in it: nabu.schemes `latin`. Attic's
is `nabu.greek_translit.word`, which now keeps lengths:
- An α ι υ that an Attic reading marks long (ᾱ), or that a circumflex or an iota subscript settles, is
  ā ī ȳ: χώρᾱ *chōrā*, ἀγορᾶς *agorās*, χώρᾳ *chōrāi*.
- A short one, or one in a diphthong, stays a i y.

Schluessel has no `latin` plug-in: its readings are Latin already.

**A word's Latin is its KC's pinned reading** (ADR 0117), the one its word card shows and its voice
says, written by the plug-in where there is one.
- The track is compiled after KC readings are pinned. The compiler attaches each node's `alphabet` to
  the bundled units then (`compile_alphabets`, `with_alphabets`).
- A word whose KC has no reading in the scheme is the new lint `script.missing-reading`.

**A letter has no reading.** Its Latin is:
- the plug-in's rendering of the letter (α *a*, ᾳ *āi*); or,
- where the scheme has no plug-in, its grapheme KC's own form in the Latin orthography. An abjad's
  letter stands for several sounds, which only data can say (chg's ب *b*, و *w*).

**A KC entry may give the reading of a form no token spells** (amending ADR 0117).
- Before, a KC's own `readings` had to be one its tokens give, unless the scheme is read over whole
  words.
- Now a form that no sentence or story line spells has no reading for the KC's own to contradict, so
  its entry may give one. This is the case for a lemma its sentences only inflect, which the track asks.
- grc gives seven, each with the lengths its inflected tokens show:
  - ᾰ̓γορᾱ́ (from ἀγορᾶς, ἀγορᾷ, ἀγορᾱ̀ν);
  - ᾰ̓φῑκνέομαι, γῐ́γνομαι, σκῠθρωπᾰ́ζω, ὀπῐσθοφῠ́λᾰξ;
  - and two whose spelling settles the reading, εἰ and χαίρω.

**Lints.**
- `script.no-romanization` becomes `script.no-reading-scheme`: the profile names no scheme with a Latin
  orthography, or that orthography has no profile.
- `script.missing-reading` is new.
- Both have fixtures. The GRC lint fixture gains a lesson sentence, ναί, which gives its word a reading.

## Consequences

- **chg's track is unchanged.** All 46 words' readings equal their chg-Latn/schluessel forms. Its
  bundle changes only in the chg-Arab profile (`romanize` → `scriptTrack`).
  - Its word KCs' chg-Latn forms are no longer read by the track: only its letters' are.
  - Removing them is left to whoever next edits chg's units.
- **grc's track gains the lengths.** Seven items change:
  - the iota subscript letter: *ai* → *āi*;
  - ἡμέρα *hēmerā*, ἀγορά *agorā*, Δαρεῖος *Dāreios*, οἰκία *oikiā*, νῦν *nȳn*, ἀφικνέομαι *aphīkneomai*.
  - The grc-Latn/romanized profile adds ā ī ȳ to its exemplars. A missing macron is still noted, not
    failed.
- **Nothing at runtime changes.** A letter's and a word's Latin are TaggedText in the bundle, as before.
- **A future track** names a scheme. If the scheme's text isn't Latin, it adds a `latin` plug-in; if its
  letters aren't written by a rule, its grapheme KCs carry forms in the Latin orthography.
