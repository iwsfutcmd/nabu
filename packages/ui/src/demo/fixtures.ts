import type { TaggedText } from "@nabu/schema";
import data from "./fixtures.json" with { type: "json" };

export type CourseKey = "fa" | "yue" | "uz" | "apc";

export interface DemoExercise {
  readonly course: CourseKey;
  /** Support-language sentence to translate. */
  readonly prompt: TaggedText;
  /** Expected answer in the target orthography; its tile groups become word-bank tiles. */
  readonly answer: TaggedText;
  readonly distractors: readonly TaggedText[];
}

/** Keyed by the answer's language tag. */
export const DEMO_EXERCISES = data.targets as unknown as Readonly<Record<string, DemoExercise>>;

/** The visual-matrix targets, by the short tag the gameplan uses → fixture key. */
export const DEMO_TARGETS = {
  fa: "fa-Arab-IR",
  "yue-Hant-HK": "yue-Hant-HK",
  "uz-Latn": "uz-Latn",
  "apc-Arab": "apc-Arab-LB",
} as const satisfies Readonly<Record<string, string>>;

export type DemoTarget = keyof typeof DEMO_TARGETS;

export const demoExercise = (target: DemoTarget): DemoExercise => DEMO_EXERCISES[DEMO_TARGETS[target]] as DemoExercise;
