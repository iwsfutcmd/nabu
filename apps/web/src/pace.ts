/**
 * The learner's choice of pace for a course (ADR 0105, D5): automatic, read from the log, or a pace
 * of their own. A per-device preference in localStorage, like a listening break; without storage it
 * holds for this page.
 */
import type { PaceChoice } from "@nabu/core/learner";

const CHOICES: readonly PaceChoice[] = ["auto", "consolidate", "steady", "accelerate"];
const keyOf = (course: string): string => `nabu.pace.${course}`;
const fallback = new Map<string, PaceChoice>();

export const paceChoiceOf = (course: string): PaceChoice => {
  try {
    const stored = localStorage.getItem(keyOf(course));
    const choice = CHOICES.find((c) => c === stored);
    if (choice !== undefined) return choice;
  } catch {
    // Storage unavailable: the in-memory choice below.
  }
  return fallback.get(course) ?? "auto";
};

export const setPaceChoice = (course: string, choice: PaceChoice): void => {
  fallback.set(course, choice);
  try {
    if (choice === "auto") localStorage.removeItem(keyOf(course));
    else localStorage.setItem(keyOf(course), choice);
  } catch {
    // Storage unavailable: the in-memory choice holds for this page.
  }
};
