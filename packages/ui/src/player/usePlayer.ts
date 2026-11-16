/**
 * The player shell: holds the pure state machine's state and executes its
 * effects (gameplan §11.5). Grading runs synchronously through the core grader;
 * events go to `onEvent` (Phase 4 stores them); sounds are synthesized.
 */
import { gradeExercise, start, step, type AdaptiveTest, type Effect, type Exercise, type Grader, type LessonEvent, type PlayerEvent, type PlayerState } from "@nabu/core/lesson";
import { useCallback, useEffect, useRef, useState } from "react";
import { playFeedbackSound } from "./sound.ts";

export interface PlayerOptions {
  readonly lesson: string;
  readonly exercises: readonly Exercise[];
  readonly grader: Grader;
  readonly onEvent?: ((event: LessonEvent) => void) | undefined;
  readonly sound?: boolean | undefined;
  /** Missed exercises come back at the end (default); off for a placement test. */
  readonly retries?: boolean | undefined;
  /** An adaptive test (the placement test, ADR 0077): what comes next depends on the answers. */
  readonly adaptive?: AdaptiveTest | undefined;
  /**
   * A session picked up again (core `resume`, S3): where it stands and the events that reopen it,
   * in place of a fresh start and its session_started.
   */
  readonly resumed?: readonly [PlayerState, readonly Effect[]] | undefined;
}

export const usePlayer = ({ lesson, exercises, grader, onEvent, sound = true, retries = true, adaptive, resumed }: PlayerOptions) => {
  const [initial] = useState(() => resumed ?? start(lesson, exercises, { retries, ...(adaptive === undefined ? {} : { adaptive }) }));
  const [state, setState] = useState<PlayerState>(initial[0]);
  const current = useRef<PlayerState>(initial[0]);
  const listener = useRef(onEvent);
  listener.current = onEvent;

  const run = useCallback(
    (effects: readonly Effect[], from: PlayerState): PlayerState => {
      let s = from;
      for (const effect of effects) {
        if (effect.tag === "emit") listener.current?.(effect.event);
        else if (effect.tag === "sound") {
          if (sound) playFeedbackSound(effect.sound);
        } else {
          const [next, more] = step(s, { tag: "graded", outcome: gradeExercise(effect.ex, effect.response, grader) });
          s = run(more, next);
        }
      }
      return s;
    },
    [grader, sound],
  );

  const dispatch = useCallback(
    (event: PlayerEvent): void => {
      const [next, effects] = step(current.current, event);
      current.current = run(effects, next);
      setState(current.current);
    },
    [run],
  );

  // The opening events (session_started, exercise_presented; a resumed session's own), once.
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    for (const effect of initial[1]) if (effect.tag === "emit") listener.current?.(effect.event);
  }, [initial]);

  return { state, dispatch } as const;
};
