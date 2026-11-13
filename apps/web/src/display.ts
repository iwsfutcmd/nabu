/**
 * How a course's text is shown on this device (P12): vowel marks (every word, new words, none) and
 * vertical text, as the learner last chose them in a lesson or story of that course. A per-device
 * convenience in localStorage, as the reading layer is (ADR 0071); without storage a choice lasts the
 * page, and before the learner chooses the profile's defaults apply (Persian: marks on new words).
 *
 * New words are the ones the learner does not know yet (ADR 0100): the player shows their marks
 * where the course says marks are for new words.
 */
import { DESIRED_RETENTION, learnedWords, type LearnerState } from "@nabu/core/learner";
import type { CourseView, Facet } from "@nabu/core/lesson";
import type { DisplayChoice } from "@nabu/ui/player";

const KEY = "nabu.display.";
const fallback = new Map<string, DisplayChoice>();

const keyOf = (course: string, orthography: string): string => `${KEY}${course}:${orthography}`;

const isChoice = (value: unknown): value is DisplayChoice => {
  if (typeof value !== "object" || value === null) return false;
  const { marks, vertical } = value as Record<string, unknown>;
  return (marks === undefined || marks === "show" || marks === "hide" || marks === "new") && (vertical === undefined || typeof vertical === "boolean");
};

/** The learner's display choice for a course in one orthography, if they made one on this device. */
export const storedDisplay = (course: string, orthography: string): DisplayChoice | undefined => {
  const key = keyOf(course, orthography);
  try {
    const value = localStorage.getItem(key);
    if (value === null) return undefined;
    const parsed: unknown = JSON.parse(value);
    return isChoice(parsed) ? parsed : undefined;
  } catch {
    return fallback.get(key);
  }
};

export const storeDisplay = (course: string, orthography: string, choice: DisplayChoice): void => {
  const key = keyOf(course, orthography);
  fallback.set(key, choice);
  try {
    localStorage.setItem(key, JSON.stringify(choice));
  } catch {
    // Storage unavailable: the choice lasts this page.
  }
};

/**
 * The words (KC ids) the learner knows now (ADR 0100), for vowel marks on new words only. `facetsOff`:
 * the facets turned off for good on this device (D41), which words are known without.
 */
export const knownWords = (course: CourseView, state: LearnerState, now: Date, facetsOff: ReadonlySet<Facet>): ReadonlySet<string> =>
  new Set(
    learnedWords(course, state, now.toISOString(), DESIRED_RETENTION, facetsOff)
      .filter((w) => w.known)
      .map((w) => w.kc),
  );
