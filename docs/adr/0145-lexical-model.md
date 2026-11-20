# 0145. The lexical model: concepts, lexemes, morphemes, forms

- Status: Proposed
- Date: 2026-11-19
- Revised: 2026-11-20, after the review and the owner's round 5 (what changed is listed at the end)
- Amends: the gameplan's §7.1 and glossary (what a KC is), [ADR 0061](0061-lemmas-and-morphs.md) (a KC's
  forms), [ADR 0132](0132-a-choice-asks-one-thing.md) ("which form" and "which word"; UD `pos` and features
  on every KC; "no KC carries a gender"), [ADR 0066](0066-meaningful-endings.md) (contrast sets)
- Also amends, since a reading and a word's marks become projections of one lexical form: [ADR
  0053](0053-vocalization.md) (vocalization files), [ADR 0117](0117-pinned-readings-on-kc-forms.md) and [ADR
  0135](0135-readings-fixed-by-their-words.md) (readings pinned on KC forms and on tokens), and the readings
  each course pins: [ADR 0071](0071-classical-chinese.md), [0127](0127-lzh-checked-against-references.md) and
  [0138](0138-reading-traditions.md) (lzh), [0082](0082-biblical-hebrew.md) and [0084](0084-hbo-references.md)
  (hbo), [0086](0086-toki-pona-and-sitelen-pona.md) (tok), [0087](0087-attic-greek.md) (grc),
  [0126](0126-yue-jyutping-orthography.md) (yue), [0129](0129-chaghatay-arabic-with-word-ruby.md) (chg)
- Working notes: [lexemes.md](../lexemes.md) (the discussion, its rounds of answers),
  [lexeme-model.md](../lexeme-model.md) (the model, diagrammed). Followed by ADRs 0146–0151.

## Context

**A KC is a word-sized unit, and the courses have outgrown it.** The schema's `KcId` allows seven kinds
(sense, form, construction, grapheme, reading, phone, tone); the courses use the first four.
- `sense:` is a word and one meaning; `form:` mixes feature values (es `form:pret-3s`) with affixes (uz
  `form:abl-dan`); `construction:` and `grapheme:` sit beside them.
- Inflected words crept into KC forms until ADR 0061 forbade it (apc's verbs, which it left unanalysed, still
  list them: `sense:ra7` has ten conjugated forms), and nothing says where an irregular form lives: *ran*,
  *fue*, کتب, Persian *rav‑*.
- Like things are analysed unlike: apc makes its active participles sense KCs of their own (`sense:raye7`,
  which even lists رايحة as a form), hbo tags the same participle as a verb form (`form:ptc-ms`).
- Nothing says what is derivable, so nothing says what is learned: a learner who knows *‑ed* and *scan*
  needs no evidence for *scanned*, but must be shown *ran*.

The owner and Claude worked the model out on 2026-11-19 over four rounds of questions; every decision below
is the owner's, and the notes record each one where it was made.

## Decision

### Terms

