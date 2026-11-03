import type { JSX } from "react";
import { ExerciseCard, type WritingMode } from "./ExerciseCard.tsx";
import { demoExercise, type DemoTarget } from "./fixtures.ts";
import { DEMO_ORTHOGRAPHIES } from "./profiles.ts";

export interface DemoExerciseCardProps {
  readonly target: DemoTarget;
  readonly writingMode?: WritingMode;
}

/** The exercise card wired to a demo target and its orthography profile. */
export const DemoExerciseCard = ({ target, writingMode = "horizontal-tb" }: DemoExerciseCardProps): JSX.Element => {
  const exercise = demoExercise(target);
  const profile = DEMO_ORTHOGRAPHIES.get(exercise.answer.orthography);
  if (profile === undefined) throw new Error(`No profile for ${exercise.answer.orthography}`);
  // Keyed so that switching target or mode resets local state (the readings toggle).
  return <ExerciseCard key={`${target}:${writingMode}`} exercise={exercise} profile={profile} writingMode={writingMode} />;
};
