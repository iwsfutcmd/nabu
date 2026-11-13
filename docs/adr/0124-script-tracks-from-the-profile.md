# 0124. Script tracks read letters and marks from the profile, and name their romanized orthography

- Status: Proposed
- Date: 2026-11-13
- Amends: [0088](0088-script-tracks.md) (what a grapheme KC is; the profile's `romanize`)

## Context

ADR 0088 built alphabet nodes for grc's Greek alphabet. The compiler (nabu/compiler/script.py) told
letters from marks with Greek in its code:

- **Marks.** A grapheme KC whose first form was one letter with combining marks was a mark only if
  that letter was one of `αεηιουωρ`, the letters Greek writes breathings and the iota subscript on.
  Every combining character was a mark: a Cyrillic й, ў or ё, a Spanish ñ or a Turkish ç would have
  lost what makes it a letter.
- **Final forms.** Final sigma was a `replace("ς", "σ")` after `lower()`.
- **Letters** were code points. Uzbek oʻ, sh and ch are single letters of the alphabet (gameplan
  §6.3), but sh was two letters here, so every word with sh also had an s.
- **The romanized orthography** was always `<lang>-Latn/romanized`, the language taken from the
  profile's tag.

A track for Biblical Hebrew, Persian, Levantine Arabic, Cyrillic Uzbek or Devanagari would have
needed edits to this shared code. The profile already says all of it. Grading reads its mark set
(`match.marks.set`), its case folding (`match.case`) and its letters (`letters`, longest first, else
grapheme clusters).

## Decision

**Letters and marks are the profile's.** A text's letters are the units core cuts it into (core-cli
`letters`: the profile's normalization, its case fold, its `letters`), without the marks of its mark
set. A unit that is not a letter (punctuation, a space, a digit) is dropped.
- So Σωκράτης is σ ω κ ρ α τ η σ, as before.
- A Cyrillic й stays й, since no Cyrillic profile counts its breve as a mark.
- Uzbek sh is one letter, as `uz-Latn/standard` lists it.

**A mark is a mark of the profile's set.** A grapheme KC whose first form is one letter carrying
marks of the profile's mark set is that mark, whatever the letter: ἁ, ὁ, ῥ is the rough breathing.
A word has the mark where any of its letters carries it. Any other grapheme KC is its letters. No
script's carriers are listed in code.

**Final forms.**
- The profile's case fold makes Greek ς and σ one letter, as it does in grading: core's
  `caseFold`, which the profile's `match.case` turns on.
- A final form that no fold makes one (Hebrew ך beside כ) is listed among its letter's forms. Every
  form of a letter grapheme spells it, as σ, ς and Σ spell `grapheme:σ`, and the track counts each
  of them as taught.

**The profile names its romanized orthography:** `romanize: {scheme, orthography}`, in place of
`romanize: <scheme>`.
- grc-Grek/polytonic has `romanize: {scheme: greek, orthography: grc-Latn/romanized}`.
- Nothing is derived from the language tag: a second romanization of one language, or one tagged
  otherwise, is a profile's choice.
- The scheme is still code (`ROMANIZERS` in nabu/compiler/script.py).

**Lint `script.no-letter`** (error): a grapheme KC whose first form has no letter. Examples are a
spacing breathing (῾) or a mark written on no letter. Such a KC would have been in every word,
since an empty spelling is found everywhere.

## Consequences

- **grc's track compiles exactly as before**: every word's letters, every item's `letters` and every
  Latin spelling are unchanged. All 241 grc KC forms read the same letters and marks either way.
- **grc's bundle changes in one file.** Its grc-Grek/polytonic profile carries `romanize` in the new
  shape, which also changes the manifest and apps/web/public/bundles/index.json. Run `pnpm bundles`
  after this change.
- **Schema:**
  - schemas/orthography-profile.schema.json: `romanize` is a `Romanization` object;
  - then `pnpm codegen`.
  - Nothing at runtime reads `romanize`: the Latin side of each letter and word is TaggedText
    tagged with the orthography.
- **A new alphabet track needs:**
  - the profile's mark set, and its `letters` where the script has multigraph letters;
  - a romanization scheme in code;
  - a profile for the romanized orthography.

  It needs no edit to the track's compiler.
- **The compiler asks core-cli** for each grapheme form and word: `letters` and the profile's mark
  set (`unicode-set`). Core is where the profile's normalization, folding and letters already live.
  These are a few hundred calls for grc.
- **Not yet:**
  - the convert nodes (uz, apc), as ADR 0088 says;
  - an alphabet track for any course but grc. None is added here.