| Term | What it is | Examples |
|---|---|---|
| **concept** | links lexemes, or forms, that differ only socially (variety, speech level, honorific); never in what is said; no learning state | EAT: *mangan*, *nedha*, *dhahar*; CAR: *carro* (Cuba), *coche* (Spain) |
| **lexeme** | a meaning, a part of speech, lexical features and a paradigm; stored, and learned | SER; *casa* (feminine); AGENT; PAST |
| **morpheme** | a listed sign: a pairing of form and meaning no rule gives (Bloomfield's, stretched to portmanteaus, multi-word and semi-transparent listed items) | *kitob*, ‑dan, 呀, *ran*, 東西, *darse cuenta*, *writer* "author" |
| **allomorph** | a morpheme's forms by context, each stored with its context or given by a rule | the uz dative as it is written: ‑ga, ‑ka after k, ‑qa after q (the spoken forms have wider contexts: two rules, ADR 0148) |
| **lemma** | a lexeme's citation form: one of its forms, by the language's convention | *hablar* (HABLAR + INF), كَتَبَ, λύω |
| **form** | a lexeme with one set of inflectional values; may be several tokens | *ran* = RUN + PAST; *he comido*; 食咗 |
| **derivative** | what a function head makes from a base: lexeme-shaped, computed | *writer* "one who writes", *rápidamente*, كاتِب "one who writes" |
| **feature** | a grammatical value: **lexical** (constant across a paradigm: gender, class) or **inflectional** (a dimension's value); inflectional ones are **inherent** (chosen for meaning) or **contextual** (agreement, government) | *casa* feminine; PAST; *blanca*'s ‑a |
| **dimension** | a set of inflectional values every member of a category must choose from, declared per language | Spanish verb: tense, person, number, VerbForm |
| **scope** | where a morpheme, lexeme or rule is said: a range of varieties and a range of registers, everywhere unless stated; it has no exponent of its own, so it is no dimension | Cuban; general Spanish; krama; formal Persian |
| **combination** | what Merge builds; a value, never stored | *kitoblarimdan*, *scanned*, *the writer of this list* |
| **utterance** | stored content: a combination plus the order it was said in | a sentence; a story line |

### Three layers

- **Entities are stored**, with ids and provenance: lexemes, morphemes, allomorphs, rules, features,
  concepts. Entities are what is learned (concepts have no learning state).
- **Values are computed** and identified by their content: combinations, forms, derivatives, surface forms,
  audio.
- **Instances are content:** utterances.

### What is listed: the morpheme rule

- **Whatever the language's rules give is a combination; whatever they don't is a morpheme.** The test is
  symmetric and per sense (blocking is per sense: *thief* does not block *stealer of hearts*). The rules meant
  are the language's, not the ones written down so far.
- **So a form has one of three statuses** (the owner, round 5):
  1. **given:** a stated rule gives it. Computed, and checked against the authored text.
  2. **pinned:** the language has a rule that ours don't state yet. Stored and checked like a listed form,
     never a learner's part (ADR 0146), and reported by the compiler as rule debt.
  3. **listed:** the language has no rule. A morpheme, and a part to learn.
- **Only a reviewed statement makes a form listed:** an entry of the lexicon saying the language has no rule
  for it, with its source, reviewed as a profile's policies are (drafted `llm:` and marked REVIEW until it is
  signed off). Every form the stated rules don't reach carries one of the two marks, never neither.
- **So a course can move whole before its rules are complete,** and nothing a learner sees counts our
  backlog: hbo's vowel reduction, or grc's contraction and accent, can be written after their courses move.
- **A gap doesn't make a morpheme.** A rule carries its conditions, and a gap they explain is predictable:
  phonological (✗*greenen*), semantic (✗*unsad*), or blocking by a listed form (✗*goed*). Only an arbitrary
  gap is listed, as a form with no word (Russian победить has no 1sg non-past).

### One operation: Merge, with two kinds of head

- **Every complex form is a base lexeme merged with another lexeme, one head per step** (*ishchilarimiz* is
  ((ISH + AGENT) + PL) + 1PL.POSS). Merge goes above the word: words don't matter for learning.
- **The head is the constituent that selects the other.** It supplies the result's features; what it leaves
  unspecified comes up from the base (Spanish ‑ito sets neither category nor gender: *ahorita* an adverb, *el
  problemita* masculine). Where both specify a feature, the selector wins; there is no hierarchy or strength.
  A construction can select (verb + noun compounds make masculine nouns: *el abrelatas*).
- **A lexeme has a part of speech, in its language's own categories** (Arabic's ism, fiʿl, ḥarf; Uzbek
  *yaxshi* is one lexeme, never split into adjective and adverb). A language declares its categories with
  their subclasses, finely enough that a word question's options share the answer's class (ADR 0132: under
  ism, Arabic grammar has ṣifa, ḍamīr, ẓarf). UD's tags stay as a mapping from each class, which ADR 0132's
  features and ADR 0144's `PROPN` default read. A function head stores a signature: what it takes, what it
  makes, which features it sets.
