# 0085. Accept sets take every answer the prompt leaves open

- Status: Proposed
- Date: 2026-11-08
- Generalizes: [0033](0033-fixture-courses.md) (pro-drop and optional words in the reverse set),
  [0056](0056-persons.md) and [0075](0075-persons-coverage.md) (untagged means every form)

## Context

An accept set lists the answers a translation exercise grades as right: a sentence's `reverse`
set when a learner writes the target language, its `translations` when they write the support
language. Courses had grown them case by case:
- optional pronouns (ADR 0033);
- every person where the prompt does not tag one (ADR 0056);
- spellings;
- here and there, another order.

They had no rule for what else belongs.

Biblical Hebrew showed the gap. Each sentence is shown in one word order, and only that order was
accepted, though Biblical Hebrew has both orders of subject and predicate in many clauses. The
narrative form (wayyiqtol) has a plain counterpart the English cannot tell from it: "the woman
said" is וַתֹּאמֶר הָאִשָּׁה and also הָאִשָּׁה אָמְרָה.

## Decision

**What the prompt does not decide, the learner may choose.** This holds in every course, in both
directions. The criterion (Ben's) is that an answer is right if its own translation would be the
prompt.
- **What this covers.** Word order, word choice, optional words, and forms the prompt cannot tell
  apart are all accepted. So are spelling variants, as before.
- **What it does not cover.** An answer whose translation would be another sentence is not
  accepted, even if it uses the same words:
  - a different meaning;
  - a statement for a wish;
  - "my brother is Cain" for "Cain is my brother".
- **Persons are the same rule.** ADR 0056 and 0075 already apply it to them: untagged means
  every form.

**Where it lives.**
- **The accept sets.** The grader stays literal: it never guesses at reorderings or synonyms.
  Course authors and drafting scripts list the answers, and the compiler checks that each set
  parses and accepts its own text.
- **Reviewers** check accept sets against the rule (courses/REVIEW.md).
- **Learners' reports** are the backstop. "My answer should have been accepted" goes through
  `nabu reports promote`.

**Biblical Hebrew, first under the rule** (ADR 0084 gives the word orders). Its drafting script
now adds:
- **The plain form beside the narrative one.**
  - A wayyiqtol with its subject is also X-qatal: הָאִשָּׁה אָמְרָה, וְהָאִשָּׁה אָמְרָה, and
    אָמְרָה הָאִשָּׁה.
  - A wayyiqtol without one is a qatal, with or without its pronoun: בָּרַח, הוּא בָרַח,
    וְהוּא בָרַח. Never וּבָרַח, which is a weqatal, "and he will flee".
  - A weqatal is a yiqtol the same way: וְאָהַבְתָּ, תֹּאהַב, אַתָּה תֹּאהַב, וְאַתָּה תֹּאהַב.
- **The pronoun of a plain qatal or yiqtol** that has none: אֲנִי אֶשְׁאָב מַיִם.
- **Only forms the Westminster Leningrad Codex attests** for that verb, stem and person, never
  made up. So "the man hid" (Gen 3:8) keeps only וַיִּתְחַבֵּא הָאָדָם: the Codex has no
  hithpael qatal of חבא. Only one-verb clauses; never with object suffixes, nor for וַיְהִי, which
  is also "and it came to pass".
- **The prompt's own words decide the rest.**
  - The subject is the one the English names. In "he paid its fare" the noun after וַיִּתֵּן is
    an object, though it agrees with the verb.
  - Names count as subjects only if they are people's (Strong's), never places (וַיֵּרֶד יָפוֹ).
  - Where every English line has its "and" or "but", only the forms with a vav are added
    (וְאַתָּה תֹּאהַב, the contrastive וְיוֹנָה קָם).
- **86 sentences gain 204 answers.** Every one was read against its English.

## Consequences

- **Grading is unchanged.** Only the accept sets change. Another order or form is CORRECT_ALT,
  and a createGrader test pins both sides for hbo.
- **The other courses were checked against the rule** (November 2026). A model read every
  sentence in both directions and proposed what each set left out.
  - The answers it was sure of are in the sets: yue 184, uz 193, fa 344, es 616, apc 996,
    lzh 734, tok 300 (and 33 more on a second read, sentence by sentence: ADR 0086). Each was graded
    before and after.
  - The 435 it was not sure of (434 now: tok's sina pilin ala pilin pona is accepted), and eight questions of policy, are in
    [courses/accept-doubts.md](../../courses/accept-doubts.md) for reviewers.
  - The check also found answers the sets wrongly accepted (*de el autobús*, أنا with a "you"
    verb, *He did not came*). Those were fixed.
  - Golden judge items the sets now accept were given new answers or removed (apc, uz, yue).
- **New courses** draft their accept sets this way from the start. A drafting script that adds
  alternatives shows its additions, and someone reads each against the prompt.
