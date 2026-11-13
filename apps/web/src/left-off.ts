/**
 * Where the learner left off (S1 in the 2026-11 review), worked out for Home: which course it
 * continues, the order of the course list, when a course was last practised, and the next step as
 * the course page's Continue has it (ADR 0105). Nothing here touches React or the page, so tests
 * import it from Node; the card is HomeContinue.tsx.
 */
import { daysBetween } from "@nabu/core/game";
import { continueOf, paceOf, type LearnerState, type PaceChoice, type PathNode, type Studied } from "@nabu/core/learner";
import type { CourseView, Facet } from "@nabu/core/lesson";
import type { useTranslator } from "@nabu/ui";
import type { CourseIndexEntry } from "@nabu/ui/player";
import { localDate } from "./clock.ts";
import { nodeName } from "./screen.tsx";

type Translator = ReturnType<typeof useTranslator>;

/** Where Home continues: the latest course studied that this app still has, in the writing system it was studied in (else the course's first). */
export const resumeOf = (studied: readonly Studied[], courses: readonly CourseIndexEntry[]): { readonly entry: CourseIndexEntry; readonly orthography: string } | undefined => {
  for (const s of studied) {
    const entry = courses.find((c) => c.id === s.course);
    const orthography = entry?.orthographies.includes(s.orthography) === true ? s.orthography : entry?.orthographies[0];
    if (entry !== undefined && orthography !== undefined) return { entry, orthography };
  }
  return undefined;
};

/** The course list (S1): the courses studied first, the latest first; then the others in `byName`'s order. */
export const orderCourses = (courses: readonly CourseIndexEntry[], studied: readonly Studied[], byName: (a: CourseIndexEntry, b: CourseIndexEntry) => number): readonly CourseIndexEntry[] => {
  const rank = new Map(studied.map((s, i) => [s.course, i]));
  const rankOf = (c: CourseIndexEntry): number => rank.get(c.id) ?? studied.length;
  return [...courses].sort((a, b) => rankOf(a) - rankOf(b) || byName(a, b));
};

/**
 * When a course was last practised, on its card ("today", "yesterday", "3 days ago", "last week",
 * "2 months ago"): by the learner's local dates, so last night is yesterday.
 */
export const lastPractised = (t: Translator, at: string, now: Date): string => {
  const days = Math.max(0, daysBetween(localDate(new Date(at)), localDate(now)));
  const relative = new Intl.RelativeTimeFormat(t.formattingLocale, { numeric: "auto" });
  const when = days < 7 ? relative.format(-days, "day") : days < 30 ? relative.format(-Math.floor(days / 7), "week") : relative.format(-Math.floor(days / 30), "month");
  return t.format("app.home.course.last", { when });
};

/** The next step, as the course page's Continue has it (ADR 0105). */
export type Step =
  | { readonly kind: "path"; readonly node: PathNode }
  | { readonly kind: "practice"; readonly node: PathNode | undefined; readonly slipping: number }
  | { readonly kind: "done" };

/** The next step at the learner's pace (`choice`, D5), with what they turned off for good left out (D41), as on the course page. */
export const stepOf = (course: CourseView, state: LearnerState, now: Date, choice: PaceChoice, facetsOff: ReadonlySet<Facet>): Step => {
  const pace = paceOf(course, state, now.toISOString(), choice, facetsOff);
  const next = continueOf(course, state, pace);
  if (next.kind === "practice") return { kind: "practice", node: next.next, slipping: pace.slipping };
  return next.kind === "path" ? { kind: "path", node: next.next } : { kind: "done" };
};

/**
 * What the card says of the step: the lesson or story Continue starts, as the path names it; why
 * practice comes first; or that the path is done (practice with nothing slipping comes only then).
 */
export const stepLine = (t: Translator, course: CourseView, step: Step): string | undefined => {
  if (step.kind === "path") {
    const name = nodeName(t, course, step.node.node);
    return name === undefined ? undefined : t.format("app.home.continue.next", { step: name });
  }
  return step.kind === "practice" && step.slipping > 0 ? t.format("app.pace.why.slipping", { count: step.slipping }) : t.format("app.continue.done");
};