- **The learner's test** (the owner's, 2026-11-19): Y belongs to X's lexeme if knowing X without Y is not
  fully knowing X. Knowing *run* without *ran* is not knowing RUN; knowing *write* without *writer* is still
  knowing WRITE; knowing *carro* without *coche*, or *padre* without *madre*, is knowing CARRO and PADRE. The
  dimensions below are how a language states the test once, instead of word by word.
- **Two kinds of head, decided by dimensions, never labelled affix by affix:**
  - a **value head** is a value of a dimension of its base's category; its result is a **form** of the base's
    lexeme;
  - a **function head** is every other head; its result is a **derivative**: another word, its category from
    the head, its meaning from both, its paradigm from its category.
- **Dimensions are declared per language, one list per category, beside the lexicon** (apc verb: aspect,
  person, gender, number; Spanish noun: number). A dimension is what every member of the category must
  choose a value of. **The base-case rule checks the declaration:** a feature with an overt, regular
  base-case morpheme is a dimension, and its suppletive forms are forms of the one lexeme
  (English past: *ran*; Arabic plural, since the sound plurals exist, ‑ات and, for male persons, ‑ون: كُتُب;
  Persian present: *rav‑*; Korean honorific: 드시다). A noun's gender is a lexical feature, and noun gender
  marking is derivation (*niña* is *niño* + a derivational feminine; *padre* and *madre* are two lexemes;
  native apc judgement: خال / خالة are one word, one derived from the other). A base case alone doesn't make a
  dimension: Spanish ‑ito and the Uzbek causative have one, and nothing makes a word choose them.
- **Which feature values are lexemes:** one with a meaning, merged as a head (PAST, lemma ‑ed; a noun's PL;
  preterite and imperfect; INF, lemma ‑r; DAT where it means "to"). A class value is a lexical feature, not a
  lexeme (*casa*'s feminine). Agreement and government merge no head: a rule plus a lexical feature (*blanca*'s
  ‑a; a dative a verb requires; *querer* + infinitive).
- **Function heads are lexemes too:** AGENT (‑er), ACTIVE PARTICIPLE (فاعِل), PLACE (مَفْعَل), DIMINUTIVE.
  Productivity decides whether their results are computed or listed, not whether they are lexemes (‑th in
  *warmth* is a lexeme that no longer makes new words).
- **A derivative is stored only where something about it is listed**, and is then a lexeme with its parts as
  links: *writer* "author", كاتِب "clerk" (plural كُتّاب), *panadero*. A computed one is a value.
- **apc's participle pattern carries two heads** (the owner, rounds 2, 4 and 5; Kline 2022, ch. 17):
  - **the participle,** a value of apc's aspect dimension (perfective, imperfective, participle): a form of
    its verb (شايف, رايح), with a feminine and a plural in ‑in. Its sense KCs go;
  - **the agentive noun,** a function head: a derivative, which takes the article, and a lexeme where its
    plural or its vowels are listed (معلّم *m3allem* "teacher"). A woman writing is *ketbe*; a woman who is
    a writer, *ketibe*.

  A token names which head it is, and the lexical form must be able to tell the two apart. A listed sense
  (جاي "next (week)") stays a lexeme.
