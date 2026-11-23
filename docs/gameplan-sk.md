# Slovak: the build plan

- Date: 2026-11-23
- Status: proposed plan, for Ben to accept, reorder or cut

What it builds: the course `sk` that [ADR 0155](adr/0155-slovak.md) (Proposed) describes, from the
brief and syllabus in [courses/sk/README.md](../courses/sk/README.md). Each stage below is one
roadmap deliverable, landed as one or a few small commits, and leaves CI green.

## Questions for you first

The plan has an answer proposed for each; the stages that depend on one say so.

1. **The learner.** Proposed: an adult English speaker starting from nothing, A1 to B1. The other
   course this could be is a heritage course, as es is (a Slovak-American family's grandchild, who
   understands some): it would start later, lean on typed production and the adaptive placement
   (ADR 0077), and keep a family at its centre. Shapes stages 3–6.
2. **The cast and the story frame** (the README): Emma and Adam in Banská Bystrica, the Hudecs, the
   village in Spiš. Keep, change or replace. Stage 3.
3. **The voice.** Proposed: Piper's `sk_SK-lili-medium` (a Slovak model, one woman, its data CC0;
   the license of its English base's data still to check), then an OmniVoice clone of a man's CC0
   recording if you want two voices; or two OmniVoice clones from the start (clips CC-BY-NC). Stage 5.
4. **d', t', l' typed for ď, ť, ľ.** The caron on those three is printed as a stroke that looks like
   an apostrophe, and learners copy what they see. Proposed: fold an apostrophe after d, t, l (and
   D, T, L) into the caron in normalization (REVIEW), since Slovak writes no apostrophe there. The
   alternative is to grade it as a missing mark. Stage 1.
