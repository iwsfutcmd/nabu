# 0147. What one language says and the other leaves open

- Status: Proposed
- Date: 2026-11-19
- Amends: [ADR 0085](0085-what-the-prompt-leaves-open.md) (accept sets), [ADR 0056](0056-persons.md) and
  [ADR 0075](0075-persons-coverage.md) (person tags), [ADR 0076](0076-cuban-spanish.md) (es: pan-Hispanic
  forms accepted), [ADR 0084](0084-hbo-references.md) (hbo: the other orders and forms its accept sets take,
  which the lint below meets)
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
- **The features tagged are the inherent ones** (ADR 0145). Contextual ones (agreement, classifiers, a
  governed case) are fixed by the sentence. In our courses and planned ones: the speaker's and addressee's
  gender and number (apc, hbo, es); register (uz *sen* / *siz*, fa تو / شما, es *tú* / *usted*, Javanese); dialect
  where the meaning has dialect synonyms (es); the gender of an unnamed "it" or "this" (apc); aspect where
  English has one past (es *comí* / *comía*); evidentiality (uz ‑ibdi beside ‑di, once taught); later,
  clusivity (Indonesian *kita* / *kami*) and Korean and Japanese honorifics.
- **Tags name the situation, not the grammar:** "a woman speaking", "to your grandmother", "it (the school)",
  "(every day)", "in Cuba". They read naturally, carry meaning rather than metalanguage, and never show the
  answer's form. A tag is shown only where the answer's language marks it, as persons are now.
- **The accept set keeps only the forms the tags allow** when the learner writes the target; ADR 0085 still
  governs what no tag decides (word order, optional words, spelling variants) and everything written in the
  learner's own language.
- **Dialect tags are derived, not authored.** A course states its variety once (es: Cuban); the compiler
  knows which lexemes have dialect synonyms (lexemes of one concept differing by variety) and tags those
  prompts.
- **A scope slip has its own feedback** (the `scope` label, ADR 0148): *coche* under "in Cuba" is wrong, and
  the feedback says "that's the word in Spain; in Cuba, *carro*". The same for register: "that's how you'd
  speak to a friend; to your boss, *usted*".
- **The compiler enforces it:** an accept set for writing the target whose alternatives differ in an inherent
  feature, with no tag to pick one, is a lint. That needs the alternatives analysed through the lexicon (ADR
  0145), not only the sentence's own text.

## Consequences

- **es stops accepting pan-Hispanic words where the prompt says Cuban**; prompts without a dialect synonym
  are unchanged. Cuban forms stay canonical (ADR 0076).
- **Untagged person forms stop being accepted all at once** when writing the target: apc's kifak / kifik /
  kifkon sentences need their tags, which the lint finds. The spread of persons each course exercises (ADR
  0075) still holds.
- **New tag data:** register, aspect situations, the referent of an unnamed "it", the variety. Authored tags
  are drafted (`llm:`) and reviewed; dialect tags are computed.
- **Prompts tagged in the learner's own language are untouched:** that direction accepts every rendering.
