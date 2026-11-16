# 0131. Readings on new words only, faded by the reading skill

- Status: Proposed
- Date: 2026-11-16

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
  For Schluessel these are alif or nothing for a, ä and ā; vav for o, ö, u, ü and ū; ye for i, e and ī (REVIEW).
  `letterVariants` trades one letter of the reading for another of its set: nan → nän, nān; süt → sut, söt, sūt.
- **Homographs first:** the course's other readings of the word's spelling come first.
- **Then other words:** other words' readings fill the card only where those are too few.
- **Case:** every option takes the answer's case, so a sentence's first word or a name gives nothing away.

A scheme without `variants` (Jyutping, sitelen Lasina) builds its cards exactly as before, random draws included.
In the first eight chg lessons the planner now plans 11 reading cards, the first lesson three. The simulation
keeps chg within its target.

Typed reading cards for words already right by choice come next.
