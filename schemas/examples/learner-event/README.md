# Events (schema 2)

- `valid/answer.json`: hablas for hablo: the lexeme shown, the person missed (ADR 0146, 0148).
- `valid/presented.json`: What a card showed is logged.
- `valid/story-line.json`: A story line read.
- `valid/answer-displayed.json`: What an answer added to what its card showed (the solution of a typed card); a lexeme the token chooses no form of has no feats.
- `valid/presented-nothing.json`: A card that shows nothing in the language yet (a dictation) logs an empty list.
- `valid/placed.json`: A placement seeds parts.
- `valid/answer-orthographic.json`: aser for hacer: right sound, wrong letters; the miss names the correspondences it was against (ADR 0148).
- `valid/answer-order.json`: a sentence's words in another order (the label `order`).
- `invalid/schema-1.json`: No event stays in schema 1: every stored one is upgraded.
- `invalid/kc-credit.json`: Credit is per part, never per KC.
- `invalid/credit-with-no-skill.json`: Memory is kept per part and skill.
- `invalid/no-labels.json`: An outcome says what the miss is, even where that is nothing.
- `invalid/empty-correspondence.json`: a correspondence id is never empty.
- `invalid/unknown-label.json`: a miss label is one of ADR 0148's.
- `invalid/displayed-bare-id.json`: a displayed lexeme is an object (lexeme and feats), never a bare id.
- `invalid/displayed-surface.json`: what was displayed is a lexeme and a form, never its spelling.
- `invalid/story-line-no-displayed.json`: a story line read always says what it displayed.
