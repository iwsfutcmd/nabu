# 0132. A choice asks one thing: which word, or which form

- Status: Proposed
- Date: 2026-11-17
- Amends: gameplan §8.2 (gap-fill), §8.5 (credit assignment); [ADR 0043](0043-stories.md) (story `complete`
  questions); the Phase 6 rule on `complete` distractors (CLAUDE.md)

## Context

The project owner found a Chaghatay story question where more than one option fitted the line. A fix
(2fb07d45) chose wrong options that make the line ungrammatical or absurd. The owner then saw the wider
problem:

> a question should only be asking one thing. In other words, if we have multiple choices, we should be
> asking "which word fits here (semantically)?" or "which word fits here (grammatically)?" asking both at
> the same time means we don't know what cued the learner, giving the learner too much advantage.

Two kinds of card ask for a word in a gap, and both mix the two questions.

**Lesson gap-fill** (`makeGapFill`). It shows the sentence's translation above the gap. Its two wrong
options are the answer's own word in other forms where the course has them (هستم / هستی / هستند), and
otherwise any other word of the unit or earlier, in whatever form it had in its own sentence. One card
often has one of each. The learner rules out the other word by meaning (the translation says what the
gap means) and the other form by grammar. A card can also be passed on grammar alone: the other words
are a verb and a postposition where the gap wants a noun.

**Story `complete`** (`story.ts`). The answer is the gap's word as written; the wrong options are the
first forms (lemmas) of the KCs the author listed. Where the gap is inflected, its suffix alone picks it
out among bare lemmas. Where it is not, an option of another part of speech is ruled out by grammar. The
fix above made this worse in places. chg's "He was a very great ___" offers *adi* "giant", *keyin*
"after" and *bila* "with": only one is a noun, so the card asks nothing about meaning.

**Credit** (`askedKcs`, credit.ts). A gap-fill or story answer is credited to every KC of the answer's
token: its sense and its morphs (or pinned `form`). A learner who knew the ending but not the word gets
the same credit as one who knew both, and a miss is laid on both. Known words (ADR 0100), due words and
the planner's targets (ADR 0101) read these credits, so they are measuring a mix too.

A three-way choice that one cue reduces to two, or to one, is also easier than it looks. The calibration
(85% first-try right) then holds only because some cards ask less than they seem to.

## Decision

**Every multiple-choice fill-in asks one of two questions and says which.** The exercise carries
`asks: "word" | "form"`; the player shows a different instruction for each.

### Which word

- **Every option has the answer's form.** Its form signature is the same: the token's morph KCs other
  than its sense, and its pinned `form` (es, grc, hbo). A dative takes datives; a first person past
  takes first person pasts; a bare word takes bare words.
- **Every option has the answer's part of speech.** KCs get an optional `pos`, a Universal Dependencies
  UPOS tag (NOUN, PROPN, VERB, AUX, ADJ, ADV, ADP, PRON, DET, NUM, PART, CCONJ, SCONJ, INTJ): a standard
  that already covers every language the project teaches. Beside it, optional `features`: the word's
  lexical features as UD writes them (`NounType: Clf` for a classifier, `PronType: Dem`), resolved
  below. Where the answer's KC has a `pos`, a candidate must have the same `pos` and the same
  `features` (none where the answer has none), so a classifier never stands against a plain noun.
  Where it has none, the form signature alone decides, which is enough only for inflected words: bare
  words of every class match each other. So `pos` is needed most where words are bare (lzh, tok, and
  the uninflected words of every course).
- **Only meaning tells them apart.** In a lesson, a wrong option is never one the translation could
  also mean. Two checks:
  - a candidate whose sentence, with it in the gap, is in the item's accept set (`producible`) is right
    too, so it is never offered (ADR 0085: what the prompt leaves open, the learner may choose);
  - a candidate whose gloss shares a meaning with the answer's (ay- and de- "say") is not offered.

  In a story, the context decides, and the Phase 6 rule stays: a wrong option makes the line false or
  absurd, never another sensible line.
