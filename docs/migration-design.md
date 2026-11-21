# The migration to the lexical model: formats

- Status: **approved by the owner on 2026-11-20, with three changes** (Task C of
  [the handoff](handoff-lexical-model.md)). The lexicon is flat, not arranged by unit; old events may be
  rewritten, and keeping old apps working is no goal; and no unit of the new formats is a "word". The eight
  questions and the owner's answers are at the end, and the sections they change are rewritten to them.
- The ADRs decide what is stored and how it behaves ([0145](adr/0145-lexical-model.md) to
  [0149](adr/0149-script-first.md)); this note gives the file shapes, the ids, the event change and the order
  of work. Deliverables 1 (the schemas) and 2 (the converter) are built ("Deliverable 1, as built" and
  "Deliverable 2, as built", below). The owner read what the converter found and said "go" on the switch
  on 2026-11-21 ("For the owner", below).
- Its numbers are counted from the repo by
  [prototypes/migration-inventory](prototypes/migration-inventory/) and, for apc, by
  [Task B's prototype](prototypes/apc-lexical-forms/).
- Two things followed from the owner's answers and are marked "for the owner" where they stand: what "word"
  still names in the code, and whether sentences leave their unit files. Both stand as proposed since the
  owner's "go" (2026-11-21).

## What there is to convert

| | Count | Where |
|---|---|---|
| Sense KCs | 3,021 | every one has a UD `pos` already |
| `form:` KCs | 262 | 133 pinned on tokens as their form, 127 written as morphs with letters, 2 both ways |
| `construction:` KCs | 24 | 23 named by their sentences (`constructions:`), 1 written as a morph |
| `grapheme:` KCs | 75 | script tracks; they stay (ADR 0149) |
| Sentences | 5,269 | 731 carry `persons`, 763 a `register` |
| Sense KCs listing a second form | 67 | apc 30, uz 24, fa 7, grc 4, es 2: mostly inflected forms |
| Clips | 7,696 | 2,193 keyed by a KC id; 148 reviewed |

## The order, and what "done" is for each

The owner's order stands, and the staging is approved: the first two deliverables change nothing a learner
sees, and the third switches all ten courses at once.

1. **Schemas.** `schemas/lexicon.schema.json` and `schemas/language.schema.json`, the token and tag changes in
   `course-source`, the profile's correspondences, the event schema's new version. Additive, with examples in
   `schemas/examples` and generated models. Done: `pnpm codegen`, lint, typecheck and tests green; nothing reads
   the new files yet. **Built on 2026-11-20:** "Deliverable 1, as built", below.
2. **The converter.** `nabu migrate <course>` writes a lexicon and a converted course beside the old ones
   (`lexicons/<lang>/`, `courses/<id>/next/`), the course's alias table, and a report. It runs on all ten courses. Done: every course
   comes through; the compiler's derivability report has no unexplained finding; each finding left is a
   question for the owner; the checks under "What must not change" pass. Nothing in the app reads the output.
   **Built on 2026-11-20:** "Deliverable 2, as built", below, and [migration/](migration/README.md).
3. **The switch.** The compiler, the bundle, core, the fold, the events and the UI read the new shape, and the
   ten courses' converted sources replace the old. One branch, landed whole. Done: ADR 0148's "Done in one go"
   list, and the checks below, on real exported logs too.
4. **Lexical-form schemas** beyond apc (Task B's, per language), each with its review list.
5. **Prompt tags** (ADR 0147), then **script tracks** (ADR 0149): each lands whole.

- **Why not course by course:** the app would have to read two bundle shapes and fold two event shapes at
  once, which is the half-switched state the owner ruled out. One switch, prepared by two steps that cannot
  break anything.
- **What can be late without blocking the switch:** rules. A form no rule gives yet is pinned (ADR 0145), so a
  course moves with its lexicon complete and its rule debt reported.

## Where the lexicon lives

`lexicons/<lang>/` at the repo's root, beside `courses/` and `profiles/`, one per language.

```
lexicons/apc/
  language.yaml        dimensions, classes, defaults, varieties and registers
  lexemes.yaml         every entry, one list, sorted by id
  rules/               one file per rule, with its vectors (later; empty at the switch)
```

- **The lexicon is flat** (the owner): no file of it is a unit's, and no entry says which unit teaches it.
  Units point at it. A unit's nodes name the lexemes, features and rules they introduce, as they name KCs now,
  and that is the only place the teaching order is written.
- So a unit can be rearranged or rebuilt without touching the lexicon: moving a lexeme to another unit edits
  two `introduces` lists.
- A unit file has no `kcs:` list any more. "Its own unit or an earlier one" (ADR 0050: distractors, stories)
  is computed from the course's order, as now.
- One file a language, sorted by id, so an entry's place never moves and a diff shows only what changed. If a
  file grows past what can be read (es will have about 750 entries), it is split by the first letter of the
  id, never by anything a course decides.
- A course names its lexicon and the range it teaches: `lexicon: apc`, `variety: apc-LB`, `registers:
  [colloquial]` in `course.yaml`. Two courses of one language share the entries.
- Entries are written with `nabu.yamlio.dump`.
- **For the owner:** sentences and stories stay in their unit files, each naming its node, as now. If
  rearranging units should not move them either, they become a pool the nodes point at. That is a larger
  change to the course source, and nothing here needs it.

## The language file

`language.yaml` is what ADR 0145 calls the declared dimensions, and ADR 0148 the stated classes and defaults.
A category is a UD tag (round 6).

```yaml
id: es
license: CC-BY-SA-4.0
provenance: {author: 'llm:…', status: draft}
varieties: [es-CU, es-419, es-ES]          # a scope's first axis
registers: [neutral, formal, colloquial]   # its second
dimensions:                                # what every member of a category must choose (ADR 0145)
  VERB: [Mood, Tense, Person, Number, VerbForm]
  NOUN: [Number]
  ADJ: [Gender, Number]
defaults:                                  # a default is a rule (ADR 0148): what it gives is no part of a lexeme
  - {id: gender-a, when: {pos: NOUN, ends: a}, gives: {Gender: Fem}}
  - {id: gender-o, when: {pos: NOUN, ends: o}, gives: {Gender: Masc}}
classes:                                   # stated, never counted
  - {id: e-ie, pos: VERB, says: "stem e becomes ie under stress"}
  - {id: go, pos: VERB, says: "first person singular present in -go"}
```

- Dimension and value names are UD's features where UD has one (`Tense=Past`), and the language's own where it
  doesn't (apc's aspect with its participle value). A language's own names are declared here.
- `status: draft` and `llm:` provenance until signed off, as profile policies are.

## A lexicon entry

One entry is a lexeme. Its id is `lexeme:<name>`, unique in its language. The name is today's KC
name where the KC is a lexeme (`sense:tener` becomes `lexeme:tener`), so most ids change only their prefix.

```yaml
- id: lexeme:tener
  pos: VERB
  gloss: {en: have}
  form: tener                        # the lexical form; es is written as it is said
  classes: [e-ie, go, short-future]  # lexical features no default gives: each is a part (ADR 0146)
  forms:
    - {feats: {Tense: Past}, stem: tuv, status: listed, statement: {author: 'llm:…', status: draft}}
  scope: {}                          # every variety and register
  provenance: {author: 'llm:…', status: draft}

- id: lexeme:mano
  pos: NOUN
  gloss: {en: hand}
  form: mano
  feats: {Gender: Fem}               # stored: the -o default would give Masc, so it is a part
  provenance: {…}

- id: lexeme:casa                    # feminine by its -a: nothing stored, nothing to learn but itself
  pos: NOUN
  gloss: {en: house}
  form: casa
```

- **`status` on a form is `listed` or `pinned`** (ADR 0145). Listed needs its `statement`, an entry saying the
  language has no rule for it, with its own provenance; a drafted statement counts until it is signed off
  (round 6). Pinned needs none: it is a rule not yet written, never a learner's part.
- **A Semitic base's form is not one string.** As [Task B](lexical-forms/apc.md) drafts it:

  ```yaml
  - id: lexeme:ra7
    pos: VERB
    gloss: {en: go}
    form: {radicals: [ر, و, ح], form: I, vowels: {present: u}}
    forms:
      - {feats: {Aspect: Perf, Person: 1, Number: Sing}, form: "رُحْت", status: pinned}
  ```

  A participle is a value of the verb's aspect, so `sense:raye7` has no entry of its own: it becomes pinned
  forms of `lexeme:ra7` until the template is a rule. `lexeme:m3allem` is an entry, with `base: lexeme:3allam`
  and `pattern: agent` as links.
- **An affix is a lexeme too** where its value has a meaning (ADR 0145): its entry says what it realises and
  its allomorphs, each with its condition.

  ```yaml
  - id: lexeme:dat            # uz, today form:dat-ga
    realises: {Case: Dat}
    allomorphs:
      - {form: ga}
      - {form: ka, after: {ends: k}}
      - {form: qa, after: {ends: q}}
  ```
- **A concept** links lexemes that differ only socially (ADR 0145): `concept: concept:EAT` on each. No concept file.
- **What an entry does not hold:** a spelling in each orthography, a reading, vowel marks. Those are
  projections of `form` (ADR 0148). Where a projection is not written yet, the entry pins them as today's KC
  forms do: `spelled: {apc-Latn/arabizi: ahwe}`, marked pinned.

### Signing off an entry

Proposed, on the model of ADR 0072:
- A sign-off pins the sha256 of the entry's canonical text (its id, pos, feats, classes, form, forms and their
  statuses, scope and glosses, in a fixed order): a Python function and its TypeScript twin, with pinned texts
  in both test suites.
