# 0145. The lexical model: concepts, lexemes, morphemes, forms

- Status: Proposed
- Date: 2026-11-19
- Amends: the gameplan's §7.1 and glossary (what a KC is), [ADR 0061](0061-lemmas-and-morphs.md) (a KC's
  forms), [ADR 0132](0132-a-choice-asks-one-thing.md) ("which form" and "which word"), [ADR
  0066](0066-meaningful-endings.md) (contrast sets)
- Working notes: [lexemes.md](../lexemes.md) (the discussion, its rounds of answers),
  [lexeme-model.md](../lexeme-model.md) (the model, diagrammed). Followed by ADRs 0146–0151.

## Context

**A KC is a word-sized unit with four prefixes, and the courses have outgrown it.**
- `sense:` is a word and one meaning; `form:` mixes feature values (es `form:pret-3s`) with affixes (uz
  `form:abl-dan`); `construction:` and `grapheme:` sit beside them.
- Inflected words crept into KC forms until ADR 0061 forbade it, and nothing says where an irregular form
  lives: *ran*, *fue*, کتب, Persian *rav‑*.
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
| **allomorph** | a morpheme's forms by context, each stored with its context or given by a rule | ‑ga, ‑ka after k, ‑qa after q |
| **lemma** | a lexeme's citation form: one of its forms, by the language's convention | *hablar* (HABLAR + INF), كَتَبَ, λύω |
| **form** | a lexeme with one set of inflectional values; may be several tokens | *ran* = RUN + PAST; *he comido*; 食咗 |
| **derivative** | what a function head makes from a base: lexeme-shaped, computed | *writer* "one who writes", *rápidamente*, كاتِب "one who writes" |
| **feature** | a grammatical value: **lexical** (constant across a paradigm: gender, class) or **inflectional** (a dimension's value); inflectional ones are **inherent** (chosen for meaning) or **contextual** (agreement, government) | *casa* feminine; PAST; *blanca*'s ‑a |
| **dimension** | a set of inflectional values every member of a category must choose from, declared per language | Spanish verb: tense, person, number, VerbForm |
| **scope** | a variety or register a morpheme, lexeme or rule belongs to; never a dimension | Cuban; krama; formal Persian |
| **combination** | what Merge builds; a value, never stored | *kitoblarimdan*, *scanned*, *the writer of this list* |
| **utterance** | stored content: a combination plus the order it was said in | a sentence; a story line |

### Three layers

- **Entities are stored**, with ids and provenance: lexemes, morphemes, allomorphs, rules, features,
  concepts. Entities are what is learned (concepts have no learning state).
- **Values are computed** and identified by their content: combinations, forms, derivatives, surface forms,
  audio.
- **Instances are content:** utterances.

### What is listed: the morpheme rule

- **Whatever the rules give is a combination; whatever they don't is a morpheme.** The test is symmetric and
  per sense (blocking is per sense: *thief* does not block *stealer of hearts*).
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
  *yaxshi* is one lexeme, never split into adjective and adverb). A function head stores a signature: what
  it takes, what it makes, which features it sets.
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
  person, gender, number; Spanish noun: number). **The base-case rule decides them:** a feature with an
  overt, regular base-case morpheme is a dimension, and its suppletive forms are forms of the one lexeme
  (English past: *ran*; Arabic plural, since ‑ون exists: كُتُب; Persian present: *rav‑*; Korean honorific:
  드시다). A noun's gender is a lexical feature, and noun gender marking is derivation (*niña* is *niño* + a
  derivational feminine; *padre* and *madre* are two lexemes; native apc judgement: خال / خالة one word).
- **Which feature values are lexemes:** one with a meaning, merged as a head (PAST, lemma ‑ed; a noun's PL;
  preterite and imperfect; INF, lemma ‑r; DAT where it means "to"). A class value is a lexical feature, not a
  lexeme (*casa*'s feminine). Agreement and government merge no head: a rule plus a lexical feature (*blanca*'s
  ‑a; a dative a verb requires; *querer* + infinitive).
- **Function heads are lexemes too:** AGENT (‑er), ACTIVE PARTICIPLE (فاعِل), PLACE (مَفْعَل), DIMINUTIVE.
  Productivity decides whether their results are computed or listed, not whether they are lexemes (‑th in
  *warmth* is a lexeme that no longer makes new words).
- **A derivative is stored only where something about it is listed**, and is then a lexeme with its parts as
  links: *writer* "author", كاتِب "clerk" (plural كُتّاب), *panadero*. A computed one is a value.
