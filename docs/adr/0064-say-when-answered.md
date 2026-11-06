# 0064. Every card says its clip once answered

- Status: Proposed
- Date: 2026-11-05
- Amends: [0040](0040-audio-pipeline.md)

## Context

A card with a clip played it only on request, except two kinds:
- listening cards, when they open;
- complete-the-translation, once answered.

Learners hear a sentence or word most usefully right after working with it. Duolingo reads the
answer out after every card.

## Decision

**Once a card is answered, its clip plays once,** if it has one and sound is on (@nabu/ui/player,
Views.tsx: `useSayWhenAnswered`).
- **Cards whose prompt is the target text:** the prompt's clip plays, with karaoke, through the
  prompt's own player (choose-translation, translations from the target, character reading,
  speaking cards).
- **Cards whose answer is the target text:** an answer block appears with play and slow buttons,
  and plays (`AnswerAudio`: translations into the target, complete-the-translation, gap-fill,
  pictures, vowel marks, transcription).
- **Listening cards:** they play when they open, and again once answered, as the transcript
  appears and follows the clip.
- **Not changed:**
  - match-the-pairs, where each tapped word says itself;
  - story questions: the reader plays the story's lines.

**Each view owns its clip,** never the player shell, so a card never plays two copies at once.

## Consequences

- **Every answer is heard,** right or wrong, at the moment it is learned.
- **Sound off means silence:** the lesson's sound setting still turns all of this off.