- **Cases on the line,** as the dimension test settles them (the kind is per language; the explainer
  [inflection-or-derivation.html](../explainers/inflection-or-derivation.html) gives the reasons both ways):

  | Case | Kind |
  |---|---|
  | apc participle (رايح, شايفه "I've seen him") | value (aspect) |
  | apc agentive noun, on the participle's pattern (معلّم "teacher") | function; listed where its plural or vowels are: one pattern, two heads |
  | Standard Arabic participle (كاتِب: case, definiteness) | function |
  | Arabic verbal noun (Form I listed: كِتابة; Forms II–X computed: تَعْلِيم) | function |
  | English ‑ing: *is writing* / *the writing of the letter* / *a writing* | value (a two-token form) / function / listed: one exponent, three heads |
  | Spanish ‑mente, ‑ito | function |
  | comparatives: English *bigger* (*more intelligent* its two-token form); Arabic أَكْبَر | value in English; function in Arabic |
  | Russian aspect (писать / написать: the prefix chosen verb by verb) | function, aspect a lexical feature |
  | Korean honorific ‑시‑ (먹다 → 드시다) | value |
  | Cantonese aspect 咗, 緊, 過 | value, a two-token form |
  | Persian ـی: indefinite کتابی / adjectival ایرانی | value / function: one letter, two heads |
  | Uzbek causative ‑t, ‑tir | function |
  | Biblical Hebrew stems (לָמַד → לִמַּד) | function, mostly listed |

### Concepts and scopes

- **A scope is not a dimension.** A social distinction with an exponent of its own, which every member of a
  category must choose, is a dimension (Korean and Japanese honorifics: they have base cases); one without is
  a scope. A scoped form that replaces a lexeme's every form is a separate lexeme, linked by a concept
  (*nedha*, *dhahar*, Javanese *dipun‑*, *usted*, *coche*); one that replaces some forms is a scoped morpheme
  of the same lexeme (formal Persian کتب *kotob*, while the singular stays کتاب).
- **A scope is a range on two axes,** variety and register. Each morpheme, lexeme and rule is said in the
  scopes that have it, everywhere unless stated; an utterance has one of each, a course a range; a listed
  form carries its own register range (کتب is written only).
- **A general word is not thereby the local one** (the owner, round 5). *autobús* is general Spanish, *guagua*
  Cuban. The lexicon marks where a general word is also said in a variety, by a speaker's review; where it
  isn't, the word is outside that variety (ADR 0147).
- **All Javanese register is at the concept level**; Spanish and French T–V are concept-linked pronoun
  lexemes; Korean and Japanese honorifics are dimensions (they have base cases).
- **A concept links what differs only socially, and nothing else.** Two lexemes that share a base and differ
  in meaning are a family (below), never a concept. Meaning stays implicit, carried by glosses and accept
  sets.

### Realisation: the Elsewhere lookup

- **An irregular is stored once, on its lexeme, with the features it covers:** *ran* = RUN + PAST; *tuv‑* =
  TENER + preterite; کتب = KETĀB + PL, formal scope.
- **The most specific listed part whose features fit the request, in scope, wins** (Pāṇini; Stump's
  Paradigm Function Morphology). Covering everything, it is the form (*ran*: ✗*runned* is never built); covering
  some, it is the stem the rules continue (*tuv‑* + ‑e); covering nothing, the elsewhere morpheme and the
  regular rule (*scan* + ‑ed).
- **A tie is an authoring error** (a lint), unless the two are marked **free variants** (*hablara* / *hablase*,
  *dreamed* / *dreamt*): both accepted, one shown, the course's choice. Scope settles many apparent ties.
- **A pinned form is found as a listed one is,** so the text comes out right before its rule is written.
- **Blocking off gives the learner's error:** the same lookup ignoring listed parts and stated classes makes
  ✗*runned*, ✗*tenió*, ✗*penso*, which the compiler ships beside the answer for grading (ADR 0148's
  regularised label). Never for a pinned form: there the difference from the rules' output is our gap, not a
  learner's error.

### The lexicon and the lexical form

- **One lexicon per language**, which every course of the language draws on; a course picks a range of
  varieties and registers (an utterance has one of each).
- **A morpheme stores one lexical form**: one tier, in its own script, fully specified (the vowels, stress,
  the letters an orthography distinguishes). Every orthography and phonemic form is a projection of it
  (ADR 0148). Where a script can't say something, the language's schema invents an in-script convention,
  never a juxtaposed pair of forms.
