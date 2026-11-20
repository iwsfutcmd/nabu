# 0148. Projections as rules, and what a miss is

- Status: Accepted (2026-11-20)
- Date: 2026-11-19
- Revised: 2026-11-20, after the review and the owner's rounds 5 and 6 (what changed is listed at the end)
- Amends: [ADR 0142](0142-sound-alike-spelling.md) (`soundAlike`), [ADR 0131](0131-readings-on-new-words.md)
  (a scheme's `variants`), [ADR 0066](0066-meaningful-endings.md) (contrast sets), [ADR
  0054](0054-pronunciation-exercises.md), [ADR 0098](0098-pronunciation-by-choice.md) and [ADR
  0139](0139-feature-cards.md) (where their options come from); the marks policy of the es profile, which
  [ADR 0076](0076-cuban-spanish.md) decided (a missing accent is noted, not failed), and, once the app can put
  Greek's marks on, the grc profile's, which [ADR 0087](0087-attic-greek.md) decided; [ADR
  0141](0141-minimal-ruby.md) (its "Unwritten" ruby reads a scheme's `variants`, removed here); [ADR
  0045](0045-ai-services.md) (the judge sees what the grader calls `WRONG`, a verdict that becomes a set of
  labels); [ADR 0134](0134-required-marks.md) (chg-Latn's consonant marks are split by sound: š, ž, ḫ and ǧ
  become required)
- Leaves standing: [ADR 0133](0133-script-tracks-ask-the-reading.md) (grc-Latn's macrons stay noted: its
  readings are only ever chosen, never typed)
- Builds on: [ADR 0145](0145-lexical-model.md) (one lexical form, projected), [ADR 0146](0146-what-is-learned.md)
  (credit per node)

## Context

