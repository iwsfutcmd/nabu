# 0064. Every card says its clip once answered

- Status: Accepted (2026-11-18)
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

## Amendment: a sentence whose meaning is asked is said as it opens (2026-11-23)

The owner asked that a card like choose-translation play its sentence as it opens, when sound is on.

- **Said as it opens:** a card whose prompt is a target sentence and whose question is what it means:
  choose-translation and the word bank from the target (translate-tap.l2-l1). It plays once, through the prompt's
  own player (`TargetPrompt`'s `sayOnOpen`), and again once answered, as a listening card does.
- **Never where the clip is the answer:** reading cards keep it until answered (`clipWhenAnswered`), gap-fill and
  cards into the target have none before the answer, and a scored speaking card stays silent until the learner
  speaks (it would become listen-and-repeat; tier 0's model already plays, P5).
- **Sound off, or a listening break:** nothing plays as the card opens; its play button still does (P6, D18).