- **apc's active participle** (شايف, رايح) is its verb + the participle pattern, a value of apc's aspect
  dimension (perfective, imperfective, participle): a form. Its sense KCs go; a listed sense (جاي "next
  (week)") stays a lexeme.
- **Cases on the line,** as the dimension test settles them (the kind is per language; the explainer
  [inflection-or-derivation.html](../explainers/inflection-or-derivation.html) gives the reasons both ways):

  | Case | Kind |
  |---|---|
  | apc participle (رايح, شايفه "I've seen him") | value (aspect) |
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
  | Biblical Hebrew stems (לָמַד → לִמֵּד) | function, mostly listed |

### Concepts and scopes

- **Scopes are never dimensions.** A scoped form that replaces a lexeme's every form is a separate lexeme,
  linked by a concept (*nedha*, *dhahar*, Javanese *dipun‑*, *usted*, *coche*); one that replaces some forms is
  a scoped morpheme of the same lexeme (formal Persian کتب *kotob*, while the singular stays کتاب).
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
- **Blocking off gives the learner's error:** the same lookup ignoring listed parts makes ✗*runned*, ✗*tenió*,
  which the compiler ships beside the answer for grading (ADR 0148).

### The lexicon and the lexical form

- **One lexicon per language**, which every course of the language draws on; a course picks its scope.
- **A morpheme stores one lexical form**: one tier, in its own script, fully specified (the vowels, stress,
  the letters an orthography distinguishes). Every orthography and phonemic form is a projection of it
  (ADR 0148). Where a script can't say something, the language's schema invents an in-script convention,
  never a juxtaposed pair of forms.
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

### Decided per language

- **es:** stem-changing verbs are a lexical class (e→ie, o→ue, e→i) plus a rule, not listed stems; the class
  isn't derivable from the form (*probar* / *pruebo*, *robar* / *robo*), and the profile states what is
  predictable (nearly every ‑ir verb with stem e or o alternates; ‑ear verbs never do). Cuban forms are
  canonical (ADR 0076; dialect tags, ADR 0147).
- **uz:** the causative (‑t, ‑tir, ‑dir) is derivation: a causative whose meaning drifted is a lexeme (*oʻqit‑*
  "teach" beside *oʻqi‑* "read"), a transparent one a derivative. *yaxshi* "good, well" is one lexeme. The
  lexical form is Latin-based, the Cyrillic derived from it.
- **fa:** the course teaches both registers, formal first: a scope pair like ngoko and krama, realised by
  scoped rules (colloquial *mi‑ram* for *mi‑ravam*), scoped morphemes (formal کتب) and concept-linked lexemes
  (*hālā* / *aknun* "now").
- **Javanese** (when it comes): ngoko and krama taught from the start; every register form at the concept
  level.
- **yue:** 嘅 is one linker (possessive and attributive, its head left out by rule): fix its gloss and drop
  `Poss=Yes`, in the new lexicon. Literary and colloquial readings are different words (生 *saang1* in 生日,
  *sang1* in 學生).
- **apc:** its lexical-form schema comes first; its participles are forms (above).
- **lzh:** characters carry their Qieyun positions (TshetUinh), Baxter, Pinyin and Jyutping derived, with
  overrides (a loan reading, a variant lookup, a missing position, Baxter & Sagart where they differ, modern
  readings that left regular change, literary or colloquial as policy); lexemes.md §8 and
  [the prototype](../prototypes/lzh-qieyun/).

## Consequences

- **KC ids are renamed once** (lexemes, morphemes, features, rules), with a migration in the fold for logged
  events (decided in round 1). `sense:` becomes a lexeme or a morpheme; `form:` splits into feature lexemes
  and listed forms.
- **New schemas** (schemas/, then `pnpm codegen`): the per-language lexicon (lexemes, morphemes with features,
  parts and scope, lexical forms), each language's dimensions per category, concepts. Courses reference the
  lexicon; tokens name lexemes and features, and the compiler realises them.
- **The compiler checks derivability both ways:** a token analysed as a combination must come out of the
  rules, and a form the rules can't give must be a listed morpheme (generalising `kc.inflected-form`). It runs
  the Elsewhere lookup, so accept sets, overregularisations and (later) other orders are generated.
- **Courses move to it whole, not piecemeal.** apc's participles fold into their verbs; yue 嘅 becomes one
  linker in the new lexicon (not a fix to the old KCs); es and hbo's `form:` gender KCs become dimension values
  or lexical features by the rules above.
- **"Which form" and "which word" follow the kinds of head** (ADR 0132): a form card offers other forms of the
  answer's lexeme (رايح / رحت / بروح); a word card offers other lexemes.
- **A grammatical miss and a lexical miss follow the same split** (ADR 0066's contrast sets, ADR 0148).
- **Not decided here:** what is learned and how progress counts (ADR 0146), underspecification (0147),
  projections and miss labels (0148), script first (0149), pattern display (0150), fonts (0151). How
  syntax is taught is left for later.
- **Costs:** every course needs a lexicon, dimensions and lexical forms, reviewed (REVIEW) like profile
  policies; over-generation is the risk of every rule, so every rule ships with vectors in both harnesses.
