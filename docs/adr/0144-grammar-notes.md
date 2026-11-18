# 0144. Grammar notes: one reference section in every course, its tables taken from the course

- Status: Proposed
- Date: 2026-11-18
- Amends: gameplan §7.1 (KC `notes` ship, as language-tagged segments) and §7.2 (notes per support
  layer); [ADR 0029](0029-bundle-format.md) (a bundle role fetched on first need);
  [ADR 0047](0047-offline.md) (downloads keep it)

## Context

A learner has nowhere to look things up: a conjugation table, the pronouns, the case endings, what
a particle does. What the course teaches about grammar is scattered through lessons and KC glosses.

**What exists:**

| What | Where | What it gives us |
|---|---|---|
| 1,548 KC `notes` (all `en`), many already small grammar notes (es `form:subj` runs to 560 characters) | unit YAML; `schemas/course-source.schema.json:296` | Content to start from. **The compiler drops them**: `_bundle_unit` copies no `notes` (`pipeline/src/nabu/compiler/build.py:1593-1619`), `BundleKc` has no field for them, and nothing reads them. They are bare strings that mix English with target text (*"Son las dos y media: it's half past two"*). |
| 262 form KCs (apc 46, chg 58, es 23, fa 15, grc 42, hbo 49, uz 28, yue 1) and 26 construction KCs | unit YAML | The cells' meanings. Each has an English `gloss` and often a note, but **no features**: the ids follow each course's own convention (`pres-1s`, `f-pl-cstr`, `dat-ga`). The only code that reads an id's shape is the contrast `forms` prefix match (`packages/core/src/match/compare.ts:236`). |
| Forms attested by sense and form signature | `formSignature` (`packages/core/src/lesson/signature.ts:19`); `attestedFor` (`templates.ts:661`); the compiler's `_Compiler.attested` (`compiler/stories.py:136`) | Paradigm tables for free. Senses with more than one attested signature: es 232, chg 187, hbo 172, apc 121, uz 80, grc 79, fa 53, with up to 22 signatures on one sense. |
| Morphs whose surfaces concatenate to the token; `glossAt` shows them | `tagged-text.schema.json:98`; `packages/core/src/story/story.ts:217` | Stem and ending boundaries without counting characters. |
| `pos` on every sense KC; UD `features` on lexical subsets (PronType, NumType, PartType, NounType=Clf) | `common.schema.json:56-71`; [ADR 0132](0132-a-choice-asks-one-thing.md) | Pronoun, particle and classifier lists by query. |
| `typo.contrasts` in profiles: person, case and possessive endings, pronouns (REVIEW) | `profiles/uz-Latn.standard.yaml:32`, `hbo-Hebr.tiberian.yaml:37`; [ADR 0066](0066-meaningful-endings.md) | The endings that carry meaning, already listed per course. Feedback can link to them. |
| Language-tagged segments (`support`, `target`, `ref`) and `ExplanationView` | `schemas/ai.schema.json:76`; `packages/ui/src/ai/Explanation.tsx:26` | A model for mixed support and target text with the right `lang`, `dir` and font. |
| The word list | `apps/web/src/Words.tsx`; `@nabu/ui/words`; `@nabu/core/learner` `learnedWords`, `wordMatcher` | The model for a per-course page: route, `CourseUiProvider`, an IME-safe search, ruby never faded. |
| Reading schemes with tone names and contours; profile letters | `profiles/schemes/*.yaml`; core-cli `letters` | Tone charts and letter tables without authoring. |
| "What a wrong word means" in feedback (*hablas: to speak; present tense: you (tú)*) | [ADR 0121](0121-feedback-what-was-wrong-and-why.md) | The natural place for a "see the table" link. |
| What each unit teaches: es README's Grammar column, 622 lines of unit header comments | `courses/es/README.md:143`; `courses/*/units/*.yaml` | Drafting input for `unit:` and `about:` (not parsed). |

**What is missing:**
- prose at course level;
- any table structure;
- features on form KCs;
- any shipping of KC notes;
- lazy loading for anything but media: every non-media bundle file is fetched when a course opens
  (`packages/ui/src/player/load.ts:40`).

