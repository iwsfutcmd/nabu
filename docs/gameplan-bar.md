# South Tyrolean: the build plan

- Date: 2026-11-23
- Status: stages 0 to 6 built 2026-11-23 (the owner: "whatever, just go wild"), but for the units' review
  stop in stage 3, which waits for a reader; stage 5's clips are being made; stage 7 later. Where each stage
  stands is under "Where it stands" at the end.

What it builds: the course `bar` that [ADR 0156](adr/0156-south-tyrolean.md) describes. Each stage is one
roadmap deliverable, a few small commits, CI green after each, as in [gameplan-sk.md](gameplan-sk.md).

## Stage 0: the plan (this commit)

- ADR 0156 (Proposed) and this file.
- Library notes, `nabu/notes/bar/`: `survey.md` (what Moser and Weiß attest, headword by headword,
  and what they lack) and `tts.md` (the voice search, the VinKo map's file layout, the test).
- The voice test: two VinKo speakers cloned, nine dialect items each (ADR 0156); files with the owner.

## Stage 1: the orthography

- `profiles/bar-Latn.moser.yaml`, every policy REVIEW:
  - letters: German's (ä ö ü ß among them, for what learners type); exemplars `cldr:de-IT` (CLDR has no bar
    locale; å is in de-IT's auxiliary set, and normalization reads it as o);
  - normalize: NFC, curly apostrophes to straight (the apostrophe is a letter in *’s*, *’n*), punctuation
    stripped, whitespace collapsed;
  - case folded in `de`; no mark is required: å's ring is a free spelling (å, a, o);
  - the sound statement (ADR 0148): the free correspondences of ADR 0156, each with conformance vectors in
    `projection.json` and `grade.json`, both harnesses;
  - typos on a German QWERTZ layout (`profiles/keyboards/de.yaml`); contrast sets for the person endings
    (-sch, -t, -ts, -n) and the article's case forms (der, in, inda, di).
- `input.keyboard: de` (ADR 0143).

## Stage 2: the language and the lexicon

- `lexicons/bar/language.yaml`: dimensions, Case (Nom, Acc, Dat), Gender, Number, Person, Mood, Tense,
  VerbForm; `defaults` only where an ending settles a gender (the dialect drops German's final -e, so
  fewer do than in German: most nouns store theirs);
  `labels` by pronoun and by use; `registers: [formal, neutral]`; `rules: rule:tian-would`.
- `lexicons/bar/lexemes.yaml`, flat, sorted by id; the A1 core from Moser's examples and the survey's
  table, every form not attested in Moser marked REVIEW in a comment (the gaps: *woaß*, *kinnen*, numbers).

## Stage 3: the course and unit 1

- `courses/bar/course.yaml`, `README.md` (brief, cast, conventions, syllabus), unit 1 (greetings,
  *i bin*, *bisch*, *isch*), its story; `pnpm courses` clean; `pnpm bundles`.
- **Stop here for a native reader** (ADR 0156: Claude's written dialect needs checking early).

## Stage 4: units 2–10 (A1)

- Family, food (*Marende*, *Knedl*), the house, the week, the perfect (*i hon gessn*, *i bin gangen*),
  *war*, the dative after prepositions, modals (*welln*, *megn*, *muaß*), *nit* and *koan*.

## Stage 5: audio

- `nabu audio cast --recording` for the chosen VinKo speakers (references cut on whole words, no breath
  at either end), transcripts checked by a listener; `nabu audio generate ../courses/bar` on Kaggle or
  CPU; `nabu audio align`; the audio check; `audio.quality` iffy until a listener says otherwise.
- The round trip off for bar (Whisper writes Standard German): a profile `speech` entry saying so.

## Stage 6: units 11–20, the scenarios

- The subjunctive (*tat*, *war*, *hatt*), *es/enk* in full, clitics after conjunctions, relative
  clauses (to be checked: neither book has them), Italian loans in daily use, valley variation as a unit.

## Stage 7: the `scope` label

- Standard German forms the course knows (a list per lexeme, `standard:` in the lexicon, REVIEW) graded
  `scope` (ADR 0148) with its feedback line; conformance vectors; the catalog messages.

## Risks

- Claude's drafting: the forms Moser does not attest are Claude's, and Moser's examples keep their
  contributors' spellings. Every unit's review list names them.
- Voices from volunteers: the licence and consent allow it; the owner decides (ADR 0156, question 5).
- A spelling with no norm: the free correspondences must merge no two forms the course keeps apart
  (prove each, as apc-Latn's were).

## Where it stands (2026-11-23)

- Stage 0: done (ADR 0156, this file, the voice test, library notes `nabu/notes/bar/`: survey.md, tts.md).
- Stage 1: done. `profiles/bar-Latn.moser.yaml`, `profiles/keyboards/de.yaml`, `cldr:de-IT` exemplars; vectors in
  conformance/normalize.json (3), projection.json (4), grade.json (9), both harnesses.
- Stage 2: done. `lexicons/bar/language.yaml` and `lexemes.yaml` (269 lexemes, 263 pinned forms), first written by
  the generator (library: `nabu/notes/bar/generator`).
- Stages 3, 4, 6: ten units (374 sentences, ten stories, nine scenarios), compile clean; the review stop after unit
  1 was not made (no reader yet): courses/REVIEW.md lists what to check first. Units 11–20 are not drafted.
- Stage 5: both voices cast; clips generated on a CPU (about 30 s a clip), committed as they are made.
- Stage 7 (`scope`): not started.