- **"One form" is a value whose shape depends on the kind of morpheme:**
  - most morphemes: a string in the script;
  - a Semitic base: its radicals (below), its Form and its stem vowels;
  - a pattern: its slots and its own letters and vowels, a template per root class (ADR 0150 draws them);
  - a listed item whose form is its parts' (*darse cuenta*, زمین خوردن, *writer* "author"): its parts, and
    which one inflects (*me di cuenta*). Only its meaning is listed.
- **A logography is the one exception to "never a pair":** a character can't say its sound, so the form is
  the character with what picks its reading. lzh: its Qieyun position, the tradition's own notation.
  Proposed for yue: the character, with a reading only where the table gives several or a tone changes.
  Proposed for tok: the Latin word, its sitelen pona glyph a listed correspondence (ADR 0148).
- **A source's spelling is the utterance's, not the morpheme's.** Where an orthography leaves a
  correspondence free (ADR 0148: chg's scribes write p as پ, ب or ف; hbo spells a vowel full or defective),
  the projection gives every such spelling, the utterance keeps the one its source wrote, and the others are
  accepted.
- **Per language:** apc's schema comes first; uz's is Latin-based, with conventions on the Latin from which
  the Cyrillic is derived (Russian loans: цирк / *sirk*); lzh's characters carry their Qieyun positions
  (TshetUinh), with overrides where needed.

### Roots and families

- **A Semitic root is neither a morpheme nor an object.** Its radicals are a field of a base lexeme's lexical
  form, stored (قالَ and باعَ look alike until يَقُولُ, يَبِيعُ); the root class is derived from them.
- **A derivative's parts are its base lexeme and its pattern**, listed or not: مَكْتَب "office" ← كَتَبَ + مَفْعَل.
  Evidence that the base is the lexeme, not the root: the pattern's vowel follows the verb's imperfective
  (يَكْتُبُ → مَكْتَب, يَجْلِسُ → مَجْلِس), the passive participle keeps the verb's preposition (المَغْضُوبِ
  عَلَيْهِمْ), and the diminutive takes the noun's gender (شُمَيْسَة).
- **Families are computed** from base links; there is no family object. Shared radicals without a base link
  only sort together, as in a dictionary.
- **Only synchronic relations are formalised.** Etymology, a loan's source, cognates and doublets are memory
  aids at most, a note with a source, never a link.

### Order

- **A combination stores structure** (what applies to what: a UD tree for a sentence), **not order**; each
  language states its order rules once (affix order, clitic clusters, clitic placement, constituent order).
- **Every language starts with none**, and each utterance keeps its authored order; accept sets list other
  orders by hand (ADR 0085). Rules come inside words first (uz suffix order, Spanish clitic clusters), each
  with conformance vectors; they only accept and check (the compiler checks the authored order is one the
  rules give, and adds the others to accept sets). The text shown is always the authored text.
- **Trees come with the first rule that needs them,** drafted by a parser and corrected by a reviewer; no one
  writes 5,269 of them at the migration. **Agreement and government links are on tokens from the migration
  on** (which word a form agrees with, which word governs a case), since credit for a lexical feature needs
  them: ✗*el mano* counts against *mano*'s gender only if *el* is known to agree with it (ADR 0146).

### Decided per language

- **es:** stem-changing verbs are a lexical class (e→ie, o→ue, e→i) plus a rule, not listed stems; the class
  isn't derivable from the form (*probar* / *pruebo*, *robar* / *robo*), and the profile states what is
  predictable (nearly every ‑ir verb with stem e or o alternates; ‑ear verbs never do). Gender by ending is
  such a default too (‑a feminine, ‑o masculine, with its other reliable endings: REVIEW), so a noun stores
  its gender only where the default misses or is broken (ADR 0146). Cuban forms are canonical (ADR 0076;
  dialect tags, ADR 0147).
