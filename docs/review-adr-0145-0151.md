# Review of ADRs 0145–0151 (the lexical model)

- Date: 2026-11-20. Task A of [handoff-lexical-model.md](handoff-lexical-model.md): an independent review by a
  session that took no part in the discussion.
- Reviewed at commit 98a9031: ADRs [0145](adr/0145-lexical-model.md), [0146](adr/0146-what-is-learned.md),
  [0147](adr/0147-underspecification.md), [0148](adr/0148-projections-and-misses.md),
  [0149](adr/0149-script-first.md), [0150](adr/0150-pattern-display.md), [0151](adr/0151-fonts-build-step.md);
  with them [0144](adr/0144-read-first-then-write.md), the accepted ADRs they amend or touch, both notes files,
  the explainer and the two prototypes.
- No ADR was edited. The owner decides which fixes to take.

## How it was done

- **ADRs and code first, the notes after**, as the handoff asks. What the ADRs and the code showed was listed
  before the notes were opened. Where the notes then added to a finding, the finding says "the notes".
- **Claims about the repo were checked in the repo.** The grader was run on the ADRs' own examples through each
  course's real lexicon (`createGrader` over the committed bundles). Schemas, the fold, profiles, courses,
  workflows and Dockerfiles were read where an ADR describes them. The prototype font build was run, and its
  page rendered in Chromium. What was run is listed under "Evidence".
- **Linguistic examples** were checked against the courses' own data first, then outside sources where the
  network allowed (named with the finding). Where I rely on memory, I say so.
- Every finding gives the ADR and section (line numbers are the ADR file's), what is wrong, why, how sure I
  am, and a proposed fix. Most serious first. "Sure" means verified by a run, a count or both texts read;
  "fairly sure" means the reasoning is mine and unverified.

## The findings at a glance

| # | ADR | Finding | Kind |
|---|---|---|---|
| 1 | 0148 | The miss labels, as defined, don't give the outcomes the ADR states | contradiction |
| 2 | 0145 | "One lexical form, one tier" doesn't hold for four things the ADR decides or the courses do | contradiction, gap |
| 3 | 0146 | "Never shown that word in that form (from the log)": the log can't say, and pairs are used up | gap |
| 4 | 0145, 0146, 0148 | "Listed" is whatever our rules don't yet give, so the rule set decides what is learned | design risk |
| 5 | 0148 | The miss test must run where grading runs; "a projection may be code" can't | gap |
| 6 | 0147 | The lint contradicts hbo's accept sets, and "inherent" names the wrong set | contradiction |
| 7 | 0145, 0146 | "A migration in the fold" is one line for a change the fold can't make alone | gap |
| 8 | 0148 | Most of today's matching policies, and the judge, have no place in the label scheme | gap |
| 9 | handoff | The "148 reviewed items" are clips; no sentence in any course has a sign-off | false claim |
| 10 | all | Accepted ADRs that change without being listed as amended | contradiction |
| 11 | 0145, 0149 | Five of seven KC kinds have no destination; letters are learned in one ADR, not in another | gap |
| 12 | 0146 | The parts of a lexeme: what is a part, a skill, a key, a denominator | gap, contradiction |
| 13 | 0145 | A language's own categories, UD's tags, and a tree for every sentence | contradiction, gap |
| 14 | 0145 | The base-case rule decides less than it says; "scopes are never dimensions" | contradiction |
| 15 | 0147 | Dialect scopes need a general level; a tag needs a type and a reviewer | gap |
| 16 | 0145, 0148 | An overregularised answer has no label; "another lexeme" is a string lookup today | gap |
| 17 | 0149 | Script first: what gates, what a Latin track asks, who is already past the gate | gap |
| 18 | 0150 | Pattern display: the AA rule, two backgrounds, radicals that repeat | contradiction, gap |
| 19 | 0151 | Fonts: four build paths have no Python, and Toki Pona has no fallback | gap, false claim |
| 20 | 0146 | Built glosses, feature names, and "the support language's own word" | gap |
| 21 | 0145 | One lexicon per language: ownership, review, and authored accept sets | gap |
| 22 | 0146 | Wug cards: the guardrails stayed in the notes | gap |
| 23 | 0145–0149 | What it costs: the ADRs count the reviews, not the rule sets | cost |
| C | | Corrections: examples, citations, wording | errors |
| D | | The notes and the ADRs: who decided what | record |

## A. Fix before accepting

These would be built wrong, or can't be built without guessing.

### 1. ADR 0148, "What a miss is": the labels don't give the outcomes

**What is wrong.** The ADR defines the labels by three questions, then says the outcome "comes from the set:
a slip alone is a typo, accepted (`CORRECT_WITH_TYPO`); any other label is not accepted" (lines 80–82). The
definitions and the examples don't agree:

- **A slip is never alone.** A phonemic miss is "a form that spells another phonemic form" (line 62). ✗*nesa*
  for *mesa* spells /nesa/. By the definition it is phonemic as well as a slip, and by the outcome rule it is
  not accepted. Every slip either changes the sound (phonemic) or doesn't (orthographic).
- **The table treats two slips two ways.** ✗*nesa* is a slip and nothing else; *cada* for *casa* is "phonemic
  + lexical + slip" (lines 75, 78–79). Nothing says why the sound question is asked of one and not the other.
- **"Slip" is narrower than today's typo, and nothing says so.** The ADR's slip is "keyboard or IME neighbours,
  a transposition" (line 75). Today's typo also takes a letter left out, a letter doubled, and any one edit in a
  word of five letters or more (`keyboardDistance`, packages/core/src/match/compare.ts:41–58, 185–190).
  *hablr*, *hablaar* and *hadlar* for *hablar* are all `CORRECT_WITH_TYPO` today. By the ADR's words each
  "spells another phonemic form": wrong. The Consequences name only es and grc as stricter (lines 113–114).
- **`CORRECT_MARKS` has nothing to be a view of.** It, `WRONG_WORD` and `WRONG` "become views of the set"
  (line 81). `CORRECT_MARKS` is an accepted outcome, and the only accepted set is a lone slip. The notes say
  it plainly: the change "retires `CORRECT_MARKS` for es's accents and grc's missing marks"
  (lexeme-model.md:1070–1072).

**Why it matters.** This rule grades every typed answer in every course. Two implementers would build two
graders from it, and the conformance vectors would pin whichever came first.

**How sure.** Sure of the contradiction and of today's behaviour (run through the es course's grader). The notes
have the same gap (lexeme-model.md:1085–1091) and one more clue, "a typo only by the keyboard model" (line
1071), which reads as if the slip was meant to be today's whole typo budget. I can't tell which the owner
meant.

**Fix.** State the procedure, not only the labels, and give every example its full row:
1. The accept set, after normalization and the profile's accepted equivalences and variants (finding 8):
   right, as now.
2. Otherwise, against the nearest accepted answer: if what differs is within the slip budget, and the result
   is neither a spelling the sound also allows (✗*havlar*) nor a form of another lexeme (*cada*), the label is
   **slip** alone and the answer is accepted. Say whether the budget is today's (`typo.maxRatio`: insertions
   and deletions too) or only neighbours and transpositions. If the second, put it under Consequences: every
   course gets stricter.
3. Otherwise ask the sound question and the whose-form question of the unit. A slip that lands on another
   lexeme keeps its slip label for feedback only.
4. Say what becomes of `CORRECT_MARKS`: gone where the mark carries sound; and whether it survives where a
   profile's `match.marks` notes a mark (finding 8).

### 2. ADR 0145, "The lexicon and the lexical form": one tier doesn't hold

**What is wrong.** "A morpheme stores one lexical form: one tier, in its own script, fully specified […] never
a juxtaposed pair of forms", and "every orthography and phonemic form is a projection of it" (lines 144–147).
Four things in the same ADR, or already in the courses, don't fit:

- **A logography needs a pair.** The ADR's own lzh decision is that "characters carry their Qieyun positions"
  (lines 149–150, 192–195): a character with a phonological address beside it. The notes call the position
  "the tradition's own notation" (lexemes.md:386–387), which keeps it in the script, not on one tier. For yue
  the notes propose "characters, a table and disambiguators" (lexemes.md:339–343, 418–419). The ADR says
  nothing of yue's or tok's lexical form.
- **A Semitic verb's form is a structure.** "Its radicals are a field of a base lexeme's lexical form" (line
  155); a pattern "stores its slots abstractly" (ADR 0150, line 50). A form with fields and a template with
  slots are not one string in a script, and how they are written down is not defined.
