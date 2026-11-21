# 0131. Readings on new words only, faded by the reading skill

- Status: Accepted (2026-11-18)
- Date: 2026-11-16
- Amended by: [0141](0141-minimal-ruby.md) (a third choice: what the script leaves unwritten over words read before)
- Amended by: [ADR 0132](0132-a-choice-asks-one-thing.md)'s amendment of 2026-11-21 (a choice's words keep or lose their readings together)
- Decided, not yet built (ADRs 0145–0151, accepted 2026-11-20), to amend this:
  [0148](0148-projections-and-misses.md) (a scheme's `variants` become stated correspondences)

## Context

Vowel marks have three settings: on every word, on new words only, or on none (P12). Persian starts on
new words only: a known word (ADR 0100) loses its marks, as a reader of the script meets it. The project
owner asked for the same in the courses whose readings are a transcription rather than marks: Jyutping
over Cantonese characters and Schluessel's transliteration over Chaghatay's Arabic. Readings were on or
off for every word.

The gameplan already marked yue's Jyutping layer `fade: by-facet`, but nothing read it. The owner chose
these rules:

- A reading fades once its reading is right, not once the word is known. Knowing that 書 means "book"
  is not knowing syu1, and a known word's meaning says nothing about its reading.
- Cantonese and Chaghatay start on new words only.

## Decision

**A reading is a skill the fold witnesses.** `witness` (state.ts) now records the read-script facet too
(`WITNESSED_FACETS`). It goes in `shown` and `missed` at `kc|read-script|orthography`, by ADR 0100's rule:

- A first try right, not self-rated, on a later day than the word was met and than its reading was last
  missed, shows it.
- A miss takes it away again.

A reading card is any card of that facet: a word read in its sentence (char-read, transcribe, vocalize),
a word's reading card, or a script track's word-read. Only the word the card asks about is credited.
No word needs its reading to be known, since `skillsAsked` is unchanged. Known words, due words, the
planner's needs and the pace therefore stay as they were. The fold's oracle (fold-before-r2.ts) mirrors
the change.

**Core `readingsShown(course, state)`** lists the words whose reading has been shown in the course's
orthography.

**A layer that fades** (`fade: by-facet`) may show over every word or only over new words. The new-words
choice is per course and device, kept with the display choice (`DisplayChoice.readings: "all" | "new"`,
display.ts). Its default comes from the layer: `default: on-for-new-words` (on, over new words) or
else every word. The layer itself (which scheme, or none) is chosen per orthography as before (ADR 0071).

- **The control:** one such layer is a choice of three under its name (All words, New words, Off), as
  vowel marks are. Among several layers, a which-words choice follows the layer chosen. A layer that does
  not fade keeps its switch.
- **Where it fades:** inside a lesson or story (`FadeReadings`), <T> leaves off the ruby of a token whose
  KCs (its sense and morphs, or its form's KC on a word card) have all shown their reading. A word no KC
  writes keeps its reading.
- **Where it never fades:** a tapped word's gloss (where a faded reading is looked up), the word list,
  the sentence list and the audio check.
- **Feedback:** a right typed answer is shown again with its readings (the feedback's own rule) only
  where a word of it still has one.
- yue's Jyutping and chg's Schluessel layers are `default: on-for-new-words`, `fade: by-facet`. lzh's
  layers, tok's lasina and yue-Latn's characters do not fade.

## Consequences

- A new learner sees every reading, as before in Cantonese. In Chaghatay, readings are now on where
  they were off.
- A word's reading fades only once a reading card has asked about it. Words the planner never asks
  keep their reading. Chaghatay has no reading cards yet, so its readings stay over every word for now:
  multiple-choice cards, then typed ones for words already right by choice, come next.
- The fade waits a night after the word is met, as known words do. A reading card answered right in the
  lesson that teaches the word does not fade it; one answered right on a later day does.
- The fold now keeps read-script entries in `shown` and `missed`. Older logs replay to them, since a
  projection is derived.

## Amendment: Chaghatay's reading cards, by choice (2026-11-16)

Chaghatay had no reading cards, so its readings never faded. The Schluessel scheme now names its answer
orthography (`answer: chg-Latn/schluessel`, the profile that already tagged the alphabet track's Latin side), so
char-read builds for chg: a word of a sentence, its reading among others.

The wrong options are what the script leaves open, not other words:

- **Variants:** a scheme's `variants` (schemas/reading-scheme.schema.json) lists letters the script writes alike.
  `letterVariants` trades one letter of the reading for another that shares a set with it.
- **Schluessel's sets (REVIEW):** they err on more options, by the owner's choice. Each set is what one letter of
  the script stands for in the course's own words. The 786 word types were aligned with their readings to find this.
  - alif: a ä ā e i u. vav: o ö u ü ū.
  - ye: i e ī ä à ē. A final he: a ä e. No letter: a ä e i u ü.
  - Consonants: ک k g; غ ǧ g; ب پ ف b p ṗ; ج j č; ن n ŋ.
  - Examples: nan → nin, nun, nān; bir → bür, pir, bar.
  - Some consonant trades are ones the script rules out (چ is always č). They make an easier wrong option, never
    a wrong card.
- **Homographs first:** the course's other readings of the word's spelling come first.
- **Then other words:** other words' readings fill the card only where those are too few.
- **Case:** every option takes the answer's case, so a sentence's first word or a name gives nothing away.

A scheme without `variants` (Jyutping, sitelen Lasina) builds its cards exactly as before, random draws included.
In the first eight chg lessons the planner now plans 11 reading cards, the first lesson three. The simulation
keeps chg within its target.

**Typed once read right by choice.** A scheme may say its readings are typed as text of its answer orthography and
graded by that profile (`typedByProfile`), rather than syllable by syllable as Jyutping is. Schluessel does.

- **When it is asked:** the planner asks a word's reading typed (transcribe) only once that reading has been shown
  by the fold's rule: read right by choice, on a later day than the word was met.
- **How it is graded:** chg-Latn/schluessel grades the answer. A mark left out is noted (CORRECT_MARKS, "mind the
  marks") unless the answer then spells another word of the course. ng is accepted for ŋ. That is the profile's
  existing policy, marked REVIEW.
- **One inconsistency:** a vowel the choice card counts wrong (sut for süt) passes typed, with the note.
- **The field:** it offers that profile's letters on the character bar.
- **What stays as it was:** Jyutping's typed cards.

## Amendment: a corrected or tapped word keeps its reading (2026-11-17)

Two words lost their reading where readings fade, though they are the ones the learner is looking at:

- **A corrected word:** feedback marks the words an answer got wrong or slipped on (a typo, a mark, a word
  left out). In chg, mundin typed without its nun showed the corrected word bare between bolmas, üzüm and
  yaḫširaq.
- **A tapped word:** the gloss panel showed the reading only of an entry's form. A word glossed by its parts
  (اشلیغی: اشلیغ "grain", ی "his, her") showed its reading nowhere, above the word or below it.

The rule:

- **Marked or tapped:** a word <T> marks as wrong (`highlight`) or tapped (`pressed`) keeps its reading where
  readings fade. Other words of the sentence still fade by the fold's rule. A card that shows no reading
  layer (`ruby={false}`: char-read and transcribe ask for it) shows none for a tap or a mark either.
- **The gloss is a glossary entry:** it always shows a reading, readings off or not: the layer shown, else
  the profile's first (lzh: Pinyin; chg, yue and tok have one).
  - A part spelled as its dictionary form is that form, with the reading its KC pins (اشلیغ ašliǧ).
  - Where no entry is the word whole (parts, a phrase, or none), the word comes first with its own reading
    (اشلیغی ašliǧi).
- **What it does not change:** the fold, `readingsShown`, and a typed gap's filled word.

## Amendment: a reading stands on its own word (2026-11-17)

Nastaliq stacks letters far above the em box a browser sets ruby on. In chg, یکی cascades rise to 2.44 em of
the word's size (یکیتمنمو), and یکیتسن to 2.06 em. Its reading, set 1.05 em up, ran into the ک. One clearance
for every word would either leave readings in the strokes or float them far over short words (سن).

- **The rule:** a reading over Arabic script sits with its baseline a gap (0.35 em) over its own word's ink,
  room for g, y and ǧ to hang. Readings in one line are at different heights, each close to its word, and the
  line grows to hold the tallest.
- **How:** <T> measures by what the browser draws and lays out, never by an engine's metrics
  (packages/ui/src/ruby-lift.ts).
  - **A word's ink:** the top row it inks on a canvas in its font. The read-back must be clean: Firefox may
    scramble canvas reads against fingerprinting.
  - **Where an unlifted reading sits:** first from a hidden probe built from T's own classes and fonts, with a
    zero-size mark on each baseline. The probe trusts the canvas only once it sets a word at the width the
    page does. Then the text's own readings are measured in place at their size, before paint: browsers
    round ruby to whole pixels (0.07 em at 20 px in Chromium).
  - The lift is the difference. A line's readings share one baseline, so the lift pads an inline-block inside
    the reading, set on the bottom of their row.
  - The row's own strut is set to nothing (line-height 0 on the reading's row). Otherwise an unlifted reading
    (padding 0) set every reading in its line 0.09 em higher.
  - Until a word is measured, and where there is no browser (tests), the reading clears the tallest word.
- **Checked in Chromium and Firefox (160):** every lifted reading on the u04 sentence list, the u03 story's
  lines and its gloss panel sits exactly 0.35 em over its word's ink, and unlifted ones at least that.
  - The browsers set an unlifted reading far apart: 1.07 em up in Chromium, 0.64 in Firefox.
  - The first version, modelled on Chromium alone, left Firefox's readings 0.005 to 0.045 em over their
    words: on them, as Firefox on Android showed.
- **Where:** Arabic script only (`INK_LIFTED` in T.tsx, mirrored in T.module.css): Han, Latin and sitelen
  pona keep the browser's own placement, and their visual baselines stay as they are.

## Amendment: a line's readings stand level, inside their box (2026-11-18)

Readings at each word's own height read as ragged: a line's readings belong together, as the sentence's
reading. And the lift sat on a box inside the reading, which Gecko does not grow a line for: in a word-bank
tile, ikkinči stood over the tile's top edge in Firefox.

- **The rule:** every reading on a line stands at one height, a gap (0.35 em) over the line's tallest word.
  The line, and any box around it (a tile, a card), grows to hold its readings.
- **How:** each word's lift is still its own (`data-lift`). Once laid out, the readings whose words share a
  baseline in a block take the largest lift among them (`alignLines`, ruby-lift.ts), across every text set
  inline in that block (a gap sentence's two halves). Again when the block's width changes, as its lines wrap
  anew. The lift is padding on the reading itself: both engines grow the line for it.
- **Checked in Chromium and Firefox 160:**
  - The u04 sentence list's 49 lines: readings level on each, the tallest word's gap 0.35 em (Firefox 0.35 to
    0.38, its rounding).
  - A tile given a tall word's lift grows to hold its reading in both.
- **Tappable answers:** the feedback's right answer, and the nearest correct version, are tappable for a
  word's gloss, as an answered card's prompt is, where they are in a language the course teaches. A right
  sentence typed whole (translate-type, listen-type) comes again under its verdict for that, readings or not:
  the field holds only letters. An answered word bank's tiles of that language open their gloss too.
