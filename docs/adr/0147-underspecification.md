# 0147. What one language says and the other leaves open

- Status: Accepted (2026-11-20)
- Date: 2026-11-19
- Revised: 2026-11-20, after the review and the owner's rounds 5 and 6 (what changed is listed at the end)
- Amends: [ADR 0085](0085-what-the-prompt-leaves-open.md) (accept sets), [ADR 0056](0056-persons.md) and
  [ADR 0075](0075-persons-coverage.md) (person tags), [ADR 0076](0076-cuban-spanish.md) (es: pan-Hispanic
  forms accepted), [ADR 0132](0132-a-choice-asks-one-thing.md) (a story line may ask a third thing, which
  use: a contrast only the passage decides; its rule for which form stands), [ADR 0072](0072-sign-off.md) (a
  sign-off covers a sentence's tags)
- Leaves standing: [ADR 0084](0084-hbo-references.md) (hbo: the other orders and forms its accept sets take)
- Builds on: [ADR 0145](0145-lexical-model.md) (inherent features, scopes, concepts)

## Context

A prompt in one language often leaves open what the answer in another must say: English "you" and apc
*kifak* / *kifik* / *kifkon*; "I ate" and es *comí* / *comía*; "bus" and *guagua* / *autobús*. Today an
untagged prompt accepts every form that fits (ADR 0056, 0075, 0085), and es accepts pan-Hispanic words beside
Cuban ones (ADR 0076). Persons are tagged, by hand, where the target marks them. Nothing covers register,
aspect, an unnamed "it", evidentiality or dialect the same way.

## Decision

**One idea covers all of it: what one language specifies and the other leaves open.** Aim for one right
answer per prompt; some will still have several (word order and the like), as close to one as possible.

| The learner writes | The prompt leaves open what the answer must say | The prompt says what the answer can't |
|---|---|---|
| the target language | **tag the prompt**: one answer | nothing to do (English "he" → lzh 其) |
| their own language | **accept every rendering** (tok *ona*; lzh's tense) | nothing to do (apc *kifik* → "how are you") |

The owner decided these, and the two below (the notes record them as decided in lexemes.md §12):
- **When the answer can't say what the prompt does, nothing is tagged.** The learner is trusted to know that
  lzh doesn't mark gender; the target's gloss already says what collapses (其: his, her, its, their). An
  answer that adds the gender with extra words (男子 "the man") translates back to another sentence, so ADR
  0085 already rejects it.
- **Dialect synonyms are specified.** Where a prompt's meaning has dialect synonyms (*carro* / *coche*,
  *guagua* / *autobús*), the prompt says which variety.

With this ADR:
- **What is tagged is what the answer must say and the prompt leaves open.** That is an inherent feature
  (aspect, evidentiality), agreement whose controller shows nothing (a speaker's gender: in *ana ta3ban* /
  *ana ta3bane* the adjective agrees with *ana*, which shows none), or a scope (register, variety). Agreement
  the sentence itself fixes (a classifier, a governed case, an adjective beside its noun) needs no tag. In
  our courses and planned ones: the speaker's and addressee's gender and number (apc, hbo, es); register (uz
  *sen* / *siz*, fa تو / شما, es *tú* / *usted*, Javanese); dialect where the meaning has dialect synonyms
  (es); the gender of an unnamed "it" or "this" (apc); aspect where English has one past (es *comí* /
  *comía*); evidentiality (uz ‑ibdi beside ‑di, once taught); later, clusivity (Indonesian *kita* / *kami*)
  and Korean and Japanese honorifics.
- **Tags name the situation, not the grammar:** "a woman speaking", "to your grandmother", "it (the school)",
  "(every day)", "in Cuba". They read naturally, carry meaning rather than metalanguage, and never show the
  answer's form. A tag is shown only where the answer's language marks it, as persons are now.
- **A tag is data of one of two kinds.** A value from a closed set (persons, number, register, variety) is
  rendered from the UI catalog, in the UI's language, as person tags are (ADR 0056). An authored situation
  ("it (the school)", "(every day)", "to your grandmother") is TaggedText in the support language, with
  provenance, translated as the sentence's translations are.
- **A tag is reviewed with its sentence.** It decides which answers are right, so a sign-off covers it:
  `signoffText` and its Python twin hash it. No sentence is signed off today, so no sign-off is lost.
- **The accept set keeps only the forms the tags allow** when the learner writes the target; ADR 0085 still
  governs what no tag decides (word order, optional words, spelling variants) and everything written in the
  learner's own language.
- **Dialect tags are derived, not authored.** A course states its variety once (es: Cuban). A lexeme's scope
  is a range of varieties (ADR 0145), and the compiler tags a prompt whose meaning has a word outside the
  course's variety.
- **Under the tag, a word of another variety is wrong, and so is a general word the variety doesn't use**
  (the owner, round 5). *coche* is Spain's. *autobús* is general Spanish, and wrong under "in Cuba" unless
  Cubans say it too: the lexicon marks where a general word is also Cuban, by a Cuban speaker's review, and
  there it is accepted. Two words of the prompt's own variety are both right (*máquina* and *carro*): ADR
  0085 still governs a choice inside a variety.
- **A scope slip has its own feedback** (the `scope` label, ADR 0148), which names where the word belongs:
  "that's the word in Spain; in Cuba, *carro*"; for a general word, "that's the general word; in Cuba,
  *guagua*", never "Spain's". The same for register: "that's how you'd speak to a friend; to your boss,
  *usted*".
- **The compiler enforces it:** an accept set for writing the target whose alternatives differ in something
  the answer must say, with nothing to pick one (the prompt, a tag, the answer's own syntax), is a lint.
  That needs the alternatives analysed through the lexicon (ADR 0145), not only the sentence's own text.
- **The lint lets two differences be** (the owner, round 5):
  - **one the answer's own order forces.** In hbo a subject put first can't take a wayyiqtol (ADR 0084), so
    וַתֹּאמֶר הָאִשָּׁה and האשה אמרה (unpointed, as the course's accept set writes it) are each the form
    their order allows;
  - **a contrast only a context decides, on a sentence that has none.** The wayyiqtol adds succession to
    what a qatal says, and a writer avoids it for an earlier action or a contrast (Joüon–Muraoka § 118). A
    lone sentence has nothing before it, so both mean "the woman said": ADR 0085's ground for taking both.

  Each language marks which of its contrasts are context-only (REVIEW). hbo's accept sets stay as they are.
- **A context-only contrast is asked where there is context:** on a line of a story, by a third kind of
  question, **which use** (the owner, round 6), beside ADR 0132's which word and which form.
  - Its options are one word in the forms of one contrast (hbo: the wayyiqtol and the qatal of the line's
    verb), and what came before decides. The wrong form is one the line could take by itself and the passage
    rules out.
  - It has an instruction of its own, so a card still says what it asks, and it credits the feature's use
    (ADR 0146).
  - ADR 0132's rule for which form is untouched: there a wrong form still makes the line ungrammatical.
  - It comes with its messages and a lint: the contrast is one its language marks as context-only, and the
    line is not the story's first.

## Consequences

- **Where the prompt says Cuban, es stops accepting a word of another variety, and a general word Cubans
  don't say**; prompts without a dialect synonym are unchanged. Cuban forms stay canonical (ADR 0076).
- **A dialect tag is only as good as the lexicon.** A synonym nobody entered leaves its prompt untagged and
  that word plainly wrong; a learner's report is how such a word arrives. Which general words are also Cuban
  waits on a Cuban speaker's review.
- **Untagged person forms stop being accepted all at once** when writing the target: apc's kifak / kifik /
  kifkon sentences need their tags, which the lint finds. The spread of persons each course exercises (ADR
  0075) still holds.
- **hbo's accept sets are untouched** (ADR 0085's 204 answers), and its stories gain which-use questions on
  the narrative and the plain form.
- **New tag data:** register, aspect situations, the referent of an unnamed "it", the variety; and each
  language's list of context-only contrasts. Authored tags are drafted (`llm:`) and reviewed; dialect tags
  are computed.
- **`signoffText` changes,** with its pinned test text in both languages, before any sentence is signed off.
- **Prompts tagged in the learner's own language are untouched:** that direction accepts every rendering.

## Revision (2026-11-20): the review and round 5

After [the review](../review-adr-0145-0151.md) (findings 6, 10, 15; C17) and the owner's fifth round of
answers ([lexemes.md](../lexemes.md) §16).

**Decided by the owner in round 5:**
- hbo keeps the narrative form and the plain one, untagged. The lint lets a difference be when the answer's
  own order forces it, or when it is a contrast only a context decides; each language marks those; the
  contrast is asked on story lines.
- A general word under a variety tag is wrong unless that variety's speakers say it too, and its feedback
  says "the general word", never "Spain's".

## Round 6 (2026-11-20): accepted

The owner's sixth round ([lexemes.md](../lexemes.md) §16) ruled on what the revision had proposed, and
accepted the ADR.

**Decided against the draft:**
- **A story asks a context-only contrast by a question of its own, which use.** The draft widened ADR 0132's
  which-form question instead, so one instruction would have covered two different questions.

**Accepted as drafted:**
1. What is tagged, in one phrase: what the answer must say and the prompt leaves open. It covers agreement
   with an open controller and scopes, which "the inherent features" did not.
2. A tag's two kinds of data: a catalog value, or authored TaggedText in the support language.
3. A sign-off covers a sentence's tags, so `signoffText` hashes them (ADR 0072).
4. Two words of the prompt's own variety are both right.