- **A listed item whose form is derivable stores parts.** *darse cuenta*, زمین خوردن and *writer* "author" are
  morphemes (Terms, line 34), but their form is built from their parts, and one part takes the inflection (*me
  di cuenta*). The notes say so: "a morpheme stores either lexical forms or parts" (lexeme-model.md:1142–1152).
  The ADR says every morpheme stores one lexical form.
- **A source's spelling is not a projection.** The courses that read real texts write each word as the source
  does. chg's scribes write one word three ways and the course takes all three (پادشاه, بادشاه, فادشاه:
  courses/chg/units/u04-do-you-have-a-king.yaml:230, 836). hbo's unpointed answers take a word in its full
  and its defective spelling (ויאמר or ויואמר, אלהים or אלוהים: u01-let-there-be-light.yaml:373). One stored
  form can't give each of these. The ADR says how a morpheme's forms vary by context (allomorphs) and how two
  listed parts tie (free variants, lines 136–137), but not how one morpheme has several spellings that no
  context picks.

**Why it matters.** The lexical-form schema is the next piece of work (handoff Task B, apc first). Its brief asks
for apc's vowels, consonants, spelling conventions and marks; not for radicals, root classes or pattern
templates. Yet the first thing ADR 0145 asks of apc is that "its participles fold into their verbs" (lines
96–98, 208): رايح from راح needs the hollow root's middle radical and the participle's template by root
class. A schema built to the brief can't do the ADR's first migration.

**How sure.** Sure that the texts disagree as quoted, and of the course lines. That Task B's brief is too narrow
is my reading of it.

**Fix.**
- Define the lexical form as a value with a shape per kind of morpheme: a string in the script (most); radicals,
  Form and stem vowels (a Semitic base); slots and fixed letters (a pattern); parts, with the one that
  inflects (a listed multi-word or semi-transparent item).
- State the logography exception outright: a character plus what picks its reading (a Qieyun position; a
  reading where the table has several). Give yue's and tok's forms.
- Say where a source's spelling lives: on the token, as an attested spelling the projection must be able to
  produce, with the others in the accept set (finding 8).
- Add radicals, root classes and pattern templates to Task B's brief before it starts.

### 3. ADR 0146, "What counts as shown": "never shown that word in that form (from the log)"

**What is wrong.** A rule's branch counts on "at least two lexemes the learner can't have memorised it on: never
shown that word in that form (from the log)" (lines 62–63).

- **The log can't say.** An event records what was asked, not what was seen. `ExerciseRef` is an id, a
  template, an item id and a flat list of KC ids, "enough to recompute credit without the bundle"
  (schemas/learner-event.schema.json). It has no surface forms and no options shown, and it doesn't pair a
  sense with its form: a sentence with two inflected words gives four ids. Story lines read are not logged
  (only a story's questions and its end are). The bundle an event names is a sha256 nobody keeps, and
  `replay(events)` takes no course (packages/core/src/learner/state.ts:454). So "from the log" needs new event
  data from here on, the bundle for stories (as ADR 0144 already leans on it for its drills), and a ruling on
  everything logged before.
- **It is state on a combination.** The fold would keep, per learner, every (lexeme, form) pair seen. ADR 0146
  says a combination "has nothing of its own" (line 43). The pair isn't learned, but it is tracked.
- **A pair counts once.** After the attempt, right or wrong, it has been seen. Showing a branch takes two
  unseen pairs, on a later day than the branch was met, and more after every miss (ADR 0100, D3).
  Recognition cards, stories and ADR 0144's passages use pairs up without asking for anything. A common
  branch in a large course may have enough. A rare one (a defective root's participle, a second person
  plural) may have two sentences in the whole course. Nothing says the planner holds unseen pairs back for
  typing, or what a branch's progress does when none are left. Wug cards are "never the main evidence" (line
  96), and ADR 0132 forbids a form the course doesn't write in a choice.
- **"Shown" means two things.** Everywhere else in the ADR the learner shows a part. Here the word is shown to
  the learner; the notes are clear that it means seen (lexeme-model.md:793).

**Why it matters.** Rules are half of what the model says is learned. If their evidence can't be identified or
runs out, "‑ar present: 4 of 6" stalls, and the planner aims at cards that don't exist.

**How sure.** Sure about the log and the fold. Fairly sure about the supply: it is an argument, not a
simulation. It should be the first thing the simulation is asked.

**Fix.**
- Use another word than "shown" for seen.
- Log it: the tokens a card displayed, each as lexeme and feature values, on `exercise_presented` and
  `answer_submitted` from the new event schema on, and a line-read event for stories. Say whether a branch's
  evidence from before the change counts.
- Say where unseen pairs come from. The compiler can now realise any regular form: let typed building cards ask
  a known lexeme in a form the course never writes (*cantamos* is not a made-up word), and amend ADR 0132's
  "attested only" for typed cards. Or weaken the test to "not seen in this session or in the last N days".

### 4. ADRs 0145, 0146, 0148: "listed" is whatever our rules don't yet give

**What is wrong.** "Whatever the rules give is a combination; whatever they don't is a morpheme" (ADR 0145, line
55). The compiler enforces it: "a form the rules can't give must be a listed morpheme" (line 206). ADR 0146
then makes every listed form a part to learn and to count. "The rules" means two things, and the ADRs slide
between them: the language's grammar, and the rules someone has written down so far. The notes had the right
one, as a proposal: "derivability is judged against the language's rules" (lexemes.md:137).

- **A missing rule becomes something to learn.** Until hbo's vowel reduction, gutturals and pause, or grc's
  contraction, augment and accent, are stated as rules, nearly every inflected token of those courses is "a
  form the rules can't give". Each would be a listed part: a memory of its own, a line in the word list, one
  more in the denominator. Progress would measure the rule set.
- **The Costs name the opposite risk only**: "over-generation is the risk of every rule" (line 218).
- **The class guard is a count threshold.** "A class must cover at least two lexemes" (ADR 0148, line 28).
  Spanish has two ‑ir verbs with o→ue, *dormir* and *morir*. With one in the lexicon its forms are a list; add
  the other and they are a class with a rule, and the first verb loses parts. The same ADR rejects exactly
  this for projections: "Not a count threshold, which would let added words change what is a rule" (line 40).
- **ADR 0146's example doesn't follow the guard.** *tener* is given five parts: itself, e→ie, *tengo*, *tuv‑*,
  *tendr‑* (line 81). But *tengo* has *vengo*, *pongo*, *salgo*, *valgo*, and *tendr‑* has *vendr‑*, *pondr‑*,
  *saldr‑*. By the guard those are classes with rules, not listed parts. Whether *tener* reads "3 of 5" or "2
  of 3" is an authoring choice the ADRs don't settle.

**Why it matters.** "Learn what can't be derived" is the owner's principle. As written, what can't be derived is
decided by how far the implementation has got.

**How sure.** Sure of the logic and the quotes. How much it distorts each course is a judgement: es mildly, hbo
and grc badly. The Spanish verbs are from memory.

**Fix.** Three statuses, not two:
1. **given by a stated rule**: computed and checked;
2. **derivable, pinned for now**: the language has a rule that we haven't written. Stored and checked like a
   listed form, never a learner's part, and reported by the compiler as rule debt;
3. **listed**: the language has no rule. A part.

Only a statement that the language has no rule (REVIEW, with a source) makes a part. Replace the count guard
the same way: each language states its classes, as each profile states its projections.

### 5. ADR 0148: the miss test has to run on the device

**What is wrong.** An orthographic miss is "a spelling the target's phonemic form also allows", tested "on the
whole form, under the profile's stated rules" (lines 58–59). That test runs when an answer is graded: in the
browser, offline, in pure TypeScript (`grade`, packages/core/src/match/grade.ts), under a 5 ms budget (`pnpm
test:perf`). The ADR also says "a projection may be code" (line 50) and names the modules it means: tiberian,
attic, toki_pona, greek_translit. Those are Python, in the pipeline.

- **Python can't run there, and code can't run backwards.** The test is the projection reversed: which spellings
  does this sound allow? The notes say it: "Reversal is what the miss labels need" (lexeme-model.md:1039–1040).
  The ADR makes reversible data "a standing goal" (line 53), not a requirement.
- **So where a projection is code, no label can be computed**: hbo, grc and tok today.
- **The conformance rule gives no way round.** Both harnesses drive one implementation through core-cli
  (CLAUDE.md: never re-implement matching in Python). A projection the grader uses has to be in @nabu/core,
  or its results have to be in the bundle.

**How sure.** Sure of where grading runs and what the modules are. The fix is a design choice.

**Fix.** Pick one and say it:
- **Data, read by core.** The orthography-to-sound projections that grading reads are data. The standing goal
  becomes the rule for them. What a voice needs (a reading to its phonemes) is another function and can stay
  Python.