A morpheme stores one lexical form, and every orthography and phonemic form is a projection of it (ADR 0145).
Several mechanisms already say, piecemeal, what a projection loses: fa's `soundAlike` sets (those letters are
one sound, so which a word takes is learned per word), a profile's marks set (the vowels the script leaves
out), a scheme's `variants` (chg's vowels written alike), attested tones. Each drives its own cards and its own
grading. And the grader decides a miss by mechanism (a keyboard typo, a mark, a contrast, another course
word), so ✗*havlar* is a typo and *cafe* for *café* is accepted with a note. (*esta* for *está* is already
wrong, since *esta* is another word of the course: ADR 0076's own example.)

## Decision

### What rules read

- **A rule's conditions may read** its base's lexical form (uz ‑qa after q), its lexical features (*pensar*'s
  e→ie class; a verb's imperfective vowel choosing مَفْعَل or مَفْعِل; a noun's gender), the combination's
  features, its neighbours, its scope, and computed prosody (e→ie only under stress: *pienso*, *pensamos*).
- **Two guards.** A class is stated, never counted (the owner, round 5): each language states its classes
  in its lexicon, reviewed, as each profile states its projections, so adding a word never changes what is a
  rule (*dormir* and *morir* are a class whichever of them the lexicon holds; *ser* is listed). And a rule
  reads no feature the form already gives (Spanish conjugation class from the infinitive, Arabic root class
  from the radicals).
- **A default is a rule too** (the owner, round 5). Where a language states one (Spanish ‑a feminine and ‑o
  masculine, with its other reliable endings), a lexical feature the default gives is not a part of the word
  (ADR 0146); the word stores it only where the default misses or is broken (*la noche*; *la mano*, *el día*).

### Projections are rules, and the profile states them

- **The projections (lexical form to each spelling, lexical form to phonemes) are rules,** so a word's spelling
  and reading are learned only for what no projection gives (ADR 0146).
- **A correspondence covering many words is a rule** (a letter, a digraph, a mark, Spanish *c* before *e* and
  *i*); one per morpheme is listing (a Chinese character's reading, a sitelen pona glyph); a statistical
  tendency is neither (a character's phonetic component, a phonaestheme).
- **The rules are what the orthography profile states**, as data, with contexts, marked REVIEW; whatever they
  don't produce is per word. Not a count threshold, which would let added words change what is a rule.
- **Reading and writing are two directions, each with its own leftovers.** Writing needs what the phonemic
  projection loses (es b/v, h, Cuban s/c/z, ll/y; fa which of س / ص / ث); reading needs what the orthographic
  one loses (fa's vowels and خواهر's silent و; *México*'s x; hbo's qamets gadol or qatan and vocal shewa).
- **Leftovers depend on the variety:** Cuban *casa* / *caza* are a spelling leftover, Madrid's aren't; a Dari
  profile, leaving ق / غ out of its sound-alike letters, makes that pair derivable.
- **One statement in the schema** says what each direction loses, in the profile and scheme schemas. It
  replaces `soundAlike` and a scheme's `variants`, which are removed; matching policy (`match.marks`) stays.
- **The compiler lists each word's leftovers per direction**, and lints any spelling or reading a course
  pins that the stated rules can't account for: the per-word parts to teach, and a review list.
- **What grading reads is data the grader runs** (the owner, round 5). An orthographic miss is decided when
  an answer is graded: on the device, offline, in @nabu/core, inside the grading budget. So each profile's
  correspondences (a letter or digraph to a sound, with its contexts) are executable data, and the question
  they answer is: can this typed spelling be read as the target's sound? The compiler puts each accepted
  answer's phonemic form in the bundle; how it computes that, by code or by data, is its own business. The
  device needs no inverse: it reads what was typed forwards and compares.
- **A correspondence is fixed or free.** Fixed: the norm picks one spelling per word, so which one is a
  leftover (fa's س, ص or ث; es b or v). Free: no norm picks one, so every spelling it gives is right, an
  accepted variant and no leftover (Arabizi's e or i; chg's scribes' پ, ب or ف for p; hbo's full and defective
  spellings; Hong Kong and Taiwan character forms). The profile says which, as its `equivalences` and
  `variants` do today.
- **What the compiler and the voices use may be code, but it is part of the language's data**, kept with it
  rather than in the pipeline's modules (nabu/audio's tiberian, attic and toki_pona; nabu/greek_translit). A
  conformance check confirms the code and the profile agree: where the profile says a reading follows from
  the spelling, the code must get it from the spelling alone. **A standing goal: every transformation as pure
  data**, so it can be analysed and run backwards (ordered rewrite rules compile to invertible transducers:
  Kaplan & Kay 1994).

### What a miss is

- **An answer is graded in this order** (the owner, round 5):
  1. **Against the accept set, after normalization and the profile's matching policies.** An equivalence (ة
     for ه; ch for sh in Arabizi), a character variant (裡面 for 裏面), a free correspondence (above), a ZWNJ
     or an apostrophe typed another way: right, with the note the profile gives, as now. A policy is not a
     miss and gets no label.
  2. **Then the slip.** A slip is any edit within today's typo budget (the profile's `typo`: a neighbouring
     key or a transposition in a short word; in a longer one also a letter left out, doubled or mistyped).
     Against the nearest accepted answer, a difference a slip explains is accepted, with the label **slip**
     alone, unless what was typed is:
     - a spelling the target's sound also allows (✗*havlar*, ✗*ablar*): which letter was the question;
     - a form of another lexeme, or another form of the answer's own (*cada* for *casa*; *habla* for
       *hablo*, as ADR 0066's contrast sets rule today);
     - the answer with a mark that carries sound left out, added or moved (*tambien* for *también*).
  3. **Then two questions,** asked only of what a slip doesn't explain: is the sound right, and whose form is
     it.
- **An orthographic miss: a spelling the target's phonemic form also allows.** The test runs on the whole
  form, under the profile's fixed correspondences: es ✗*havlar*, ✗*aser* (h and c both), *ké tal* (the
  profile states *k* as a spelling of /k/, as in *kilo*), fa سد for صد, uz сирк for цирк, yue 唔洗 for 唔使 (a
  homophone character is a possible spelling of its syllable). Never a typo.
- **A phonemic miss: a form that spells another phonemic form.** *esta* for *está* says /ˈesta/. So **a mark
  that carries sound is never excused as a mark**: Spanish stress accents and ü (*pinguino* says /ɡi/). Marks
  an orthography leaves out (fa's vowels) are no miss: the unmarked form is a possible spelling, the usual
  one. Which marks carry sound falls out of the projection.
- **chg's typed readings split their consonant marks by sound** (the owner, round 6; amends ADR 0134, which
  noted them all). š, ž, ḫ and ǧ are required, as the vowels' marks are: without the mark they are s, z, h and
  g, other sounds and other Arabic letters (*kisi* for *kiši*, *tag* for *taǧ*). The rest stay noted: ṣ, s̱, ḥ,
  ṭ, ẓ, ż, ź and ṗ sound like their plain letter and only name another Arabic letter (*hujra* for *ḥujra*),
  and č has no plain letter to be taken for. The split is from Schluessel's table of letters (2018, pp. xi to
  xxxii) and stays a statement marked REVIEW in the profile. ž joins the answer bar.
