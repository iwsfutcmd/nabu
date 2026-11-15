# 0129. A transliteration as a reading layer: Schluessel's Latin over Chaghatay's Arabic

- Status: Proposed
- Date: 2026-11-15
- Amends: [0071](0071-classical-chinese.md) (a reading layer of whole words),
  [0128](0128-chaghatay.md) (the Arabic shows its transliteration on request)

## Context

The project owner, taking chg in its Arabic script, found no way to see the transliteration: a
match-pairs card showed قند, نان, سو, چای and توز, and the player's settings offered no readings switch.
The course has the transliteration already: every sentence, story line and KC form is pinned in
chg-Latn/schluessel as well, word for word (ADR 0128; a test checks the senses and suffixes line up).
What it lacked was a way to show one over the other.

Reading layers (ADR 0071, 0109) are ruby that the learner switches on: Jyutping over yue's
characters, Pinyin, Jyutping and Baxter over lzh's, sitelen Lasina over sitelen pona's logographs.
Each word token pins its reading, and the compiler splits it over the word's characters, one
syllable each. An alphabet's word does not split that way, and Chaghatay's words should not be pinned
twice: the Latin form is already pinned, and a second copy could drift from it.

## Decision

**A reading layer may be another orthography of the course** (`orthography` on a profile's
annotation layer). chg-Arab/standard has one: `{id: schluessel, kind: reading, scheme: schluessel,
orthography: chg-Latn/schluessel, lang: chg-Latn, toggle: true, default: "off", render: ruby, fade:
none}`. The scheme is data (profiles/schemes/schluessel.yaml, "Transliteration (Schluessel)") with no
`answer`: it is shown, never asked.

**The compiler takes the words; nothing is pinned by hand** (nabu.compiler.transliteration):

- **A sentence or story line:** each word reads as the word in the same place in the layer's
  orthography's form of the same sentence or line. Its ruby is one segment over the whole word (قند
  under qand), not split over its letters.
- **A KC form:** the KC's form in that orthography, form by form where the KC has as many in both,
  else its first form only. A form of one word reads as the other form from its first word to its
  last: bē-ḥadd over بیحد. A stem's hyphen (bar-) stays outside the ruby, as the Arabic shows it.
- **Words that do not line up** (their count, or two senses in one place) are an error,
  `enrich.ruby-unaligned`.
- **A script track's letters get none** (`grapheme:` KCs), and neither do its items: their Latin
  spelling is what the alphabet cards ask for.
- **Only ruby, never `readings`.** The reading is the other orthography's own text, which
  corrections, the word list and voices already have as that orthography's. A learner corrects the
  Latin as chg-Latn's text, not as a reading of the Arabic.

**In the app** nothing changes: the player's readings switch ("Show readings") appears for every
profile with a ruby layer, and `<T>` sets each segment's ruby in the layer's language (`chg-Latn`)
and its face. The switch starts off, as lzh's layers and sitelen Lasina do.

## Consequences

- chg's Arabic shows Schluessel's transliteration over every word on request: lesson cards, word
  banks, match-pairs, stories, glosses, new-word lists and the word list.
- The ruby is the Latin sentence's: its first word keeps its capital (Čay sawuq emäs.), as a
  transliterated line is written.
- Another course written in two orthographies word for word (uz Latin and Cyrillic, apc Arabic and
  Arabizi) could show one over the other the same way with one line in a profile. None does yet:
  nobody has asked, and uz's two are both alphabets a learner reads.
- chg-Latn does not show the Arabic over its words. It could, by the same means.