- **Or precomputed.** The compiler ships, for each accepted answer, the lattice of same-sound spellings, as it
  ships overregularised forms (ADR 0145, line 139). The grader stays literal; bundles grow, and by how much
  should be measured.

Either way, add the performance budget to the definition of done.

### 6. ADR 0147: the lint contradicts hbo's accept sets, and "inherent" is the wrong test

**What is wrong.**

- **hbo.** "An accept set for writing the target whose alternatives differ in an inherent feature, with no tag
  to pick one, is a lint" (lines 54–55). ADR 0085 added to hbo's sentences the plain form beside the narrative
  one, because English can't tell them apart: for וַתֹּאמֶר הָאִשָּׁה the set also takes האשה אמרה and והאשה אמרה
  (courses/hbo/units/u04-what-have-you-done.yaml:515–521). A wayyiqtol and a qatal differ in conjugation,
  which the notes name as an inherent contrast of its language (lexeme-model.md:800–801). The lint fires on
  every such set. No tag that "names the situation, not the grammar" (line 42) tells the two apart: the choice
  follows the clause's order, which ADR 0085 leaves to the learner. ADR 0147 lists ADR 0085 as amended, not
  ADR 0084, and its Consequences speak of es and of persons only.
- **Agreement with an open controller.** "The features tagged are the inherent ones. Contextual ones (agreement
  […]) are fixed by the sentence" (lines 36–37). The first case on its list, a speaker's gender, is agreement:
  in *ana ta3ban* / *ana ta3bane* the adjective agrees with *ana*, which shows no gender. The feature is
  contextual, and the sentence doesn't fix it. A lint that looks for inherent differences passes that set.
- **Scopes are not features.** The list of "inherent" features includes register and dialect (lines 38–39), and
  ADR 0146 calls "krama against ngoko" an inherent feature (line 37). ADR 0145 says a scope is never a
  dimension (line 119). *tú* and *usted* are two lexemes of one concept and differ in no feature, so the lint
  as worded doesn't see them.

**How sure.** Sure of the hbo lines and the quotes. That no situation tag separates wayyiqtol from X-qatal is my
judgement, not a reference check.

**Fix.**
- Word the lint by what the prompt leaves open, not by a kind of feature: two alternatives that differ in a
  feature value or a scope that neither the prompt, a tag, nor the answer's own syntax decides.
- Say that a form the answer's order forces is no choice (hbo's wayyiqtol and X-qatal stay, untagged), and
  list ADR 0084.
- Use one phrase in ADRs 0145–0147 for what is tagged: "what the target demands and the prompt leaves open"
  covers features, agreement with an open controller, and scopes.

### 7. ADRs 0145 and 0146: "a migration in the fold"

**What is wrong.** "KC ids are renamed once […] with a migration in the fold for logged events" (ADR 0145, line
199); "logged events migrate with the KC rename, in the fold" (ADR 0146, lines 133–134). The fold can't do it
alone, and the rename reaches further than the fold:

- **The fold has no course.** `replay(events)` (state.ts:454) sees events only. A table from old ids to new
  parts is per course and has to come from somewhere, on the device and on the server alike (CLAUDE.md: never
  derive state on the server differently).
- **One old id is several parts, and the event doesn't say which.** A credit for `sense:tener` and
  `form:pret-3s` doesn't say the word was *tuvo*. The listed stem's evidence is gone unless today's bundle is
  read for that sentence, and sentences change. apc's `sense:raye7` becomes a verb and a branch of a rule: is
  the verb then met?
- **Ids are stored in more than `met`, `shown` and `missed`.** Card keys, `mistakes`, the performance model's
  per-KC difficulties (packages/core/src/learner/performance.ts), placement's `seeded` list, corrections whose
  `item` is a KC id (ADR 0057), and a session's plan, kept on the device until it ends and never re-planned
  (ADR 0108).
- **Events are `schema: 1`**, and the API validates uploads against the schema. Per-part credit is a new event
  shape. Old apps will upload old events to a new server; self-hosted servers will meet new ones.
- **Word clips are keyed by KC id, and so is their voice.** 2,193 of the 7,696 clips in courses/*/audio have a
  KC id as their `item`. `pick_voice` draws an item's voice from a seed of that id
  (pipeline/src/nabu/audio/course.py:325–338, 385). Rename the id and, in the three two-voice casts (apc, es,
  yue: 1,335 word clips), about half the clips nobody has checked are given the other voice: stale, to be made
  again, some on a GPU.
- **The simulation can't stand in for real logs.** It "says by how much" known counts change (ADR 0146, line
  140). It says nothing of what an existing learner's list does on the day.

**How sure.** Sure of each fact (read or counted). The voice redraw is from reading `pick_voice`, not from a run.

**Fix.** A migration section in ADR 0145, or an ADR of its own, that decides: the alias table and where it ships;
`replay(events, aliases)`; what an old credit maps to, and whether listed forms start unshown; event schema 2
and the order of server and app releases; a session under way across the change; the audio index rewritten
with its ids, each clip keeping its voice through an alias seed or a pinned assignment; and a test on real
exported logs.

### 8. ADR 0148: most of today's matching policies, and the judge, have no place in the scheme

**What is wrong.** The ADR says what becomes of four verdicts and one policy field: "matching policy
(`match.marks`) stays" (line 47). The grader has ten verdicts and seven kinds of policy.

| Today (run, or read from the profile) | Where | Under ADR 0148 |
|---|---|---|
| 裡面 for 裏面: `CORRECT_VARIANT`, a note | yue, lzh `variants` | not said; by "any other label is not accepted", wrong |
| 唔洗 for 唔使: `PARTIAL`, a note, not correct | yue `homophones: partial-credit` | orthographic, by its own example; `PARTIAL` itself not said |
| a ZWNJ left out or typed as a space: right, a note | fa `zwnj` | not said |
| an ASCII apostrophe for ʻ: right, a note | uz-Latn `apostrophe` | not said |
| ة for ه, ى for ي, a hamza's seat: right, silently | apc-Arab, chg-Arab `equivalences` | not said |
| ch for sh, 5 for kh, a doubled vowel: right, silently | apc-Latn `equivalences` | not said |
| s for š: `CORRECT_MARKS`, a note | chg-Latn `marks` (ADR 0134) | the mark carries sound, so wrong by line 63 |
| *chōra* for *chōrā*: `CORRECT_MARKS`, a note | grc-Latn `marks` (ADR 0133) | carries sound, so wrong |
| *kefak* for *kifak*, *shokran* for *shukran*: a typo | apc-Latn, by the typo budget | e and i are not neighbours: wrong |
| *oqiyman* for *oʻqiyman*: a typo | uz-Latn | o and oʻ are two vowels: wrong |

- **The notes had the missing clause.** The orthographic test is "checked after normalization and accepted
  variants (Arabizi's)" (lexeme-model.md:1061). The ADR dropped it. With it the silent equivalences stand; the
  noted ones still have no outcome.
- **An orthography without a norm is hit hardest.** Arabizi has no standard spelling, and today a one-letter
  variation passes. Under "the right sound with the wrong letter is never accepted", each is wrong unless an
  accept set lists it. The same goes for chg's scribal letters and hbo's full and defective spellings.
- **The judge.** An answer goes to the LLM judge when its verdict is `WRONG` and never when it is `WRONG_WORD`
  (`judgeable`, packages/core/src/ai/judge.ts:23–24). The ADR never mentions the judge. A synonym the accept
  set lacks is "another lexeme": if lexical means no judge, the judge loses the cases it exists for; if the
  judge still sees it, the learner is first told "another word" and then told it was right. Reports ("my
  answer should be accepted") have the same question.

**How sure.** Sure of today's column. The last column is the ADR's own wording applied; the owner may well
intend otherwise.

**Fix.** Put the clause back. Add a row per policy: which are applied before the miss test and keep their note
(`CORRECT_VARIANT`, the ZWNJ, the apostrophe, the equivalences), which become labels (the homophone table),
and which accepted ADRs change (0134 for chg's consonant marks, 0133 for grc's macrons). Say what an
orthography with no standard accepts. Define which label sets still go to the judge, and that their lexical
label is held until it answers.

## B. Decide before building

An implementer would have to guess, or an accepted decision changes without being said.

### 9. The handoff's "148 reviewed items" are clips

**What is wrong.** Task C says: "Sign-offs hash only the compiled text and the translations (`signoffText`): 148
reviewed items today (apc 82, fa 37, uz 29). A migration that changes none of that text keeps every sign-off
valid." The description of `signoffText` is right (packages/core/src/corrections/signoff.ts:31–43: each
orthography's compiled text and each translation, nothing else). The 148 are something else:

- **They are audio clips.** `status: reviewed` occurs 82, 37 and 29 times in
  courses/{apc,fa,uz}/audio/index.yaml: a listener's verdicts in the audio check (ADR 0060). It occurs nowhere
  under courses/*/units.
