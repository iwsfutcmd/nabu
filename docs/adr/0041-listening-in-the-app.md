# 0041. Listening in the app: templates, karaoke, "Can't listen now"

- Status: Proposed
- Date: 2026-11-03

## Context

Phase 5 asks for:
- the listening templates (listen-tap, listen-type, listen-select, minimal-pair);
- a "Can't listen now" switch;
- karaoke highlighting within 80 ms.

## Decision

**Templates** (`@nabu/core/lesson`). Each exists only where a clip does (`CourseView.audio`, from
the bundle's audio index). All exercise the `listen` facet.
- **listen-tap:** hear a sentence, build it from target tiles. Graded against the sentence's
  `reverse` accept set.
- **listen-type:** the same, typed. Typed answers get per-word credit, like translate-type.
- **listen-select:** hear a word KC, choose its written form among three.
- **minimal-pair:** hear a word, choose between it and one rival it is minimally apart from:
  - with a pinned reading scheme, the same syllable count and one syllable one sound or tone off
    (呀 *aa3* / 嗎 *maa3*, 嗎 *maa3* / 媽 *maa1*);
  - otherwise, one letter apart, using the profile's letters (Uzbek oʻ is one letter).

  Rivals are found automatically. The fixtures happen to hold one Cantonese pair.

**Planner.**
- KC listening joins the select-image and match-pairs candidates.
- Sentence listening joins the sentence templates.
- Caps per session: 2 each, 1 minimal-pair.
- Listening priors sit above their reading twins in the Elo model.
- New KCs are still recognized in writing before they are heard (the RECOGNITION constraint).

**Player.**
- `useClipPlayer` plays a clip and reads `currentTime` on every animation frame to find the token
  being said.
- `<T highlight>` marks that token, so the highlight trails the sound by at most a frame.
- Listening exercises play their clip on arrival and offer play and slow.
- After the answer, the transcript and translation appear, highlighted as the clip replays.
- Target-language prompts with a clip (choose-translation, tiles into the support language,
  speak) get a play button with the same karaoke.

**"Can't listen now."**
- Skips the exercise and drops the rest of the lesson's listening (player `skip` with
  `cant-listen`, as `cant-speak` does for speaking).
- The app then plans sessions without listening for an hour.
- That flag is a per-device convenience in `localStorage`, guarded. The course path says so and
  offers to turn listening back on.

## Consequences

- Courses with audio gain listening without content changes. Cantonese has little, until a voice
  passes QA ([ADR 0040](0040-audio-pipeline.md)).
- Phase 3's lesson builder (`buildLesson`) does not make listening exercises; only the planner
  does.
