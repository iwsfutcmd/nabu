/**
 * The learning path (gameplan §11.1): the course's nodes in order (lessons, and stories where
 * the course has one), each done, available or locked. A node opens when the one before it is
 * done, so a learner always has exactly one new node ahead, and done nodes stay open for
 * practice and rereading.
 */
import type { BundleNode, BundleUnit } from "@nabu/schema";
import { lessonNodes } from "../lesson/build.ts";
import type { CourseView } from "../lesson/course.ts";
import type { LearnerState } from "./state.ts";

export type NodeStatus = "done" | "available" | "locked";

export interface PathNode {
  readonly node: string;
  readonly unit: string;
  readonly kind: "lesson" | "story";
  readonly status: NodeStatus;
}

/** The path's nodes in order: lesson and practice nodes with sentences, and story nodes with a story. */
export interface PathEntry {
  readonly unit: BundleUnit;
  readonly node: BundleNode;
  readonly kind: "lesson" | "story";
}

export const pathNodes = (course: CourseView): readonly PathEntry[] => {
  const lessons = new Set(lessonNodes(course).map((n) => n.node.id));
  return course.units.flatMap((unit) => {
    const stories = new Set((unit.stories ?? []).map((s) => s.node));
    return unit.nodes.flatMap((node): PathEntry[] => {
      if (lessons.has(node.id)) return [{ unit, node, kind: "lesson" }];
      return node.kind === "story" && stories.has(node.id) ? [{ unit, node, kind: "story" }] : [];
    });
  });
};

export const pathOf = (course: CourseView, state: LearnerState): readonly PathNode[] => {
  const done = new Set(state.completedNodes);
  return pathNodes(course).map(({ node, unit, kind }, i, all) => {
    const previous = all[i - 1];
    const status: NodeStatus = done.has(node.id) ? "done" : previous === undefined || done.has(previous.node.id) ? "available" : "locked";
    return { node: node.id, unit: unit.id, kind, status };
  });
};