- **No sentence, story or unit in any course has a sign-off** (ADR 0072). Every one is `status: draft`. A
  release build (ADR 0073) of any course would hold no sentences today.

**Why it matters.** The check the handoff asks for protects nothing. What a reviewed clip does depend on is its
item id, its voice, and the exact text or reading the voice was given:
- 34 of fa's 37 are word clips whose item is a KC id (finding 7's rename);
- apc's 82 are read from the vowel-marked text, which Task B's projection will regenerate. One mark different
  and a clip is stale, and its check is lost.

**How sure.** Sure (counted in the index files and the unit files).

**Fix.** Correct the handoff: verify that every reviewed clip keeps its item (through an alias), its voice and
its input, byte for byte. Keep the `signoffText` check for the day sentences are signed off.

### 10. Accepted ADRs that change without being listed as amended

The seven list sixteen ADRs as amended. These also change:

| Accepted ADR | What it decided | What changes it | Listed? |
|---|---|---|---|
| 0117, 0135 | readings are pinned per token and per KC form, "nothing is guessed"; grc "keeps its Greek text and Attic readings both" | 0145: one lexical form, everything projected | no |
| 0053 | vowel marks come from `vocalization.yaml` at compile time | 0145: the lexical form is fully specified | no |
| 0071, 0127, 0138 | every lzh token pins Pinyin, Jyutping and Baxter, checked against Baxter & Sagart row by row | 0145: derived from Qieyun positions, with overrides | no |
| 0082–0084, 0086, 0087, 0126, 0129 | hbo, tok, grc, yue and chg tokens pin their readings | 0145, 0148: projections | no |
| 0084 | hbo's other orders and forms in accept sets | 0147's lint (finding 6) | no |
| 0076, 0087 | a missing accent is a note (es); missing Greek marks are a note, since "learners may have no polytonic keyboard" (grc) | 0148 names "the marks policies of the es and grc profiles", not the ADRs, and doesn't answer grc's reason | in part |
| 0134, 0133 | chg-Latn's consonant marks and grc-Latn's macrons are noted, not failed | 0148: a mark that carries sound is never excused | no |
| 0141 | "Unwritten" ruby reads a scheme's `variants` (`openLetters`, packages/core/src/match/pronounce.ts:308–321) | 0148 removes `variants` | no |
| 0045 | the judge sees what the cascade grades `WRONG` | 0148's label sets (finding 8) | no |
| 0083 | a colour that carries text has an AA pairing in both themes | 0150: slots at 6%, "below AA on purpose" | no |
| 0088, 0111, 0077 | "placement does not touch" the script row; seeding gives recognize cards | 0149's test-out, "folded like any placement (ADR 0039)" | 0088 only |
| 0132 | KCs carry UD `pos` and `features`; options share a form signature; "no KC carries a gender: a lemma such as *tío* covers *tía*"; never an unattested form in a choice | 0145: own categories; gender a lexical feature; *niña* a derivative | named, for "which form" and "which word" only |
| 0100 | "speaking is no skill a word is known by"; `facetsOff` | 0146, line 32: "reading aloud" is a part | named; this isn't said |
| 0144 (Proposed) | `drill: false` by default for `pos: PROPN` | 0145's own categories | "compatible" |

**How sure.** Sure of each row's two sides (both texts read).

**Fix.** List them. For ADR 0087, answer its reason: after ADR 0148 a grc learner with no polytonic keyboard can
get no typed answer right. That may be what the owner wants (script first); it should be said.

### 11. ADRs 0145 and 0149: KC kinds without a destination, and letters

**What is wrong.**
- **Seven kinds, not four.** ADR 0145 says a KC has "four prefixes" (line 13). The schema's `KcId`, and the
  gameplan's §7.1 and glossary which the ADR amends, have seven: sense, form, construction, grapheme, reading,
  phone, tone (schemas/common.schema.json; docs/gameplan.md:417–422, 1343). The courses use four.
- **Two of the four in use go nowhere.** "`sense:` becomes a lexeme or a morpheme; `form:` splits" (lines
  200–201). Nothing is said of the 24 `construction:` KCs (seven courses) or the 75 `grapheme:` KCs (five),
  nor of reading, phone and tone, which ADR 0139 still plans to credit (`reading:vowel`, `reading:tone`).
- **Letters.** ADR 0148 makes a letter's correspondence a rule (line 36), and a rule's branches are learned (ADR
  0146, lines 35–36). The notes count an orthographic miss "against the projection rule where a rule decides
  that spot" (lexeme-model.md:1080). ADR 0149 says "the fold needs no letter edges on words: a learner past
  the gate has the letters" (line 43), and still seeds "the grapheme KCs" (line 27). ADR 0088 left script
  cards out of review ("not yet"), and nothing here brings them in.

**Why it matters.** After the gate nothing practises a letter again, and nothing says whether a misread letter
counts against anything.

**How sure.** Sure of the counts (counted in courses/) and the quotes.

**Fix.** A row per kind in ADR 0145's Consequences. A construction is a listed combination with slots, or a
rule: the notes say both (lexeme-model.md:854–856). A grapheme is a projection rule's branch with a memory and
a place in review, or it is not tracked after the gate. Pick one, and make ADRs 0148 and 0149 agree.

### 12. ADR 0146: what is a part, a skill, a key, a denominator

**What is wrong.** "Memory is kept per part and skill" (line 71), and a lexeme's parts are four kinds (lines
24–32). The list doesn't make a key space:

- **Part 4 mixes two things.** "Each edge the course asks that no projection gives: a reading leftover, a
  spelling leftover, listening, reading aloud." Listening is a skill of the lexeme itself; no projection is
  involved. A reading leftover and reading aloud are one edge named twice (the notes' table has it as
  read-script, lexemes.md:782–790).
- **Reading aloud.** If it is a part, a lexeme is learned only once it is shown. Without a speech server
  speaking is self-rated in every course, and a self-rating shows nothing (ADR 0100). The notes had the
  condition the ADR lacks: "every edge that can be asked, for this course and this learner" (lexemes.md:793–795).
- **‑ka after k is two things.** An allomorph, "stored with its context or given by a rule" (ADR 0145, Terms),
  and a rule's branch (ADR 0146, line 35). Its memory lives on one of them.
- **A pair has state and no place.** A lexical miss "counts against telling *casa* from *caza*" (line 69). A
  confusable pair is not a lexeme's part, a rule's branch or a feature's use.
- **The denominator.** "Every part the course will ever teach" (line 22); "within the dimensions the course
  teaches" (line 75). es teaches the *tú* imperative and never writes *ten*. Is *ten* one of *tener*'s parts? If
  parts come from the language's lexicon, some can never be shown. If they come from the content, a new
  sentence changes every learner's count.
- **A default, or a part?** "What the profile can predict is a default, not a part" (line 33). *casa* is
  feminine by its ‑a about as surely as an ‑ir verb with stem e alternates, yet *casa* shows "itself,
  feminine: 2 of 2" (line 82). The owner decided `casa|gender` counts in round 1 (lexemes.md:956); the default
  rule came in round 4 for verbs (lexeme-model.md:819–821). The two were never put side by side. *la mano*, *el
  día* and *la noche* are the parts a gender default would leave.
- **Evidence for a lexical feature needs a link that tokens lack.** ✗*el casa* counts against *casa*'s gender
  only if the grader knows *el* agrees with *casa*. Nothing says a token names its controller.
- **The other model.** Gameplan decision 6, which the ADR amends, is two models. The performance model keys
  difficulty by KC too (performance.ts). The ADR speaks of memory only.
- **The simulated learner.** Everything is "re-tuned only against the simulation" (line 132), and its learner
  has a memory per KC. What a simulated learner's knowledge of a rule is, and how far it carries to a lexeme
  never seen, nobody has decided.
- **The order of units.** "Scheduling favours finishing a lexeme once it is started" (line 22). In es, *tuv‑*
  first appears seven units after *tengo* (u09, u02) and *tendr‑* eighteen (u20). ADR 0050 fixes what a lesson
  may use.

**How sure.** Sure of the quotes and the course facts. Spanish gender by ending is from memory: ‑a feminine and
‑o masculine hold for well over nine nouns in ten.