- `nabu review apply` takes entries as it takes sentences. An entry two courses share is signed once: the
  lexicon is the language's, so the sign-off is too.
- A listed form's `statement` is signed with its entry.
- Changing an entry's form or status voids its sign-off; changing a gloss in another support language does
  not void the others' (the hash is per support language for glosses).

## A token

A token is a stretch of text. It names the lexemes it writes and their feature values, and where one of them
agrees or is governed, its UD head and relation (round 6).

**There is no unit between the token and the lexeme** (the owner: "word" may be used in what a learner is
shown, never as an internal unit). The note's first version split a token into UD's words. That is gone: a
stem, a clitic and an affix are all lexemes the token writes, in one list, and nothing has to rule which of
them is a word. ADR 0145 already says so of the model: Merge goes above the word, and words don't matter for
learning.

```yaml
# today (apc): the clitics are morphs
- {surface: بالمطبخ, sense: matbakh, morphs: [{surface: ب, kc: 'sense:b'}, {surface: ال, kc: 'sense:el'}, {surface: مطبخ, kc: 'sense:matbakh'}]}

# the new shape
- surface: بالمطبخ
  lexemes:
    - {n: 3, lexeme: b, surface: ب, head: 5, rel: case}
    - {n: 4, lexeme: el, surface: ال, head: 5, rel: det}
    - {n: 5, lexeme: matbakh, surface: مطبخ, head: 2, rel: obl}
```

