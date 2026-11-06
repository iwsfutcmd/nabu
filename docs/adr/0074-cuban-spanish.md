# 0074. Cuban Spanish for heritage speakers, and accent marks that make another word

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
- **Placement has production typed** (`placement: {production: typed}`, ADR 0075).

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

## Consequences

- A heritage speaker gets a course that starts where they are and goes on for twenty units after
  the core. The units after 10 are most of the course.
- Accent marks are graded the way a teacher would grade them: a missing one is a note, a missing
  one that changes the word is a mistake. A word the course never writes cannot be checked, so
  *mas* for *más* passes with a note until a sentence writes *mas*.
- Every item is an LLM draft. Cuban usage, register and the accept sets need a native speaker's
  review (`courses/REVIEW.md`).
- `form:` KCs give the planner per-tense knowledge. Other fusional languages can do the same.