The gameplan foresaw notes. §7.1 has `notes?: Record<LangTag, TaggedText>` on a KC, and §7.2 says
grammar notes differ by support language, so they are per layer. Nothing built them.

**Three data facts shape the decision:**
- **es's person-less form KCs.** `form:impf`, `fut`, `cond`, `subj` and `subj-past` carry no
  person, so ser's `form:impf` holds *era, eras, éramos*.
- **fa's past is not on the verb.** It is a sentence construction (`construction:past`), so رفتم
  carries only `form:1sg-am`.
- **Clitics sit in form signatures.** A word's signature holds its clitic morphs: hbo לֵאמֹר is
  `form:inf` plus `sense:le`.

## Decision

Each course has a **Grammar** section, a reference with the same layout in every course. It holds
conjugation and declension tables, pronoun and particle lists, adpositions and case endings, and
short explanations.

**The rules it follows:**
1. **One design, the data per course.** The sections and block kinds are fixed, and the
   components are shared. A course chooses which notes to write; it never chooses a layout.
2. **Notes are content.** They are YAML, compiled and linted. Each note carries provenance and an
   SPDX license, and cites its sources.
3. **Target text is never a bare string.** Every quote, cell and example is compiled as a sentence
   form's tokens are.
4. **Tables come from the course.** Cells are looked up among its tokens, and a cell an author
   writes is checked against them. Nothing in a note contradicts a lesson.
5. **Structured, never free markdown.** Gameplan §13.3 decides the same for explanations, for the
   same reasons: mixed `lang`, bidi isolation, fonts, taps.
6. **A note belongs to its support language; the page around it belongs to the UI.**
7. **A reference, never a gate.** Every note is open from the start (D6). Progress only marks
   things, and is read from the log, never stored.
8. **Facts from references, never their text** ([ADR 0079](0079-reference-library.md)).

### The same sections in every course

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
- A note sits in one section and may be listed in another too (`also: [relations]`), so uz's case
  endings are under both Nouns and Places.
- Section headings are chrome: MF2 messages `grammar.section.<id>`, in the UI locale.
- Each entry shows the note's title, its unit ("Unit 9"), and "later in the course" while the
  learner has not reached that unit. That mark comes from the fold's done nodes.
- A draft badge shows until the note is reviewed.

### Notes are course content

```text
courses/es/
  course.yaml            # grammar: grammar/index.yaml   (a path, as vocalization's is)
  grammar/
    index.yaml           # the course's axes (presets), its own terms, its note files in order
    present.yaml
    preterite.yaml
    pronouns.yaml
    ser-estar.yaml
```

`index.yaml`:

