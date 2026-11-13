/**
 * A course's lesson nodes and the sentences each one teaches with: what the planner, placement, the
 * path and the card gallery are built from.
 */
import type { BundleNode, BundleSentence, BundleUnit } from "@nabu/schema";
import type { CourseView } from "./course.ts";

export interface LessonNode {
  readonly unit: BundleUnit;
  readonly node: BundleNode;
}

/** A node's sentences, in its order, that the orthography being learned writes. */
export const sentencesOf = (
  course: CourseView,
  unit: BundleUnit,
  node: BundleNode,
): readonly BundleSentence[] =>
  node.sentences
    .flatMap((id) => unit.sentences.find((s) => s.id === id) ?? [])
    .filter((s) => s.forms[course.orthography] !== undefined);

/** Nodes a lesson can be built from, in path order (script-convert and other node kinds come later). */
export const lessonNodes = (course: CourseView): readonly LessonNode[] =>
  course.units.flatMap((unit) =>
    unit.nodes
      .filter(
        (node) =>
          (node.kind === "lesson" || node.kind === "practice") &&
          sentencesOf(course, unit, node).length > 0,
      )
      .map((node) => ({ unit, node })),
  );