- **Credit goes to the sense only.** Every option had the gap's form, so the form was given.

### Which form

- **Every option is the answer's own word** (the same sense), in another form the course attests: a
  token in the item's unit or earlier (ADR 0050) with that sense and another form signature. Never a
  form the course does not write somewhere; a learner must not meet a made-up form in a choice.
- **Only grammar tells them apart:** agreement with the rest of the line, the translation (I, you, we),
  the persons tags (ADR 0056). The same two checks apply: a form the item's accept set would take is
  never a wrong option (English "you" for sän and siz, "he/she" where the language marks no gender).
- **Credit goes to the form KCs only** (the morph KCs other than the sense, and the pinned `form`). The
  word was given.
- **Feedback says what each form is.** A wrong choice shows the chosen form's form-KC glosses beside the
  right one's ("-dim: I (past)", "-di: he, she (past)"), not the word's meaning, which is the same.

### Which one a card asks

- **A lesson card asks what made the planner blank that word.** `blankIndex` picks the gap by a KC
  being asked again, in focus, or new. If that KC is a sense, the card asks *word*; if a form KC or a
  morph's, *form*. A gap picked by default (the last word) asks *word*, or *form* where only that can
  be built.
- **A mistake is asked again as the same question.** `Mistake.ask` (ADR 0037) records the kind with
  the KCs, and only an answer to that kind closes it.
- **No card where the question cannot be built.** A word question needs two wrong options with the
  answer's form and part of speech; a form question needs two other attested forms. Lacking both, no
  gap-fill is made for that sentence; the planner's other candidates fill the slot, as they do today
  when `makeGapFill` returns nothing.

### Story questions

- A `complete` line gets `asks: word | form` in schemas/course-source (default `word`).
- **word:** `distractors` stay KC ids. The compiler shows each in the gap's form: it finds a token the
  course attests with that sense and the gap's form signature (its unit or earlier) and bundles its
  surface. None found is a diagnostic, `story.distractor-form`. Two KCs of another part of speech than
  the gap's (where both have `pos`) is `story.distractor-pos`.
- **form:** `distractors` are form KC ids (`form:past-1s`), or left out for the compiler to choose two
  attested forms of the gap's sense. A form the course does not attest is `story.distractor-form`.
- Both diagnostics start as warnings, listing every step that fails, and become errors once the courses
  are clean.
- The Phase 6 note in CLAUDE.md is rewritten to say this: a story question asks one thing, and its wrong
  options fail for that reason only.

### What this covers

Only the fill-ins mix two questions today. The other choice cards already ask one: match-pairs and
listen-select ask meaning or what was heard; char-read, vocalize and minimal pairs ask a reading;
story-choose asks comprehension. A new choice template states what it asks, and its options differ in
that alone. Word banks (translate-tap, story-arrange) ask for a whole sentence and are credited as one;
their distractor tiles are not covered here. Typed blanks (complete-translation) ask the learner to
produce the whole word, so crediting sense and form together is honest there.

## Consequences

- A right answer says what the learner knew: the word, or the form. Known words, due words and the
  planner's targets read cleaner credit, and form KCs (person endings, cases, tenses) get credit of
  their own from choices for the first time.
- Word questions are harder than today's mixed cards, form questions too; the simulation must stay
  within ±5pp of 85% (CALIBRATION_WEIGHT), and every course's golden plans change (UPDATE_GOLDEN=1).
  Gap-fill and story-complete screens change in the visual matrix (the instruction text).
- Two new messages each for gap-fill and story-complete instructions (new keys, ADR 0070: the meaning
  changed), and one for form feedback. The drafted catalogs need them translated.
