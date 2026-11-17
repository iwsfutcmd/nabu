# 0136. Morphs the script does not write

- Status: Proposed
- Date: 2026-11-17
- Amends: [0061](0061-lemmas-and-morphs.md) (morphs)

## Context

A morph is a span of its word's text, and the spans tile the word. Some morphemes have no span.
- **fa's ezafe** is the kasra on a noun's last letter (کتابِ). It sits inside that letter's grapheme
  cluster, so it cannot be cut out without slicing a grapheme. After a silent -e it is a hamza on the ه
  (خانوادهٔ), in the same position.
- **chg's ezafe** is not written at all in Schluessel's Arabic: ملک is *malik* or *malik-i*.

fa therefore tagged the ezafe on the sentence (`constructions: [construction:ezafe]`, 75 sentences and
story lines). Nothing said which word carried it. Only where a letter writes it (ی after -hā) was it a
morph.

ADR 0135's reading check needs it on the word: in chg the ezafe is the whole difference between two
readings of one spelling. The project owner decided on a morph with no surface.

## Decision

**A morph's surface may be empty** (schemas/tagged-text.schema.json `Morph`), for a morpheme the
script does not write, or writes only as a mark on a letter it shares.
- It is the word's last morph.
- The spans still tile the word: the stem keeps every letter, its marks included.
- It is credited like any other morph, and ADR 0135's check sees *malik* and *malik + ezafe* as two
  forms.

**A tap glosses it as unwritten.** core `glossAt` gives it the whole word as its form and marks it
`unwritten`. The gloss panel shows "not written as letters" where a part's spelling would go, then
its meaning.

**fa moves its ezafe onto its words.**
- 104 words ending in the ezafe kasra or the hamza take `{surface: '', kc: 'construction:ezafe'}`.
  دوستانِ, whose plural ending carries the kasra, takes it after that ending.
- The sentence tags go.
- Every sentence keeps the KCs it had: the 79 sentences that taught the ezafe still do.

## Consequences

- **chg's three ezafe tokens** (*malik-i*, *faqīr-i*, *āwāz-i*) can take the same morph once the course
  has a KC for it. That is left to whoever edits chg's units; ADR 0135 lists them as pending warnings.
- **fa** credits the ezafe to the word that carries it, not to the whole sentence. A feature card can
  now ask about it ("is there an ezafe here?").
