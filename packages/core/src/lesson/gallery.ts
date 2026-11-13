/**
 * Cards of each kind a course makes, for debug mode's card gallery, stories, tests and previews.
 * They are the cards lessons plan among (`lessonCandidates`, the planner's own enumerator), lesson
 * by lesson in path order, for a learner who has met nothing else: so a kind shows here only where
 * lessons can plan it. A script track's kinds come from its alphabet nodes (`scriptCandidates`), as
 * their sessions plan them.
 */
import type { CourseView } from "./course.ts";
import { lessonCandidates } from "./candidates.ts";
import type { Exercise, TemplateId } from "./exercise.ts";
import { courseExclusions } from "./exclusions.ts";
import { lessonNodes } from "./nodes.ts";
import { seededRng } from "./rng.ts";
import { SCRIPT_TEMPLATES, scriptCandidates, scriptNodes } from "./script.ts";
import { TEMPLATES } from "./templates.ts";

/** One card of a kind, or none where the course cannot make that kind. */
export interface GalleryCard {
  readonly template: TemplateId;
  readonly exercise: Exercise | undefined;
}

const KINDS = Object.keys(TEMPLATES) as TemplateId[];
const NONE_SEEN: ReadonlySet<string> = new Set();

/**
 * The first card of `template` the course's lessons make: each lesson, in path order, makes its
 * cards as a plan that may use only that kind does (its own rng, seeded with `seed`), until one
 * makes one. Undefined where the course rules the kind out or cannot make it.
 */
export const sampleExercise = (course: CourseView, template: TemplateId, seed = 1): Exercise | undefined => {
  if (courseExclusions(course).has(template)) return undefined;
  const others = new Set(KINDS.filter((t) => t !== template));
  if (SCRIPT_TEMPLATES.has(template)) {
    for (const at of scriptNodes(course)) {
      const [found] = scriptCandidates({ course, rng: seededRng(seed), introduced: at.node.introduces }, at, others);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  for (const at of lessonNodes(course)) {
    const [found] = lessonCandidates({ course, rng: seededRng(seed), introduced: at.node.introduces }, at, NONE_SEEN, others);
    if (found !== undefined) return found;
  }
  return undefined;
};

/**
 * One card of every kind the course can make, for debug mode: each kind's `sampleExercise`. Story
 * questions belong to stories and are left out, as is every kind the course rules out
 * (`courseExclusions`); a kind the course has no material for comes back without a card.
 */
export const cardGallery = (course: CourseView, seed = 1): readonly GalleryCard[] => {
  const excluded = courseExclusions(course);
  return KINDS.filter((t) => !t.startsWith("story-") && !excluded.has(t)).map((template): GalleryCard => ({ template, exercise: sampleExercise(course, template, seed) }));
};
