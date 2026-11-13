# 0088. Script tracks: alphabet lessons on a row of their own, beside the path

- Status: Proposed
- Date: 2026-11-09
- Amends: gameplan §3 and §6.3 (`script` nodes); [0087](0087-attic-greek.md) (the grc course)

## Context

The grc course is for a learner who does not read the Greek alphabet well. Ben asked for lessons that
teach it, on a track of their own beside the units.

The gameplan has a node kind for this: `script`, "an alphabet or characters track running alongside the
path" (§3). It is only half built:
- **The compiler** validates and bundles script nodes: `introduces` (`grapheme:` KCs), `convert: {from, to,
  sentences}` and the `script.missing-form` lint. uz (Latin→Cyrillic) and apc (Arabic→Arabizi) each carry one.
- **The runtime ignores them.**
  - `lessonNodes`, `pathNodes` and `plan` all filter them out: the uz and apc tracks have never run.
  - No template credits a `grapheme:` KC, and nothing uses the `write-script` facet.
  - No code transliterates at runtime.
- **The path is strictly linear** (`pathOf`): a node is available once the one before it is done. A
  script node added to `pathNodes` would gate the unit after it.
- **The script templates** that exist work on ruby readings of Han characters and logographs (`char-read`,
  `transcribe`) or on vowel marks (`vocalize`). None teaches an alphabet to someone who cannot read it.

## Decision

**Alphabet nodes.** A `script` node can now teach an orthography from scratch, to a learner who reads the
support language's script, with `alphabet` in place of `convert`:

```yaml
- id: grc.abc.1
  kind: script
  introduces: ['grapheme:α', 'grapheme:ε', 'grapheme:ι', 'grapheme:ο', 'grapheme:τ', 'grapheme:ν']
  alphabet:
    orthography: grc-Grek/polytonic
    words: ['sense:ti', 'sense:nai', 'sense:eti']   # course KCs whose first form these letters spell
```

- **A grapheme KC** gives the letter and its capital as its forms (`grc-Grek/polytonic: [α, Α]`) and its
  name and value as its gloss ("alpha: a"). A diphthong (αι) is a grapheme KC too, and so is a mark (the
  rough breathing: ἁ, ὁ, ῥ; the iota subscript: ᾳ, ῃ, ῳ): the compiler tells them apart by their forms
  (nabu/compiler/script.py), and a word has a mark where any of its letters carries it.
- **Letters are not words.** Grapheme KCs are no glossary entries: a tap on a word never shows "alpha".
- **Every grapheme and word has a Latin spelling.** The compiler writes it with the orthography's
  romanization. A profile names it as `romanize: <scheme>`, and the scheme is code: `greek` is
  nabu.greek_translit, the scholarly scheme set to Attic sounds (η ē, ω ō, υ y, θ φ χ th ph ch, h for the
  rough breathing, accents left out). Latin text is tagged `<lang>-Latn` (`grc-Latn`) and set in the
  support language's font. It is not an orthography a learner can pick.
- **Lint `script.untaught-letter`** (error): a word whose base letters the track has not taught by then.
  Marks are not checked: the words are shown as the course writes them. An orthography whose profile
  names no romanization (or has no profile for the Latin spellings) is `script.no-romanization`, and a
  word with no form in the orthography `script.missing-form`.
- **Bundled:** the node carries `alphabet: {orthography, letters: [{kc, letters, text, latin}], words: [{kc,
  letters, text, latin}]}`. `text` and `latin` are TaggedText; `letters` lists the grapheme KCs taught by
  then that the item is written with, which its exercises credit. The romanized orthography's profile
  (profiles/grc-Latn.romanized.yaml) ships in the bundle beside the course's own.

**Four templates** (`SCRIPT_TEMPLATES`, a record apart from the sentence and KC templates, so no lesson,
review or golden file of any other course changes):

| Template | Facet | Shows | The learner |
|---|---|---|---|
| `letter-read` | read-script | a letter | picks its Latin value from four |
| `letter-pairs` | read-script | five letters and five Latin values | matches them |
| `word-read` | read-script | a word | picks its Latin spelling from four |
| `word-write` | write-script | a Latin spelling | builds the word from letter tiles |

- **Grading.** `letter-read` and `word-read` reuse the char-read exercise (a prompt and options).
  `word-write` reuses the tiles exercise, and its accept set is the word itself.
- **Credit.** These credit the grapheme KCs of the letters shown or built: the node's new letters are
  asked, the others given. Cards are `grapheme:α|read-script|grc-Grek/polytonic`, as §6.3 keys script facets.
- **Distractors** come from the letters and words of this node and the nodes before it: the same idea as
  ADR 0050.
- **After an answer** a word card shows its gloss and plays the word's clip, where the course has one.

**Sessions.** A script node is planned like a lesson: `{mode: "lesson", node}`, with candidates from the
script templates only. Every new letter is presented (the ADR 0050 constraint). Finishing it records
`session_completed` and marks the node done.

**A row of its own.** `scriptNodes(course)` lists a course's alphabet nodes in order, apart from
`pathNodes`.
- The course page shows them as a row above the units: "Alphabet", one entry per node, showing its letters.
- Each node opens when the one before it in the row is done. The row and the units never wait for each
  other, so a learner who reads Greek can skip it, and one who does not can start there.
- Placement does not touch it.

**Not yet:**
- **The convert nodes** (uz, apc). They need a session whose orthography is the `to` one, so that write-script
  cards are filed under it; today an event's cards take the course orthography's. They stay data only.
- **Script cards in review.** Review rebuilds exercises from the sentence and KC templates.
- **Letter clips.** Grapheme KCs have no reading to say.

**grc's track** (courses/grc/units/abc.yaml, a unit with no lessons of its own): eight nodes, ordered so
that each drills up to eight words of the course spelled with the letters taught by then. Words with a rough
breathing or an iota subscript wait for the node that teaches it.

| Node | Teaches |
|---|---|
| 1 | α ε ι ο τ ν |
| 2 | κ σ (ς) λ ρ μ |
| 3 | η ω π δ |
| 4 | υ γ β |
| 5 | φ θ χ (the aspirates) |
| 6 | ζ ξ ψ |
| 7 | the diphthongs αι ει οι αυ ευ ου υι |
| 8 | the breathings (ῥ with the rough one) and the iota subscript |

The accents and capitals are shown, not drilled: an accent changes no Latin spelling, so no "how is this
said?" card can ask about it. They are explained in the letters' notes and the grc profile's marks note.

## Consequences

- **Schema changes:**
  - `PathNodeSource.alphabet`, and the bundle node's `alphabet`;
  - the profile's `romanize`;
  - the four template ids, in the learner-event schema too.

  Then `pnpm codegen`.
- **Other courses are unchanged:** their lessons, reviews, golden files and simulations. Script templates are
  never candidates outside a script node.
- **The exhaustive tables gain the four templates:** instructions, the e2e solver, the true-template and
  prior tables, and the card gallery.
- **Tests:**
  - core (test/script.test.ts): alphabet sessions present every new letter, accept their own solutions,
    and offer only letters and words taught by then; the row opens in order and never gates the path;
  - pipeline: grc's track spells each word with taught letters; a lint fixture for script.untaught-letter;
  - the e2e solver answers the four templates. An e2e run of the first alphabet node and visual
    baselines for the row are left for a run with the app and the pinned container.
