# Events in the new shape (schema 2)

- `valid/answer.json`: hablas for hablo: the lexeme shown, the person missed (ADR 0146, 0148).
- `valid/presented.json`: What a card showed is logged.
- `valid/story-line.json`: A story line read.
- `valid/placed.json`: A placement seeds parts.
- `invalid/schema-1.json`: No event stays in the old shape: every stored one is upgraded.
- `invalid/kc-credit.json`: Credit is per part, never per KC.
- `invalid/credit-with-no-skill.json`: Memory is kept per part and skill.
- `invalid/no-labels.json`: An outcome says what the miss is, even where that is nothing.
