# 0146. What is learned: every part no rule gives

- Status: Accepted (2026-11-20)
- Date: 2026-11-19
- Revised: 2026-11-20, after the review and the owner's rounds 5 and 6 (what changed is listed at the end)
- Amends: the gameplan's §1 decisions 6 (memory per KC and facet) and 7 (credit per token), [ADR
  0100](0100-known-words.md) (what is known), [ADR 0050](0050-ten-unit-courses.md) (what a lesson presents),
  [ADR 0132](0132-a-choice-asks-one-thing.md) (only attested forms: it stands for a choice, while a typed
  building card may ask a regular form the course never writes); the learner-event schema (what a card
  displayed)
- Builds on: [ADR 0145](0145-lexical-model.md) (the lexical model). Compatible with [ADR
  0144](0144-read-first-then-write.md) (Proposed), whose "word" is a lexeme here.

## Context

ADR 0100 says when a word is known: every skill the course asks of it shown, on a first try, on a later day.
Under ADR 0145 a word is not one thing. *ser* has forms no rule gives; *pensar* has a class no form shows;
*hablamos* is evidence for *hablar* and for the ‑ar endings, and no word to track; *writer* "one who writes"
is evidence for WRITE and AGENT and is not a word to track either. The unit of learning has to follow what is
derivable.

## Decision

### Learned means every part no rule gives

- **The owner's rule: to have learned something is to have learned every part of it that can't be derived.**
  Its scope is every part the course will ever teach: every listed part that some content of the course asks,
  in any unit. Scheduling favours finishing a lexeme once it is started, within what each lesson's unit allows
  (ADR 0050): a part first written in a later unit waits for it.
