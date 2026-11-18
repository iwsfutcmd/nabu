# Grammar notes: a plan

- Date: 2026-11-18
- Status: proposed plan, for Ben to accept, reorder or cut. An ADR records what is accepted, once it is decided.

Each course gets a **Grammar** section: a reference a learner can open at any time, with the same
layout in every course. It holds conjugation and declension tables, pronoun and particle lists,
adpositions and case endings, and short explanations. A learner of two courses finds pronouns in
the same place in both, laid out the same way. Only the language differs.

The plan in one paragraph:
- Notes are course content: YAML beside the units, compiled, linted, with provenance and a license.
- They are built from a few typed blocks (text, table, list, examples, pairs, callout, plus blocks
  generated from the course's data), never free markdown.
- Every piece of target-language text in a note is compiled the way a sentence's tokens are, so
  `<T>` renders it, a tap glosses it and readings show over it.
- Tables are filled from the course's own tokens, by sense and by the features each form KC marks.
  The compiler checks any cell an author writes against those tokens, so a table can never
  contradict a lesson.

---

## 1. What there is to build on

| What | Where | What it gives us |
|---|---|---|
| 1,548 KC `notes` (all `en`), many already small grammar notes (es `form:subj` runs to 560 characters) | unit YAML; `schemas/course-source.schema.json:296` | Content to start from. **The compiler drops them**: `_bundle_unit` copies no `notes` (`pipeline/src/nabu/compiler/build.py:1593-1619`), `BundleKc` has no field for them, and nothing reads them. They are bare strings that mix English with target text (*"Son las dos y media: it's half past two"*). |
| 262 form KCs (apc 46, chg 58, es 23, fa 15, grc 42, hbo 49, uz 28, yue 1) and 26 construction KCs | unit YAML | The cells' meanings. Each has an English `gloss` and often a note, but **no features**: the ids follow each course's own convention (`pres-1s`, `f-pl-cstr`, `dat-ga`). The only code that reads an id's shape is the contrast `forms` prefix match (`packages/core/src/match/compare.ts:236`). |
| Forms attested by sense and form signature | `formSignature` (`packages/core/src/lesson/signature.ts:19`); `attestedFor` (`templates.ts:661`); the compiler's `_Compiler.attested` (`compiler/stories.py:136`) | Paradigm tables for free. Senses with more than one attested signature: es 232, chg 187, hbo 172, apc 121, uz 80, grc 79, fa 53, with up to 22 signatures on one sense. |
| Morphs whose surfaces concatenate to the token; `glossAt` shows them | `tagged-text.schema.json:98`; `packages/core/src/story/story.ts:217` | Stem and ending boundaries without counting characters. |
| `pos` on every sense KC; UD `features` on lexical subsets (PronType, NumType, PartType, NounType=Clf) | `common.schema.json:56-71` | Pronoun, particle and classifier lists by query. |
| `typo.contrasts` in profiles: person, case and possessive endings, pronouns (REVIEW) | `profiles/uz-Latn.standard.yaml:32`, `hbo-Hebr.tiberian.yaml:37` | The endings that carry meaning, already listed per course. Feedback can link to them. |
| Language-tagged segments (`support`, `target`, `ref`) and `ExplanationView` | `schemas/ai.schema.json:76`; `packages/ui/src/ai/Explanation.tsx:26` | A model for mixed support and target text with the right `lang`, `dir` and font. |
| The word list | `apps/web/src/Words.tsx`; `@nabu/ui/words`; `@nabu/core/learner` `learnedWords`, `wordMatcher` | The model for a per-course page: route, `CourseUiProvider`, an IME-safe search, ruby never faded. |
| Reading schemes with tone names and contours; profile letters | `profiles/schemes/*.yaml`; core-cli `letters` | Tone charts and letter tables without authoring. |
| "What a wrong word means" in feedback (*hablas: to speak; present tense: you (tú)*) | ADR 0121 | The natural place for a "see the table" link. |
| What each unit teaches: es README's Grammar column, 622 lines of unit header comments | `courses/es/README.md:143`; `courses/*/units/*.yaml` | Drafting input for `unit:` and `about:` (not parsed). |

**What is missing:** prose at course level, any table structure, features on form KCs, any
shipping of KC notes, and lazy loading for anything but media (every non-media bundle file is
fetched when a course opens: `packages/ui/src/player/load.ts:40`).

The gameplan foresaw this. §7.1 has `notes?: Record<LangTag, TaggedText>` on a KC, and §7.2 says
grammar notes differ by support language, so they are per layer. This plan builds both.

---

## 2. Principles

1. **One design, the data per course.** The sections and block kinds are fixed, and the
   components are shared. A course chooses which notes to write; it never chooses a layout.
2. **Notes are content.** They are YAML in `courses/<id>/grammar/`, compiled and linted. Each note
   carries provenance (drafts are `llm:`, status draft) and an SPDX license. Release builds keep
   only reviewed notes (ADR 0073).
3. **Target text is never a bare string.** Every quote, cell and example is compiled into
   `TaggedText` as a sentence form is. That means NFC, the script audit, tokens with sense, form
   and readings, vocalization and reading consistency (ADR 0053, 0135).
4. **Tables come from the course.** Cells are looked up among the course's tokens. A cell an author
   writes is checked against them. Nothing in a note contradicts a lesson.
5. **Structured, never free markdown.** Gameplan §13.3 says the same of explanations, and for the
   same reasons: mixed `lang`, bidi isolation, fonts, taps.
6. **A note belongs to its support language; the page around it belongs to the UI.** The note's
   title, prose and table headers take the support language's `lang` and `dir`. The back link,
   section headings and search take the UI locale. Explanations work the same way.
7. **A reference, never a gate.** Every note is open from the start (D6: never block). Progress
   only *marks* things ("Unit 9", "later in the course"). It is read from the log, never stored.
8. **Facts from references, never their text.** Notes cite books by author, title and year. Nothing
   from the private library enters the repo or the bundles (ADR 0079).

---

## 3. What a learner sees

### 3.1 Ways in

1. **The course page.** A *Grammar* link in the row under the title, next to *Words* (ADR 0120).
   It shows only when the manifest says the course has notes.
2. **Each unit on the course page.** A "Notes for this unit" line under the unit heading lists
   the notes whose `unit` it is. This is the role of Duolingo's guidebook, but as a reference, not
   a lesson.
3. **A tapped word** in a lesson, story or feedback:
   - The gloss panel's form line (*present tense: you (tú)*) gains *See the table* when a note's
     table holds that cell.
   - The word's own note (its KC note) shows under the gloss, folded after two lines.
   - During a session the note opens in a sheet over the card, never as a navigation. A running
     session holds the route (ADR 0108), and closing the sheet returns focus to the word.
4. **Feedback.** When the learner's wrong word and the right word are two cells of one table
   (ADR 0066's contrasts are the typical case: *talabasan* for *talabaman*), feedback adds
   *Compare in the table*. The sheet opens with both cells marked: the learner's with
   `highlight`, the right one with `emphasis`.
5. **The word list.** A word with a table links to it.
6. **Search** on the Grammar page, by topic in the support language ("past", "plural") or by a
   form ("hablé" finds *hablar*, preterite, I). It reuses `wordMatcher` and the grader's lexicon,
   so no new matching is needed. If any new folding is needed, it gets conformance vectors in
   both harnesses.

### 3.2 The index: the same sections in every course

| Section | Heading (en) | What goes there | For example |
|---|---|---|---|
| `writing` | Writing and sounds | letters, marks, what the script leaves out, tones, readings | chg's open vowels and k/g; yue's tones; hbo's points; fa's unwritten ezafe |
| `pronouns` | Pronouns | personal, suffixed and object pronouns, demonstratives, question words | es *yo / me / mí*; hbo suffixes; apc *-i, -ak, -ik* |
| `nouns` | Nouns | gender, number, case or state, articles, classifiers, possession | grc's article; hbo's construct state; yue's classifiers; uz case endings |
| `describing` | Describing | adjectives, agreement, comparison | es and apc agreement (*kbir → kbire*) |
| `verbs` | Verbs | conjugation, tense, aspect, mood, stems, the copula | es tenses; hbo *qatal / wayyiqtol*; uz *-yap*; chg's past |
| `relations` | Places and relations | prepositions, postpositions, case endings as relations, prepositions with suffixes | es *a, de, en*; uz *-ga, -da, -dan*; hbo *bə-, lə-*; lzh 於 |
| `particles` | Particles | sentence-final and discourse particles, conjunctions | yue 呀 啦 喇; lzh 也 矣 乎; tok *li, e, la, pi, o* |
| `numbers` | Numbers and time | numerals, counting, telling the time, dates | es u05; yue numbers with classifiers |
| `sentences` | Sentences | word order, questions, negation, commands, clauses | lzh's object pronoun before the verb after a negative; tok *la*; uz *-mi* |
| `usage` | Register and variation | politeness, T–V, regional and heritage variation | es Cuban and pan-Hispanic; uz *sen / siz*; chg *sän / siz* |

- The order is fixed, and an empty section does not show.
- Within a section, notes go in course order: by unit, then by file order.
- A note sits in one section and may also be listed in another (`also: [relations]`), so uz's case
  endings are found under both Nouns and Places.
- Section headings are chrome: MF2 messages `grammar.section.<id>`, in the UI locale.
- Each entry shows the note's title, its unit ("Unit 9"), and "later in the course" if the
  learner has not reached that unit yet. That last mark is computed from the fold's done nodes.
- A draft badge shows until the note is reviewed, as the demo labels drafts.

### 3.3 A note

A note page has, in order:
- the back link and the title (h1);
- the draft badge and "Taught in Unit 9: *¡Ayer!*";
- its blocks;
- *Where you meet this*: the unit's lessons and stories, linked on the course page;
- related notes;
- *Based on*: the sources, by author, title and year.

Reporting a mistake in a note comes later (§9, G8).

### 3.4 Tables

- **Markup.** A real `<table>` with a `<caption>` and `<th scope>`. Screen readers then read a cell
  with its headers ("first person singular, present: hablo"). Headers are terms ("1sg", spelled
  out for assistive technology) or the course's own words: an es row is headed *yo*, *tú*, *él /
  ella / usted*, taken from the course's person grid (§5.4). It is a plain table, not React Aria's
  interactive `Table`: its only controls are the word buttons `<T onTokenPress>` already makes.
- **Cells.** Each cell is a `<T>`:
  - Ruby follows the learner's chosen layer and is never faded, as in the word list. lzh's
    tradition choice (ADR 0138) applies. chg's word ruby keeps its line spacing (ruby-lift).
  - The learner's marks choice (show or hide vowel marks) applies, as it does to every `<T>`.
  - A tap opens the gloss panel (`glossAt`): lemma, morphs, form.
- **Endings.** Endings are marked only where the data splits the word: its morphs, or an authored
  stem, split on morph surfaces and never on a character count.
  - Scripts whose letters do not join (Latin, Greek, Cyrillic, Hebrew, Han) mark the ending
    inside the word.
  - Joining scripts (Arabic, Nastaliq, and any later Syriac, Mongolian or N'Ko) never wrap part of
    a word in its own element (gameplan §6.8). They show the ending in its own column beside the
    word, as word-write shows a spelled word whole (`data-spelled-word`).
  - Whether a script joins comes from the generated script metadata, as direction does.
- **Narrow screens.**
  - A wide table scrolls inside its own region (`overflow: auto`, `role="region"`, focusable,
    named by its caption), with row headers sticky at `inset-inline-start`. This mirrors itself in
    RTL with no extra code.
  - A table with a third dimension (tense, case) shows one slice at a time behind a segmented
    control.
  - The lint `grammar.wide-table` warns at more than five data columns without a slice.
  - Layout switches with container queries on the table's own inline size, not the viewport's.
- **Sound.** A lemma header plays the word card's clip where `course.audio[kc]` exists, as
  `audio.quality` allows (ADR 0091: iffy clips play where the text is shown, which it is here;
  bad, none).
- **Several spellings.** The commonest attested spelling is the cell, and the others show below it
  as "also" (apc ـه / ـو).
- **One spelling in two cells** is shown in both (apc *ru7t*, 1sg and 2ms).
- **Cells the course does not use yet** look like any other cell to a learner. Debug mode outlines
  them dotted for reviewers.

### 3.5 Direction and writing modes

- **The note takes its support language's `dir`.** An English note on Hebrew reads left to right,
  with each Hebrew cell isolated right to left by `<T>`. A future Persian support layer flips the
  whole table with no code change, because every rule is logical (stylelint).
- **Three directions can nest:** ar-XB chrome, around an English note, around Persian cells. The
  visual matrix covers that case.
- **Vertical text.** The Grammar page stays horizontal, like the word list ("a list is not set in
  columns").
  - Example blocks in yue and lzh follow the learner's vertical choice where the profile's
    `verticalScope` includes `reading`, as story transcripts do.
  - Tables are built axis-agnostic (logical properties, no physical sizes), so a table inside a
    `vertical-rl` container turns its rows into columns.
  - One Storybook story sets a table vertical under a CJK pseudo support layer, to keep that
    honest. Turning it on for learners waits for a support language that writes vertically.

---

## 4. Content model

### 4.1 Files

```text
courses/es/
  course.yaml            # grammar: grammar/index.yaml   (a path, as vocalization's is)
  grammar/
    index.yaml           # the course's person grid and other axes, term overrides, its note files in order
    present.yaml
    preterite.yaml
    pronouns.yaml
    ser-estar.yaml
```

`index.yaml`:

```yaml
license: CC-BY-SA-4.0
provenance: {author: 'llm:claude@…', status: draft}
# The axes every table of the course uses (§5.4). Rows are labelled with the course's own words.
# Cuban Spanish has no vosotros row.
presets:
  persons:
    - {features: {Person: '1', Number: Sing}, label: 'sense:yo'}
    - {features: {Person: '2', Number: Sing}, label: 'sense:tú'}
    - {features: {Person: '3', Number: Sing}, label: ['sense:él', 'sense:ella', 'sense:usted']}
    - {features: {Person: '1', Number: Plur}, label: 'sense:nosotros'}
    - {features: {Person: '3', Number: Plur}, label: ['sense:ellos', 'sense:ustedes']}
# What a token with no form KC is: a masculine singular noun, an infinitive.
defaults: {Gender: Masc, Number: Sing}
notes: [present.yaml, preterite.yaml, pronouns.yaml, ser-estar.yaml]
```

A note, `present.yaml`:

```yaml
id: present
section: verbs
unit: u01                     # where the course starts teaching it
about: ['form:pres-1s', 'form:pres-2s', 'form:pres-3s', 'form:pres-1p', 'form:pres-3p']
title: {en: The present tense}
provenance: {author: 'llm:claude@…', status: draft}
license: CC-BY-SA-4.0
sources:
  - {author: Butt and Benjamin, title: A New Reference Grammar of Modern Spanish, year: 2011}
blocks:
  - text:
      en: >-
        The ending says who does it, so the pronoun is often left out: {hablo} is "I speak",
        {hablamos} "we speak". Take {-ar}, {-er} or {-ir} off the infinitive and add the ending.
  - table:
      id: regular
      words: ['sense:hablar', 'sense:comer', 'sense:vivir']   # a column each
      rows: persons
      where: {Tense: Pres, Mood: Ind}
      stems: {'sense:hablar': habl, 'sense:comer': com, 'sense:vivir': viv}
  - callout:
      kind: variation
      en: >-
        Cubans say {ustedes} to any group of people, so the course has no vosotros row
        (Spain's {habláis}).
  - examples: [s.u01.12, {sentence: s.u03.4, mark: [1]}]
```

(The sentence ids are illustrative. The KC ids are the course's own.)

### 4.2 Blocks

| Kind | For | The author writes | The compiler adds |
|---|---|---|---|
| `text` | explanation | support-language text with inline quotes (§4.3), per support language | segments, with tokens and glosses on the quotes |
| `table` | paradigms, pronoun grids, suffix tables | words or KCs; rows, columns and slices as axes (presets or features); `where`; optional cells and stems | each cell found in the course and checked; the morph split; readings |
| `list` | pronouns, prepositions, particles, classifiers, question words | KC ids, optionally a note and an example sentence each | forms in every orthography, gloss, clip |
| `examples` | sentences that show the point | course sentence ids, with the words to mark (index among the form's words plus surface, as corrections address words); or a local example with its own translation and provenance | text, translation, clip, review status |
| `pairs` | contrasts: *ser / estar*, 呀 *aa3 / aa4*, with and without the ezafe | two to four quotes or sentence ids, each with its meaning | as examples |
| `callout` | tip, caution, variation (Cuban and elsewhere), history | a kind and support text | segments |
| `letters`, `tones` | the writing section | the block alone | letters with their readings (the script track's data); tones with names, pitch letters, a drawn contour and one attested syllable each (scheme data) |
| `forms` | every form of one word the course uses | a KC id | its attested cells, arranged by the form KCs' features |

Local examples are allowed, but course sentences are better: they are reviewed, have clips, and a
sign-off covers them once.

### 4.3 Target text inside prose

The prose is support-language text with a small inline syntax. The compiler turns it into
segments: `support`, `target` and `link`.

| Write | Means |
|---|---|
| `{hablo}` | Target text in the note's orthography (default: the course's first). It is split by the profile's segmentation, and each word is looked up in the course's lexicon, so it carries sense, form and readings and a tap glosses it. A spelling that is no word of the course (*habláis*) is allowed; it just has no gloss. |
| `{=sense:hablar}`, `{=sense:hablar form:pret-1s}` | A word by its analysis: the KC's form, or the attested form. Written once, it shows in whichever orthography the learner reads (uz Latin or Cyrillic, apc Arabic or Arabizi, yue characters or Jyutping, tok Latin or sitelen pona). |
| `{-ga}`, `{bə-}` | An affix. The hyphen marks the side it joins on. It is matched against the morph surfaces of form KCs. |
| `{*mi tengo}` | An ungrammatical example, with the linguist's star. It renders with the star, is announced as incorrect, and is never glossed. This is why `*` is not used for emphasis. |
| `[[pronouns]]`, `[[present#regular]]` | A link to a note, or to a table in it. |
| `\{` | A literal brace. |

There is nothing else: no emphasis, headings or HTML.

**Courses with several orthographies.** A literal quote must also be spelled in each of the
course's other orthographies, in one of two ways:
- resolved: the spelling is one word of the course, and its sense and form are attested in the
  other orthography;
- given: the note's `quotes:` table lists it (`quotes: {maktabga: {uz-Cyrl/standard: мактабга}}`).

Otherwise `grammar.quote-unresolved` fires.

**Catching untagged target text.** `grammar.untagged-target` flags a run of the target's script
outside braces. The check is cheap and sure wherever the target's script differs from the
support language's (fa, hbo, yue, lzh, chg, grc, apc-Arab, uz-Cyrl, tok sitelen pona). Where both
are Latin (es, uz-Latn, apc Arabizi, tok-Latn), it is review's job. The migration tool (§6.4)
proposes quotes from the lexicon.

The same segments render notes and explanations: `ExplanationView`'s body becomes a shared
`<Segments>` component.

### 4.4 Tables: what fills a cell

**Form KCs get `inflection`:** the UD features they mark. This is a new field, separate from
sense KCs' lexical `features`, so ADR 0132's word questions are unaffected.

```yaml
- {id: 'form:pres-1s', inflection: {Tense: Pres, Mood: Ind, Person: '1', Number: Sing}, gloss: …}
- {id: 'form:dat-ga', inflection: {Case: Dat}, gloss: …}                                     # uz
- {id: 'form:poss-1sg-im', inflection: {'Person[psor]': '1', 'Number[psor]': Sing}, gloss: …}  # uz
- {id: 'form:f-pl-cstr', inflection: {Gender: Fem, Number: Plur, Definite: Cons}, gloss: …}  # hbo
- {id: 'form:wayyiqtol-3ms', inflection: {Conjugation: wayyiqtol, Person: '3', Gender: Masc, Number: Sing}, gloss: …}  # hbo; Conjugation is the course's own feature (§4.5)
- {id: 'form:f-acc', inflection: {Gender: Fem, Case: Acc}, gloss: …}                         # grc
```

UD because `pos` and `features` are already UD (ADR 0132), and UD has layered features for
possessors (`Person[psor]`). UniMorph would be a second vocabulary.

**A cell is a feature bundle:** its row's, column's and slice's features plus the table's `where`.
The compiler goes through every word token of the course's sentences and story lines. A token
fills a cell when:
- its sense is the cell's word;
- the inflection of its form signature, taken together with the course's `defaults`, equals the
  bundle.

Morphs of *other* senses are left out unless the table asks for them. These are clitics: hbo's
*lə-*, apc's *el-*, which today sit in the signature (hbo לֵאמֹר is `form:inf` plus `sense:le`).
Spellings are compared as grading compares two units without a slip: case, and the profile's
silent folds (grc grave = acute, a vocalization's marks).

Then:
- **one spelling:** that is the cell (attested);
- **several spellings:** the commonest is the cell, and the rest are shown as "also";
- **none:** the author gives the cell in `cells:`. It is compiled as a one-word form (readings,
  vocalization, the script audit) and marked unattested for reviewers. The author can also write
  `none` for a form that does not exist (a defective verb, a person the variety lacks).
  Otherwise `grammar.empty-cell` warns.

An authored cell for a bundle the course does attest must be one of the attested spellings
(`grammar.cell-mismatch`, an error).

Where a course's form KC leaves the person out, an authored cell has only to be one of that KC's
spellings for the word (`grammar.cell-underspecified`, info). es `form:impf` holds *era, eras,
éramos* without person.

**Stacked suffixes** (uz, chg, fa) are an unordered signature. The cell's morph order comes from the
token's `morphs`, which keep it.

### 4.5 Axes and terms

- **Presets** are a course's named axes in `grammar/index.yaml`: `persons`, `cases`, `genders`,
  `numbers`, `states`. Each is a list of feature bundles, with labels.
  - es: five persons.
  - hbo: 3ms, 3fs, 2ms, 2fs, 1cs, 3mp, 3fp, 2mp, 2fp, 1cp, labelled with its pronouns.
  - apc: 1s, 2ms, 2fs, 3ms, 3fs, 1p, 2p, 3p.
  - grc: nominative, genitive, dative, accusative, vocative.
  - uz: nominative, genitive, accusative, dative, locative, ablative.

  Defining these once is what makes every table of a course line up with every other.
- **Terms** are a shared vocabulary of UD features and values: `profiles/grammar/terms.yaml`,
  with its schema in `schemas/`. Each term has a full name and an abbreviation per language
  ("first person singular", "1sg"), with provenance per language as scheme names have (ADR 0109).
  `@nabu/i18n` names.ts reads them (`termName`) in the note's support language, falling back as
  names do.
- **A course may name its own terms**, where a tradition has names learners will meet in every
  grammar:
  - hbo: a `Conjugation` feature with *qatal, yiqtol, wayyiqtol, weqatal*, and the stems by their
    names;
  - "construct state" rather than UD's *Cons*.

  A feature that is neither UD's nor declared by the course fails with `grammar.unknown-feature`.

### 4.6 Three more shapes

**uz: suffixes, two scripts.**

```yaml
- table:
    id: cases
    words: ['sense:maktab', 'sense:park']
    rows: cases
    caption: {en: 'Case endings: {=sense:maktab} "school", {=sense:park} "park"'}
```

- In uz-Latn the cells are *maktab, maktabning, maktabni, maktabga, maktabda, maktabdan*, and
  *park … parkka …*, which shows the *-ka* allomorph.
- In uz-Cyrl they are the Cyrillic tokens' own: *мактабга, паркка*.
- The endings are marked from the morphs.
- The caption's quotes are by analysis, so they need no `quotes:` entry.

**hbo: right to left, points, mostly unattested.**

```yaml
- table:
    id: amar
    words: ['sense:amar']
    rows: persons
    columns: {Conjugation: [qatal, yiqtol, wayyiqtol]}
```

- The course attests some cells, such as *wayyōʾmer* (3ms).
- The author fills in the rest from Joüon–Muraoka. Each cell is copied pointed from a reference and
  checked with `nabu tiberian`, with its Tiberian reading pinned like any token's (ADR 0084, 0135).
- Unattested cells will be the majority here. That is honest, and reviewers see which they are.

**yue: an isolating language, so a list rather than a table.**

```yaml
- list:
    id: final-particles
    words: ['sense:呀', 'sense:呀.q', 'sense:啦', 'sense:喇']
    examples: true        # each with the course's commonest sentence that ends in it
```

- Each item shows the particle with its Jyutping ruby (or as text, in the Jyutping orthography),
  its gloss, and a sentence.
- 呀 *aa3* softens a statement or question; 呀 *aa4* turns a statement into a question.
- A `tones` block above it in the writing section is generated from `profiles/schemes/jyutping.yaml`.

### 4.7 Word notes ship too

The 1,548 KC notes ship, in the same markup, keyed by KC in the grammar file. They show under a
tapped word's gloss and in the word list.

Some form-KC notes are really topic notes (es `form:subj`). Those move into notes with tables over
time, and the KC note shrinks to a line with a link.

---

## 5. Compiler (Python)

- **Source.** `course.yaml` names `grammar: grammar/index.yaml`. It is loaded with `load_doc` and
  `_validate`, so diagnostics carry the side file's file:line, as vocalization files do
  (`build.py:468`). Schemas: `schemas/grammar-source.schema.json` and
  `schemas/grammar-terms.schema.json`; then `pnpm codegen`.
- **Stage.** A new module, `pipeline/src/nabu/compiler/grammar.py`, runs after `pin_kc_readings` and
  `compile_alphabets`: it needs pinned readings and the script track's letters. Its steps:
  1. Build the attested-cell index: sense × inflection → spellings per orthography. This shares the
     token walk `stories.py:136` does.
  2. Resolve tables, lists and examples.
  3. Parse prose into segments.
  4. Compile every quote and authored cell through the sentence-form path.
- **Lints.** Each lint gets an entry in `diagnostics.py` and a fixture in
  `make_lint_fixtures.py`, on the `clean`, FA, GRC and HBO bases. `clean.yaml` stays free of
  diagnostics.

  | Lint | Severity | Fires when |
  |---|---|---|
  | `grammar.unknown-kc` | error | a note names a KC the course does not define |
  | `grammar.unknown-feature` | error | an axis or `inflection` uses a feature that is neither UD's nor the course's |
  | `grammar.cell-mismatch` | error | an authored cell disagrees with what the course attests |
  | `grammar.cell-underspecified` | info | a cell is checked only against a person-less form KC |
  | `grammar.empty-cell` | warning | a cell is neither attested, authored nor `none` |
  | `grammar.quote-unresolved` | error | a quote has no spelling in one of the course's orthographies |
  | `grammar.untagged-target` | error | target-script text sits outside braces |
  | `grammar.unknown-example` / `grammar.unknown-link` | error | a sentence id, note or table that does not exist |
  | `grammar.later-example` | warning | an example comes from a unit after the note's |
  | `grammar.wide-table` | warning | more than five data columns and no slice |
  | `kc.inflection-missing` | warning | a form KC without `inflection`, in a course with grammar notes |
  | `grammar.uncovered-form` | info | a form KC no note is `about`; a completeness count, turned on per course |

- **Output.**
  - A new bundle role, `grammar`, one file per support language: `grammar/en.<sha16>.json`.
    The `BundleGrammar` schema goes in `bundle.schema.json`.
  - The manifest gains `grammar: {notes, sections}` counts, so the course page shows the link
    without fetching the file.
  - Byte-for-byte determinism holds (ADR 0029).
- **Lazy, but offline.** A new `LAZY_ROLES` set in core:
  - `fetchCourse` skips `grammar` when a course opens;
  - `assembleCourse` does not require it;
  - `downloadPlan` keeps it in the core files, so a downloaded course has its notes offline.

  A `fetchGrammar(loaded)` in `@nabu/ui/player/load.ts` fetches it on first need. The service
  worker already serves `bundles/` cache-first.
- **Release builds.** Notes go through `count()` (`compiler/counts.py`), so their licenses and
  provenance enter the manifest. `release()` keeps reviewed notes. Word notes need a decision
  (§10, question 7), because KCs carry no provenance.

---

## 6. Core and UI (TypeScript)

### 6.1 `@nabu/core/grammar` (pure)

- `notesAbout(grammar, kc)`: the notes and tables that mention a KC.
- `cellOf(grammar, token)`: the table cell holding a token's sense and signature. The gloss link
  and *Compare in the table* use it.
- `grammarIndex(grammar, manifest, state)`: the sections, each note's unit, and whether the learner
  has reached it (from the fold's done nodes).
- `lookupForm(grammar, course, query, profile)`: search by form, through `wordMatcher` and the
  grader's lexicon.

No I/O and no clock. Tests are on the real fixture bundles.

### 6.2 `@nabu/ui/grammar` (a new `exports` entry)

- **Components:** `GrammarIndex`, `NoteView`, `Blocks`, `FormTable`, `WordItems`, `Examples`,
  `Callout`, `Segments` (shared with `ExplanationView`), and `NoteSheet`, a React Aria modal for
  sessions wrapped in `useChrome()` (its content renders outside `UiRoot`).
- **Shared from the player:** `GlossPanel` and `useGlosses` (not exported today), so a tap in a note
  glosses as a tap in a story does.
- **CSS modules:** logical properties only, colours from tokens (both themes), container queries.

### 6.3 apps/web

- **Route.** `{tag: "grammar"; course; orthography; note?; table?}` is
  `#/<course>/<orth>/grammar[/<note>[/<table>]]`.
  - Parse it before the fall-through to a session (`App.tsx:141`).
  - Add it to `href` (`App.tsx:146-163`) and to `titleOf` (`screen.tsx:50-84`, an exhaustive
    switch).
  - Dispatch it inside `CourseUiProvider` as Words is (`App.tsx:1678`).
- **Course page.**
  - The link goes in the course-links `nav` (`App.tsx:667-687`), only when `manifest.grammar` is
    present. `tests/e2e/path.spec.ts:136` pins those link texts, so it changes with the link.
  - Unit headings list their notes.
- **Search** is IME-safe, as the word list's is. It spreads `keyboardHint` for the target
  orthography (ADR 0143), since forms are what need a keyboard. Topics in the support language
  match from any keyboard.
- **Messages.** New MF2 messages in `packages/i18n/messages/en.json`, each with its description:
  - `grammar.title`, `grammar.search`, `grammar.section.*`, `grammar.unit`, `grammar.later`;
  - `grammar.draft`, `grammar.sources`, `grammar.see-table`, `grammar.compare`;
  - `grammar.none-found`, `grammar.ungrammatical`, `grammar.also`, `grammar.table.region`.

  The draft catalogs get `llm:` drafts. `pnpm check:catalogs` must stay clean.

### 6.4 Tooling

`nabu notes quote ../courses/<id>` proposes braces for existing KC notes and writes them back with
`nabu.yamlio.dump`. It quotes runs in the target's script automatically, and proposes lexicon
matches where both are Latin. A person reviews the diff.

### 6.5 Tests

- **Storybook:** `packages/ui/src/grammar/*.stories.tsx` load real bundles, including es, hbo, chg
  and uz. Stories can load any course, not only `DEMO_TARGETS`.
- **Visual matrix:** `tests/visual/grammar.spec.ts` runs over `cells()`:
  - LTR, RTL and ar-XB;
  - a vertical cell for yue's examples;
  - `expectNoClipping` (Nastaliq ruby, hbo points) and axe.

  The dark pass comes with it.
- **e2e:** `apps/web/tests/e2e/grammar.spec.ts`, by keyboard and touch:
  - course page → Grammar → a note → tap a cell → its gloss;
  - in a lesson, the gloss panel's link opens the sheet, and Escape returns focus to the word with
    the session still running;
  - axe on every screen.
- **Python:** the lint fixtures; and resolving tables on every fixture course, with the unattested
  cells counted per course.

---

## 7. Course by course

| Course | Shape | First notes | Data work first |
|---|---|---|---|
| es | fusional; Latin; 30 units | present; preterite; imperfect; *ser* and *estar*; pronouns (subject, object, after a preposition); articles and agreement; accents (u11); the subjunctive (u21); Cuban and elsewhere | `inflection` on 23 form KCs. `impf`, `fut`, `cond`, `subj` and `subj-past` carry no person, so their tables are authored and checked by membership. |
| uz | agglutinative; Latin and Cyrillic | case endings; possessive endings; person endings and the copula; *-yap* and the present; *-lar*; *-mi*; *sen / siz* | `inflection` on 28 form KCs |
| fa | Arabic script; the ezafe unwritten | what the script leaves out; the ezafe; pronouns and pronoun suffixes; the present (*mi-*) and past stems with person endings; را; prepositions | The past is a sentence construction (`construction:past`), so رفتم carries only `form:1sg-am`. A checked past table needs the past on the verb, as ADR 0136 moved the ezafe onto words. |
| apc | Arabic and Arabizi; root and pattern | pronouns and suffixes; the *b-* present; the past; *ra7*, *3am*; prepositions with suffixes (*ma3*, *la*, *3end*); negation; feminine and plural | `inflection` on 46 form KCs; ـه / ـو shown as "also" |
| hbo | right to left; points; Tiberian readings | the article and prefixed prepositions; pronouns and suffixes; noun states by gender and number; *qatal, yiqtol, wayyiqtol, weqatal* of the strong verb; the stems | `inflection` on 49 form KCs; the course's own conjugation terms; clitic morphs kept out of cells |
| grc | Greek; vowel length in readings | the article; first and second declensions; εἰμί; present and aorist; ἐγώ and σύ | `inflection` on 42 form KCs; defaults masculine, nominative, singular; tables cite forms with acute, matched to graves through the fold |
| chg | Nastaliq; word ruby | what the script leaves out (sources-of-truth §6.8); case suffixes with their spellings (غه / قه / که); possessive and person endings; the copula *-dur* | `inflection` on 58 form KCs |
| yue | Han and Jyutping; isolating | tones (generated); pronouns and 哋; classifiers; sentence-final particles; aspect markers; negation | little: particles already carry `PartType` |
| lzh | Han; three reading traditions | pronouns; final particles; negatives; the object pronoun before the verb after a negative | none: its five constructions become notes |
| tok | Latin and sitelen pona | *li, e, la, pi, o*; pronouns; prepositions; modifiers and *pi*; numbers; the sitelen pona glyphs (a `letters` block) | none |

Drafting follows the courses' rules:
- an LLM drafts, checked against each course's references (ADR 0084, 0092, 0127, 0128);
- `sources:` cite them;
- facts are taken from the references, never their text;
- every note stays `status: draft` until a reviewer signs it off.

---

## 8. What the data needs first

1. **`inflection` on 262 form KCs** in eight courses. LLM drafts, marked REVIEW like the rest of
   the linguistic policy. This is the one big annotation pass, and the tables depend on it.
2. **es's person-less form KCs stay as they are.** Splitting them would rename KCs that learners'
   logs already hold. Their tables are authored and checked by membership (§4.4).
3. **fa's past moves onto the verb**, under its own ADR. Otherwise fa's past tables stay unchecked
   (decision 8).
4. **Signatures and clitics.** Table lookup counts form KCs only (§4.4). `formSignature` is
   unchanged.
5. **KC notes get quoted** (`nabu notes quote`, §6.4) before they ship.

---

## 9. Phases

Small PRs, one deliverable each, as CLAUDE.md asks.

| Phase | Deliverable | Acceptance |
|---|---|---|
| G1 | ADR 0144; the schemas (grammar source, terms, form-KC `inflection`, the `grammar` bundle role); codegen | `pnpm codegen` is clean; nothing compiles differently |
| G2 | The compiler stage: the attested-cell index, tables, prose segments, lints with fixtures, the bundle file; lazy loading in core | Every new lint fires in its fixture; `clean.yaml` is clean; bundles are unchanged for courses without notes |
| G3 | The es pilot: `inflection` for es; notes on the present, pronouns, *ser / estar* | `pnpm courses` is clean; the tables resolve with no mismatch |
| G4 | The read-only UI: route, index, note, blocks, `Segments`, messages, Storybook, visual matrix, e2e | The matrix passes (LTR, RTL, ar-XB, dark); axe is clean; e2e passes by keyboard and touch |
| G5 | Three more shapes: hbo, uz, yue (with the `tones` block) | Each renders in the matrix with no clipping; uz shows the same table in both scripts |
| G6 | Word notes: the quoting tool, KC notes in the bundle, in the gloss panel and in the word list | `grammar.untagged-target` is clean in every course |
| G7 | In context: the gloss link, the sheet in lessons and stories, unit links, word-list links | e2e: the sheet opens mid-lesson and the session continues; a reload resumes as before |
| G8 | Feedback and search: *Compare in the table*; search by form | ADR 0066's examples (uz, apc) open the table with both cells marked |
| G9 | Review and release: notes in the review workspace with sign-off (`signoffText` and its Python twin); learners report mistakes in notes; release builds keep reviewed notes | A release build holds only reviewed notes; a reviewer signs off a note in the browser |
| G10 | The other courses' notes (fa, apc, grc, chg, lzh, tok), one PR each; `grammar.uncovered-form` on per course | Each course's notes cover its form KCs |

**G3 and G4 can run in parallel** once G2 lands.

**Later:**
- Explain My Answer is given the relevant note as context, so its explanations agree with the
  course.
- Cells marked "met", once the fold tracks sense and form pairs; today the mark could only be
  approximated.
- Cell audio cut from sentence clips by their word timings.
- Support layers beyond English.
- Vertical notes for a support language that writes vertically.

---

## 10. Decisions for you

1. **The name.**
   - *Recommended:* **Grammar**. It is plain, and it is the word a learner looks for.
   - Alternatives: Notes, Guide, Reference.
2. **Who labels table headers.**
   - *Recommended:* the note's support language, so the table reads as one piece with its prose.
   - Alternative: the UI locale, as scheme and tone names are.
3. **Traditional terms.**
   - *Recommended:* the tradition's name as the label, with UD's spelled out for assistive
     technology: *wayyiqtol*, *qatal*, Jyutping's tone names, *ezafe*.
   - Alternative: UD's names everywhere.
4. **Reading ahead.**
   - *Recommended:* every note is open, with "later in the course" marked (D6).
   - Alternative: hide the notes of units not yet reached.
5. **Cells the course does not use yet.**
   - *Recommended:* shown like any other cell to learners, and marked for reviewers.
   - Alternatives: marked for everyone; or hidden.
6. **Tips inside lessons.**
   - *Recommended:* links only (gloss panel, feedback, sheet), never a card that interrupts.
   - Alternative: a one-time card the first time a lesson introduces a note's form KC.
7. **Word notes in release builds.** KCs carry no provenance.
   - *Recommended:* leave word notes out of release builds until KCs can be signed off.
   - Alternative: ship them labelled as drafts.
8. **fa's past.**
   - *Recommended:* move it onto the verb, under its own ADR.
   - Alternative: an unchecked past table.
9. **Where the shared terms live.**
   - *Recommended:* `profiles/grammar/terms.yaml`, as data with names per language like reading
     schemes (ADR 0109).
   - Alternative: the UI catalogs.
