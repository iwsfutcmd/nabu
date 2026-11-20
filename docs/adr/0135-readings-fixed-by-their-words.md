# 0135. Readings fixed by their words

- Status: Accepted (2026-11-18)
- Date: 2026-11-17
- Amends: [0117](0117-pinned-readings-on-kc-forms.md) (where readings come from), [0087](0087-attic-greek.md)
  (grc's spelling check)
- Decided, not yet built (ADRs 0145–0151, accepted 2026-11-20), to amend this: [0145](0145-lexical-model.md)
  (a reading is a projection of a lexical form)

## Context

Every course pins a reading per word token (Jyutping, the Tiberian reading, Attic with its lengths,
Schluessel's transliteration), and its vowel marks where it has a vocalization. Until now nothing checked
two tokens of one word against each other. A mistyped reading on one token went unnoticed unless someone
saw its ruby or heard its clip.

The sources-of-truth study (docs/sources-of-truth.md) found that a reading is almost always fixed by the
word's spelling, sense and morphs. What was left over was a distinction the course had not annotated, or
a mistake. The project owner decided:
- the compiler enforces this, switched on per course once the course is clean;
- a form pinned once fills its other tokens (grc's Attic lengths);
- grc keeps its Greek text and Attic readings both, with the compiler checking one against the other.

## Decision

**The reading check** (nabu/compiler/consistency.py):
- **Grouping.** Every word of every sentence and story line is grouped by how it is annotated:
  orthography, spelling as written, sense, form, morphs' KCs, `context`, and whether it is bound to the
  next word.
- **What is compared.** Its readings in each scheme, compared without capitals (a sentence's start or a
  title is no other reading). In an orthography with a vocalization, its marked form too.
- **What is reported.** A group read two ways is reported once, with each reading's count and first
  place.
  - In a course with `consistentReadings: true` it is `reading.inconsistent`, an error.
  - Elsewhere it is `reading.inconsistent-pending`, a warning.
- **Free variation** is declared on the token (`readingVariant: true`), and the check leaves it out.

**Context the text does not show** is a token's `context`: a label for what the source's accents
encode where the course's text leaves them out.
- hbo labels four tokens: three pausal ʾānṓḵî (`pause`), and qā́rāʾ before láylâ (`nesiga`).
- Each context is compared apart.

**Bound words.** A reading scheme may say how it marks a word bound to the next: the Tiberian reading's
`bound: {mark: "-", before: "־"}`.
- A reading must end with the mark exactly where the next token holds the maqaf (`reading.bound`). All
  270 bound words in hbo do.
- A bound word is compared apart from a free one: it can read otherwise, being unstressed (saʿar- before
  a maqaf, sáʿar free).

**Filling in.**
- Before forms compile, the compiler collects, for each annotated form and scheme, the reading every
  pinned token gives it.
- A token that pins none takes that reading, unless the pinned tokens disagree (or are free variants).
- So a form is pinned once. Readings still come only from the course's own tokens (ADR 0117): nothing is
  guessed.

**Spelling.**
- A scheme whose readings spell their words has a `spelling` plug-in (Attic: `attic.surface`, the
  reading without its lengths).
- Every token's reading, and every KC entry's own reading (to its citation form), must spell its word
  (`reading.spelling`). This was a pytest for grc; it is now a compile error with file and line.

**Switched on:** apc, es, fa, grc, lzh, tok and uz compile clean and set `consistentReadings: true`.

## Consequences

- **What the check found.** The three courses left are not switched on; each reports what it found.
  - **yue:** one 呀 reads *aa4* (係你呀？ "Is it you?"), the question particle, against 141 *aa3*. It wants
    its own sense KC, as decided.
  - **hbo:** וְנֵדְעָה reads *wənēḏəʿâ* in sentence s.18.12 and *wənēḏʿâ* in the Jonah 1:7 story line,
    from one word of the Codex. One of them is wrong; which depends on the Codex's meteg, for a person to
    check.
  - **chg:** eight groups.
    - Three are the ezafe: *malik / malik-i*, *faqīr / faqīr-i*, *āwāz / āwāz-i*. They wait for the
      ezafe as a morph with no surface.
    - Five look like data questions: *yer / yär*, *yol / yul*, *suyi / süyi*, *šahargä / šaharǧa*, and
      a *tizigä* pair.
- **Lints and fixtures.** Four new lints, each with a fixture:
  - `reading.inconsistent` and `reading.inconsistent-pending` (the yue fixture reading 我哋 two ways);
  - `reading.spelling` (ναί read νεί);
  - `reading.bound` (a new hbo fixture: עַל before a maqaf without its hyphen).
- **Bundles are unchanged.** `context` and `readingVariant` stay in the sources; the compiled tokens are
  what they were.