```yaml
# today (uz): the affix is a morph
- {surface: uyga, sense: uy, morphs: [{surface: uy, kc: 'sense:uy'}, {surface: ga, kc: 'form:dat-ga'}]}

# the new shape: the same list, and the same kind of entry as a clitic's
- surface: uyga
  lexemes:
    - {lexeme: uy, surface: uy}
    - {lexeme: dat, surface: ga}
```

```yaml
# today (es)
- {surface: la, sense: el, form: 'form:fem'}
- {surface: mano, sense: mano, form: 'form:fem'}

# the new shape: a token that writes one lexeme names it itself
- {n: 1, surface: la, lexeme: el, feats: {Gender: Fem, Number: Sing}, head: 2, rel: det}
- {n: 2, surface: mano, lexeme: mano, feats: {Number: Sing}}
```

- **`lexemes`** lists what the token writes, in the order it writes them. A token that writes one lexeme
  carries `lexeme` and `feats` itself.
- **`feats` holds only what is chosen there**: the dimension values. A lexical feature (*mano*'s gender) is
  the lexeme's and is not repeated. A value that is a lexeme of its own (ADR 0145: PAST, a noun's PL) is
  written as a feature value where the token does not write it apart (*hablamos*), and as an entry of
  `lexemes` where it does (uz ‑ga).
- **`n`** numbers the lexemes an utterance writes, in order; `head` points at one. Both are written only where
  a relation is.
- **`head` and `rel` are needed only where agreement or government matters** (ADR 0145): a determiner, an
  agreeing adjective, a governed case. The converter writes them for those and leaves the rest bare. UD
  defines its relations between what it calls words, so an affix takes none: inside a token the list's order
  is all the structure there is, until a rule needs more. A full tree comes with the first rule that needs
  one.
- **`surface` on a lexeme** of a token that writes several stays, as a morph's does today: taps, corrections
  and the marks' split need it. A lexeme the script does not write keeps an empty surface (ADR 0136).
- **A token's readings and `vocalized`** stay as pins until its orthography's projections are written, then
  go. `context` (hbo's pause) becomes a feature value or stays a pin, per language.

### What "word" still names

- **In the new formats, nothing.** The lexicon, a token, an event and the fold's new state have lexemes,
  forms, features, parts and tokens.
- **What a learner is shown keeps the word:** the word list, a word bank, "new words", the feedback's "another
  word". Those are messages and the names of cards and pages.
- **For the owner:** today's code uses it inside in three places, and the note proposes this for each at the
  switch, when every bundle is rewritten anyway:
  - TaggedText's token kind `word` (a token of letters, against `punct`, `space`, `number`, `symbol`) is
    renamed `lexical`. It is the one place the schema itself calls a unit a word.
  - The fold's and the planner's names (`learnedWords`, `WORD_KINDS`, `wordMatcher`) become the lexeme's, with
    the fold's rewrite.
  - Template ids that name a card (`word-bank`, `word-read`, `word-write`) and the course switch for ADR
    0152's cards (`wordParts`) stay: they model nothing, and the template ids are in every logged event.
  - Corrections address a sentence's tokens as "words" (ADR 0051: by their index among a form's words). That
    becomes an index among its tokens with the events' rewrite.

## What each KC becomes

By its use, which the inventory counts ([migration/kc-conversion.md](migration/kc-conversion.md) lists all
286):

| Today | Use | Becomes |
|---|---|---|
| `sense:` | a glossary entry | `lexeme:` of the same name; or a pinned or listed form of another lexeme, where it is an inflected form (apc `sense:baddi`, `sense:esmak`; the participles) |
| `form:` pinned on a token (133) | es `form:pret-3s`, grc `form:f-acc`, hbo `form:qatal-3ms` | the token's `feats`. The KC itself goes; what was learned under it is a feature's uses and a rule's branches (ADR 0146) |
| `form:` written as a morph (127, and 2 also pinned) | uz `form:dat-ga`, apc `form:poss-1sg`, chg's suffixes | a lexeme with `realises` and allomorphs |
| `form:` with no letters | fa's ezafe on a token that does not write it | a lexeme with an empty surface, as now (ADR 0136) |
| `construction:` (24) | apc `used-to`, tok `x-ala-x`, lzh `wei-passive` | a rule where its meaning is its parts'; a listed item with slots where it isn't. Decided per construction, with its course (ADR 0145) |
| `grapheme:` (75) | script tracks | unchanged, and listed by the unit whose script nodes teach them (`graphemes:`), since a unit no longer lists KCs |