- **Greek waits for its buttons** (the owner, round 5). Greek accents and the rough breathing carry sound too,
  and a learner may have no polytonic keyboard (ADR 0087's reason for noting them). grc keeps that note until
  the app has its own way to put the marks on, from buttons, as ADR 0137 gave vowel marks; then a missing one
  is wrong, as in es.
- **Every miss is labelled, and may carry several labels,** each from one question:

  | Question | Label | Example | What it counts against |
  |---|---|---|---|
  | Is the sound right? | **orthographic**: yes, not the spelling | *caza*, *ké tal* for *casa*, *qué tal* | the word's spelling leftover; where a stated rule decides that spot, the correspondence (below) |
  | | **phonemic**: no | *esta*, ✗*cafe* for *está*, *café* | the word's sound, or the rule that writes it (the stress accent) |
  | Whose form is it? | **grammatical**: the right lexeme, another form | *hablas* for *hablo* | the use that was called for, or the agreement rule |
  | | **regularised**: the right lexeme and form, built by rule where a part is listed | ✗*tenió* for *tuvo*; ✗*penso* for *pienso* | the listed part (*tuv‑*; the e→ie class); the feature is shown |
  | | **lexical**: another lexeme | *gato* for *perro*; *caza*; *esta* | always recorded: the target's recall, or telling a pair apart (*caza*) |
  | | **scope**: the right concept, a variety or register the prompt ruled out (ADR 0147) | *tú* under "(to your boss)" | the scope choice |
  | How did it happen? | **slip**: an edit within the typo budget | ✗*nesa* for *mesa*; *cada* for *casa* | nothing by itself |
  | (sentences) | **order**: the right words, in an order the language doesn't allow | | the order rule |

  ✗*nesa* is a slip and nothing else. *cada* is lexical + slip, and *habla* for *hablo* grammatical + slip:
  the slip explains the difference, so the sound question is not asked, and the slip stays for the feedback.
  *caza* is orthographic + lexical; *esta* phonemic + lexical; *hablas* phonemic + grammatical; ✗*ke tal*
  orthographic (*k*) + phonemic (the unstressed *que*).
- **The outcome comes from the set:** a slip alone is a typo, accepted (`CORRECT_WITH_TYPO`); any other label
  is not accepted, and the worst label decides the outcome. `WRONG_WORD` and `WRONG` become views of the set,
  and `PARTIAL` (yue's homophone characters) becomes the orthographic label, not accepted, as now.
  `CORRECT_VARIANT` and `CORRECT_MARKS` stay what a profile's policy gives in step 1: es's accents leave
  `CORRECT_MARKS`; grc's marks leave it with their buttons; the marks a transliteration notes stay (grc-Latn's
  macrons, ADR 0133; chg-Latn's consonant marks that say no other sound, above).
- **Another lexeme is decided by lexeme, not by string.** A scribe's or a variant spelling of the answer's own
  word is never another word (chg بادشاه for پادشاه is `WRONG_WORD` today, because another sentence's accept
  set holds it). The lexicon the grader asks is the course's: the lexemes it teaches, in every form the stated
  rules and the listed parts give them.
- **The regularised forms are the ones the compiler ships** (ADR 0145: the Elsewhere lookup with blocking off,
  for listed parts and stated classes only, never for a pinned form).
- **Credit follows the labels, per node** (ADR 0146): a label is a miss on one part and the rest of what the
  card made the learner supply is shown. *caza* for "house" shows the sound and misses the spelling, and its
  lexical label counts against telling *casa* from *caza*, which then gets a spelling-choice card. A lexical
  label is always recorded; *gato* for *perro* misses the target's recall.
- **A letter's rule is counted, not scheduled** (the owner, round 5). An orthographic miss at a spot a stated
  correspondence decides counts against that correspondence. The fold keeps the count and no memory, and a
  correspondence that keeps coming back reopens its part of the script track (ADR 0149).
- **Feedback names every label** (an MF2 note each), the worst first: "right sound, wrong letter", "right verb,
  wrong person", "right verb and tense: an irregular one", "another word: *caza* is 'hunt'", "that's the word
  in Spain", "that's the general word; in Cuba, *guagua*".
- **The judge sees what it sees today** (ADR 0045): a free production into the target that is not accepted,
  unless a slip or the sound test explains every difference, which was never a question of meaning. Labels
  that depend on its answer (lexical, grammatical, order) are held until it answers, so a learner is not told
  "another word" and then "right". A report ("my answer should be accepted") works as now.
- Not labels of their own: Latin typed for Cyrillic is orthographic with a note; a missing or extra word is
  lexical or grammatical by what it is.

### Cards

- **Spelling-choice, vocalize, vocalize-build, reading-feature and char-read options come from the leftovers**,
  in every course, with no per-course path: a card's options differ from the answer only where the
  direction it asks loses something.

### Done in one go

The stages are build order on one branch, landed together, never half-switched. Done means:
1. one statement of each direction's losses in the profile and scheme schemas, executable by @nabu/core,
   saying which correspondences are fixed and which free; `soundAlike` and `variants` removed, and ADR 0141's
   `openLetters` reading the new statement;
2. every profile and scheme states its losses, marked REVIEW: 22 profiles and 8 schemes today;
3. the compiler reports leftovers per word and direction, puts each accepted answer's phonemic form in the
   bundle, and accounts for every spelling and reading the courses pin;
4. those cards and the miss labels come from the leftovers in every course;
5. the fold counts leftovers shown and misses per correspondence (`test/fold-before-r2.ts` mirrored, the
   simulation and golden files rerun);
6. conformance vectors in both harnesses, for the projections, the order of grading and the label sets; the
   grading budget holds (`pnpm test:perf`: p95 under 5 ms); the fixture courses green; profiles/README and
   CLAUDE.md updated.

## Consequences

- **Grading gets stricter in es:** b/v, h and s/c/z swaps, and missing accents, are wrong with a note where
  they were typos or accepted. Heritage speakers of Spanish are the audience for whom that is the point. grc
  follows when its mark buttons exist.
- **And wherever a profile states a fixed correspondence:** a letter with the same sound is a miss in every
  course (uz-Cyrl's с for ц), where today it can pass as a typo. Which correspondences are fixed is each
  profile's reviewed statement.
- **Nothing else gets stricter.** A letter left out, doubled or mistyped is a slip, as now.
- **A slip onto another form of the answer's own lexeme** is caught wherever the lexicon knows the form,
  where today a profile's contrast sets and the course's own words decide.
- **An orthography with no norm depends on its profile.** Lebanese has no codified spelling in either script
  (Kline 2022, ch. 2): what apc's profiles state as free is accepted, and until they state it, accept sets
  carry the spellings by hand, as now. The same goes for chg's scribal letters and hbo's full and defective
  spellings.
- **The grade carries labels**, not one verdict; the feedback panel and the learner-event schema change with
  it, under the KC-rename migration (ADR 0145).
- **The voices keep their code;** what changes is where it lives and the check that ties it to the profile.
- **Every profile gains a reviewed, executable statement of its losses.** For hbo, grc and tok that is new
  data beside the Python their voices keep: the larger part of this ADR's cost.

## Revision (2026-11-20): the review and round 5

After [the review](../review-adr-0145-0151.md) (findings 1, 5, 8, 10, 11, 16; C1, C16) and the owner's fifth
round of answers ([lexemes.md](../lexemes.md) §16).

**Decided by the owner in round 5:**
- A slip is any edit within today's typo budget, asked before the two questions, with three exceptions (the
  order of grading).
- The device reads the profile's rules: the statement is executable data, the phonemic form of each accepted
  answer is in the bundle, and every profile states its rules so before this lands.
- A class is stated per language and reviewed, never counted (it replaces "a class must cover at least two
  lexemes").
- A default is a rule (gender by ending), so what it gives is no part of the word.
- Greek's missing marks stay a note until the app can put them on; then strict.
- Letters after the gate are counted per correspondence, not scheduled.
- The feedback for a general word under a variety tag ("the general word", never "Spain's").

**Restored from the notes** (decided there, dropped when the ADR was written): the accept set is checked
after normalization and accepted variants; the worst label decides the outcome; what each label counts
against.

## Round 6 (2026-11-20): accepted

The owner's sixth round ([lexemes.md](../lexemes.md) §16) ruled on what the revision had proposed, and
accepted the ADR.

**Decided against the draft:**
- **chg-Latn's consonant marks are split by sound** (ruling 2). The draft left ADR 0134 standing, with every
  consonant mark noted. š, ž, ḫ and ǧ become required; the others stay noted.

**Accepted as drafted:**
1. A correspondence is fixed or free, and a free one is an accepted variant, not a leftover.
2. "Another form of the answer's own lexeme" stops a slip, as a contrast set does today (ruling 1). Run on
   fifteen such slips in es, uz and apc, today's graders already refuse all fifteen.
3. The label **regularised**, for the forms the compiler ships with blocking off.
4. Another lexeme is decided by lexeme, and the grader's lexicon is the lexemes the course teaches.
5. The judge's gate keeps today's reach, and labels that depend on it are held.
6. What becomes of each verdict: `PARTIAL` is the orthographic label; `CORRECT_VARIANT` and `CORRECT_MARKS`
   stay as profile policies.
7. ADR 0133 stands: grc-Latn's macrons stay notes, since its readings are chosen, never typed.
8. The grading budget and the order of grading join the definition of done.
