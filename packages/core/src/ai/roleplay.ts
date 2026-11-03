/**
 * Roleplay (gameplan §13.4): the vocabulary a learner knows, and the course analyzer's check of
 * every model turn before it is shown. A turn passes when its words are known (at most `budget`
 * new ones) and every character belongs to the orthography; otherwise it is generated again.
 */
import type { CourseView } from "../lesson/course.ts";
import { allKcs, profileOf } from "../lesson/course.ts";
import { retrievability, type LearnerState } from "../learner/state.ts";
import { glossUnits } from "../match/gloss.ts";
import { surfaceOf } from "../text/tagged-text.ts";

/** KCs whose recognition the learner would likely recall now (R ≥ θ), with their forms in the orthography. */
export const knownForms = (course: CourseView, state: LearnerState, now: string, theta = 0.7): readonly string[] =>
  allKcs(course)
    .filter((kc) => retrievability(state, kc.id, "recognize", course.orthography, now) >= theta)
    .flatMap((kc) => (kc.forms?.[course.orthography] ?? []).map(surfaceOf));

export interface TurnCheck {
  /** Units of the turn not in the known vocabulary (folded, as glossing matches). */
  readonly unknown: readonly string[];
  /** Characters of another script than the orthography's. */
  readonly outOfScript: readonly string[];
  readonly words: number;
  readonly ok: boolean;
}

const scripts = new Map<string, RegExp>();
const UNICODE_SCRIPTS: Readonly<Record<string, readonly string[]>> = { Hant: ["Hani"], Hans: ["Hani"], Jpan: ["Hani", "Hira", "Kana"], Kore: ["Hang", "Hani"] };
/** Characters any orthography may use: spaces, digits, punctuation and symbols shared by scripts, combining marks. */
const COMMON = /^[\p{Script=Zyyy}\p{Script=Zinh}]$/u;

/**
 * Checks a turn. `known` are the learner's known forms. Every character must be common to all
 * scripts or belong (by Script_Extensions) to the orthography's script, from its language tag.
 */
export const checkTurn = (course: CourseView, text: string, known: readonly string[], budget: number): TurnCheck => {
  const profile = profileOf(course, course.orthography);
  const knownUnits = new Set(known.flatMap((f) => glossUnits(profile, f)));
  const units = glossUnits(profile, text);
  const unknown = [...new Set(units.filter((u) => !knownUnits.has(u)))];
  const subtag = /-([A-Z][a-z]{3})(?:-|$)/u.exec(profile.lang)?.[1];
  let ofScript: RegExp | undefined;
  if (subtag !== undefined) {
    // CLDR script variants are unions of Unicode scripts.
    const unicode = UNICODE_SCRIPTS[subtag] ?? [subtag];
    ofScript = scripts.get(subtag) ?? new RegExp(`^[${unicode.map((u) => `\\p{Script_Extensions=${u}}`).join("")}]$`, "u");
    scripts.set(subtag, ofScript);
  }
  const outOfScript = ofScript === undefined ? [] : [...new Set([...text.normalize("NFC")].filter((c) => !COMMON.test(c) && !ofScript.test(c)))];
  return { unknown, outOfScript, words: units.length, ok: unknown.length <= budget && outOfScript.length === 0 };
};
