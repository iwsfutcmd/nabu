# 0076. Cuban Spanish for heritage speakers, and accent marks that make another word

- Status: Proposed
- Date: 2026-11-06
- Amends: [0066](0066-meaningful-endings.md) (meaningful marks beside meaningful endings)

## Context

The first course written for a particular learner: a man from a Cuban family in the US who
understands Spanish and speaks "kitchen Spanish", but never studied it. Heritage speakers differ
from beginners in ways the fixture courses never had to handle.

- **Uneven skills.** They understand far more than they produce. Listening is their strength;
  spelling, written accents, formal registers, the subjunctive and compound tenses, and
  vocabulary beyond the home are their gaps.
- **A variety of their own.** Their Spanish is Cuban. A course that "corrects" *guagua* to
  *autobús*, or *¿Qué tú quieres?* to *¿Qué quieres tú?*, tells them their family speaks badly.
- **Depth.** They place well past the first units, so a ten-unit course would leave them almost
  nothing to do.

Spanish also raises a grading question the Arabic-script profiles never did. Their marks are
optional; Spanish accent marks are part of the spelling, and some of them tell words apart: *esta*
"this" and *está* "is", *si* "if" and *sí* "yes", *el* "the" and *él* "he", *hablo* "I speak" and
*habló* "he spoke".

## Decision

**A course `es`, Cuban Spanish (`es-Latn-CU`), thirty units from A1 to B2** (`courses/es`, its
brief and syllabus in `courses/es/README.md`).

- Units 1–10 are the everyday core. Units 11–30 are what a heritage speaker works through:
  written accents and spelling, the imperfect and preterite, commands, the present perfect, the
  conditional and future, the subjunctive, *por/para*, relative clauses, *si* clauses, reported
  speech and formal register, all through Cuban family life and culture (food, music, pelota and
  dominó, Nochebuena, refranes, the family's history of exile, Havana, the countryside, José
  Martí's *Versos sencillos*, Spanglish and identity).
- **Cuban is canonical.** The text and the first accepted answer are what a Cuban family says;
  pan-Hispanic forms are accepted too, and KC notes say where other countries differ and how
  words are said (*pa'*).
- **One family runs through the stories**, from Hialeah to Centro Habana, so a learner meets the
  same people from the first unit to the last.
- **Verb forms are form KCs on the token** (`form:pres-1s`, `form:pret-3s`, `form:subj`…), not
  morphs: Spanish is fusional, and *tengo*, *fui* and *hizo* have no segmentation. The planner
  then knows which tenses a learner misses. A new verb in a new tense is two new KCs on one word,
  so the course allows two a sentence (`iPlusOne: 2`).
- **Placement has production typed** (`placement: {production: typed}`, ADR 0077).

**The profile `es-Latn/standard`** (RAE and ASALE spelling).

- A left-out or misplaced accent mark (acute, diaeresis) is accepted with a note: `CORRECT_MARKS`.
- **`marks.distinguishes`** (new): where the answer's marks spell another word of the course
  (the grader's lexicon, as for typos in erratum 46), it is `WRONG_WORD` with the note
  `accent-word`. *esta* for *está*, *El* for *Él*, *hablo* for *habló*, and *que* for *qué* are
  wrong; *cancion* for *canción* is right with a note.
- ñ is a letter of its own, not n with a mark: *anos* for *años* is wrong, while *manana* for
  *mañana* is a typo.
- Endings that carry meaning (person and tense on verbs, gender and number) and subject pronouns
  are contrasts (ADR 0066).
- A Latin American keyboard for the typo model; CLDR `es` exemplars.

The policies are marked REVIEW in the profile, and the conformance vectors pin them in both
harnesses.

**A Cuban voice: OmniVoice cloning a Cuban speaker** (amends 0058).

- OmniVoice's voice design has accents for English only and dialects for Chinese only, so a
  designed voice would not sound Cuban. Cloning keeps the speaker's accent.
- `nabu audio cast --recording <file> --text <transcript> --license --author human:<id>
  --source` keeps a real speaker's recording as the voice's reference: normalized and trimmed
  like an ingested recording, with its license, speaker and source (`ReferenceVoice.source`,
  `synthetic: false`).
- Two voices, a man's and a woman's (ADR 0078 shares the items between them; a sentence or story
  character that says who speaks gets that voice). Both come from the openly licensed archive of
  Radio La Voz de la Victoria, the municipal station of Ciénaga de Zapata, Matanzas, on
  archive.org; neither speaker is named, so the evidence that they are Cuban is the station.
  - **The man (`coral-m`):** an actor in the station's radio drama *Tras el rastro de Coral*
    (ARV producciones, `tras-el-rastro-de-cora-l`, CC BY 4.0), chapter 3, 8.2 s of fast, colloquial
    acted speech, its long pauses shortened to 0.3 s. Acted and unscripted speech carry more of
    the Cuban features (aspirated *s*) than read news: the first voice, a newsreader of the same
    station (`compendio-30-7`, CC0), sounded too standard and was replaced.
  - **The woman (`zapata-f`):** a member of the FMC interviewed for Women's Day
    (`fmcdiainternacionalmujer`, CC0), 8.8 s of unscripted speech.
  - **Cutting a reference:** it starts and ends on speech, whole words, no breath. A reference
    that ended on an in-breath put one at the end of every clip; one that began inside a word
    began clips with a stray sound. OmniVoice clips are trimmed to their speech too (80 ms
    before, 150 ms after), since the model can leave up to a second of silence before it.
- Like apc's, the clips are CC-BY-NC-4.0, because OmniVoice's weights are. A CC0 or CC BY
  reference adds no condition of its own beyond attribution: every clip cloned from a recording
  names it in its credit (speaker, license, source). A ShareAlike one would have conflicted with NC.
- On a CPU, cloning takes about 15–25 s a clip (the reference is part of every sequence), so the
  course's clips take many hours; generation resumes where it stopped. A recording by a Cuban
  family member, cast the same way, would replace the voice and make every clip stale.

## Consequences

- A heritage speaker gets a course that starts where they are and goes on for twenty units after
  the core. The units after 10 are most of the course.
- Accent marks are graded the way a teacher would grade them: a missing one is a note, a missing
  one that changes the word is a mistake. A word the course never writes cannot be checked, so
  *mas* for *más* passes with a note until a sentence writes *mas*.
- Every item is an LLM draft. Cuban usage, register and the accept sets need a native speaker's
  review (`courses/REVIEW.md`).
- `form:` KCs give the planner per-tense knowledge. Other fusional languages can do the same.
- The course sounds Cuban, in an actor's and a local woman's voices from Ciénaga de Zapata. A
  recording by a Cuban family member would sound more like home; the course can be recast at any
  time (every clip of the recast voice is made again).
- Persons coverage ([ADR 0075](0075-persons-coverage.md)) applies here too: the learner is a man, but
  the course also has women speaking: a woman's version beside most of Daniel's gendered sentences
  (*soy cubana*, *cuando era niña*), and Abuela, Lili and Mami in units 27–30. The man's voice reads
  their sentences until the course casts a second voice (ADR 0078).
- Authentic texts are quoted from a published public-domain edition, not from memory: the Martí
  verses in u27's story are written in from Wikisource's text by a script. The schema keeps
  provenance per story, so the story stays an LLM draft as a whole; its title names the source.