```yaml
license: CC-BY-SA-4.0
provenance: {author: 'llm:claude@…', status: draft}
# The axes every table of the course uses. Rows are labelled with the course's own words.
# Cuban Spanish has no vosotros row.
presets:
  persons:
    - {features: {Person: '1', Number: Sing}, label: 'sense:yo'}
    - {features: {Person: '2', Number: Sing}, label: 'sense:tú'}
    - {features: {Person: '3', Number: Sing}, label: ['sense:él', 'sense:ella', 'sense:usted']}
    - {features: {Person: '1', Number: Plur}, label: 'sense:nosotros'}
    - {features: {Person: '3', Number: Plur}, label: ['sense:ellos', 'sense:ustedes']}
# What a token with no form KC is.
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

**Every note has:**
- `id` and `section`;
- `unit`: where the course starts teaching it;
- `about`: the KCs it explains, so glosses and feedback can find it;
- `title` and `blocks`, per support language;
- `provenance` and `license`;
- `sources`, by author, title and year.

Drafts are `llm:` and status draft until a reviewer signs them off. Release builds keep only
reviewed notes ([ADR 0073](0073-release-builds.md)).

### Blocks

| Kind | For | The author writes | The compiler adds |
|---|---|---|---|
| `text` | explanation | support-language text with inline quotes, per support language | segments, with tokens and glosses on the quotes |
| `table` | paradigms, pronoun grids, suffix tables | words or KCs; rows, columns and slices as axes (presets or features); `where`; optional cells and stems | each cell found in the course and checked; the morph split; readings |
| `list` | pronouns, prepositions, particles, classifiers, question words | KC ids, optionally a note and an example sentence each | forms in every orthography, gloss, clip |
| `examples` | sentences that show the point | course sentence ids, with the words to mark (index among the form's words plus surface, as corrections address words); or a local example with its own translation and provenance | text, translation, clip, review status |
| `pairs` | contrasts: *ser / estar*, 呀 *aa3 / aa4*, with and without the ezafe | two to four quotes or sentence ids, each with its meaning | as examples |
| `callout` | tip, caution, variation (Cuban and elsewhere), history | a kind and support text | segments |
| `letters`, `tones` | the writing section | the block alone | letters with their readings (the script track's data); tones with names, pitch letters, a drawn contour and one attested syllable each (scheme data) |
| `forms` | every form of one word the course uses | a KC id | its attested cells, arranged by the form KCs' features |

Course sentences are preferred to local examples: they are reviewed, have clips, and a sign-off
covers them once.

### Target text inside prose

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
are Latin (es, uz-Latn, apc Arabizi, tok-Latn), it is review's job, helped by the quoting tool
below.

The same segments render notes and explanations: `ExplanationView`'s body becomes a shared
`<Segments>` component.

### Tables come from the course

**Form KCs get `inflection`:** the UD features they mark. This is a new field, separate from
sense KCs' lexical `features`, so ADR 0132's word questions are unaffected.

```yaml
- {id: 'form:pres-1s', inflection: {Tense: Pres, Mood: Ind, Person: '1', Number: Sing}, gloss: …}
- {id: 'form:dat-ga', inflection: {Case: Dat}, gloss: …}                                     # uz
- {id: 'form:poss-1sg-im', inflection: {'Person[psor]': '1', 'Number[psor]': Sing}, gloss: …}  # uz
- {id: 'form:f-pl-cstr', inflection: {Gender: Fem, Number: Plur, Definite: Cons}, gloss: …}  # hbo
- {id: 'form:wayyiqtol-3ms', inflection: {Conjugation: wayyiqtol, Person: '3', Gender: Masc, Number: Sing}, gloss: …}  # hbo's own feature
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

Morphs of *other* senses (clitics: hbo *lə-*, apc *el-*) are left out unless the table asks for
them. `formSignature` itself is unchanged. Spellings are compared as grading compares two units
without a slip: case, and the profile's silent folds (grc grave = acute, a vocalization's marks).

Then:
- **one spelling:** that is the cell (attested);
- **several spellings:** the commonest is the cell, and the rest are shown as "also";
- **none:** the author gives the cell in `cells:`. It is compiled as a one-word form (readings,
  vocalization, the script audit) and marked unattested for reviewers. The author can also write
  `none` for a form that does not exist (a defective verb, a person the variety lacks).
  Otherwise `grammar.empty-cell` warns.

An authored cell for a bundle the course attests must be one of the attested spellings
(`grammar.cell-mismatch`, an error).

**Where a course's form KC leaves the person out** (es `form:impf`), an authored cell has only to be
one of that KC's spellings for the word (`grammar.cell-underspecified`, info). Those KCs stay as
they are: splitting them would rename KCs that learners' logs already hold.

**Stacked suffixes** (uz, chg, fa) are an unordered signature. The cell's morph order comes from the
token's `morphs`, which keep it.

**Presets** are a course's named axes in `grammar/index.yaml`: `persons`, `cases`, `genders`,
`numbers`, `states`. Each is a list of feature bundles, with labels: terms, or the course's own
words. Defining them once makes every table of a course line up with every other.
- es: five persons.
- hbo: 3ms, 3fs, 2ms, 2fs, 1cs, 3mp, 3fp, 2mp, 2fp, 1cp, labelled with its pronouns.
- apc: 1s, 2ms, 2fs, 3ms, 3fs, 1p, 2p, 3p.
- grc: nominative, genitive, dative, accusative, vocative.
- uz: nominative, genitive, accusative, dative, locative, ablative.

