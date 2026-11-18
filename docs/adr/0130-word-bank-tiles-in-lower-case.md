# 0130. Word-bank tiles in lower case, but for words that must be capitalized

- Status: Accepted (2026-11-18)
- Date: 2026-11-15

## Context

The project owner found word banks easy to guess from their capitals. A Chaghatay card ("Čay sawuq emäs."
→ "The tea is not cold") offered The, tea, is, not, cold, This, Salt, Fruit and Bread. Only one tile can
start the sentence. Every capitalized tile but one was therefore a distractor, and every lower-case tile
was the answer's.

Tiles kept the case they had in their own sentence, so each sentence's first word kept its capital,
answer and distractor alike. P2 had tried to blur this by preferring capitalized distractors where the
answer starts with a capital. That made it worse: it took away the lower-case distractors that the
answer's other words could hide among.

## Decision

**A tile is in lower case unless its word must be capitalized** (`tilesOf`, @nabu/core/lesson/tiles.ts).
This covers the word bank's answer and its distractors (translate-tap both ways, listen-tap) and a
story's arrange question.

A word loses its capital only where both of these hold:

- **It starts a sentence:** the text's first word, or the first after a sentence terminator (Unicode's
  Sentence_Terminal: . ? ! ؟ 。). Punctuation between does not count (¿Qué).
- **The course writes it in lower case somewhere in the same orthography:** a sentence, a translation,
  a word's form or gloss, or a story line. A name never is written so, nor "I", nor a German noun, so
  they keep their capital.

A capital inside a sentence always stays (Calle Ocho, Aunt Cachita, La Habana): there it belongs to the
word.

- **The language's own lower case:** `toLocaleLowerCase` with the text's tag, so Turkish İ becomes i,
  not i with a dot above. A caseless script is left alone. A token's morphs and ruby bases are lowered
  with it, since they spell its surface.
- **Grading does not change.** Every profile compares case-folded text (`match.case`), and story-arrange
  compares the tiles' own text. The solution shown after an answer is the sentence as written, capitals
  and all.
- **Distractors are drawn as before, now from lower-case tiles.** The preference for capitalized ones
  is gone. Gap-fill still matches the answer's case (its options are words in their sentence).

## Consequences

- No tile's capital tells the answer's first word from the rest, or a distractor from the answer's
  words. A name still has its capital wherever it stands, as a learner would write it.
- A name that only ever starts sentences and is also a common word the course writes in lower case
  (Rose, rose) loses its capital on a tile. The fix is a course sentence that writes the name inside a
  sentence, or a token marking it as a name, should one appear.
- Word-bank cards in the visual baselines changed: their tiles are lower case.