- **Gender and number KCs** (es, apc, hbo, grc: ADR 0132's amendment) become `feats` on the lexemes that agree
  and a lexical feature on the noun only where no default gives it. The converter proposes each language's defaults
  from its nouns and lists the exceptions for review.
- **The 67 second forms** are sorted by the converter: a variant spelling stays a free correspondence's
  output; an inflected form becomes a pinned form with its feats; what it cannot sort is a finding.
- **An id's name** is kept where it can be (`form:dat-ga` to `lexeme:dat`), and the alias table records every
  change.

## The profile's correspondences

ADR 0148 puts one statement in the profile and the scheme, replacing `soundAlike` and a scheme's `variants`.
Proposed shape, which Task B's apc tables fill:

```yaml
correspondences:
  - {says: "\u0650", written: [e, i], kind: free}             # apc-Latn: a kasra, the short front vowel
  - {says: "\u064f\u0648", written: [u, ou], kind: free}      # a damma and its waw: long u
  - {says: ق, written: ["2", ""], kind: free, when: {at: start}}
  - {says: ص, written: [s], kind: fixed, loses: [س]}                 # writing back needs which letter
```

- `says` is in the lexical form's notation; `written` in the orthography; `when` a context; `kind` free or
  fixed; `loses` what the other direction cannot recover, which is what makes a lexeme's leftover.
- **It is data the grader runs** (ADR 0148): core compiles it once per profile, as it compiles `typo` today,
  and reads a typed answer forwards against the accepted answers' phonemic forms, which the compiler puts in
  the bundle.
- `match.marks`, `equivalences` and `typo` stay. `typo.contrasts` goes when the lexicon knows every form
  (ADR 0148).

## Prompt tags

ADR 0147: a tag is a value from a closed set or an authored situation. Proposed, on a sentence:

```yaml
tags:
  - {persons: {speaker: f, addressee: sg}}          # today's `persons`, unchanged inside
  - {register: formal}
  - {variety: es-CU}                                # derived by the compiler, never authored
  - {situation: {en: "it (the school)"}, provenance: {author: 'llm:…', status: draft}}
```

- Today's `persons` (731 sentences) and `register` (763) move under `tags` as they are.
- **apc's `register: colloquial` on all 685 sentences is not a tag:** it is the course's range. The converter
  moves it to `course.yaml` and reports it.
- `signoffText` and its Python twin hash a sentence's tags (ADR 0147). No sentence is signed off today.

## The log

### New events

The event schema gains a version, and `answer_submitted` and `exercise_presented` change shape under it. Old
events are upgraded to it once (below); none stays in the old shape.

```json
{"type": "answer_submitted", "schema": 2,
 "outcome": {"labels": ["grammatical"],
             "parts": [{"part": "lexeme:hablar", "skill": "produce", "status": "right"},
                       {"part": "feature:Person=1|use:speaker", "skill": "choose", "status": "wrong"}]}}
{"type": "exercise_presented", "schema": 2,
 "displayed": [{"lexeme": "lexeme:hablar", "feats": {"Person": "2", "Number": "Sing"}}]}
```

- **`parts`** replaces `kcs`: each is a part, the skill asked and right, wrong or given (ADR 0146: credit per
  part, only where the card made the learner supply it).
- **`labels`** is ADR 0148's set (slip, orthographic, phonemic, grammatical, regularised, lexical, scope). The
  outcome is still recorded, and follows from the set.
- **`displayed`** is what a card showed: each lexeme with its feats (ADR 0146: seen is logged).
- **A story line read** is not an exercise, so it gets a small event of its own, `story_line_read`, with the
  story, the line and its `displayed`. It is the one new event type.
- **A part's id** is its node and what of it: `lexeme:tener` (itself), `lexeme:tener|class:go`,
  `lexeme:tener|stem:tuv`, `lexeme:mano|Gender`, `lexeme:casa|spell:es-Latn/standard`,
  `rule:uz-dat|after-q`, `feature:Tense=Past|use:completed`. A card key is a part, a skill, and where the
  skill is of a script its orthography and reading tradition, as today.

### Old events

The fold sees no course, so it cannot rename anything itself (ADR 0145). The owner: fold old events through a
table, broadly, and rewrite whatever needs rewriting to fit the schema; keeping old things working is not a
priority. So:

- **One function upgrades an old event:** `upgrade(event, aliases)` gives the same event in the new shape. It
  is pure, in core, and the same on the device and the server.
- **The logs are rewritten once.** The device upgrades its log on the first run of the new build, as it
  already re-sends held events then (ADR 0108), and keeps the old log aside until the release after. The
  server upgrades its rows in a job at the deploy. After that every stored event is schema 2.
- **The fold reads one shape.** No reader of schema 1 is kept: not in the fold, not in the game's replay, not
  in the server's projections.
- **An alias table per course** is what `upgrade` reads, written by the converter and committed:
  `courses/<id>/aliases.yaml`. The compiler puts it in the bundle.
- **One id that is now several parts** is resolved by the sentence, which an old event names
  (`exercise.item`):

  ```yaml
  sense:tener:
    part: 'lexeme:tener'                                 # where the sentence is not known
    byItem: {s.past.12: ['lexeme:tener', 'lexeme:tener|stem:tuv']}
  form:pret-3s:
    byItem: {s.past.12: ['feature:Tense=Past|use:completed']}
  ```

  The converter knows every sentence's old KCs and new parts, so it writes `byItem` for all of them. A credit
  whose sentence is gone, or that came from a drill, goes to the lexeme itself and to nothing else: it never
  invents a listed form or a rule's branch.
- **Nothing old counts towards a rule** (ADR 0146): an upgraded event has no `displayed`.
- **The other places an id is kept** are rewritten with the log, through the same table: card keys and their
  FSRS state come out of the fold again; open mistakes, a placement's `seeded` and corrections whose item is a
  KC are in events; a session's plan kept on the device is dropped (a session under way is started again).
- **The performance model** takes its difficulties per KC today, and ADR 0146 leaves its key open. For the
  switch: per part, seeded from the old KC's value through the table. It is retuned before anything is tuned
  against the simulation.
- **Old apps are not kept working.** After the switch the server takes schema 2 only. What an old app uploads
  is refused event by event and held on the device, as a bad event is today (ADR 0108), and goes up once the
  app has updated and rewritten its log. An old app cannot read a new bundle: the manifest carries a format
  version, and an app that does not know it keeps the bundle it has and asks to be updated.
- **A download made before the switch** (Your progress, restore) is upgraded as it is read.
- **`fold-before-r2.ts`** gets a successor: the oracle folds an upgraded log and must agree with `replay`.

### What must be true of a real log on the day

Tested on exported logs, not the simulator (ADR 0145):
- Every word the old fold calls known or learning is a lexeme the new fold calls the same, or the report says
  why not (it became a form of another lexeme).
- Nothing is due that was not, and nothing stops being due, on the day of the switch.
- Streaks, XP and the game's projections do not move: they read answers and sessions, not KC ids.

## What must not change, and how it is checked

| What | Check |
|---|---|
| Every sentence, story line and translation as displayed | The old and new bundles' compiled text and translations are equal, item by item, byte for byte |
| The 148 reviewed clips (apc 82, fa 37, uz 29) | Each keeps its item, its voice and the exact text its voice was given |
| The 7,696 clips | None becomes stale: the compiler reports no `audio.stale` in any course (`pnpm courses`) |
| The 2,193 clips keyed by a KC | The converter renames the item in `audio/index.yaml` with its lexeme and changes nothing else in the entry; a test compares file, sha256, voice and input before and after |
| An item's voice | A voice is drawn from a seed of the item's id, so a renamed id would redraw it. The converter writes the voice every existing item has into `audio/assignment.yaml`, and `assignment` reads a pinned voice before it draws |
| Sign-offs | None exists on a sentence, story or unit today. The clips' reviews are the ones to keep |
| A learner's list | The checks on real logs above |

- **Task B's finding bears on the second row:** for 18 of apc's 82 reviewed clips the projection writes other
  marks than the voice was given ([lexical-forms/apc-review.md](lexical-forms/apc-review.md)). The course's
  vocalization stays the source of what the voices read until those are settled. A projection does not replace
  a pinned text it does not reproduce: that is a finding, not a regeneration.

## Feedback and the lexeme's parts

- **Labels are messages** in `packages/i18n/messages/`, one per label and one for a known pair, as notes have
  today:

  | Id | English, proposed |
  |---|---|
  | `feedback.label.slip` | A slip of the keys. |
  | `feedback.label.orthographic` | Right sound, wrong letter. |
  | `feedback.label.orthographic-pair` | Right sound, wrong letter: {$expected}, not {$answer}. |
  | `feedback.label.phonemic` | That spells another sound. |
  | `feedback.label.grammatical` | Right word, another form. |
  | `feedback.label.regularised` | That would be the regular form; this one is its own. |
  | `feedback.label.lexical` | Another word. |
  | `feedback.label.scope` | Right meaning, another way of speaking. |

  Today's `feedback.note.*` stay: they are a profile's policies, not misses (ADR 0148).
- **The feedback panel** lists every label, the worst first, each with the word it is about, as notes name
  their words now (`AlignOp.note`). No new layout: the list the panel has.
- **A lexeme's parts** are shown where the word list shows a word today: its entry opens to its parts, each
  with what shows it ("have · 3 of 5"; ADR 0146's table). The explainer's mockups are a starting point. A
  regular lexeme shows one part and points at its rules.
- **A rule has an entry of its own** in the list ("-ar present: 4 of 6"), new in the UI.
- All of it is TaggedText through `<T>`, logical CSS, in the visual matrix (LTR, RTL, vertical).

## What the converter reports

Its own test is the strongest there is (the handoff): every course comes through, and each finding is a
question. The report, per course:

- sense KCs that are inflected forms, and the lexeme each was folded into;
- second forms, sorted or not;
- nouns whose gender no proposed default gives;
- tokens whose form the lexicon's listed and pinned forms do not account for;
- pinned spellings, readings and marks a stated projection does not reproduce (Task B's list is apc's);
- constructions, each with its sentences, undecided;
- ids that changed, and credits that could not be resolved by sentence.

## Not designed here

- **Rules:** their file shape, and the vectors each ships with. They come after the switch, one at a time.
- **Trees:** only `head` and `rel` on the tokens that need them.
- **What the simulated learner knows of a rule** (ADR 0146 leaves it open), and the planner's use of parts.
- **The script-track gate's test-out** (ADR 0149) and the tracks fa, hbo, apc's Arabic and uz's Cyrillic lack.
- **How syntax is taught.**
- **Whether sentences and stories become a pool** the units point at, as the lexicon now is.

## Deliverable 1, as built

The schemas, with examples of what validates and what must not (`schemas/examples/`) and the generated
TypeScript and Pydantic types. Nothing reads them: no code names one of the new types yet.

| File | What it holds |
|---|---|
| `schemas/language.schema.json` | `LanguageDeclaration`: varieties, registers, dimensions by UD tag, features and their values, defaults, classes |
| `schemas/lexicon.schema.json` | `Lexicon` and `Lexeme`, with the shapes of a lexical form (a string, a base's radicals, a pattern's templates, a listed item's parts, a logograph), listed and pinned forms, allomorphs, scope |
| `schemas/course-source.next.schema.json` | The course source in the new shape: `NextToken` with its `lexemes`, `PromptTag`, units that define no lexemes |
| `schemas/learner-event.next.schema.json` | Every event at schema 2: `PartCredit`, a miss's labels, `displayed`, `story_line_read` |
| `schemas/aliases.schema.json` | `AliasTable`: what each old KC id became |
| `schemas/common.schema.json` | The ids: `LexemeId`, `RuleId`, `FeatureValueId`, `TeachableId`, `PartId`, `ConceptId`; `Skill`, `MissLabel`, `Question` |
| `schemas/orthography-profile.schema.json`, `reading-scheme.schema.json` | `Correspondence`, as an optional `correspondences` |

**Settled while writing them** (each is small, and none is in the sections above):
- **The new course source and the new events are files of their own,** with `Next` before the names they
  replace. Each was derived from the shape it replaces, so nothing else differs. At the switch they take the
  old files' places and the prefix goes. Changing the live schemas in place would have loosened them for the
  courses and events that exist.
- **A unit lists its `graphemes`:** the letters its script nodes teach. They are no lexemes, and a unit has
  no `kcs` to hold them.
- **A sentence's `uses`** is what `constructions` was: the rules and listed items it is an example of, until
  rules are written and the compiler can find them.
- **`Question`** (`lexeme`, `form`, `use`) replaces `Asks` (`word`, `form`): ADR 0147's third question, and
  no "word".
- **`Skill`** is the six facets and two more for a feature's use: `choose` and `read-off` (ADR 0146's table).
- **A dialect tag is not in the source's `PromptTag`:** the compiler derives it (ADR 0147), so only the bundle
  will have it.
- **Conditions are small:** a default's `when` and an allomorph's `after` and `before` look at a part of
  speech, an ending, a beginning, a class and feature values. They grow with the rule format.

**Left to lints,** since the schema files use none of JSON Schema's conditional keywords and both code
generators are kept on the constructs they already handle:
- an entry is one of three kinds: it has `pos`, `realises` or `head`;
- a form has `form` or `stem`;
- a token names its one lexeme or lists several, never both;
- `head` and `rel` come together, and `head` names an `n` of the utterance;
- a lexeme's classes, a token's feature values and a scope's varieties are ones its language declares.

The converter (deliverable 2) writes against these and reports what they do not hold.

## Deliverable 2, as built

`cd pipeline && uv run nabu migrate ../courses` (`pnpm migrate`) converts all ten courses. For each it
writes, and never by hand:

| File | What it is |
|---|---|
| `lexicons/<lang>/language.yaml` | The language's declaration: dimensions, lexical features, the citation cell, features and values, defaults, labels |
| `lexicons/<lang>/lexemes.yaml` | Its lexicon, flat and sorted by id |
| `courses/<id>/next/` | The course in the new shape: `course.yaml`, its units, and `audio/assignment.yaml` where the cast has several voices |
| `courses/<id>/aliases.yaml` | What each KC id became |
| `docs/migration/<id>.md` | What the converter found: [the page over all ten](migration/README.md) |

Nothing in the app reads any of it. `pipeline/tests/test_migrate.py` converts every course and fails where
a check fails or a committed file is out of date, so **a change to a course's source needs the converter
run again**, as it needs `pnpm bundles`.

**Ten courses: 3,145 lexemes** (3,021 senses, less 8 that are forms or built words now, plus 132 endings and
other lexemes that were `form:` and `construction:` KCs), **1,639 pinned forms, no listed form.** Every
check passes in every course.

### The plan

What a course does not say, the converter cannot decide: that `form:pret-3s` is Tense=Past with the third
person singular, that uz *-ga* realises the dative, that apc *raye7* is a form of *ra7*. Each course has a
**conversion plan** (`pipeline/src/nabu/migrate/plans/<id>.yaml`) that states these, drafted by an LLM and
awaiting review like every profile policy (REVIEW). The converter applies the plan and decides nothing.

| A plan states | For |
|---|---|
| `forms`: a form KC's feature values (by part of speech where they differ), or the lexeme it is | every `form:` KC |
| `constructions`: the lexeme a construction is, or the rule's name it keeps | every `construction:` KC |
| `bare`: what a token says when no form is pinned on it | masculine singular; an es verb's infinitive; an apc verb's command to a man |
| `citation`: the cell an entry is spelled in | es infinitive; apc he-past; grc first person singular |
| `lexical`, `defaults`: what a lexeme has of itself, and the endings that give it | a noun's gender |
| `senses`: a sense that is a form of another lexeme, or built of several | apc *raye7*, *baddi*; fa *bud* |
| `tokens`: one token the course pins nothing on and that is not what a bare token is | es *eso*; an infinitive with a pronoun on it |
| `stems`: the ending an entry is cited with, so that its stem explains itself | uz *-moq*; fa *-n* |
| `relations`: the rules that draft agreement's edges | es, apc, hbo, grc |
| `questions`: what the drafter saw and did not decide | every course with any |

### What it does

- **A form KC pinned on a token is feature values;** one written as a morph is a lexeme. Both tables are
  the plan's. Where the KC names less than the forms differ by (es `form:impf` names no person), the plan
  may read the rest off the ending (`refine`: *-mos*, *-s*, *-n*).
- **A token lists the lexemes it writes and marks its base,** the one today's `sense` named. A sense that is
  built of several lexemes (apc *baddi*) is cut by how each is written elsewhere in the course.
- **Every form the entry's own spelling does not account for is pinned.** A token stands in its entry's
  cell where every value it names is the citation cell's; any other form is a pinned form with its values.
  Another spelling in the entry's own cell is an allomorph (uz *singl-*, fa *dār-*, es *gran*).
- **Spellings are paired across orthographies** by the lexemes a sentence names: it names the same ones in
  the same order in each (868 of apc's 868 items, once an entry written as several tokens is one).
- **A noun's gender is its lexeme's** where every token of it agrees. An entry stores it only where no
  default of the plan gives it: 158 lexemes, each a part to learn (ADR 0146).
- **Relations are drafted by the plan's rules:** a determiner and an adjective to their noun, a
  preposition and an article to the word after them or the word they are written on. A rule links only
  where the values agree and nothing but the words it may skip stands between. 4,610 edges in four courses.
- **Letters are compared, never marks** (CLAUDE.md): case, Arabic vowel signs and the shadda, Hebrew
  points, a Greek grave and invisible characters make no difference to whether a token is written as its
  entry. Where an entry is written with its marks (hbo), the lexicon keeps every pointing of a form.

### What it checks

Each on what was written, not on what the converter meant (`pipeline/src/nabu/migrate/checks.py`):

| Check | What it reads |
|---|---|
| Every sentence and story line as displayed | Text, tokens in order, readings, vowel marks, accept sets and translations, item by item, byte for byte |
| No two annotations became one | Whatever the course told apart, the converted course still does |
| Every lexeme a token writes is accounted for | Its entry's spelling, a pinned form with its values, or an allomorph: from the files alone |
| Every name points at something | Lexemes, feature values, letters, relations' numbers |
| Every file fits its schema | The generated models and the JSON Schemas themselves |
| Every word clip has one name | 2,193 clips keyed by a KC: 2,185 renamed with their item, 8 listed |

The old and new bundles cannot be compared until the compiler reads the new shape; the first check is its
stand-in on the sources.

### Settled while building it

None of these is in the sections above. Each is small, and each is the owner's to overrule.

- **A form KC's gloss and notes become a label.** The note said the KC goes and did not say where its
  words go. `language.yaml` has `labels`: what a learner is shown for a set of feature values (ADR 0146: a
  built gloss is a message over the names of feature values, which are language data).
- **A node introduces feature values,** each once, at the first node whose form KC brings it
  (`feature:Tense=Past`). A later form KC that brings no new value leaves its node with less to introduce
  (7 nodes). No rule's name is invented for a form: what was learned under it is a rule's branch, and no
  rule is written (ADR 0146).
- **A construction keeps a rule's name** (`rule:used-to`) and is not decided; the plan's note gives the
  drafter's reading of each. Three are lexemes already: fa's ezafe, which is written as a morph; *dust
  dāštan*, a listed item whose form is its parts'; and *hast* "there is", which has a spelling and a clip.
- **A token's base is marked** (`base: true`). A card that asks which lexeme, or which form, needs to know
  which of a token's lexemes it asks. It is ADR 0145's base (what the others are merged onto), not a word.
- **A noun written in both genders keeps the gender on its tokens,** and its entry says so (`chooses`):
  es *hermano*, *tío* (the course writes *tía* under it and never *tío*); apc *rfi2*; 23 lexemes. By ADR
  0145 the feminine is a derivative, a lexeme of its own where it is listed: decided per noun.
- **Old credits for a form KC have nowhere to go** (133 KCs): feature values have no uses authored, and
  nothing old counts towards a rule. The alias table gives them no part.
- **The audio index is not rewritten.** The converter says what each word clip's item is called now and
  pins the voice each has (four casts of two voices: 1,455 items).

### What the schemas gained

| Where | What | Why |
|---|---|---|
| A token's lexeme | `base` | Above |
| `language.yaml` | `lexical`, `citation`, `labels` | Which features a lexeme has of itself; the cell an entry is spelled in; a form KC's words |
| A lexeme | `chooses` | A lexical feature its tokens choose instead |
| An allomorph | `spelled` with no `form`; `form: ''` | No lexical-form notation yet; a lexeme the script does not write (ADR 0136) |
| A feature name | A layer (`Person[psor]`) | A possessor's person on a noun |
| A story's wrong option | A list of lexemes | A built word offered against a word (apc *esmak*) |

### For the owner

The reports list 465 findings; most are for whoever reviews a course. These are the ones that bear on the
switch, or on a decision above:

1. **Labels, and feature values as what a node introduces:** both are read into the note's "the KC itself
   goes". The alternative is a rule's name for each form KC, kept until the rule is written.
2. **`base` on a token's lexeme:** it is no unit between a token and a lexeme, and it is one more thing
   the format says of a token than the owner's "a token lists its lexemes".
3. **Nouns in both genders** (23): a feature the token chooses, or two lexemes, per noun.
4. **Proper names:** apc, hbo and grc keep a name's gender on its lexeme; es keeps it on the token, since
   the course pins it only on single-word names. One rule for all four would be better.
5. **Feature names where Universal Dependencies has none or its treebanks differ:** hbo's weqatal,
   jussive, cohortative and infinitive absolute; grc's aorist against its perfect; chg's aorist. Each
   plan says what it chose and why.
6. **Eight word clips** say a word that is no lexeme of its own now (apc *baddi*, *baddak*, *esmi*,
   *esmak*, *kifak*, *raye7*; fa *bud*, *nist*): what keys a form's clip is the switch's to say. None was
   checked by a person.
7. **What the reports found in the courses themselves:** es *el ave*, *el alma*, *el azúcar* pinned
   against the course's own rule; apc verbs cited as a command or a b-present, not as Kline cites them;
   uz entries shown as a built word; hbo words with a suffix not analysed; fa present stems, which ADR
   0145 calls listed and no statement lists.

**The owner's answer (2026-11-21): "go".** The seven were put with a default each, and the two points read
into the first answers with them; the owner took the defaults and started the switch.

| | Stands as |
|---|---|
| 1 | Built: a form KC's gloss is a label, and a node introduces feature values |
| 2 | Built: a token marks which of its lexemes is its base |
| 3 | Built: a regular gender pair is one lexeme whose tokens choose the gender; two lexemes only where the feminine is a word of its own |
| 4 | A proper name's gender sits on its lexeme in every course: es is moved at the switch |
| 5 | Built: the feature values each plan chose |
| 6 | A form's clip is keyed by its lexeme and its feature values, at the switch |
| 7 | The courses' findings go to review, not into the switch |
| | The token kind `word` is renamed at the switch; sentences and stories stay in their unit files |

**Tags and glosses (the owner, 2026-11-21):** "ideally we use UD/Leipzig, unless we run into trouble". Read
as: parts of speech, features and relations are Universal Dependencies', and a gloss's abbreviations are the
Leipzig Glossing Rules'; where either does not fit a language, the format departs from it and says where
(apc's participle as `Aspect=Part`). A lexeme still takes one tag, which UD gives a word in its sentence:
the tag whose dimensions it inflects for, else the one its distribution in its own language gives.

### Not done

- **No form is listed.** A listed form needs a statement that the language has no rule for it (ADR 0145);
  none is drafted, so every form is pinned and no lexeme has a part but itself and a stored gender.
- **No lexical form.** Every entry pins its spellings (`spelled`) and its readings stay on the tokens.
  apc's notation ([lexical-forms/apc.md](lexical-forms/apc.md)) has the owner's rulings (2026-11-20); its
  rules are not written, and it is not read.
- **No rule, no class, no feature's use.** A sentence's `uses` name rules that are not written.
- **Relations are a draft:** a determiner, an adjective and a preposition. A subject and its verb, a
  governed case's value and everything else wait for trees (ADR 0145).
- **One course a language.** Two courses of one language would write one lexicon between them, which the
  converter refuses rather than merge.

## Deliverable 3, the switch: build order

The owner said "go" on 2026-11-21. The stages are build order on one branch, and nothing of them reaches
main before the switch is whole (ADR 0148: never half-switched). Each stage has a check of its own, so a
fault is found in the stage that made it.

| | Stage | Done when |
|---|---|---|
| 1 | **The new bundle's shape,** beside the old one: lexemes where it had KCs, tokens that list lexemes, a language's labels, the alias table, a format version | `pnpm codegen` is clean, and the schema has examples that fit and that do not |
| 2 | **The compiler** writes it from `lexicons/<lang>/` and the converted units, beside today's bundles | Every course compiles with no new diagnostic; each sentence's and story line's text and translations equal today's bundle, item by item; no clip is stale and each word clip has its lexeme's name |
| 3 | **Core reads it:** lessons, the planner, placement, stories, the list and the Data page work on lexemes, forms and feature values | Every fixture course's lessons plan from the new bundle; the golden files are rerun and each difference is explained |
| 4 | **The log:** schema 2 events, `upgrade(event, aliases)`, the fold over parts, the device's rewrite of its log and the server's job | The oracle that succeeds `fold-before-r2.ts` agrees with `replay`; "What must be true of a real log on the day" holds on exported logs |
| 5 | **Losses and labels (ADR 0148):** every profile and scheme states its correspondences, core runs them, a grade carries labels, the compiler reports leftovers and the fold counts them | ADR 0148's "Done in one go", points 1 to 6 |
| 6 | **What a learner sees:** labelled feedback, a lexeme's parts and a rule's entry in the list | The visual matrix (LTR, RTL, vertical) and the e2e suite |
| 7 | **The flip:** the app reads the new bundles and nothing else; the old sources, bundles, schemas and readers go, the converter and its plans with them; `Next` leaves the schemas' names and the token kind `word` becomes `lexical` | Nothing names a KC or reads a schema 1 event; every check of the handoff passes |

- **The new is built beside the old, and the old goes last,** so every stage can be checked against what
  runs today.
- **Stages 1 to 4 and 7 change nothing a learner sees** but ids under the hood. Stage 5 changes grading
  (ADR 0148: stricter in es, and wherever a profile states a fixed correspondence) and is the largest: 22
  profiles and 8 schemes each need a reviewed statement.
- **Proposed to the owner, not decided:** land stages 1 to 4 and 7 as the switch, and stage 5 with stage 6
  as a deliverable of its own right after. Nothing in 1 to 4 waits on 5: a schema 2 event's `labels` may be
  empty until grading has labels, so the log is not rewritten twice. One landing of all seven is the note's
  first plan and stays the plan until the owner says otherwise.
- **Taken with the "go"** ("For the owner", above): a proper name's gender moves to its lexeme in es (the
  plan's `lexical`), before the converter's last run; a form's clip is keyed by its lexeme and its feature
  values in stage 2.

## The owner's decisions (2026-11-20)

The eight questions this note ended with, and what the owner answered. The sections above are rewritten to
the answers.

| | Asked | Answered | What it changed |
|---|---|---|---|
| 1 | Two silent deliverables (schemas, converter), then one switch of all ten courses | "yes, silent then big switch" | Nothing |
| 2 | `lexicons/<lang>/` at the root, entries in files by unit | Fine, but not by unit: "things should be flatter, to allow for easier rearrangement and retooling of units. units should point towards a common lexicon, the lexicon shouldn't be organized by unit" | One list a language; no entry names a unit; a unit file loses its `kcs:` |
| 3 | Ids `lexeme:<name>`, keeping today's names; a part as `node` and what of it | "fine by me" | Nothing |
| 4 | Old events never rewritten, folded through a per-course alias table | "yes broadly, but don't be afraid to rewrite anything if need be to fit the schema. backwards compatibility isn't a high priority" | One `upgrade` function; the logs are rewritten once; no reader of the old shape is kept; old apps are told to update |
| 5 | UD's multiword tokens for clitic groups | "we should probably shy away from 'word' as a concept at all. it can be used in presenting info to the learner, but not at all as an internal unit" | No `words` under a token: it lists its `lexemes`, stems, clitics and affixes alike. What "word" still names is listed for the owner |
| 6 | A sign-off per lexicon entry, signed once for every course of the language | "eh, ok, don't care" | Nothing |
| 7 | Voices pinned by the converter in `audio/assignment.yaml` | "yeah that's fine" | Nothing |
| 8 | apc's vocalization stays the voices' source until the review list's clips are settled | "that's fine" | Nothing |

**Read into the answers** (each is marked "for the owner" where it stands; both stand since the owner's
"go" of 2026-11-21):
- From 5: the token kind `word` in TaggedText is renamed at the switch, and the fold's names follow; card
  names that say "word" stay.
- From 2: sentences and stories stay in their unit files. Whether they should be a pool too was not asked.