- Every course's story `complete` steps are reviewed: apc 20, chg 19, es 57, fa 10, grc 10, hbo 36,
  lzh 18, tok 10, uz 10, yue 10 (200). chg's were chosen under the Phase 6 rule (2fb07d45) and mix part
  of speech in places (u13's keyin, bila for a noun); they are redone first.
- `pos` must be drafted for every course's KCs (an LLM draft marked REVIEW, as glosses are), starting
  with the KCs that story gaps and lesson blanks use. Until a course has it, its bare words can still
  be offered across parts of speech.
- Courses with little morphology modelled (lzh and tok have none; es and grc pin only verb forms) get
  few form questions; that is right, since a choice there cannot ask about a form the data does not mark.

## Order of work

1. Schemas: `pos` on KCs, `asks` on story lines and on gap-fill and story-complete exercises; codegen.
2. Core: `makeGapFill` builds a word or a form question; `askedKcs` credits the sense or the form KCs;
   `Mistake.ask` keeps the kind; feedback for form questions; messages; goldens; simulation.
3. Compiler: story distractors resolved to attested forms; `story.distractor-form` and
   `story.distractor-pos` (warnings) with lint fixtures.
4. Courses: chg's 19 steps, then the other nine courses; `pos` drafted per course; the diagnostics
   become errors.
5. Visual baselines from the pinned container.

## Resolved questions

The project owner decided both open questions on 2026-11-17.

- **yue classifiers and sentence particles: UD features.** Not a `class` of our own: a KC's optional
  `features` are UD's (feature name to value, UD's spelling). Classifiers are `pos: NOUN` with
  `NounType: Clf`, as the Cantonese-HK, Chinese-HK and Classical Chinese (Kyoto) treebanks tag them. UD
  defines no value for sentence-final particles (`PartType` lists Emp, Inf, Int, Mod, Neg, Vbp, "not
  exhaustive"; the Cantonese treebank marks its final particles PART with no feature). yue's (呀, 啦,
  喇, 嗎, 呢) take `PartType: Mod`, the modal particle, so they stand only against each other; the
  possessive 嘅 is PART with `Poss: Yes`. Both are REVIEW. Features match exactly: a candidate has the
  answer's `pos` and the same features, no more and no fewer.
- **Story distractors the course does not attest: not allowed.** `story.distractor-form` is a warning
  until the courses are clean, then an error. The author picks another option, or adds a sentence that
  teaches the form.

## Implementation (2026-11-17)

- **Schemas.** KCs (course source and bundle) take `pos` (UPOS) and `features` (UD's spelling; YAML must
  quote `'Yes'`). Story lines take `asks`; a bundled `complete` line carries `options`, its wrong options
  resolved per orthography (one token each, analysis and readings kept). The logged exercise
  (`ExerciseRef`) carries `asks`, so the fold can keep the question with a mistake.
- **The form signature** is `lesson/signature.ts` (`formSignature`, `sameKind`), and its Python twin in
  compiler/stories.py. A clitic morph (Hebrew ha- and wə-, Lebanese w-) is part of it, so a gap written
  with the article takes options written with it.
- **Gap-fill** tries its blanks in order: a mistake's word, as the question it was, and nothing else; then
  words in focus, then words the node introduces, each with the question of what made it the choice
  first and the other second; then the rest, from the last word, word first. The first question that can
  be built is asked. A blank needs a sense of its own: never a word of a phrase KC or a word its sentence
  repeats, and such words are never offered either. A form question needs the answer to have a form.
  "The accept set takes it" is graded with the course's lexicon (a typo that is another word is no
  match); "shares a meaning" compares the glosses' meanings, split at `;`, `,` and `/`, notes left out.
- **Credit and mistakes.** `askedKcs` follows `asks`; a card planned before it (a session left part-way)
  has none, and credits sense and form as before. A fill-in's mistake from before ADR 0132 (no `asks`) is
  closed by an answer to either question about its word (`sameQuestion`).