- **uz:** the causative (‑t, ‑tir, ‑dir) is derivation: a causative whose meaning drifted is a lexeme (*oʻqit‑*
  "teach" beside *oʻqi‑* "read"), a transparent one a derivative. *yaxshi* "good, well" is one lexeme. The
  lexical form is Latin-based, the Cyrillic derived from it.
- **fa:** the course teaches both registers, formal first: a scope pair like ngoko and krama, realised by
  scoped rules (colloquial *mi‑ram* for *mi‑ravam*), scoped morphemes (formal کتب) and concept-linked lexemes
  (*hālā* / *aknun* "now").
- **Javanese** (when it comes): ngoko and krama taught from the start; every register form at the concept
  level.
- **yue:** 嘅 is one linker (possessive and attributive, its head left out by rule): fix its gloss and drop
  `Poss=Yes`, in the new lexicon. Literary and colloquial readings are different words (生 *saang1* in 學生,
  *sang1* in 醫生, as the course pins them).
- **apc:** its lexical-form schema comes first; its participle pattern carries two heads (above).
- **hbo:** the wayyiqtol against the qatal is a contrast only a context decides (Joüon–Muraoka § 118):
  asked on story lines, never tagged on a lone sentence (ADR 0147).
- **lzh:** characters carry their Qieyun positions (TshetUinh), Baxter, Pinyin and Jyutping derived, with
  overrides (a loan reading, a variant lookup, a missing position, Baxter & Sagart where they differ, modern
  readings that left regular change, literary or colloquial as policy); lexemes.md §8 and
  [the prototype](../prototypes/lzh-qieyun/).

## Consequences

- **KC ids are renamed once** (lexemes, morphemes, features, rules), with a migration for logged events
  (decided in round 1). What becomes of each kind:

  | Today | Becomes |
  |---|---|
  | `sense:` (3,021 in the courses) | a lexeme, or a listed morpheme of one |
  | `form:` (262) | a feature's lexeme, a listed form, a lexical feature or a class, by the rules above |
  | `construction:` (24) | a rule where its meaning is its parts' (apc's *used to* fills a feature in two words); a listed item with slots where it isn't. Decided per construction when its course is converted |
  | `grapheme:` (75) | stays the script track's (ADR 0149): a correspondence the track teaches, with no memory after the gate |
  | `reading:`, `phone:`, `tone:` (none in use) | leave the schema; what ADR 0139 planned to credit is a word's leftover or a correspondence (ADR 0148) |