- **A lexeme's parts:**
  1. **itself:** its elsewhere morpheme, which the learner meets as its lemma (*hablar*'s stem *habl‑* with its
     ‑ar class): its meaning recognised and produced;
  2. **each lexical feature no rule or default gives:** *pensar*'s e→ie class (not derivable: *probar* /
     *pruebo*, *robar* / *robo*; learners' dictionaries print "pensar (ie)"); a gender the noun's ending
     doesn't give (*la mano*, *el día*, *la noche*);
  3. **each listed form or stem**, often principal parts rather than whole forms (*tener*: *tuv‑*), or whole
     forms where nothing is predictable (*soy*, *fue*);
  4. **each leftover of an orthography the course teaches** (ADR 0148): a reading leftover (fa's vowels), a
     spelling leftover (which of س / ص / ث).
- **A default is not a part** (the owner, round 5). What a language's stated defaults predict needs no
  evidence of its own: *casa* is feminine by its ‑a, so typing *la casa* is evidence for the ‑a rule, not for
  *casa*; nearly every ‑ir verb with stem e or o alternates and ‑ear verbs never do, so for an ‑ir verb only
  "ie or i" is left. A word the default misses or that breaks it has the part. The default is itself a rule,
  learned and shown like any other, and each language states its own (REVIEW): hbo, apc and grc as es does (ἡ
  ὁδός breaks grc's).
- **A class the lexicon states is a lexical feature, not a list of forms** (the owner, round 5: classes are
  stated per language, ADR 0148). Where es states the ‑go verbs (*tengo*, *vengo*, *pongo*, *salgo*, *valgo*)
  and their short futures (*tendr‑*, *vendr‑*, *pondr‑*, *saldr‑*, *valdr‑*), *tener* stores that it belongs to
  them (part 2), and only *tuv‑* is its own (part 3).
- **A pinned form is never a part** (the owner, round 5). A form the language's rules give and ours don't yet
  (ADR 0145) is stored and checked, never counted and never in the word list. Progress measures the learner,
  not how many rules have been written.
- **A part is asked only where this course can ask it and this learner hasn't turned it off:** the course's
  facets, its voice's quality, `facetsOff`, as `skillsAsked` does now. Listening is a skill asked of the
  lexeme itself, where the voice is good and the word can be heard; speaking stays no skill a word is known
  by (ADR 0100).
- **A rule's parts:** every branch it distinguishes (the uz dative as written: ‑ka after k, ‑qa after q; the
  participle on a sound, a hollow and a defective root; INF's ‑ar, ‑er, ‑ir). A default is a rule. **A
  letter's correspondence is the exception** (the owner, round 5): its script track teaches and tests it (ADR
  0149), and after the gate it has no memory of its own; the fold only counts the misses labelled against it
  (ADR 0148).
- **An inherent feature is learned as its contrast:** preterite against imperfect. Its parts are its uses
  (preterite: a completed event, a sequence; imperfect: habitual, ongoing, description, polite *quería*), each
  introduced and shown on its own where no core meaning predicts it. Contrasts belong to their language:
  Spanish preterite / imperfect and English simple / progressive are two features. A scope pair is learned
  the same way (krama against ngoko), though a scope is no feature (ADR 0145). A contrast only a context
  decides (hbo's wayyiqtol against qatal) is shown where there is context, on a story line (ADR 0147).
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
  produced in its own context; each lexical feature that is a part produced from the meaning (*la mano*
  typed, not picked).
- **For a feature,** each use of each value: chosen right where the situation calls for it with the
  alternative available; read right off the form ("*comía*: once, or habitually?"); each on at least two
  sentences with different lexemes. A wrong value counts against the use that was called for, only where the
  grading pins it.
- **For a rule,** each branch on at least two lexemes the learner can't have memorised it on: **never seen in
  that form** (the owner, rounds 4 and 5).
  - **"Seen" is the app's doing, "shown" the learner's.** A word is seen when a card or a story line displays
    it; a part is shown when the learner supplies it.
  - **Seen is logged.** Each card records the words it displayed, each as a lexeme and a form; a story
    records the lines read. The fold keeps the pairs a learner has seen: a record of exposure, not a memory,
    so a combination still has nothing to learn.
  - **Nothing logged before the change counts towards a rule:** those events don't say what was displayed.
  - **A typed building card may ask a regular form the course never writes** (*cantamos* from *cantar*), so
    unseen pairs never run out. Never in a choice: there ADR 0132 stands, and an option is a form the course
    attests. Each rule's conformance vectors matter the more for it.

### Credit is per node

- **An answer is evidence for each part it made the learner supply,** hits and misses alike, from the miss
  labels of ADR 0148. ✗*writing* for *writer*: WRITE shown, AGENT missed. *caza* typed for "house": the
  sound shown, the spelling missed, and a lexical miss that counts against telling *casa* from *caza* (the
  pair then gets a spelling-choice card). *hablas* for *hablo*: HABLAR shown, the 1sg form missed.
- **A pair has no state of its own.** The miss against telling *casa* from *caza* is kept on *casa*'s
  spelling leftover, and *caza* becomes an option of the card that asks it again.
- **Memory is kept per part and skill** (FSRS-6, as before), not per KC and facet:

  | Part | Skills asked of it | What shows it |
  |---|---|---|
  | a lexeme itself | recognize; produce, where a sentence uses it; listen, where the voice is good and the word can be heard | its meaning recognised, produced, heard |
  | a lexical feature no default gives | produce | a form that shows it, typed from the meaning (*la mano*, *pienso*) |
  | a listed form or stem | produce | the form produced in its own context (*tuve*) |
  | a reading or a spelling leftover | read-script, write-script, per orthography (and reading tradition, ADR 0138) | read or spelled right where a card asked it |
  | a rule's branch | produce | two lexemes never seen in that form |
  | a feature's use | choose, and read off the form | two sentences with different lexemes, each way |

- **Not decided here:** what the performance model keys (gameplan decision 6's second model takes its
  difficulties per KC today), and what a simulated learner knows of a rule and carries to a lexeme it has not
  met. Both come before anything is tuned against the simulation.

### Progress

- **A lexeme shows its listed parts**, within the dimensions the course teaches:

  | | Parts | Shows |
  |---|---|---|
  | *hablar* | itself | speak · regular · 1 of 1 |
  | *casa* | itself | house · regular · 1 of 1 |
  | *mano* | itself, feminine | hand · 2 of 2 |
  | *pensar* | itself, e→ie | think · 2 of 2 |
  | *tener* | itself, e→ie, the ‑go class, the short future, *tuv‑* | have · 3 of 5 |

  (*tener* as es states its classes, REVIEW.)
- **Regular forms count toward rules**, whose progress is their own ("‑ar present: 4 of 6"; the ‑a rule for
  gender); a regular lexeme's entry can point there.

### Which derivatives and combinations a learner meets

- **Whatever the course's sentences and stories contain**, as *scanned* turns up for ‑ed. The planner aims at
  heads and their branches, not at derivatives; the compiler reports a branch no content shows.
- **Chunks are not a category.** A listed one (*¿Qué tal?*) is a lexeme, crediting nothing to *qué* or *tal*;
  its parts are links, and its literal hint opens once they are taught. A compositional one (*¿Cómo estás?*,
  *Qayerdansiz?*) is a combination like any sentence, under the same rule on memorised items.
- **Closed classes are taught early** (round 1), which leaves formulas less to do.
- **Wug cards come last and light:** a confirmation that a productive rule is known after real words have
  shown it, an easter egg, never the main evidence. Made up at compile time from real stems (a nonce root in
  a real pattern for Semitic), checked against the course's own words (the owner, round 6: they are enough,
  so every course can have these cards), shipped with `generated` provenance; a rule that needs a listed
  property shows it, as a dictionary entry would (a made-up Greek noun with its genitive ending and its
  article). **Always labelled as made up, and never in the word list, stories or gloss panels.** A made-up
  word may then be a real word the course never teaches: the label says it is asked as a form, not as a
  word.

### Glosses and literal hints

- **Glosses are built, not written per form** (round 3). The gloss belongs to the concept, or to the lexeme
  where it has none; a lexeme's gloss is its concept's plus its features ("eat (krama)"); a form's adds its
  inflection ("run (past)"); a computed derivative's comes from its parts; a listed one has its own. An
  override is allowed where that reads badly.
- **Both are shown, as a starting point:** the support language's own word where it has one ("ran", "went /
  was" for *fue*) and the analysis ("run (past)", "ir or ser · preterite · 3rd singular").
- **A built gloss is a message, never a string put together in code:** an MF2 message over the lexeme's gloss
  and the names of its feature values, which are language data read through @nabu/i18n, as scheme names are
  (ADR 0109). The support language's own word is authored on the listed form, with provenance, until a
  support language has a lexicon of its own.
- **A literal hint** ("lit. earth + eat" for زمین خوردن, "lit. big + learning" for 大學) comes only from a real
  analysis, never a folk etymology, and never on the prompt side of a card (it would hand over the answer's
  parts). It cites its source (a dictionary or a grammar) or waits for a reviewer's sign-off: LLM drafting is
  this project's biggest source of folk etymologies. It is about a word's morphemes; a character's components
  only with a scholarly source of their own, cited (a glyph story told without one is out). It comes after
  the real gloss, labelled "lit.", and is stored and shown apart from the gloss: a memory aid, never what the
  word means.
- **A hint changes no credit:** knowing زمین خوردن says nothing about زمین.

### Cards for patterns and bound morphemes

- **A pattern's template is checked against the lexical form first.** Where a token is analysed as a base
  and a pattern, the compiler fills the template with the base's radicals and compares the result with the
  word's lexical form; each spelling and reading is then checked as a projection of that (ADR 0148).
- **Bound morphemes get building cards:** a base and a head given, the combination asked (كَتَبَ + مَفْعَل →
  مَكْتَب; *ish* + ‑chi → *ishchi*), typed, or from buttons where the pieces are patterns, never a typed
  template. A typed one may ask a regular form the course never writes (above).
- **Root extraction** (a word to its radicals, the skill an Arabic or Hebrew dictionary needs) reads the
  base's radicals and is credited to the pattern's rule; a root has no learning state.
- **Semi-productive patterns** (مَفْعَل) get decoding cards ("what might مَدْخَل be?"), never wug cards.
- **Teaching order** for a pattern: two or three words first, aligned; then its shape (ADR 0150) with its
  meaning; then building, extraction and decoding.

## Consequences

- **The fold changes what it keys:** `met`, `shown` and `missed` per part and skill (today `met` is per KC,
  and `shown` and `missed` per skill card: a KC and a facet). It gains the pairs a learner has seen, and a
  count of misses per correspondence. `test/fold-before-r2.ts` mirrors it; the simulation and golden files
  are rerun; CALIBRATION_WEIGHT and the pace bands are re-tuned only against the simulation, as now.
- **Events change shape:** an answer carries credit per part; a card records the words it displayed, each as
  a lexeme and a form; a story records the lines read. Logged events migrate with the KC rename, as ADR 0145
  says of the migration. Nothing logged before the change counts towards a rule.
- **The word list shows parts and "regular"**, and rules get a progress view of their own.
- **The planner aims at parts:** a lexeme's next listed part, a feature's unshown use, a rule's unshown
  branch on a pair never seen (a typed building card where the sentences have none); presenting a new lexeme
  still requires a card credited to it (ADR 0100).
- **The compiler reports coverage:** branches and uses no content shows, lexemes whose listed parts no
  sentence uses, and rule debt (pinned forms), which no learner sees.
- **Known counts change in every course;** the simulation says by how much before anything ships. A noun
  whose ending gives its gender has one part, so that evidence moves to the rule in es, apc, hbo and grc.

## Revision (2026-11-20): the review and round 5

After [the review](../review-adr-0145-0151.md) (findings 3, 4, 12, 20, 22; C3, C6, C10 to C12, C19, C20) and
the owner's fifth round of answers ([lexemes.md](../lexemes.md) §16).

**Decided by the owner in round 5:**
- A form the language's rules give and ours don't yet is pinned: stored and checked, never a part.
- Classes are stated per language, so *tener*'s ‑go and short-future forms are classes it belongs to.
- "Never seen in that form" stands, and is logged: what each card displayed, the story lines read, the pairs
  seen in the fold. Nothing logged before counts towards a rule.
- A typed building card may ask a regular form the course never writes; a choice never.
- Gender by ending is a default where the language has one: *casa* is 1 of 1, *mano* 2 of 2.
- A letter's correspondence has no memory after the gate; its misses are counted.

**Restored from the notes:** a part is asked only where the course can ask it and the learner hasn't turned it
off; wug cards are always labelled as made up and never appear in the word list, stories or gloss panels.

## Round 6 (2026-11-20): accepted

The owner's sixth round ([lexemes.md](../lexemes.md) §16) ruled on what the revision had proposed, and
accepted the ADR.

**Decided against the draft:**
- **A made-up word is checked against the course's own words, and that is enough.** The draft asked for a
  large word list and gave a language without one no wug cards. (It also named hbo among those, wrongly: the
  Codex is a closed corpus.)

**Accepted as drafted:**
1. "Every part the course will ever teach" means every listed part some content asks, and a part first
   written in a later unit waits for it (ADR 0050).
2. The table of parts, their skills and what shows each: listening is a skill of the lexeme, and there is no
   "reading aloud" part (ADR 0100 stands).
3. A confusable pair has no state: the miss is kept on the asked word's spelling leftover.
4. A built gloss is an MF2 message over language data; the support language's own word is authored on the
   listed form.
5. Named as not decided: what the performance model keys, and what a simulated learner knows of a rule.
