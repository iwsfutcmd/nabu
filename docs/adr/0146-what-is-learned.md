# 0146. What is learned: every part no rule gives

- Status: Proposed
- Date: 2026-11-19
- Amends: the gameplan's §1 decisions 6 (memory per KC and facet) and 7 (credit per token), [ADR
  0100](0100-known-words.md) (what is known), [ADR 0050](0050-ten-unit-courses.md) (what a lesson presents)
- Builds on: [ADR 0145](0145-lexical-model.md) (the lexical model). Compatible with [ADR
  0144](0144-read-first-then-write.md) (Proposed), whose "word" is a lexeme here.

## Context

ADR 0100 says when a word is known: every skill the course asks of it shown, on a first try, on a later day.
Under ADR 0145 a word is not one thing. *ser* has forms no rule gives; *pensar* has a class no form shows;
*hablamos* is evidence for the ‑ar endings, not for *hablar*; *writer* "one who writes" is evidence for WRITE
and AGENT and is not a word to track at all. The unit of learning has to follow what is derivable.

## Decision

### Learned means every part no rule gives

- **The owner's rule: to have learned something is to have learned every part of it that can't be derived.**
  Its scope is every part the course will ever teach, and scheduling favours finishing a lexeme once it is
  started.
- **A lexeme's parts:**
  1. **itself:** its elsewhere morpheme, which the learner meets as its lemma (*hablar*'s stem *habl‑* with its
     ‑ar class): its meaning recognised and produced;
  2. **each lexical feature that needs evidence:** *casa*'s gender, *pensar*'s e→ie class (not derivable:
     *probar* / *pruebo*, *robar* / *robo*; learners' dictionaries print "pensar (ie)");
  3. **each listed form or stem**, often principal parts rather than whole forms (*tener*: *tengo*, *tuv‑*,
     *tendr‑*), or whole forms where nothing is predictable (*soy*, *fue*);
  4. **each edge the course asks that no projection gives** (ADR 0148): a reading leftover (fa's vowels), a
     spelling leftover (which of س / ص / ث), listening, reading aloud.
  What the profile can predict is a default, not a part (nearly every ‑ir verb with stem e or o alternates;
  ‑ear verbs never do), so for an ‑ir verb only "ie or i" is left.
- **A rule's parts:** every branch it distinguishes (‑ka after k, ‑qa after q; the participle on a sound, a
  hollow and a defective root; INF's ‑ar, ‑er, ‑ir).
- **An inherent feature is learned as its contrast:** preterite against imperfect, krama against ngoko. Its
  parts are its uses (preterite: a completed event, a sequence; imperfect: habitual, ongoing, description,
  polite *quería*), each introduced and shown on its own where no core meaning predicts it. Contrasts belong
  to their language: Spanish preterite / imperfect and English simple / progressive are two features.
- **A contextual feature has no state of its own:** agreement and government are a rule plus a lexical
  feature (*casa*'s gender; *querer* takes an infinitive).
- **A combination has nothing of its own, and neither has a computed derivative.** *hablamos* and *writer*
  "one who writes" are evidence for their parts; never a word-list entry, never counted. A listed
  derivative is a lexeme (*writer* "author").
- **A concept has no learning state.** (A derived view of a concept's lexemes, "EAT: you know *mangan* and
  *nedha*", is proposed, not decided.)

### What counts as shown

- **ADR 0100's rule applies to every part:** a first try, right, not self-rated, on a later local date than
  the part was met and than it was last missed.
- **A part counts only where the card made the learner supply it**, never where it was handed over: a word
  bank's tiles give the spelling and the article, a clip gives the sound (ADR 0100's "where the grading pins
  it", per part).
- **For a lexeme:** its meaning recognised (form to meaning) and produced (meaning to form); each listed form
  produced in its own context; each lexical feature produced from the meaning (*la casa* typed, not picked).
- **For a feature,** each use of each value: chosen right where the situation calls for it with the
  alternative available; read right off the form ("*comía*: once, or habitually?"); each on at least two
  sentences with different lexemes. A wrong value counts against the use that was called for, only where the
  grading pins it.
- **For a rule,** each branch on at least two lexemes the learner can't have memorised it on: **never shown
  that word in that form** (from the log).

### Credit is per node

- **An answer is evidence for each part it made the learner supply,** hits and misses alike, from the miss
  labels of ADR 0148. ✗*writing* for *writer*: WRITE shown, AGENT missed. *caza* typed for "house": the
  sound shown, the spelling missed, and a lexical miss that counts against telling *casa* from *caza* (the
  pair then gets a spelling-choice card). *hablas* for *hablo*: HABLAR shown, the 1sg form missed.
- **Memory is kept per part and skill** (FSRS-6, as before), not per KC and facet.

### Progress

- **A lexeme shows its listed parts**, within the dimensions the course teaches:

  | | Parts | Shows |
  |---|---|---|
  | *hablar* | itself | speak · regular · 1 of 1 |
  | *pensar* | itself, e→ie | think · 2 of 2 |
  | *tener* | itself, e→ie, *tengo*, *tuv‑*, *tendr‑* | have · 3 of 5 |
  | *casa* | itself, feminine | house · 2 of 2 |

- **Regular forms count toward rules**, whose progress is their own ("‑ar present: 4 of 6"); a regular
  lexeme's entry can point there.

### Which derivatives and combinations a learner meets

- **Whatever the course's sentences and stories contain**, as *scanned* turns up for ‑ed. The planner aims at
  heads and their branches, not at derivatives; the compiler reports a branch no content shows.
- **Chunks are not a category.** A listed one (*¿Qué tal?*) is a lexeme, crediting nothing to *qué* or *tal*;
  its parts are links, and its literal hint opens once they are taught. A compositional one (*¿Cómo estás?*,
  *Qayerdansiz?*) is a combination like any sentence, under the same rule on memorised items.
- **Closed classes are taught early** (round 1), which leaves formulas less to do.
- **Wug cards come last and light:** a confirmation that a productive rule is known after real words have
  shown it, an easter egg, never the main evidence. Made up at compile time from real stems (a nonce root in
  a real pattern for Semitic), checked against the course and a large word list, shipped with `generated`
  provenance; a rule that needs a listed property shows it, as a dictionary entry would (φλόμος, ‑ου, ἡ).

### Glosses and literal hints

- **Glosses are built, not written per form** (round 3). The gloss belongs to the concept, or to the lexeme
  where it has none; a lexeme's gloss is its concept's plus its features ("eat (krama)"); a form's adds its
  inflection ("run (past)"); a computed derivative's comes from its parts; a listed one has its own. An
  override is allowed where that reads badly.
- **Both are shown, as a starting point:** the support language's own word where it has one ("ran", "went /
  was" for *fue*) and the analysis ("run (past)", "ir or ser · preterite · 3rd singular").
- **A literal hint** ("lit. earth + eat" for زمین خوردن, "lit. big + learning" for 大學) comes only from a real
  analysis, never a folk etymology, and never on the prompt side of a card (it would hand over the answer's
  parts). It cites its source (a dictionary or a grammar) or waits for a reviewer's sign-off: LLM drafting is
  this project's biggest source of folk etymologies. It is about a word's morphemes; a character's components
  only with a scholarly source of their own (安 as "a woman under a roof" is out). It comes after the real
  gloss, labelled "lit.", and is stored and shown apart from the gloss: a memory aid, never what the word
  means.
- **A hint changes no credit:** knowing زمین خوردن says nothing about زمین.

### Cards for patterns and bound morphemes

- **Pattern templates are checked against the lexical form first,** readings after.
- **Bound morphemes get building cards:** a base and a head given, the combination asked (كَتَبَ + مَفْعَل →
  مَكْتَب; *ish* + ‑chi → *ishchi*), from buttons where the pieces are patterns, never a typed template.
- **Root extraction** (a word to its radicals, the skill an Arabic or Hebrew dictionary needs) reads the
  base's radicals and is credited to the pattern's rule; a root has no learning state.
- **Semi-productive patterns** (مَفْعَل) get decoding cards ("what might مَدْخَل be?"), never wug cards.
- **Teaching order** for a pattern: two or three words first, aligned; then its shape (ADR 0150) with its
  meaning; then building, extraction and decoding.

## Consequences

- **The fold changes what it keys:** `met`, `shown` and `missed` per part and skill, not per KC and facet.
  `test/fold-before-r2.ts` mirrors it; the simulation and golden files are rerun; CALIBRATION_WEIGHT and
  the pace bands are re-tuned only against the simulation, as now.
- **Answer events carry credit per part**, so the learner-event schema changes; logged events migrate with
  the KC rename (ADR 0145), in the fold.
- **The word list shows parts and "regular"**, and rules get a progress view of their own.
- **The planner aims at parts:** a lexeme's next listed part, a rule's unshown branch on an unmemorised word,
  a feature's unshown use; presenting a new lexeme still requires a card credited to it (ADR 0100).
- **The compiler reports coverage:** branches and uses no content shows, and lexemes whose listed parts no
  sentence uses.
- **Known counts change in every course;** the simulation says by how much before anything ships.