**Fix.** A table in ADR 0146: each kind of part, the skills asked of it, its key, and what shows it. State the
condition "that this course can ask and this learner has not turned off". Put the gender-default question to
the owner. Add a controller to agreeing tokens (finding 13).

### 13. ADR 0145: a language's own categories, UD's tags, and a tree for every sentence

**What is wrong.**
- "A lexeme has a part of speech, in its language's own categories (Arabic's ism, fiʿl, ḥarf)" (line 69). ADR
  0132, accepted the day before, put a UD tag and UD features on every sense KC, about 3,000 of them, and
  rests a guarantee on them: a word question's options have the answer's part of speech, so grammar alone
  never picks the answer. With three categories for Arabic, a pronoun, an adjective and a noun are all ism.
  The guarantee needs finer classes.
- "A combination stores structure (what applies to what: a UD tree for a sentence)" (line 167). The
  Consequences never mention a tree. Who writes one for each of 5,269 sentences, and when (at migration, or
  with the first sentence-level rule), is not said. Finding 12's agreement links are the part of a tree
  needed at once.

**How sure.** Sure of the quotes and the count. The notes show the owner meant own categories as a principle
(lexemes.md:978–980) and trees as drafted by a parser and corrected (lexeme-model.md:1130–1132).

**Fix.** Say that a language declares its categories and their subclasses finely enough for ADR 0132's rule
(Arabic grammar has them: ṣifa, ḍamīr, ẓarf), with UD's tags kept as a mapping. Say that trees come with the
first order rule, and agreement and government links at migration.

### 14. ADR 0145: the base-case rule, and "scopes are never dimensions"

**What is wrong.**
- **The rule decides less than it claims.** "The base-case rule decides them: a feature with an overt, regular
  base-case morpheme is a dimension" (lines 82–83). Spanish ‑ito, the Uzbek causative ‑tir and Spanish
  feminine ‑a each have one. The ADR calls the first two functions and the third derivation, each on other
  grounds: nothing forces a diminutive; the causative's meaning drifts; a native speaker's judgement. What
  decides is the definition in the Terms table, "a set of values every member of a category must choose
  from". The base case is a second condition.
- **Korean.** "Scopes are never dimensions" (line 119); a scope is "a variety or register" (Terms); "Korean and
  Japanese honorifics are dimensions" (line 123). Korean's speech levels are register, and inflection that
  every finite verb must choose. The notes had the distinction ("a dedicated exponent: a paradigm dimension",
  lexeme-model.md:229–230) and then wrote the blanket rule over it (lines 309–310).
- **So one social slip gets two labels.** A plain form said to a grandmother is a scope miss in Javanese and a
  grammatical miss in Korean (ADR 0148's table), with different feedback.

**How sure.** Sure of the quotes. The Korean facts are textbook ones, from memory.

**Fix.** Reword: a social distinction is a dimension where it has a base-case morpheme, a scope where it has
none; dimensions are declared, and the base case checks the declaration. Let a dimension be marked social, so
its misses get the scope feedback.

### 15. ADR 0147: dialect scopes, and what a tag is

**What is wrong.**
- **Two varieties are not enough.** The examples are pairs (*carro* / *coche*, *guagua* / *autobús*). The course's
  sets are wider: *una máquina* / *un carro* / *un auto* / *un coche*, with a note that older Cubans say
  *máquina* and that *carro* is common too (courses/es/units/u13-los-cuentos-de-abuela.yaml:16, 196); *la
  guagua* / *el autobús* / *el bus* (u06-el-barrio.yaml:137). Some are two Cuban words (so not "one right
  answer": ADR 0085 still applies), some are general Spanish, one is Spain's. A scope has to be able to say
  "everywhere" and "everywhere but here".
- **The feedback is false for a general word.** "That's the word in Spain; in Cuba, *carro*" (line 52) is right
  of *coche*. *autobús* is not Spain's word; it is the general one.
- **A dialect tag depends on who has filled the lexicon.** The compiler tags a prompt where the lexicon holds a
  synonym in another variety (lines 48–50). A word nobody entered leaves the prompt untagged and its synonym
  plainly wrong.
- **What a tag is.** Person tags are structured values shown through the UI catalog, in the UI's language (ADR
  0056: `player.persons.*`, translated in every catalog). "To your grandmother" and "it (the school)" are
  authored text. In which language, as what type (TaggedText in the support language, with its direction),
  and translated how for a second support language, the ADR doesn't say.
- **A tag is outside review.** `signoffText` hashes the text and the translations (finding 9). A tag decides
  which answers are right, and a signed-off sentence would ship with a tag no reviewer saw.

**How sure.** Sure of the course lines and of what is hashed. That *autobús* is general Spanish is from memory.

**Fix.** Scopes as sets, "every variety" by default. A tag rules out only a lexeme whose scope excludes the
course's variety, and the feedback names the variety the word does belong to, or says only "not the Cuban
word". Tags as structured values rendered from the catalog where the set is closed (persons, number,
register), as TaggedText with provenance where authored. Put tags under review: hashed, or with a provenance
of their own that release builds check.

### 16. ADRs 0145 and 0148: an overregularised answer, and "another lexeme"