- **Stories.** The compiler resolves a `complete` line once every story is compiled: in the course's
  first orthography (the gap's case first), then from the same sentence or line in the others. A bundle
  without `options` (from before) still shows the distractors' first forms.
- **Feedback.** A wrong form shows each form with its form KCs' glosses (`formMeanings`), the right one
  first, under "What each form says:"; a wrong word shows the meanings as before.
- **Courses.** Every sense KC's `pos` and `features` were drafted by a model (REVIEW): about 3,000.
  chg's live in its generator (`pos.py` in the library's nabu/notes/chg/generator). All 200 story steps
  were redone and resolve; [courses/choice-doubts.md](../../courses/choice-doubts.md) lists the
  weakest. Both diagnostics are errors.
- **Calibration.** Every simulated course stays within ±5pp of 85% (80.8% to 88.9%); CALIBRATION_WEIGHT
  is unchanged. The planner walks diverge from the drafts' first lessons on, as the learners' histories
  do: yue's walk with scored speech now plans `speak` but no `listen-speak` (fa's has both).
- **Not modelled at first.** Spanish nouns and adjectives had no form KCs, so a lesson's word question
  could offer a noun of another gender or number; the amendment below closes it.

## Amendment: Spanish gender and number (2026-11-17)

The implementation left Spanish nouns and adjectives without forms: es pinned only verb forms, so a
word question could offer a noun of another gender or number (*una ___* with *carro* among the
options), which grammar alone rules out. The owner asked for the gap to be closed.

- **Agreement is the token's form.** Every es noun, adjective, determiner and pronoun that agrees
  pins its gender and number as `form:` (`form:fem`, `form:pl`, `form:fem-pl`; masculine singular
  is bare), as es already pins verb forms and apc `form:fem`. The form is the word's agreement in its
  line, not its spelling: an invariable word takes its noun's (*mi casa*, *una casa grande*), a noun
  its own gender (*el agua* is feminine), a first or second person the sentence's `persons`
  (untagged: bare); words that agree with nothing stay bare. No KC carries a gender: a lemma such as
  *tío* covers *tía*, so gender belongs to the token, for nouns as for adjectives.
- **How it was drafted.** 2,374 tokens, from their spelling where it shows the form (*la*, *cubanas*,
  *tías*), else from the noun they agree with in a dependency parse (spaCy's es_core_news_lg, used
  only as a drafting tool: nothing of it ships), else the sentence's `persons`; nouns' own genders
  and the 48 words the parse left open were decided by hand. REVIEW: courses/choice-doubts.md.
- **What it changes.** Word questions offer only words of the answer's gender and number; Spanish
  now has form questions on agreement (*la* among *el*, *los*, *las*; *cubana* among *cubano*,
  *cubanos*). Feedback on a word the learner wrote says its form (*esta*: feminine). Seven story
  questions got new wrong options that agree with their gap.
- **A phrase KC's words are next to each other.** The rule that keeps a word of a phrase KC (*por* of
  *por favor*) from being blanked or offered alone now looks at neighbouring words only: a word a line
  repeats apart (*Este es mi papi, y esta es mi mami*) is a word of its own.
- **The weak learner's pacing check** (test/simulation.test.ts, ADR 0105) averages its success over
  three seeds against 79%, above where Continue starts consolidating (78%). One seed's success
  swings about 1.5 points, and es's three new KCs moved its seed's draw from 81% to just under 80%;
  the planner stayed calibrated. The owner chose this over retuning the pace.


## Amendment: Lebanese Arabic, Biblical Hebrew and Attic Greek (2026-11-17)

The owner asked for the Spanish model in the other courses whose nouns have a gender. apc pinned gender only
on adjectives and on nouns that name a man or a woman (*jara*), hbo on adjectives (טוֹבָה), grc on adjectives
and a few pronouns: ὁ and ἡ were both bare, so a word question could offer a masculine noun after ἡ.

