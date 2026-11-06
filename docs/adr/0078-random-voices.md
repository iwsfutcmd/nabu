# 0078. A course's voices read its items at random, except where grammar says who speaks

- Status: Proposed
- Date: 2026-11-06
- Amends: [0075](0075-persons-coverage.md), [0058](0058-lahgtna-voice.md), [0040](0040-audio-pipeline.md)

## Context

Each course had one voice: apc a man's, fa and uz a woman's. Every sentence was heard in that one
voice, and in apc a woman's words (*ana jou3ane*) were read by a man.

ADR 0075 let a voice say whose voice it is (`speaker`). A voice with `speaker` set then
left out every sentence of the other gender: no clip at all. The project maintainer would
rather:
- hear a man's voice read a woman's line than hear nothing;
- hear men and women at random through a course;
- keep a voice of the right gender wherever the grammar says who speaks.

## Decision

**A course's cast reads its items between its voices** (`nabu audio generate`, every voice by
default). Each sentence, word card and story line gets exactly one voice.
- **Grammar first.** A sentence whose `persons.speaker` is set goes to a voice whose `speaker`
  matches, if the cast has one. So does every line of a story character with a `speaker`.
- **Otherwise at random,** seeded by the item's id, so every run chooses the same voice. The
  draw is gender first, then a voice of that gender, so one man and three women still read
  half the items each.
- **A story character keeps one voice through a story.** The draw is seeded by the story and
  the character. Narration (lines with no speaker) is drawn the same way, as one more voice.
- **A clip a person checked keeps its voice.** A clip that is `reviewed` or `published` stays
  in the voice it was checked in. The exception is an item whose grammar wants the other
  gender when the cast has that gender. For a story character, the first checked line decides.
- **A cast of one voice reads everything,** whoever speaks.

**Story characters can carry a gender** (`speaker: m | f` on `StoryCharacter`, also in the
bundle).
- **Where it is set:** only where the text fixes it, by agreement (apc's Maya and Sami are
  addressed in the feminine and masculine) or by the word (grandmother, Abu Ali, Maryam's
  mother).
- **Where it is not:** a name alone is not grammar, so such characters draw a voice like any
  other item.

**The compiler follows the assignment.** A clip in a voice that no longer reads its item is
`audio.stale` and stays out of the bundle until `generate` makes it again. `--voice` runs one
voice; the clips of the others stay as they are until they run.

**apc casts a woman's voice, `beirut-f`.**
- **Design:** OmniVoice, "female, young adult, moderate pitch", seed 7.
- **Reference:** the man's reference sentence with Maya's name: مَرْحَبا! أَنا مايا. أَنا مِن
  لِبْنان، وأَنا بْبيروت. كيفَك؟
- **Shares:** the woman reads 265 items and the man 403. The man keeps the 88 clips listeners
  had already checked.

## Consequences

- **apc** speaks with a man's and a woman's voice:
  - every sentence a woman says is in the woman's voice;
  - Maya's and Teta's story lines are in hers, Sami's and Abu Ali's in his.
- **fa, uz and yue** have one voice each, so nothing changes until they cast a second:
  - a man's Piper voice for fa;
  - a man's Navoiy voice for uz;
  - for yue, an eSpeak NG variant, or a hosted voice.

  Their mother and grandmother characters already carry `speaker: f`.
- **A voice's `speaker` changes meaning.** Under ADR 0075 it was a filter that left out the
  other gender's sentences. It is now a preference within the cast. Nothing is ever left
  without a clip because of it.
- **Adding or removing a voice re-draws the items.** About half of a course's items move to the
  new voice and are synthesized again. Checked clips stay where they are.