**What is wrong.**
- The compiler ships ✗*runned* and ✗*tenió* "beside the answer for grading (ADR 0148)" (ADR 0145, line 139).
  ADR 0148 has no label for them. ✗*tenió* is the right lexeme in the right form: not grammatical ("another
  form"), not lexical. The notes had the feedback, "right tense, irregular verb", and the credit: the form
  right, the listed part missed (lexemes.md:300–302). They also told ✗*penso* (the class not learned) from
  ✗*piensamos* (the rule's stress condition missed) (lexeme-model.md:1018–1019).
- "Lexical: another lexeme." Today the test is whether the typed string is a word the course writes anywhere.
  That calls a scribe's spelling of the same word another word: بادشاه for پادشاه is `WRONG_WORD` today (run),
  because another sentence's accept set contains it. With a lexicon the grader can tell a spelling of this
  lexeme from another lexeme. The ADR should say it must.
- **Which lexicon.** The course's words, or the language's ("one lexicon per language")? A slip is accepted
  unless it lands on another lexeme, so the size of the lexicon decides how many slips pass.

**How sure.** Sure (the chg case was run).

**Fix.** A label, say **regularised**: the right lexeme and form, the listed part missed; the feature is shown.
Define "another lexeme" by lexeme, after variants. Say the grader's lexicon is the course's scope of the
language's.

### 17. ADR 0149: script first

**What is wrong.**
- **"Alphabetic".** The gate is for "an alphabetic orthography" (line 19); the list that follows has fa, hbo, apc
  and chg, which are abjads. The line that matters is between signs that stand for sounds and signs that
  stand for morphemes. A syllabary gates by that line; a mixed orthography (kana with kanji) gates in part.
- **Reading schemes.** A yue learner in characters types Jyutping (transcribe cards) and never passes Jyutping's
  track, since "its characters don't" gate (lines 22–24). The same holds for lzh's typed traditions, and for
  tok's Latin typed for sitelen pona.
- **A Latin track has nothing to ask.** The four script templates ask a letter's or a word's reading in Latin
  (ADR 0133). For es, tok, Arabizi, Jyutping and uz's Latin the orthography is the Latin. "es's track teaches
  Spanish spelling (c, qu, g and gu, h, ll and y, ñ, the accent rules)" (lines 29–30) needs cards that go from
  sound to spelling: dictation. None exists, and the ADR names none.
- **Learners already in a course.** The gate turns on for everyone at once (line 38). Whether a learner with a
  hundred lessons done is stopped until a test-out is not said. The fold is a projection, so "past the gate"
  must be something the log already shows.
- **The test-out.** "Folded like any placement (ADR 0039), seeding the grapheme KCs it shows" (lines 26–27). ADR
  0088 says "placement does not touch" the row. Seeding is ADR 0111's, and it gives recognize cards, where a
  letter's card is a read-script card of one orthography.
- **After the gate.** Nothing reviews a letter (finding 11).
- **What waits.** "A unit's cards" (line 19). Stories and ADR 0144's passages are not cards. Say that the whole
  path in that orthography waits.
- **The cost is not recorded.** The notes weigh it: "an hour or more of letters before the first sentence
  (Arabic's forms), where many apps interleave; a heritage speaker who wants to start by ear"
  (lexeme-model.md:1120–1121). The ADR's Consequences don't.

**How sure.** Sure of the quotes and of today's tracks: grc and chg have eight alphabet nodes each, apc and uz one
convert node each that doesn't run. The ADR's own account of today is right.

**Fix.** Add to the ADR: the line between sound-writing and logography, and what a mixed script does; whether a
reading scheme gates its typed cards; a dictation template for Latin tracks, or their content named; a learner
with any reviewed card in an orthography is past its gate; the test-out's own fold; script cards in review;
the cost.

### 18. ADR 0150: pattern display

**What is wrong.**
- **The AA rule.** ADR 0083: "a new colour is a token with a value in both themes and, if it carries text, a
  pairing in the token test", and every pairing meets AA. The slot colour carries text at 1.13:1 (light) and
  1.17:1 (dark). ADR 0150 says "below AA on purpose" (line 41) but lists no amendment and doesn't say how the
  token test treats the exception. Nothing in packages/ or apps/ uses `prefers-contrast`, `forced-colors` or
  `font-palette` today, so the two fallbacks the ADR leans on (lines 42–43) are untested here, and the visual
  matrix has no pass for either.
- **Two backgrounds.** "6% of the way from the background to the text colour (light #f1f1f1 on #fff; dark
  #2d2b28 on #211f1c)" (lines 39–40). The arithmetic is right for those pairs. But #fff and #211f1c are the
  surface token; the page token is #f6f5f1 and #161614 (packages/ui/src/tokens.css:11–13, 52–54). On the page
  the same slot colour is 2% from the background in light (1.04:1) and 10% in dark. The notes knew: "an opaque
  grey is tuned to one background" (lexemes.md:583–584). The ADR dropped it.
- **A bare slot is a gap.** The owner decided against a bar and a stronger tatweel, accepting that a shape with
  a bare slot "no longer shows how many radicals it has" (lexemes.md:608–618). The ADR records the decision
  ("no bar under bare slots") and not the cost.
- **One slot letter can't say which radical is which.** A pattern that repeats a radical at a distance (Hebrew
  pilpel and polel; an Arabic quadriliteral from a doubled root, زَلْزَلَ), or moves one (hitpaʿel's metathesis),
  looks like any shape with that many slots. The tradition's dummy root does say (פּוֹלֵל writes ל twice), and
  its letters name the weak classes (פ״נ, ל״ה), names the ADR keeps as labels (lines 48–49) while removing
  the letters they point at. Numbered slots are left for "later" (lines 63–64). hbo is one of the two profiles
  that get a slot letter first.
- **Mandaic** joins and takes the tatweel (Script_Extensions of U+0640: Adlm Arab Mand Mani Ougr Phlp Rohg Sogd
  Syrc). The table gives a tatweel rule for Arabic and Syriac only.

**How sure.** Sure of the colours (computed from tokens.css), the grep, and the Unicode data (Unicode 16's
ScriptExtensions.txt). The Hebrew and Arabic stems are from memory. Every code point in the slot table is the
letter the ADR names (checked with unicodedata).

**Fix.** List ADR 0083 and write the exception into the token test. Give a palette per surface a shape can stand
on, or say shapes stand on the surface token only. Record the bare-slot cost. Say what a repeated radical looks
like before numbered slots exist, even if the answer is "the traditional name carries it".

### 19. ADR 0151: fonts as a build step

**What is wrong.**
- **Four places build the app without Python.** "A turbo task, `fonts`, runs ahead of `dev`, `build` and
  Storybook" (lines 24–25); "CI builds them" (line 40). Today:

  | Where | How it builds | Python and uv there |
  |---|---|---|
  | deploy/web.Dockerfile | `pnpm --filter @nabu/web build`, in node:22.23-slim | no |
  | pages.yml (the public demo) | `pnpm --filter @nabu/ui build-storybook`; `pnpm --filter @nabu/web exec vite build` | not set up |
  | ci.yml, `android` (the preview APK) | `pnpm --filter @nabu/web build` | not set up |
  | ci.yml, `visual` (visual matrix, e2e) | `pnpm test:visual`, inside mcr.microsoft.com/playwright | not set up |
  | `pnpm storybook`, `pnpm test:visual:docker` | package scripts, on the host | the developer's |

  Three of these call a package's script directly, so a turbo dependency never runs.
- **Toki Pona has no fallback.** The Consequences say a machine without Python "gets no derived fonts" and
  "sitelen pona has no font until the task has run once" (lines 42–44). The sitelen pona orthography is
  private-use code points: without the font every word is a box. As the ADR stands, the self-hosted image,
  the demo and the APK would ship that way, and the CSS would still point at the file
  (packages/ui/src/fonts.css:33). "The task says so rather than failing silently" doesn't help where the task
  never runs.
- **`nabu tables` doesn't pin that way.** A source is "a URL pinned by commit and sha256, as `nabu tables` pins
  Unihan and OpenCC" (lines 21–22). tables.py pins a Unicode version and a git tag in the URL and checks no
  hash (pipeline/src/nabu/tables.py:19–22).
- **`pnpm license-check` doesn't see fonts.** The manifest gives each font's "licence for `pnpm license-check`"
  (lines 22–23). The check reads `pnpm licenses list` for the web app, the API and the mobile shell. It passes
  today over 47 packages (0BSD, Apache-2.0, BSD-3-Clause, ISC, MIT): the nine OFL font packages aren't among
  them, and OFL-1.1 isn't in its allowed set (packages/lint/src/licenses.ts:11–26).
- **One rule stayed in the prototype.** "Never colour a ligature that takes in one of the pattern's own letters"
  (docs/prototypes/pattern-slots/README.md; lexemes.md:624) is not in the ADR.
- **The visual baselines gain an input.** `pnpm test:visual:update` builds Storybook on the host and
  screenshots it in the pinned container. A font built on the host by whatever fontTools is there is a new way
  for a baseline to differ. The uv lock answers this only if the task always runs through it.

**How sure.** Sure (each file read; the licence check run). That Vite keeps a missing font's URL without failing
the build is from memory, not run. The ADR's numbers are all right: one committed font binary (279,688
bytes); the pinned source's sha256, its 2,519 code points and 183 in the UCSUR block, 634 KB as WOFF2 (fetched
and counted); no `@fontsource/noto-sans` subset has U+035C, and only its Devanagari one has U+25CC.

**Fix.** Make the fonts a step of the packages' own `build`, `dev` and `build-storybook` scripts, not only a
turbo edge. Add Python and uv to the web image, the Pages job, the android job and the visual job, or have one
job build the fonts and the rest fetch them. Make a missing sitelen pona font a build failure. Give the font
manifest its own licence check, with OFL-1.1 allowed for fonts.

### 20. ADR 0146, "Glosses and literal hints": built glosses

**What is wrong.**
- **Built how.** "A form's [gloss] adds its inflection ('run (past)')"; "ir or ser · preterite · 3rd singular"
  (lines 104, 107). These are user-facing strings made of a gloss and feature names. Feature names in each
  support language, their order, their agreement and their direction are a message's job (CLAUDE.md: no
  user-facing literals). Where the names live (the catalogs, or language data, as ADR 0109 has scheme names)
  is not said.
- **"The support language's own word where it has one ('ran', 'went / was')"** (line 106) is a gloss per form.
  Either someone writes it per form, which the same paragraph rules out, or the support language is realised
  from a lexicon and rules of its own. English has neither in this repo.

**How sure.** Sure of the quotes.

**Fix.** Built glosses are MF2 messages over a lexeme's gloss and feature-name messages. "Ran" is an authored
override on a listed form, with provenance, until a support language has its own lexicon.

### 21. ADR 0145: one lexicon per language

**What is wrong.** "One lexicon per language, which every course of the language draws on" (line 143). The notes
list where it bites (lexeme-model.md:548–557): who owns an entry two courses analyse differently; provenance
and licence per entry; review per entry. None reached the ADR. Three more:
- **Review.** A sign-off covers a sentence or a story. A lexeme's gloss, features and lexical form decide what
  every sentence shows and accepts. "Reviewed (REVIEW) like profile policies" (line 217) is a comment in a
  file, not the workflow of ADRs 0072–0074.
- **Accept sets** "are generated" (line 207). Today they are authored, and learners' reports are promoted into
  them (`nabu reports promote`), as corrections are applied to KCs. Which alternatives the compiler makes
  (forms a tag leaves open, free variants, later orders) and which stay written (synonyms, optional words),
  and where a promoted answer is then written, is not said.
- **Other varieties' words.** Dialect tags (ADR 0147) need Spain's words in the Cuban course's lexicon.

**How sure.** Sure of the quotes.

**Fix.** A paragraph each in ADR 0145: where the lexicon lives and its licence; an entry's provenance and
sign-off; generated alternatives carry `generated` provenance and are reviewed (the notes say so for orders,
lexeme-model.md:1136–1137); authored alternatives stay.

### 22. ADR 0146: wug cards