**Terms** are a shared vocabulary of UD features and values, in `profiles/grammar/terms.yaml`
(schema in `schemas/`).
- Each term has a full name and an abbreviation per language ("first person singular", "1sg"),
  with provenance per language, as scheme names have ([ADR 0109](0109-names-and-schemes-are-data.md)).
- `@nabu/i18n` names.ts reads them (`termName`) in the note's support language, falling back as
  names do.
- A course may name its own where a tradition has names its learners will meet in every grammar:
  - hbo: a `Conjugation` feature (*qatal, yiqtol, wayyiqtol, weqatal*), and the stems by their names;
  - "construct state" rather than UD's *Cons*.
- A feature that is neither UD's nor declared by the course fails with `grammar.unknown-feature`.

**Three more shapes:**

```yaml
# uz: suffixes in two scripts
- table:
    id: cases
    words: ['sense:maktab', 'sense:park']
    rows: cases
    caption: {en: 'Case endings: {=sense:maktab} "school", {=sense:park} "park"'}
```

- In uz-Latn the cells are *maktab … maktabga, maktabda, maktabdan*, and *park … parkka*, which
  shows the *-ka* allomorph.
- In uz-Cyrl they are the Cyrillic tokens' own: *мактабга, паркка*.
- The endings are marked from the morphs.

```yaml
# hbo: right to left, pointed, mostly unattested
- table:
    id: amar
    words: ['sense:amar']
    rows: persons
    columns: {Conjugation: [qatal, yiqtol, wayyiqtol]}
```

- The course attests some cells (*wayyōʾmer*, 3ms).
- The author fills in the rest from Joüon–Muraoka. Each cell is copied pointed and checked with
  `nabu tiberian`, with its Tiberian reading pinned like any token's
  ([ADR 0084](0084-hbo-references.md), [0135](0135-readings-fixed-by-their-words.md)).
- Unattested cells are most of this table. Reviewers see which they are.

```yaml
# yue: an isolating language, so a list rather than a table
- list:
    id: final-particles
    words: ['sense:呀', 'sense:呀.q', 'sense:啦', 'sense:喇']
    examples: true        # each with the course's commonest sentence that ends in it
```

- Each item shows the particle with its Jyutping ruby (or as text, in the Jyutping orthography),
  its gloss, and a sentence.
- A `tones` block in the writing section is generated from `profiles/schemes/jyutping.yaml`.

### Word notes ship

The 1,548 KC notes ship, in the same markup, keyed by KC in the grammar file. They show under a
tapped word's gloss and in the word list.

`nabu notes quote ../courses/<id>` proposes their braces and writes them back with
`nabu.yamlio.dump`:
- it quotes runs in the target's script automatically;
- it proposes lexicon matches where both are Latin;
- a person reviews the diff.

Form-KC notes that are really topic notes (es `form:subj`) move into notes with tables, and the KC
note shrinks to a line with a link.

### What a learner sees

**Ways in:**
1. **The course page.** A *Grammar* link in the row under the title, next to *Words*
   ([ADR 0120](0120-where-to-go-next.md)). It shows only when the manifest says the course has notes.
2. **Each unit on the course page.** "Notes for this unit" lists the notes whose `unit` it is.
3. **A tapped word** in a lesson, story or feedback:
   - The gloss panel's form line (*present tense: you (tú)*) gains *See the table* when a note's
     table holds that cell.
   - The word's KC note shows under the gloss, folded after two lines.
   - During a session the note opens in a sheet over the card, never as a navigation
     ([ADR 0108](0108-uploads-sessions-stopped-placement.md) holds the route). Closing the sheet
     returns focus to the word.
4. **Feedback.** When the learner's wrong word and the right word are two cells of one table (ADR
   0066's contrasts are the typical case: *talabasan* for *talabaman*), feedback adds *Compare in
   the table*. The sheet opens with the learner's cell marked with `highlight` and the right one
   with `emphasis`.
