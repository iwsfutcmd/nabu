/**
 * The learning path (gameplan §11.1): the course's lesson nodes in order, each
 * done, available or locked. A node opens when the one before it is done, so a
 * learner always has exactly one new lesson ahead, and done lessons stay open
 * for practice.
 */
import { lessonNodes } from "../lesson/build.ts";
import type { CourseView } from "../lesson/course.ts";
import type { LearnerState } from "./state.ts";

export type NodeStatus = "done" | "available" | "locked";

export interface PathNode {
  readonly node: string;
  readonly unit: string;
  readonly status: NodeStatus;
}

export const pathOf = (course: CourseView, state: LearnerState): readonly PathNode[] => {
  const done = new Set(state.completedNodes);
  return lessonNodes(course).map(({ node, unit }, i, all) => {
    const previous = all[i - 1];
    const status: NodeStatus = done.has(node.id) ? "done" : previous === undefined || done.has(previous.node.id) ? "available" : "locked";
    return { node: node.id, unit: unit.id, status };
  });
};