5. **Authentic texts.** Proposed: every story written for the course. A choice for units 17–20 is a
   short public-domain text beside the story: verses of a folk song, proverbs, the opening of one of
   Dobšinský's tales (1880s). Dobšinský's own spelling is pre-1953 (other than today's in places),
   and a modernized edition may carry an editor's rights, so it would be quoted in its own spelling
   with a note, or modernized by the course itself. Stage 6.
6. **Aspect pairs.** Proposed: two lexemes, each noting the other (as UD lemmatizes them). Later,
   with rules, a perfective made by a prefix could be a derivative (ADR 0145's function heads); not
   predictable which prefix (*napísať*, *urobiť*, *prečítať*), so it would stay listed. Stage 2.
7. **A native reviewer.** Every sentence is a draft until one signs off (ADR 0072–0074).
8. **A fixture course?** Proposed: add sk to CLAUDE.md's fixture courses once units 1–10 build clean,
   so CI keeps it green. Stage 4.

## Stage 0: the plan (this commit)

- ADR 0155 (Proposed), `courses/sk/README.md`, this file.
- Reading notes in the library, `nabu/notes/sk/references.md`: the three books, where each topic is,
  page offsets, what their text layers get wrong.
- Done when: you have answered the questions above, or said which to leave open.

## Stage 1: the orthography

- `profiles/sk-Latn.standard.yaml`, every policy REVIEW, written with Python where it holds escapes
  (CLAUDE.md):
  - `letters` (the 46, `ch`, `dz`, `dž` among them), `exemplars: cldr:sk`, `segmentation` as es's;
  - `normalize`: NFC, curly apostrophes, the d'/t'/l' fold if question 4 says so, punctuation
    stripped, whitespace collapsed;
  - `match`: case folded in `sk`; marks `[́̌̈̂]` all `required`; `typo` on the
    Slovak layout with contrast sets for endings (*a, u, e, i, y, o, á, é, í, ý, ú, om, ou, ov, ám, ách,
    ami, ým, ých, ými, ej, m, š, me, te, ia, l, la, lo, li*) and pronouns (*ja, ty, on, ona, ono, my, vy,
    oni, ony*; *ma, ťa, ho, ju, mi, ti, mu, jej, nás, vás, ich, im*);
  - the sound statement as ADR 0155 states it (i/y, the soft d t n l, ä, voicing, v and u as u̯), each
    correspondence with a comment saying why, and what was left out and why;
  - `speech: {tiers: [1]}`, `input: {keyboard: sk}`, `layout: {vertical: none}`.
- `profiles/keyboards/sk.yaml`: the Slovak QWERTZ layout (the national standard's), for the typo
  model.
- Conformance vectors in `conformance/` (normalize, grade, projection; ADR 0153), passing in both
  harnesses:
  - normalize: decomposed marks composed (d + U+030C is ď); „…“ stripped; the fold, if decided;
  - grade: *pas* for *pás* and *cas* for *čas* phonemic; *zle* for *zlé* lexical once both are words
    of a vector's lexicon; *ďeti* for *deti*, *hrat* for *hrad*, *meso* for *mäso*, *pánou* for
    *pánov*, *fšetko* for *všetko* orthographic; *biť* for *byť* orthographic, and lexical with *biť*
    in the lexicon; *ti* for *ty* phonemic; a missing caron never a typo;
  - projection: `read`, `compare` and `spellings` for each correspondence, the `rare` ones never
    offered (*deti* offers no *ďeti*; *mäso* offers *meso*).
- Two new notes for feedback, `length` (the long mark) and `caron` (the soft mark), in every UI
  catalog (English written, the others drafts, stamped: `check-catalogs.ts --stamp`).
- Done when: `pnpm conformance`, `pnpm check:catalogs`, `pnpm test` (the profile schema tests in both
  languages) pass.

## Stage 2: the language and the lexicon

- `lexicons/sk/language.yaml`:
  - `dimensions`: NOUN [Case, Number]; ADJ [Animacy, Case, Degree, Gender, Number]; DET, PRON, NUM
    [Animacy, Case, Gender, Number]; VERB and AUX [Gender, Mood, Number, Person, Polarity, Tense,
    VerbForm];
  - `lexical`: NOUN and PROPN [Animacy, Gender]; VERB [Aspect];
  - `citation` and `bare` cells (a noun's nominative singular, an adjective's masculine nominative
    singular, a verb's infinitive);
  - `features` as UD's Slovak treebank uses them; `defaults` for gender and animacy by ending;
    `registers: [formal, neutral, colloquial]`; `labels` (the README's table, every case in both
    numbers, every person, the past by gender, the imperative, the conditional).
- **A label that reads a lexical feature.** A perfective's present says the future. `labels` can be
  narrowed by `pos` today, not by a lexeme's own features: either a `lexical` key on a label (schema
  in `schemas/`, then `pnpm codegen`, and core's `labelOf`), or the note on the present's label says
  it. The first needs a short ADR (an amendment to 0145's labels).
- `lexicons/sk/lexemes.yaml`: unit 1's lexemes, every form its sentences write pinned.
- Done when: the schema tests pass, and the Data page (debug mode) shows the lexicon and the language.

## Stage 3: the course and its first unit

- `courses/sk/course.yaml`: `names` in English (Slovak; "Slovak as it is written and spoken in
  Slovakia, from the start") and in each UI catalog's language as drafts, as es has them;
  `iPlusOne: 2`, `wordParts: true`, `lexicon: sk`; `aliases.yaml` as the compiler wants it.
- `units/u01-ahoj.yaml`, the model unit: its nodes, about 30 sentences, the story.
- `cd pipeline && uv run nabu build ../courses/sk --check`: no errors, no warnings. Then `pnpm courses`
  and `pnpm bundles`.
- The tests that list courses take sk (the pipeline's `test_courses.py`, `test_course_names.py`,
  `test_aliases.py`; core's planned-lesson walk and the simulation, every course within ±5pp of 85%).
- In the app: a lesson by keyboard and by touch; the card gallery in Storybook.
- Done when: `pnpm lint`, `pnpm typecheck`, `pnpm test` and the e2e lesson for sk pass.

## Stage 4: units 2–10 (A1)

- One unit a commit, each clean under `--check`, with its story; i+1 kept.
- Every form pinned in the lexicon is checked against Mistrík's paradigm for its class (Slovak
  spellings from the page image, never the text layer alone).
- The persons spread (ADR 0075): count per unit speaker m and f, addressee m, f and pl, and formal
  *vy*, and keep them even before committing.
- Golden files: `UPDATE_GOLDEN=1` for sk's alone, read before committing.
- Done when: as stage 3, for every unit; sk is a fixture course if question 8 says so.

## Stage 5: audio

- The cast question 3 chose: `nabu audio cast` (for a clone, `--recording` with its license, author and
  source), `nabu audio generate ../courses/sk`, `nabu audio align` where a voice gives no word timings,
  the round trip (Whisper hears Slovak), then a listener in the audio check (`#/sk/sk-Latn/audio`,
  `nabu audio verdicts`). `audio.quality: good` only after that; then `pnpm bundles`.
- Done when: `nabu audio report` lists no unchecked clip, and listening cards appear in lessons.

## Stage 6: units 11–20 (A2 to B1) and the scenarios

- As stage 4, unit by unit; the eight scenarios of the README; authentic texts if question 5 says so.
- The aspect sentences (units 11, 17) are where accept sets are most likely wrong: each sentence's
  set is read for "would this translate the prompt?" in both directions.

## Stage 7: a native-speaker pass and the review list

- One more model pass, prompted in Slovak to read everything as a native speaker would (as in
  November 2026 for the other courses), fixing what it finds and widening accept sets.
- `courses/REVIEW.md`: what a Slovak reviewer should check first (aspect choices; clitic order in
  accept sets; agreement under formal *vy*; animacy in the accusative and the plural; the i/y spellings;
  the sound statement's hard *de, te, ne, le*).
- `courses/README.md` gets sk's row; CLAUDE.md gets "Slovak notes".

## Stage 8, later: sk's rules

After apc's rules and Spanish verbs (docs/rules-design.md), Slovak's inflection as data:
- the noun paradigms (*chlap, hrdina, dub, stroj; žena, ulica, dlaň, kosť; mesto, srdce, vysvedčenie,
  dievča*; M 27–45) and the adjective ones (*pekný, cudzí*; possessive *otcov, matkin*; M 51–53);
- the conjugation classes (M 78: fourteen paradigms; KK teaches ten);
- as `phonology`: the rhythmic law (M 35), the lengthening of the genitive plural (*žena*, *žien*;
  *kniha*, *kníh*), the fleeting e (*pes*, *psa*; *deň*, *dňa*), the softening of masculine animate
  plurals (*vojak*, *vojaci*; *Čech*, *Česi*).

The compiler then checks every pinned form against them (`form.unaccounted`), as it does apc's verbs.

## Sizes

About 600 sentences (30 a unit), 450 lexemes, 1,500 pinned forms, 100 lessons, 20 stories and 8
scenarios.

## Risks

- **Accept sets grow fast**: free order, a dropped pronoun, two aspects and the persons multiply. The
  duplicate lint catches repeats; nothing catches an order a Slovak would not write but the model
  drafted. The native pass and the reviewer are the check.
- **Pinned forms**: many, and each hand-checked until stage 8.
- **The sound statement's exceptions** (hard *de, te, ne, le*) are read soft: an orthographic miss
  where a phonemic one is due, for a closed set of words.
- **The voice's license**, until question 3 and the check of lili's base data are settled.

## Where the references treat each topic

Printed pages. Mistrík's PDF page is the printed page − 2, Naughton's + 14; Krížom-krážom's PDF is a
scan with no text layer, its first pages two-page spreads, so find a page by its printed number.

| Topic | Mistrík | Naughton | Krížom-krážom |
|---|---|---|---|
| Sounds, letters, marks, stress | 12–16 | pronunciation guide | lesson 1 (*Slovenská abeceda*) |
| Personal pronouns, *byť* | 55, 85 | unit 1 | lesson 2 |
| Present tense classes | 78–84 (14 paradigms) | units 1–2 | lessons 2, 6, 7 (classes I–X) |
| Gender, nominative, adjectives | 18–53 | units 1, 3 | lessons 2–4 |
| Nominative plural, 2–4 | 27–45, 61–70 | unit 10 | lesson 4 |
| Accusative | 27–45 | unit 3 | lesson 5 |
| Instrumental | 27–45 | unit 6 | lesson 6 |
| Past tense | 73, 85 | unit 6 | lesson 7 |
| Locative | 27–45 | units 4–5 | lesson 8 |
| Reflexive verbs | 56, 72 | units 1–2 | lesson 9 |
| Genitive | 27–45 | units 4, 10–11 | – |
| Aspect, the future | 75–76, 88 | unit 8 | – |
| Dative | 27–45 | units 4–5 | – |
| Imperative | 91 | unit 10 | – |
| Pronouns, every case | 55–60 | units 12–13 | – |
| Verbs of motion, prefixes | 72, 88 | units 13–14 | – |
| Comparison | 49–50, 97 | unit 14 | – |
| Conditional, possessive adjectives | 51–53, 73–74 | units 8, 15 | – |
| Passive, verbal adjectives | 72–73 | units 15–16 | – |
| Prepositions and their cases | 99–105 | units 4–6 | lessons 5, 6, 8 |
| Rhythmic law | 35 | – | – |
| Word order, clitics | 132 | units 3, 8, 12 | – |
