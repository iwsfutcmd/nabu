# 0056. Prompts say who speaks and who is spoken to, where English cannot

- Status: Proposed
- Date: 2026-11-05

## Context

The learner writes a sentence in the target language from its English. English "you" has no
gender or number, and "I'm tired" does not say who is speaking. Lebanese Arabic marks both:
- *kifak* (to a man), *kifik* (to a woman), *kifkon* (to several people);
- *ana ta3ban* (a man speaking), *ana ta3bane* (a woman speaking).

The accept sets took one form or the other, chosen when the sentence was drafted, and nothing on
the screen said which. A learner could be marked wrong for a correct sentence, and could not
learn which form a prompt wanted.

## Decision

**A sentence can say who speaks and who is spoken to: `persons`** (common.schema.json
`Persons`, on `SentenceSource` and `BundleSentence`).
- `speaker`: `m` or `f`, where the sentence marks the speaker's gender.
- `addressee`: `m`, `f` or `pl`, where it marks whom it speaks to.

**The prompt shows it, and the accept set follows it.** In the exercises that write the sentence
in the target language (`translate-type.l1-l2`, `translate-tap.l1-l2`, `complete-translation`),
small tags under the English prompt say "to a woman", "to several people" or "a man speaking".
- **The tags are UI text** (`player.persons.*`), in the UI's language and direction, lined up
  under the prompt.
- **The accept set holds only the forms that fit the tags.**
- **No tag, both forms.** A sentence without `persons`, where the English allows either reading,
  accepts both.
- **The other direction needs no tag.** Reading the target into English, the target text already
  shows the person.

## Consequences

- **The English stays as it is.** The tags carry the information; no "(to a woman)" goes into
  the translation itself.
- **Other courses** can tag their sentences the same way. Cantonese 你 / 你哋 and Persian تو /
  شما (where both are not meant) are the likely next cases.
- **Visual matrix.** A tagged card is in the matrix (`Player/Persons`): UI {en, en-XA, ar-XB} ×
  every target.