**What is wrong.** The owner decided wug cards "as proposed, but last and light" (round 3). What was proposed
included guardrails (lexemes.md:899–902): always labelled as made up; never in the word list, stories or gloss
panels. The ADR kept the timing and the provenance and dropped the guardrails. A made-up word a learner takes
for a real one is the harm they prevent.
- The check "against the course and a large word list" (line 97) is a new, licensed data source per language.
  chg, hbo and apc may have none.
- The ADR's own example would fail it: φλόμος is a real word (C3).

**How sure.** Sure of both texts.

**Fix.** Restore the guardrails. Name the word list per language, or say a course without one gets no wug cards.

### 23. What it costs

**What is wrong.** The Costs count reviews: a lexicon, dimensions and lexical forms per course (ADR 0145, lines
217–218); a statement of losses per profile (ADR 0148, line 118). They don't count what the derivability check
requires before any course "moves to it whole": for each of ten languages, rules that reproduce every
inflected token the course writes; for each of 22 profiles and 8 schemes, a relation between spelling and sound
that runs both ways on the device.

- For es and uz this is tractable. For hbo and grc it is the hard part of those languages' computational
  morphology. For apc the verbs are not yet analysed at all: `sense:ra7` still lists ten conjugated words as
  its forms, and `sense:tele3`'s first form is *titla3* (courses/apc/units/u06-day.yaml:14, u10-plans.yaml:12).
- "Never half-switched" then means nothing ships until all ten are done.

**How sure.** A judgement.

**Fix.** Finding 4's middle status (derivable, pinned for now) is what lets a course move whole before its rules
are complete. Without it, say in the ADR how long the branch is expected to live.

## C. Corrections

Examples, citations and wording. Several came into the ADRs from the notes.