5. **The word list.** A word with a table links to it.
6. **Search** on the Grammar page, by topic in the support language or by a form ("hablé" finds
   *hablar*, preterite, I). It reuses `wordMatcher` and the grader's lexicon. Any new folding gets
   conformance vectors in both harnesses.

**A note page has, in order:**
- the back link and the title (h1);
- the draft badge and "Taught in Unit 9";
- its blocks;
- *Where you meet this*: the unit's lessons and stories;
- related notes;
- *Based on*: the sources.

**Tables:**
- **Markup.** A real `<table>` with a `<caption>` and `<th scope>`, so a screen reader reads a cell
  with its headers ("first person singular, present: hablo"). Headers are terms (abbreviated, spelled
  out for assistive technology) or the course's own words (*yo*, *tú*, *él / ella / usted*). It is a
  plain table, not React Aria's interactive `Table`: its only controls are the word buttons
  `<T onTokenPress>` makes.
- **Cells.** Each cell is a `<T>`:
  - Ruby follows the learner's chosen layer and is never faded, as in the word list. lzh's
    tradition choice applies ([ADR 0138](0138-reading-traditions.md)).
  - The learner's marks choice applies, as it does to every `<T>`.
  - A tap glosses the word (`glossAt`).
- **Endings.** Endings are marked only where the data splits the word: its morphs, or an authored
  stem, split on morph surfaces and never on a character count.
  - Scripts whose letters do not join (Latin, Greek, Cyrillic, Hebrew, Han) mark the ending
    inside the word.
  - Joining scripts (Arabic and Nastaliq, and any later Syriac, Mongolian or N'Ko) never wrap part
    of a word in an element of its own (gameplan §6.8). They show the ending in a column beside
    the word.
  - Whether a script joins comes from the generated script metadata, as direction does.
- **Narrow screens.**
  - A wide table scrolls in its own region (`overflow: auto`, `role="region"`, focusable, named by
    its caption), with row headers sticky at `inset-inline-start`.
  - A table with a third dimension (tense, case) shows one slice at a time behind a segmented
    control.
  - The lint `grammar.wide-table` warns at more than five data columns without a slice.
  - Layout follows container queries on the table's own inline size.
- **Sound.** A lemma header plays the word card's clip where `course.audio[kc]` exists, as
  `audio.quality` allows ([ADR 0091](0091-voice-quality.md)).
- **Several spellings.** The commonest is the cell, and the others are shown as "also"
  (apc ـه / ـو).
- **One spelling in two cells** is shown in both (apc *ru7t*, 1sg and 2ms).
- **Unattested cells** look like any other cell to a learner. Debug mode outlines them for reviewers.

**Direction and writing modes:**
- **The note takes its support language's `lang` and `dir`.** The back link, section headings and
  search take the UI locale's. An English note on Hebrew reads left to right, with each Hebrew cell
  isolated by `<T>`. A Persian support layer would flip the table with no code change, because
  every rule is logical.
- **Three directions can nest:** ar-XB chrome, around an English note, around Persian cells. The
  visual matrix covers that case.
- **Vertical text.** The Grammar page stays horizontal, like the word list.
  - Example blocks in yue and lzh follow the learner's vertical choice where the profile's
    `verticalScope` includes `reading`, as story transcripts do.
  - Tables are built axis-agnostic, and one Storybook story sets a table vertical under a CJK
    pseudo support layer.
  - Vertical tables for learners wait for a support language that writes vertically.

### Compiler

- **Source.** `course.yaml` names `grammar: grammar/index.yaml`. It is loaded with `load_doc` and
  `_validate`, so diagnostics carry the side file's file:line, as vocalization files do
  (`build.py:468`). Schemas: `schemas/grammar-source.schema.json`,
  `schemas/grammar-terms.schema.json`, and `inflection` on `KnowledgeComponentSource`; then
  `pnpm codegen`.
- **Stage.** A new module, `pipeline/src/nabu/compiler/grammar.py`, runs after `pin_kc_readings` and
  `compile_alphabets`: it needs pinned readings and the script track's letters. Its steps:
  1. Build the attested-cell index: sense × inflection → spellings per orthography. This shares the
     token walk of `stories.py:136`.
  2. Resolve tables, lists and examples.
  3. Parse prose into segments.
  4. Compile every quote and authored cell through the sentence-form path: NFC, invisibles, the
     script audit, vocalization ([ADR 0053](0053-vocalization.md)), reading consistency (ADR 0135),
     `lexiconKey`.
- **Lints.** Each lint gets an entry in `diagnostics.py` and a fixture in
  `make_lint_fixtures.py`. `clean.yaml` stays free of diagnostics.

  | Lint | Severity | Fires when |
  |---|---|---|
  | `grammar.unknown-kc` | error | a note names a KC the course does not define |
  | `grammar.unknown-feature` | error | an axis or `inflection` uses a feature that is neither UD's nor the course's |
  | `grammar.cell-mismatch` | error | an authored cell disagrees with what the course attests |
  | `grammar.cell-underspecified` | info | a cell is checked only against a person-less form KC |
  | `grammar.empty-cell` | warning | a cell is neither attested, authored nor `none` |
  | `grammar.quote-unresolved` | error | a quote has no spelling in one of the course's orthographies |
  | `grammar.untagged-target` | error | target-script text sits outside braces |
  | `grammar.unknown-example` | error | a sentence id that does not exist |
  | `grammar.unknown-link` | error | a note or table that does not exist |
  | `grammar.later-example` | warning | an example comes from a unit after the note's |
  | `grammar.wide-table` | warning | more than five data columns and no slice |
  | `kc.inflection-missing` | warning | a form KC without `inflection`, in a course with grammar notes |
  | `grammar.uncovered-form` | info | a form KC no note is `about`; turned on per course once its notes are complete |

- **Output.**
  - A new bundle role, `grammar`, one file per support language: `grammar/en.<sha16>.json`.
    The `BundleGrammar` schema goes in `bundle.schema.json`.
  - The manifest gains `grammar: {notes, sections}` counts, so the course page shows the link
    without fetching the file.
  - Bundles stay byte-for-byte deterministic.
- **Fetched on first need, kept offline.** A new `LAZY_ROLES` set in core:
  - `fetchCourse` skips `grammar` when a course opens;
  - `assembleCourse` does not require it;
  - `downloadPlan` keeps it with the core files, so a downloaded course has its notes offline.

  `fetchGrammar(loaded)` (`@nabu/ui/player/load.ts`) fetches it. The service worker already serves
  `bundles/` cache-first.
- **Counts.** Notes go through `count()` (`compiler/counts.py`), so their licenses and provenance
  enter the manifest. `release()` keeps reviewed notes.

### Core and UI

- **`@nabu/core/grammar` (pure).** No I/O and no clock:
  - `notesAbout(grammar, kc)`: the notes and tables that mention a KC;
  - `cellOf(grammar, token)`: the table cell holding a token's sense and signature;
  - `grammarIndex(grammar, manifest, state)`: the sections, each note's unit, and whether the
    learner has reached it;
  - `lookupForm(grammar, course, query, profile)`: search by form.
- **`@nabu/ui/grammar` (a new `exports` entry).**
  - Components: `GrammarIndex`, `NoteView`, `Blocks`, `FormTable`, `WordItems`, `Examples`,
    `Callout`, `Segments` (shared with `ExplanationView`), and `NoteSheet` (a React Aria modal
    wrapped in `useChrome()`).
  - `GlossPanel` and `useGlosses` are exported from the player, so a tap in a note glosses as a
    tap in a story does.
  - CSS modules use logical properties only and colours from tokens, in both themes.
- **apps/web.**
  - The route `{tag: "grammar"; course; orthography; note?; table?}` is
    `#/<course>/<orth>/grammar[/<note>[/<table>]]`. It is parsed before the fall-through to a
    session (`App.tsx:141`), added to `href` and `titleOf`, and dispatched inside
    `CourseUiProvider` as Words is.
  - The link goes in the course-links `nav` (`App.tsx:667-687`).
  - Search is IME-safe and spreads `keyboardHint` for the target orthography
    ([ADR 0143](0143-keyboard-language.md)).
- **Messages.** In `packages/i18n/messages/en.json`, each with its description:
  - `grammar.title`, `grammar.search`, `grammar.section.*`, `grammar.unit`, `grammar.later`;
  - `grammar.draft`, `grammar.sources`, `grammar.see-table`, `grammar.compare`;
  - `grammar.none-found`, `grammar.ungrammatical`, `grammar.also`, `grammar.table.region`.

  The draft catalogs get `llm:` drafts.

## Consequences

- **An annotation pass.** 262 form KCs in eight courses need `inflection`. These are LLM drafts,
  marked REVIEW like the rest of the linguistic policy. The tables depend on this pass;
  `kc.inflection-missing` tracks it.
- **fa's past tables stay unchecked** until fa's past moves onto the verb, under an ADR of its own
  (as [ADR 0136](0136-unwritten-morphs.md) moved the ezafe).
- **es's past and mood tables are partly authored.** Its person-less KCs are checked by membership
  only.
- **Bundles change.** Courses with notes gain a `grammar` file and a manifest entry, so
  `pnpm bundles` runs after each note change and CI keeps checking them. The bundle schema's role
  enum grows, and core gains its first non-media role that is not fetched up front.
- **The course page changes.** `tests/e2e/path.spec.ts:136` pins the course-link texts, so it
  changes with the link. The visual baselines gain grammar stories (rebuilt in the pinned
  container).
- **The visual matrix grows past `DEMO_TARGETS`.** Grammar stories load es, hbo, chg and uz bundles
  too. hbo's points and chg's Nastaliq ruby are exactly the clipping cases `expectNoClipping`
  exists for.
- **Feedback and glosses gain links**, and nothing about grading changes.
- **Explanations and notes share `<Segments>`.** A later step can give Explain My Answer the
  relevant note as context, so its explanations agree with the course.
- **Course by course,** the first notes and the data work each course needs first:

  | Course | Shape | First notes | Data work first |
  |---|---|---|---|
  | es | fusional; Latin; 30 units | present; preterite; imperfect; *ser* and *estar*; pronouns (subject, object, after a preposition); articles and agreement; accents (u11); the subjunctive (u21); Cuban and elsewhere | `inflection` on 23 form KCs; authored, membership-checked cells for the person-less ones |
  | uz | agglutinative; Latin and Cyrillic | case endings; possessive endings; person endings and the copula; *-yap* and the present; *-lar*; *-mi*; *sen / siz* | `inflection` on 28 form KCs |
  | fa | Arabic script; the ezafe unwritten | what the script leaves out; the ezafe; pronouns and pronoun suffixes; the present (*mi-*) and past stems with person endings; را; prepositions | the past onto the verb |
  | apc | Arabic and Arabizi; root and pattern | pronouns and suffixes; the *b-* present; the past; *ra7*, *3am*; prepositions with suffixes (*ma3*, *la*, *3end*); negation; feminine and plural | `inflection` on 46 form KCs |
  | hbo | right to left; points; Tiberian readings | the article and prefixed prepositions; pronouns and suffixes; noun states by gender and number; *qatal, yiqtol, wayyiqtol, weqatal* of the strong verb; the stems | `inflection` on 49 form KCs; its conjugation terms |
  | grc | Greek; vowel length in readings | the article; first and second declensions; εἰμί; present and aorist; ἐγώ and σύ | `inflection` on 42 form KCs; defaults masculine, nominative, singular; tables cite the acute, matched to graves through the fold |
  | chg | Nastaliq; word ruby | what the script leaves out (sources-of-truth §6.8); case suffixes with their spellings (غه / قه / که); possessive and person endings; the copula *-dur* | `inflection` on 58 form KCs |
  | yue | Han and Jyutping; isolating | tones (generated); pronouns and 哋; classifiers; sentence-final particles; aspect markers; negation | little: particles already carry `PartType` |
  | lzh | Han; three reading traditions | pronouns; final particles; negatives; the object pronoun before the verb after a negative | none: its five constructions become notes |
  | tok | Latin and sitelen pona | *li, e, la, pi, o*; pronouns; prepositions; modifiers and *pi*; numbers; the sitelen pona glyphs (a `letters` block) | none |

  Each course's notes are LLM drafts, checked against that course's references (ADR 0084, 0092,
  0127, 0128): facts only, cited in `sources:`, and status draft until signed off.

## Order of work

Small PRs, one deliverable each.

| Step | Deliverable | Acceptance |
|---|---|---|
| G1 | Schemas (grammar source, terms, form-KC `inflection`, the `grammar` role); codegen | `pnpm codegen` is clean; nothing compiles differently |
| G2 | The compiler stage: the attested-cell index, tables, prose segments, lints with fixtures, the bundle file; lazy loading in core | Every new lint fires in its fixture; `clean.yaml` is clean; bundles are unchanged for courses without notes |
| G3 | The es pilot: `inflection` for es; notes on the present, pronouns, *ser / estar* | `pnpm courses` is clean; the tables resolve with no mismatch |
| G4 | The read-only UI: route, index, note, blocks, `Segments`, messages, Storybook, visual matrix, e2e | The matrix passes (LTR, RTL, ar-XB, dark); axe is clean; e2e passes by keyboard and touch |
| G5 | hbo, uz and yue (with the `tones` block) | Each renders in the matrix with no clipping; uz shows the same table in both scripts |
| G6 | Word notes: `nabu notes quote`, KC notes in the bundle, in the gloss panel and in the word list | `grammar.untagged-target` is clean in every course |
| G7 | In context: the gloss link, the sheet in lessons and stories, unit links, word-list links | e2e: the sheet opens mid-lesson, and the session continues and resumes after a reload |
| G8 | Feedback and search: *Compare in the table*; search by form | ADR 0066's examples (uz, apc) open the table with both cells marked |
| G9 | Review and release: notes in the review workspace with sign-off (`signoffText` and its Python twin); learners report mistakes in notes; release builds keep reviewed notes | A release build holds only reviewed notes; a reviewer signs off a note in the browser |
| G10 | The other courses' notes (fa, apc, grc, chg, lzh, tok), one PR each; `grammar.uncovered-form` on per course | Each course's notes cover its form KCs |

**G3 and G4 can run side by side** once G2 lands.

**Later:**
- Cells marked "met", once the fold tracks sense and form pairs.
- Cell audio cut from sentence clips by their word timings.
- Support layers beyond English.
- Vertical notes for a support language that writes vertically.

## Open questions

The decision above takes the first answer to each question. Each can change before this ADR is
accepted.

1. **The name.**
   - **Grammar**: it is plain, and it is the word a learner looks for.
   - Alternatives: Notes, Guide, Reference.
2. **Who labels table headers.**
   - **The note's support language**, so a table reads as one piece with its prose.
   - Alternative: the UI locale, as scheme and tone names are.
3. **Traditional terms.**
   - **The tradition's name as the label** (*wayyiqtol*, *ezafe*, Jyutping's tone names), with
     UD's spelled out for assistive technology.
   - Alternative: UD's names everywhere.
4. **Reading ahead.**
   - **Every note is open**, with "later in the course" marked.
   - Alternative: hide the notes of units not yet reached.
5. **Cells the course does not use yet.**
   - **Shown like any other cell to learners**, marked for reviewers.
   - Alternatives: marked for everyone; or hidden.
6. **Tips inside lessons.**
   - **Links only** (gloss panel, feedback, sheet), never a card that interrupts.
   - Alternative: a one-time card the first time a lesson introduces a note's form KC.
7. **Word notes in release builds.** KCs carry no provenance.
   - **Left out of release builds** until KCs can be signed off.
   - Alternative: shipped labelled as drafts.
8. **fa's past.**
   - **Onto the verb**, under its own ADR.
   - Alternative: an unchecked past table.
9. **Where the shared terms live.**
   - **`profiles/grammar/terms.yaml`**, as data with names per language (ADR 0109).
   - Alternative: the UI catalogs.
