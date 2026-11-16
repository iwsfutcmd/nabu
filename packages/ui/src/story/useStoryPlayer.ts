/**
 * The story reader's shell: holds the pure story machine's state and executes its effects
 * (grading through the core grader, events to `onEvent`, feedback sounds), like usePlayer.
 */
import { gradeExercise, type Effect, type Grader, type LessonEvent } from "@nabu/core/lesson";
import { startStory, stepStory, type StoryEvent, type StoryScript, type StoryState } from "@nabu/core/story";
import { useCallback, useEffect, useRef, useState } from "react";
import { playFeedbackSound, playSoundEffect } from "../player/sound.ts";

export interface StoryPlayerOptions {
  readonly script: StoryScript;
  readonly grader: Grader;
  readonly onEvent?: ((event: LessonEvent) => void) | undefined;
  /** Sound effects (a chime when an answer is right, a tone when wrong, a flourish at the end); default on. */
  readonly sound?: boolean | undefined;
  /** For Storybook and tests: start from this state (no opening events). */
  readonly initialState?: StoryState | undefined;
}

export const useStoryPlayer = ({ script, grader, onEvent, sound = true, initialState }: StoryPlayerOptions) => {
  const [initial] = useState((): readonly [StoryState, readonly Effect[]] => (initialState === undefined ? startStory(script) : [initialState, []]));
  const [state, setState] = useState<StoryState>(initial[0]);
  const current = useRef<StoryState>(initial[0]);
  const listener = useRef(onEvent);
  listener.current = onEvent;
  // Right answers in a row: each takes the chime a step higher, and a wrong one starts it over.
  const streak = useRef(0);

  const run = useCallback(
    (effects: readonly Effect[], from: StoryState): StoryState => {
      let s = from;
      for (const effect of effects) {
        if (effect.tag === "emit") listener.current?.(effect.event);
        else if (effect.tag === "sound") {
          if (sound) playFeedbackSound(effect.sound, streak.current);
          streak.current = effect.sound === "correct" ? streak.current + 1 : 0;
        } else {
          const [next, more] = stepStory(s, { tag: "player", event: { tag: "graded", outcome: gradeExercise(effect.ex, effect.response, grader) } });
          s = run(more, next);
        }
      }
      return s;
    },
    [grader, sound],
  );

  const dispatch = useCallback(
    (event: StoryEvent): void => {
      const before = current.current;
      const [next, effects] = stepStory(before, event);
      current.current = run(effects, next);
      // A flourish as the session ends, finished (not quit).
      if (sound && before.tag !== "finished" && current.current.tag === "finished" && current.current.summary.completed) playSoundEffect("finished");
      setState(current.current);
    },
    [run, sound],
  );

  // The opening events (session_started, and a first question's presentation), once.
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    for (const effect of initial[1]) if (effect.tag === "emit") listener.current?.(effect.event);
  }, [initial]);

  return { state, dispatch } as const;
};