- **The same rule.** A noun pins its own gender and number; an adjective, determiner or demonstrative its
  noun's, invariable ones too (apc *Beirut akbar*, *awwal marra*); a gendered pronoun its own (apc *hiyye*,
  *enti*, *hayde*; hbo הִיא, אַתְּ, זֹאת; plurals *henne*, הֵם, אֵלֶּה, ἡμεῖς). Masculine, singular,
  nominative and absolute are bare. Numbers stay bare, as in es. Names pin theirs (Ξανθίππη, נָעֳמִי, *Maya*;
  cities and lands are feminine: *Beirut*, נִינְוֵה). First and second person pronouns that show no gender
  (*ana*, אָנֹכִי, ἐγώ) pin none.
- **apc.** `form:fem` and `form:pl`, the course's own KCs: Lebanese has no gender in the plural. A dual is its
  noun's gender beside the dual morph (*sa3ten*: `form:fem`). 364 tokens in each script, decided on the
  Arabizi and carried to the Arabic-script word of the same sense. apc's first feminine noun (*ahwe*, in the
  café lesson) now brings `form:fem` with it, so apc's `iPlusOne` is 2, as in es, hbo, grc, chg and tok.
- **hbo.** Gender joins number and state: `f`, `f-pl`, `f-cstr`, `f-pl-cstr` beside `pl`, `cstr`,
  `pl-cstr`; the course's duals (feet, eyes) are all feminine and keep `du`; `ptc-pass-fs` (בְּרוּכָה).
  Nouns always plural take the agreement they get: מַיִם, שָׁמַיִם, פָּנִים, רַחֲמִים plural; אֱלֹהִים as God
  singular, as before. A noun of common gender takes its usual one (דֶּרֶךְ, אֵשׁ, עֵת, רוּחַ, תְּהוֹם
  feminine). 337 tokens.
- **grc.** Gender, case and number make one id, each left out when masculine, nominative or singular, so the
  old ids keep their meaning (`acc`, `gen-pl`, `f`, now glossed as masculine) and `f-acc`, `f-dat`, `n`,
  `n-pl` join them. A neuter is one form as subject, object or address (`n`, `n-pl`): Greek always writes
  them alike. A plural vocative is its nominative. παῖς takes its article's gender. 287 tokens.
- **es follows.** *ella* pins `form:fem`; *ustedes*, *nos* and *les* `form:pl`, as *nosotros*, *ellos* and
  *los* already did. Single-word names pin their gender (*Cuba*, *la Habana*, *Lili*, *Marisol*, *la
  Navidad*); names of several words (*la Calle Ocho*) are never asked alone and stay bare.
- **Grading.** A contrast set marked `inflected` applies to every word of a sense the course pins a form on,
  and nouns now count. apc's verb-prefix sets name the verb forms instead (`forms: [form:impf, form:subj,
  form:past, form:imp]`, as hbo's do), so a noun's or an adjective's first letter stays a typo (a new
  conformance vector). Its agreement endings (ة, -e) now reach feminine nouns, as they did nouns of both
  genders (*jara*) and as hbo's reach plural nouns: سيّار for سيّارة, *madras* for *madrase* is WRONG_WORD
  (the ending), where it was a typo. hbo's endings (`forms: [form:f, …]`) likewise reach feminine nouns;
  grc's case endings were already meant for nouns.
- **Stories.** 17 hbo, 7 apc, 3 es and 1 grc story questions got new wrong options in the gap's gender.
  Where the course writes no two other words in the gap's form, the question asks the form instead (אָחִיו
  and פָּנָיו against other persons; מִכַּדֵּךְ), or moved: in-the-beginning asks יְהִי אוֹר, as no
  other plural with the article is written by then.
- **Kept so** by test/choice-asks.test.ts: a noun keeps one gender wherever its course writes it (but the
  listed nouns that name a man or a woman), and a word question on a feminine word offers only feminine words.
  REVIEW: [courses/choice-doubts.md](../../courses/choice-doubts.md) lists the genders chosen by hand.