- **The fold can't migrate the log alone:** `replay(events)` sees no course. The migration is designed before
  anything is renamed (the first note of the handoff's Task C, for the owner's approval), and has to settle:
  - an alias table from old ids to new parts, per course, the same on the device and on the server;
  - what an old credit becomes where one id is now several parts (a credit for `sense:tener` and
    `form:pret-3s` doesn't say the word was *tuvo*);
  - the ids kept outside `met`, `shown` and `missed`: card keys, open mistakes, the performance model, a
    placement's `seeded`, corrections whose item is a KC, a session's plan kept on the device;
  - the new event shape, with old apps still uploading old events;
  - the audio index: 2,193 clips are keyed by a KC id, and an item's voice is drawn from a seed of its id,
    so a renamed id keeps its clip and its voice only through an alias or a pinned assignment;
  - a test on real exported logs: the simulation can't say what an existing learner's list does on the day.
- **New schemas** (schemas/, then `pnpm codegen`): the per-language lexicon (lexemes, morphemes with features,
  parts and scope, lexical forms; each form the rules don't reach marked pinned or listed), each language's
  categories, dimensions, classes and defaults, concepts. Courses reference the lexicon; tokens name lexemes
  and features, and the compiler realises them.
- **The compiler checks derivability both ways:** a token analysed as a combination must come out of the
  stated rules or be pinned, and a listed form needs its statement (generalising `kc.inflected-form`). It
  reports rule debt per language. It runs the Elsewhere lookup, so accept sets, regularised forms and (later)
  other orders are generated.
- **A lexicon entry is content like any other:** provenance and an SPDX licence, drafted `llm:` and REVIEW
  until signed off. Alternatives the compiler generates for accept sets carry `generated` provenance and are
  reviewed; authored ones stay authored (synonyms, optional words, answers promoted from reports). Where the
  lexicon lives, who signs off an entry two courses share, and how a sign-off covers one belong to the same
  design note.
- **Courses move to it whole, not piecemeal.** apc's participles fold into their verbs, its agentive nouns
  apart; yue 嘅 becomes one linker in the new lexicon (not a fix to the old KCs); es, apc, hbo and grc's
  `form:` gender KCs become dimension values or lexical features by the rules above, a noun's gender stored
  only where no default gives it.
- **"Which form" and "which word" follow the kinds of head** (ADR 0132): a form card offers other forms of the
  answer's lexeme (رايح / رحت / بروح); a word card offers other lexemes.
- **A grammatical miss and a lexical miss follow the same split** (ADR 0066's contrast sets, ADR 0148).
- **Not decided here:** what is learned and how progress counts (ADR 0146), underspecification (0147),
  projections and miss labels (0148), script first (0149), pattern display (0150), fonts (0151). How
  syntax is taught is left for later.
- **Costs:** every course needs a lexicon, categories, dimensions, classes and lexical forms, reviewed
  (REVIEW) like profile policies. Rules that reproduce every inflected token a course writes are the larger
  cost, and for hbo and grc they are most of those languages' morphology: the pinned status is what lets a
  course move before they are written. Over-generation is the risk of every rule, so every rule ships with
  vectors in both harnesses; under-generation is only debt.

## Revision (2026-11-20): the review and round 5

After [the review](../review-adr-0145-0151.md) (findings 2, 4, 7, 10, 11, 13, 14, 21, 23, 24; C2, C4, C5, C7
to C9, C18, C20) and the owner's fifth round of answers ([lexemes.md](../lexemes.md) §16).

**Decided by the owner in round 5:**
- Three statuses for a form: given, pinned, listed. Only a reviewed statement makes a form listed.
- Classes are stated per language (ADR 0148), and gender by ending is a default (ADR 0146).
- apc's participle pattern carries two heads: the participle, a value of aspect as ruled before, and the
  agentive noun, a function head.
- A general word is in a variety's scope only where its speakers say it too.
- hbo's wayyiqtol against qatal is asked where there is context, never tagged on a lone sentence.

**Restored from the notes:** scopes have two axes, an utterance has one of each and a course a range, and a
listed form carries its own register range; a listed item whose form is its parts' stores the parts and which
one inflects; a construction is a rule or a listed item with slots; trees are drafted by a parser.

**Proposed with this revision, not yet the owner's:**
1. The shapes of a lexical form by kind of morpheme, the logography exception, and yue's and tok's forms.
2. A source's spelling belongs to the utterance, and a free correspondence gives the others.
3. A drafted statement that a form is listed counts while it awaits review, as every REVIEW policy does.
4. Categories declared with subclasses, UD's tags kept as a mapping.
5. The base case checks a declared dimension; alone it doesn't make one.
6. A scope is a social distinction with no exponent of its own (so Korean's honorifics are a dimension, as
   the ADR already ruled). Not taken from the review: marking a dimension as social, so that its misses get
   a scope's feedback. Say if you want it.
7. Regularised forms are shipped only for listed parts and stated classes, never for a pinned form.
8. What becomes of each kind of KC id, and what the migration has to settle before anything is renamed.
9. Agreement and government links on tokens from the migration on; trees with the first rule that needs them.
10. A lexicon entry's provenance, licence and review; generated alternatives marked as generated.
