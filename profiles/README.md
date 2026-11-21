# profiles/

Orthography profiles (gameplan §6.3), one YAML file per orthography, validated against
`schemas/orthography-profile.schema.json` by both the TypeScript and Python test suites.

Phase 1: nine profiles, all executed by the engine in `@nabu/core` and pinned by
`conformance/`.
- `fa-Arab`, `yue-Hant-HK` and `uz-Latn` follow §6.3.
- The others (`uz-Cyrl`, `ar-Arab`, `apc-Arab`, `apc-Latn` Arabizi, `tg-Cyrl`, `tr-Latn`) are new.
- Policies marked **REVIEW** are proposals awaiting linguistic sign-off.
- Later: `es-Latn`, `hbo-Hebr` (Tiberian pointing), `lzh-Hant`, and Toki Pona's `tok-Latn` and `tok-Qaap`
  (sitelen pona in the UCSUR's private use block, a private-use script subtag until ISO 15924 assigns one; ADR 0086).
- `chg-Arab.standard` and `chg-Latn.schluessel`: Chaghatay in the Arabic script (the course's one orthography, in
  Nastaliq, with Schluessel's transliteration as ruby: `schemes/schluessel.yaml`, `ruby: word`) and the alphabet
  track's Latin side in Schluessel's transliteration (ADR 0128, 0129).
- `yue-Latn.jyutping`: Cantonese in Jyutping, the characters as ruby (ADR 0126). Written from yue's characters by
  `nabu jyutping`; its words are the syllables of the scheme whose `answer` it is.

Also here:
- `tables/`: generated data tables (`pnpm tables`).
- `keyboards/`: interim layouts for the keyboard typo model (ADR 0025).
- `schemes/`: reading schemes (ADR 0109), one YAML file per scheme (`<id>.yaml`, validated against
  `schemas/reading-scheme.schema.json`): what a profile's reading layer and a course voice's `reading`
  name. `pnpm codegen` copies them into `@nabu/schema/schemes` for core; the pipeline reads them
  (`nabu.schemes`).

A profile with id `<lang>/<slug>` lives in `<lang>.<slug>.yaml`.

## The sound statement (ADR 0148)

What an orthography writes of the sound, and what it loses, stated as data and read by `@nabu/core`
(`packages/core/src/project/`; core-cli `sound-*` and `reading-*`; `conformance/projection.json`). Every
statement is marked REVIEW. Grading reads it (ADR 0148, "What a miss is"; `grade` in
`packages/core/src/match/grade.ts`): a typed word that says what the expected one says is an orthographic
miss by a fixed correspondence and an accepted variant (`CORRECT_VARIANT`) by free ones alone; one with
the same sounds and another stress (*tambien*) is phonemic; and the grade lists the correspondences an
orthographic miss differed by (`<profile id>:<id>`), which the learner fold counts (`state.letters`, never
scheduled). The cards read it: `spelling-choice` takes its options from a profile's `spellings` (and a
profile's homophone characters), `char-read`, `reading-feature` and minimal ruby from the scheme projection's `variants`
and `open`, with the word's spelling where the scheme is stated `of` its orthography (`schemeSpelling`). The
compiler writes each bundle lexeme's `leftovers` from it (`nabu.projections`, through core-cli in batches)
and lists the readings a scheme cannot relate to their spellings as the warning `projection.unaccounted`.
It replaced a profile's `soundAlike` (ADR 0142) and a scheme's `variants` (ADR 0131), both removed.

### The writing side: a profile

```yaml
sound: { from: spelling }          # a word's sound is what the correspondences read off its spelling
stress: { mark: "́", vowels: [a, e, i, o, u], weak: [i, u],
          default: [{ when: { ends: "[aeiouns]" }, "on": penult }, { "on": last }], note: accent }
correspondences:                   # the lossy part only
  - { says: b, written: [b, v], kind: fixed, note: sound-alike }
  - { says: s, written: [c], kind: fixed, when: { before: "[eiéí]" } }
  - { says: s, written: [s, z], kind: fixed }
  - { says: "", written: [h], kind: fixed }
```

- **Preparing a word** (one grading unit, already through `normalize`): NFC; case folded as the profile
  folds (unless `match.case` is none); the marks of `sound.ignores` removed (fa's vowel marks: the unmarked
  spelling is the usual one); where `stress` is stated, the letter carrying `stress.mark` noted and the mark
  removed. Units are grapheme clusters, a format character (ZWNJ) a unit of its own.
- **Reading** (`read`): left to right; at each place, among every correspondence's non-empty `written` forms
  that match there with their `when` holding, the longest wins, the earlier correspondence on a tie (so a
  narrower context is stated before the wider one: c before e or i, then c). `at: start` holds where the form
  begins the word, `at: end` where it ends it; `before` and `after` test the unit right after and right before
  the form, and fail at the word's edge. Where nothing matches, the letter is itself and says itself, with no
  rule. A site is `{says, written, rule, kind, note}`; `rule` is the correspondence's id: its `says`, or `~` and
  its first written form where it says nothing (`~h`); in an event, `<profile id>:<id>`.
- **Stress**: syllables are the sites whose `says` is one of `vowels`; adjacent ones (only silent sites between)
  share a syllable where one is `weak` and does not carry the mark; two strong ones never do. The stressed
  syllable is the marked one, else, in a word of two or more, the first `default` whose `ends` holds of the
  written word's last letter; an unmarked monosyllable has none. So *esta* and *está*, *tu* and *tú*, *día*
  and *dia* say different things, and *háblo* says *hablo*.
- **Comparing** (`compare`): the same where the said sites' `says` are equal in order and the stress is the
  same. Then each place where the written forms differ is listed with its correspondence and kind (a silent
  site on one side only pairs with nothing; a stress mark on one side only is a place of its own, rule
  `stress`). A place is free only where both sides' sites are free; `free` means the same and at least one place,
  every one free (an accepted variant). Identical spellings are the same and not free.
  Where the sounds are the same and only the stress is another (*ke* for *qué*, *tambien* for *también*),
  `same` is false and `sounds` true, and the letter places are still listed: the stress is then the miss, not
  a place of the spelling.
- **Other spellings** (`spellings`): for each site in order, each other non-empty written form of a fixed
  correspondence saying the same, and a silent site dropped; a candidate is kept where reading it back is the
  same and not free (so *quasa* is no spelling of *casa*: qu says k only before e or i). A traded letter keeps
  its capital and the marks preparing took from it. No stress-mark variants.
- `sound: { from: reading, scheme }` says a word's sound is its token's pinned reading in that scheme; core
  compiles it as such, and the writing side's operations refuse it. Grading takes the readings the course's
  tokens pin on the expected spelling (`Spellings.readings`), and a typed spelling says the same where the
  scheme's statement relates it to one of them (`compareByReading`, core `project/by-reading.ts`); a word with
  no pinned reading is not asked the sound question. No profile states it yet.

es (`es-Latn.standard.yaml`) states Cuban Spanish as the course teaches it: seseo, yeísmo, b and v, silent h
(ch apart), g before e or i and j, gu and gü, qu, c and k, the trill, y as the vowel at a word's end after a
vowel, x. fa (`fa-Arab.standard.yaml`) states ADR 0142's sets, its vowel marks ignored.

### The reading side: a scheme

```yaml
of: chg-Arab/standard
correspondences:
  - { says: a, written: [ا, آ], kind: fixed, when: { at: start }, loses: [ä, ā, e, i, u] }
  - { says: o, written: [و], kind: fixed, loses: [ö, u, ü, ū] }
  - { says: a, written: [""], kind: fixed, loses: [ä, e, i, u, ü] }
  - { says: k, written: [ک], kind: fixed, loses: [g] }
```

- A reading is NFC, cut into grapheme clusters and lowercased in the scheme's `lang` (or `language`), each
  cluster's capital remembered; a spelling is NFC, cut into code points (an Arabic letter, a shadda and a ZWNJ
  are each written, and stated, on their own).
- **`spells`**: dynamic programming over both. A correspondence consumes its `says` of the reading (`""`:
  written and not said, a ZWNJ) and one of its `written` forms of the spelling (`""`: said and not written,
  most short vowels), its `when` tested on the spelling. Nothing is implied: a piece or a letter no
  correspondence names fails. The path taken prefers the longest `says`, then the longest written form, then
  the earlier correspondence. A correspondence that says nothing and is written only as nothing is refused.
- **The sets a card may trade within**: each correspondence's `says` with its `loses`. Without a spelling (or a
  scheme without `of`, or a spelling the statement cannot relate), `variants` cuts the reading greedily into the
  longest known pieces (a `says` or a member of a `loses`) and trades each for the other members of every set it
  is in: what a scheme's `variants` sets gave. With a spelling it relates, each site is traded only for what
  the letter written there also writes (another correspondence with that written form whose `when` holds there;
  for an unwritten site, another piece the script leaves unwritten there), and for its own `loses`, and only
  within the piece's sets.
- **`open`**: minimal ruby (ADR 0141): open pieces kept, each run of closed ones a middle dot, spaces kept; ""
  where nothing is open. Tone marks stay the caller's (`openLetters`).
- A scheme without `of` (Pinyin, Baxter) lists a reading per sign: its correspondences only state sets
  (`{ says: ā, written: [""], loses: [á, ǎ, à] }`).

`schemes/schluessel.yaml` relates Schluessel's transliteration to every word of the chg course (see `nabu
projections ../courses/chg` for the readings it does not account for); its first ten correspondences carry the
sets its `variants` had.