| # | Where | It says | What is the case | How sure |
|---|---|---|---|---|
| C1 | 0148, line 19 | "*esta* for *está* is 'accepted with a note'" | Today it is `WRONG_WORD` with the note `accent-word`: *esta* is a word of the course (u02, u14). ADR 0076 gives this very pair as its example of wrong. *cafe* for *café* is the true example | sure (run) |
| C2 | 0145, lines 189–190 | "生 *saang1* in 生日, *sang1* in 學生" | 學生 is *hok6 saang1*: the course pins it so seven times. Its *sang1* word is 醫生 *ji1 sang1*. 生日 is not in the course. Use 學生 and 醫生. The notes have the same slip (lexeme-model.md:184, 327) | sure (course data) |
| C3 | 0146, line 98 | φλόμος, ‑ου, ἡ as a made-up noun | A real word, "mullein", and masculine (Wiktionary's entry, which cites LSJ, Bailly and Beekes; LSJ itself not opened). The notes mean it as a wug (lexemes.md:893–894) | sure it is real |
| C4 | 0145, line 115 | לָמַד → לִמֵּד | The Bible's form is לִמַּד (Eccl 12:9, before a maqaf; read in a Masoretic text online, not the WLC). The course's own rule is never to guess a pointing | fairly sure |
| C5 | 0145, line 84 | "Arabic plural, since ‑ون exists: كُتُب" | ‑ون is for male persons. The regular plural a noun like كتاب could take is ‑ات. The argument holds with either | sure (from memory) |
| C6 | 0146, line 112 | 安 as "a woman under a roof" is out | That is the Shuowen's own analysis, and one many palaeographers keep. By the ADR's rule (a scholarly source of its own) it would be in. 東 as "the sun behind a tree" is the cleaner example of a story the script's history refutes | fairly sure (from memory) |
| C7 | 0145, line 86 | "native apc judgement: خال / خالة one word" | Reads as evidence for inflection. The notes say "one word, one derived from the other" (lexemes.md:971–974). Add the clause | sure |
| C8 | 0145, lines 16–17 | "inflected words crept into KC forms until ADR 0061 forbade it" | apc's verbs still list them: `sense:ra7` has ten conjugated forms. ADR 0061 says apc verbs "are not analysed yet" | sure |
| C9 | 0145, line 13 | "four prefixes" | Seven kinds in the schema and the gameplan; four in use (finding 11) | sure |
| C10 | 0146, line 130 | `met`, `shown` and `missed` are keyed "per KC and facet" | `met` is per KC; `shown` and `missed` are per skill card (state.ts:85–95) | sure |
| C11 | 0146, line 14 | "*hablamos* is evidence for the ‑ar endings, not for *hablar*" | The Decision says the opposite, rightly: "*hablas* for *hablo*: HABLAR shown" (line 70) | sure |
| C12 | 0146, line 119 | "Pattern templates are checked against the lexical form first, readings after" | Can't be read without the question it answered (lexemes.md:939–940, 959). Say what is checked, and by what | sure |
| C13 | 0149, lines 7, 27 | builds on "ADR 0146 (a word's letters are not its parts)"; seeding "(ADR 0039)" | ADR 0146 doesn't say that. Seeding is ADR 0111 | sure |
| C14 | 0150, line 19 | "Hebrew III‑he ◌ָ◌ָה" | Drawn with U+25CC twice. The table's Hebrew slot is samekh, and the prototype draws סָסָה. The example predates the change (lexemes.md:534, 548, 605) | sure (code points) |
| C15 | 0150, line 5 | "a pattern is a function head" | ADR 0145 makes apc's participle pattern a value head (lines 96–98) | sure |
| C16 | 0148, line 51 | "the pipeline's audio modules (tiberian, attic, toki_pona, greek_translit)" | greek_translit is nabu/greek_translit.py, not an audio module | sure |
| C17 | 0147, line 27 | "decided … in round 1" | The notes record these as Decided in §12 (lexemes.md:816–830), not among round 1's answers (955–993) | sure |
| C18 | 0145, lines 143, 183 | "a course picks its scope"; fa "teaches both registers" | A course picks a range. The notes: "an utterance has one of each, a course a range" (lexeme-model.md:263–265) | sure |
| C19 | 0146, line 81 | *tener*'s five parts | See finding 4 (classes, by the guard) and finding 12 (*ten*) | sure of the texts |

## D. The notes and the ADRs

The handoff says every decision is in an ADR, and ADR 0145 says "every decision below is the owner's, and the
notes record each one where it was made" (lines 23–24). Both are nearly true.

**Decided in the notes, in no ADR:**
- **The two axes of a morpheme**: class (open, closed) and attachment (independent, dependent, clitic)
  (lexemes.md:241–242). ADR 0146 relies on "closed classes" and "bound morphemes" and never defines them.
- **yue 嘅's sentence-final particles** (assertive *ge3*; *ge2*) are morphemes of their own (lexemes.md:195–197).
  ADR 0145 says only "嘅 is one linker", which can be read as one morpheme.
- **The miss table's fourth column**, what each label counts against (lexeme-model.md:1078–1086); "checked after
  normalization and accepted variants" (1061); "the worse decides the outcome" (1069); `CORRECT_MARKS` retired
  for es and grc (1070–1072). Findings 1, 8 and 11 would each be smaller with these in ADR 0148.
- **Scopes have two axes**, variety and register; an utterance has one of each and a course a range; each listed
  form carries its own register range (lexeme-model.md:263–267).
- **Wug cards' guardrails**, their two directions, and which courses get them (lexemes.md:886–903; finding 22).
- **The order of introduction**: a lexeme's elsewhere morpheme before its listed forms, a base before its
  derivatives (lexeme-model.md:752–753).
- **Smaller ones**: one morpheme, one sense (lexemes.md:183); the phonetic form is shelved (319); uz Cyrillic
  stays as the proof of concept for two scripts (1007); Merge runs at compile time and generated variants carry
  `generated` provenance (lexeme-model.md:1007–1008, 1136–1137).
- **Not marked as decided, but the ADRs need it**: a listed item whose form is derivable stores parts, not a
  lexical form (lexeme-model.md:1142–1152; finding 2).

**Stated by an ADR; in the notes only as a proposal, or not as the owner's:**
- **ADR 0145's table of cases on the line** (lines 102–115). The owner decided the method (option A, round 4)
  and three rows by name: apc's participle (rounds 2 and 4), Korean's honorific (the base-case rule) and
  Uzbek's causative (round 1). The other rows are what the explainer says the test "would give". One of them,
  Biblical Hebrew's stems, is a ruling on a fixture course.
- **The compiler's derivability check, both ways** (ADR 0145, lines 205–207). In the notes it is "proposed
  clarification" 7 (lexemes.md:162–164) and was never marked decided. Finding 4 turns on it.
- **Five rules of ADR 0147** (lines 36–56): which features are tagged, tags that name the situation, derived
  dialect tags, the scope slip, the lint. Proposed in the notes (lexemes.md:832–860). The ADR marks them as its
  own ("With this ADR"), which is right.
- **"Memory is kept per part and skill"** (ADR 0146, line 71). Proposed, with the choice between facets and KCs
  left open (lexemes.md:808–812).
- **ADR 0149's test-out** as a placement that seeds grapheme KCs, and what a Latin track teaches. The notes have
  only "a test-out is always offered".
- **ADR 0151's manifest, turbo task and test** (lexemes.md:679–697, Proposed), and ADR 0150's colour font itself
  (569, Proposed). The owner decided how a pattern looks and that fonts are built, not committed.
- **lzh's list of overrides** (ADR 0145, lines 192–195): Proposed (lexemes.md:402–414).

**In the notes, against an ADR, and not marked superseded:**
- Register and dialect as features (lexemes.md:58, 188, 211), against ADR 0145's scopes. ADR 0147 follows the
  old wording (finding 6).
- "Every morpheme has a lexeme and a concept, affixes included" (lexeme-model.md:131–133), against a concept
  that links only what differs socially.
- "Hebrew: Decided, U+25CC" (lexemes.md:548), against samekh (605). The example that reached ADR 0150 is from
  the earlier decision (C14).
- *ser* as "5 of 9 forms" (lexemes.md:983; the explainer's mockup 5.1), against round 4's listed parts.
- The explainer still calls the two kinds of head "the one parked question". Round 4 settled it (option A).
- One literal ZWNJ, in a Persian plural (lexeme-model.md:262). The ADRs, the handoff, the explainer and the
  prototypes have no invisible or bidi-control character.

## E. Checked and found right

So that the owner knows what was looked at and held.

- **ADR 0145, Context.** es `form:pret-3s`, uz `form:abl-dan`, hbo `form:ptc-ms`; apc `sense:raye7` listing
  رايحة; yue 嘅 as `pos: PART` with `Poss: 'Yes'` and the gloss "possessive particle".
- **ADR 0146.** ADR 0100's rule as quoted; a new word "presented by a card credited to it" is ADR 0100's;
  FSRS-6 (ts-fsrs 5.4.2); gameplan decisions 6 and 7 as described; a `generated:` author exists in the
  provenance schema.
- **ADR 0147.** Untagged means every form today; es takes pan-Hispanic words beside Cuban ones; person tags sit
  under prompts written into the target.
- **ADR 0148.** ✗*havlar* is a typo today; سد for صد is wrong with the sound-alike note; `soundAlike` is fa's
  alone; three schemes have `variants`; the five card templates exist; 22 profiles and 8 schemes ("about
  twenty").
- **ADR 0149.** ADR 0088 as described; today's tracks as listed; D6 is about a backlog, so "not a pace rule" is
  a fair reading.
- **ADR 0150.** Every code point in the slot table; the 6% arithmetic against the surface token; Chromium
  paints a mark in its letter's colour (tested: a fatha and a dagesh in spans of another colour came out in
  the letter's); the prototype builds from a clean checkout with its pinned inputs and renders as described,
  marks and pattern letters dark, slots faint, in both themes.
- **ADR 0151.** One committed font binary; every number about it and its source.
- **Linguistic examples that look right** (from memory unless a source is named above): Javanese *mangan*,
  *nedha*, *dhahar* and *dipun‑*; Korean 먹다 and 드시다; Russian победить; Uzbek *ishchilarimiz*,
  *kitoblarimdan*, ‑ga / ‑ka / ‑qa, *oʻqi‑* and *oʻqit‑*, ‑ibdi beside ‑di; Arabic مَكْتَب and مَجْلِس by the
  imperfective's vowel, المَغْضُوبِ عَلَيْهِمْ, شُمَيْسَة, كاتِب and كُتّاب, the verbal nouns; Persian *kotob*,
  *mi‑ram*, *hālā* and *aknun*, the two ـی, خواهر, زمین خوردن; Spanish *probar* and *robar*, *el abrelatas*, *el
  problemita*, *ahorita*, *hablara* and *hablase*; Hebrew בָּנָה; Indonesian *kita* and *kami*.

## Evidence

Run on 2026-11-19 and 20 at commit 98a9031. Nothing here was committed but this file.

**The grader, through each course's lexicon** (accepted answer ← typed answer: verdict, notes):
- es: está ← esta: `WRONG_WORD` [accent-word]. hablar ← havlar, hablr, hablaar, hadlar: `CORRECT_WITH_TYPO`.
  café ← cafe, pingüino ← pinguino: `CORRECT_MARKS` [accent]. casa ← caza, cada: `CORRECT_WITH_TYPO`. mesa ←
  nesa: `CORRECT_WITH_TYPO`; ← mepa: `WRONG`. hablo ← habla: `WRONG_WORD` [contrast-ending]; ← hablas: `WRONG`.
  hacer ← aser, qué tal ← ké tal: `WRONG`.
- apc-Latn: kifak ← kefak, keefak; shukran ← shokran, chokran: `CORRECT_WITH_TYPO`.
- apc-Arab: مدرسة ← مدرسه: `CORRECT`. chg-Arab: پادشاه ← بادشاه: `WRONG_WORD`.
- fa: صد ← سد: `WRONG` [sound-alike]. *mi‑ravam* with its ZWNJ left out, or a space for it: `CORRECT`
  [spacing].
- grc: ἄνθρωπος ← ανθρωπος, ὁδός ← ὀδός: `CORRECT_MARKS` [greek-marks]. καὶ ← καί: `CORRECT`. grc-Latn: chōrā
  ← chōra: `CORRECT_MARKS`.
- chg-Latn: šahar ← sahar: `CORRECT_MARKS` [translit-marks]. üzüm ← uzum: `WRONG` [translit-vowels].
- yue: 唔使 ← 唔洗: `PARTIAL` [ime-homophone]. 裏面 ← 裡面: `CORRECT_VARIANT` [hk-tw-variant]. yue-Latn: nei5 ←
  lei5: `CORRECT_WITH_TYPO`.
- uz-Latn: oʻqiyman ← o'qiyman: `CORRECT` [apostrophe]; ← oqiyman: `CORRECT_WITH_TYPO`. uz-Cyrl: цирк ← сирк:
  `WRONG`.

**Counted.** KC ids defined per course, by prefix: sense 3,021, form 262, construction 24, grapheme 75; no
reading, phone or tone. Sentences: 5,269. Clips: 7,696, of which 2,193 are keyed by a KC id; reviewed clips:
apc 82 (sentences), fa 37 (34 words, 3 sentences), uz 29 (27 sentences, 2 story lines). Profiles 22, schemes 8.
`pnpm license-check`: 47 packages.

**Fonts.** The committed subset: 187 code points, 183 in U+F1900–F19FF, 279,688 bytes. The pinned source
(sha256 6646af72…, fetched): 2,519 code points, 3,732 glyphs, 634,172 bytes as WOFF2. The prototype's
`build_slot_fonts.py`, with fontTools 4.68.0 and uharfbuzz 0.57.0 and its three font packages at 5.3.0, wrote
its four fonts and page, which were rendered in Chromium.

**Outside sources.** Wiktionary's Ancient Greek entry for φλόμος; Ecclesiastes 12:9 in a Masoretic text
(Sefaria's API); Unicode 16's ScriptExtensions.txt. No reference from the library was used, and nothing from
one is quoted here.

## The three that matter most

1. **ADR 0148's rule for a miss can't be built as written** (finding 1, with 5 and 8). Its definitions make
   every slip a second kind of miss as well, so nothing is ever a typo; its "slip" is narrower than today's
   typo without saying so; its test has to run on the device and may be Python; and it dropped the clause that
   keeps Arabizi, chg and hbo spellings from all turning wrong. It grades every typed answer in every course.
   Its opening example of today's grading is also false (C1).
2. **ADR 0145's "one lexical form" doesn't cover what the ADR itself needs first** (finding 2). A logography
   needs a pair, a Semitic verb a structure, a multi-word item its parts, and a real text its own spellings.
   Task B's brief inherits the gap: it asks for apc's letters and vowels and not for radicals or patterns, and
   apc's participles, the ADR's first migration, need exactly those.
3. **ADR 0146 would measure our rule set and our content, not the learner** (findings 3 and 4). A form is
   "listed", and so to be learned and counted, wherever a rule hasn't been written yet. And a rule counts as
   learned only on word-and-form pairs the learner has never seen, which the log doesn't record and every
   card, story and passage uses up.

Next after those: the handoff's "148 reviewed items" are audio clips, and no sentence has a sign-off (finding
9), which changes what a migration has to protect.
