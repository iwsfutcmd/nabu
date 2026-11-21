# 0153. Projections and misses, as built

- Status: Proposed
- Date: 2026-11-21
- Amends: [ADR 0148](0148-projections-and-misses.md) (the shape of the statement, which it left to the build;
  its "Done in one go" point 3; how a verdict is read off the labels; when the sound question is asked),
  [ADR 0146](0146-what-is-learned.md) (a spelling or reading leftover is no part id of its own)
- Builds on: [ADR 0145](0145-lexical-model.md), [ADR 0147](0147-underspecification.md) (not built: the label scope waits
  for it), [ADR 0149](0149-script-first.md) (not built: a correspondence that keeps coming back reopens
  nothing yet)

## Context

ADR 0148 decided that an orthography's losses are stated once, as data core runs, and that a miss is a set
of labels. Stages 5 and 6 of the switch built it (docs/migration-design.md, "Stages 5 and 6"). Building it
meant settling what the ADR left open and, in a few places, reading it narrowly. Each of those is listed
here so the owner can accept or overrule it; nothing here was decided by anyone but the builder.

## Decision

### The statement

- **A letter no correspondence names says itself.** A profile lists only what is lossy; an orthography that
  loses nothing states `correspondences: []`. `says` is a sound in the profile's own notation, only ever
  compared for equality, and may be empty (a letter written and not said: Spanish h).
- **`sound` says where a word's sound comes from:** its spelling, read forwards by the correspondences
  (`from: spelling`; `ignores` names marks the reading leaves aside, as fa's vowel marks), or its token's
  pinned reading in a scheme (`from: reading`), related to the spelling by that scheme's statement. A
  profile with no `sound` is never asked the sound question (characters, logographs, the support language).
- **`stress`** (es): the mark, the vowels, which of them are weak, and where an unmarked word is stressed.
  Stress is made explicit before two spellings are compared, so which accents carry sound falls out of the
  projection, as ADR 0148 asked: *tambien* says another thing than *también*, *exámen* the same as *examen*.
  An unmarked monosyllable has no stress and a marked one has: *tu* and *tú* differ (ADR 0148's own *ke* for
  *qué*), and so ✗*fé* for *fe* is called phonemic, where a speaker hears no difference. REVIEW.
- **A scheme's statement is a relation** between its reading and the spelling of the orthography it names
  (`of`): each piece with the ways the script writes it, `""` where it does not. There nothing is implied.
  A scheme over a script that lists a reading for each sign states no relation, only the sets a reading
  card may trade within (`loses`: Pinyin's tones of one vowel).
- `soundAlike` and a scheme's `variants` are gone. `match.marks`, `equivalences`, `variants` (the table of
  character variants) and `typo` stay: matching policy.

### What the bundle carries

- **No phonemic form is shipped.** ADR 0148 ("Done in one go", point 3) has the compiler put each accepted
  answer's phonemic form in the bundle. As built, the device reads the expected spelling forwards exactly as
  it reads the typed one, or takes the pinned reading the bundle's tokens already carry: the same answer,
  with nothing added to a bundle and no second place for a sound to be wrong in. The compiler does write
  each lexeme's `leftovers` (the orthographies in which a fixed correspondence could have spelled it
  otherwise; the schemes in which its letters leave its reading open) and reports, as the warning
  `projection.unaccounted`, each pinned reading a scheme's relation cannot relate to its spelling.
- The bundle format is 4.

### What a miss is

- **Labels** as ADR 0148 lists them, the worst first: lexical, grammatical, regularised, scope, order,
  phonemic, orthographic, slip. `order` joins the event schema. **regularised** and **scope** are defined
  and never produced: no lexicon ships regularised forms until rules are written, and scope needs ADR 0147's
  prompt tags.
- **The sound question is asked only of an attempt at the word:** a typed word that says the same, shares a
  lexeme with the expected one, or is within half the longer word's letters of it. So *gato* for *perro* is
  lexical alone, as ADR 0148's table has it, and not phonemic too. A miss nothing else labels is lexical:
  every miss has a label.
- **The same sounds with another stress** are phonemic, and orthographic too where a letter differs (*ke*
  for *qué*).
- **Verdicts are views of the labels.** A slip alone is `CORRECT_WITH_TYPO`. Not accepted: `PARTIAL` where
  every miss is a homophone character (yue, as before); `WRONG_WORD` where every miss is explained by a
  slip, by the same sounds, or by marks (marks that make another word of the course; or, where the profile
  states its sounds, marks that alone differ); else `WRONG`. The judge is asked about `WRONG` alone, which
  keeps its reach as ADR 0148 asked with no change to the gate: *bolber*, *tambien* and *pinguino* are never
  the judge's. `WRONG_WORD` therefore no longer means "another word", and the feedback's headline follows
  the labels instead.
- **Whose form** is decided by the lexemes and forms the course's tokens write under a spelling, never by
  the string: another spelling of the same lexeme in the same form is no other word.

### Credit and the fold

- **A leftover is no part id.** ADR 0146 counts a word's spelling or reading leftover as a part of it. As
  built it is the lexeme by the skill `write-script` or `read-script` in that orthography, which is how the
  fold already keeps a spelling-choice or a reading card: the right sound with the wrong letter shows the
  word (by the card's skill) and misses its spelling; a typed word that is right shows its spelling where
  the bundle says it has a leftover. Known words are counted as before (ADR 0100).
- **Every orthographic miss counts against its correspondence** (`<orthography>:<id>`, on the event and in
  the fold's `letters`), whether or not a rule decides that spot; ADR 0148 counts only the spots a stated
  rule decides and leaves the rest to the word. The count schedules nothing, and nothing reopens a script
  track yet (ADR 0149).

## Consequences

- Spanish is stricter, as ADR 0148 said it would be; and wherever a profile states a fixed correspondence.
- Every statement is a draft marked REVIEW until the owner signs it off, as profiles' policies are.
- If the owner wants the phonemic form in the bundle after all (a voice or a speech scorer reading it), the
  compiler can write what `sound-read` returns per lexeme: the operation exists.
