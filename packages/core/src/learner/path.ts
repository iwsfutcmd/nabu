/**
 * The learning path (gameplan §11.1): the course's nodes in order (lessons, and stories where
 * the course has one), each done, available or locked. A node opens when the one before it is
 * done, so a learner always has exactly one new node ahead, and done nodes stay open for
 * practice and rereading.
 */
import type { BundleNode, BundleUnit } from "@nabu/schema";
import { lessonNodes } from "../lesson/nodes.ts";
import { scriptNodes } from "../lesson/script.ts";
import type { CourseView } from "../lesson/course.ts";
import type { LearnerState } from "./state.ts";

export type NodeStatus = "done" | "available" | "locked";

export interface PathNode {
  readonly node: string;
  readonly unit: string;
  readonly kind: "lesson" | "story" | "script";
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

/** A path entry as the course page numbers it (S11 in the 2026-11 review). */
export interface NumberedEntry extends PathEntry {
  /** A lesson's number within its unit, from 1; none for a story or a practice node (a drill). */
  readonly number: number | undefined;
}

/** A unit on the path: its entries in order, numbered as the course page shows them. */
export interface PathUnit {
  readonly unit: BundleUnit;
  /**
   * Its number among the course's units with lessons, from 1, as the course list counts units; none
   * for a unit without one (a generated drill, such as numbers, is a unit of practice nodes only).
   */
  readonly number: number | undefined;
  readonly entries: readonly NumberedEntry[];
}

/**
 * The path by unit (S11): a lesson is numbered within its unit, so a learner reads "Unit 7, lesson 2"
 * rather than "Lesson 43". Units without entries (a script track's, ADR 0088) are not on it.
 */
export const pathUnits = (course: CourseView): readonly PathUnit[] => {
  const byUnit: { unit: BundleUnit; entries: PathEntry[] }[] = [];
  for (const entry of pathNodes(course)) {
    const last = byUnit.at(-1);
    if (last?.unit === entry.unit) last.entries.push(entry);
    else byUnit.push({ unit: entry.unit, entries: [entry] });
  }
  let units = 0;
  return byUnit.map(({ unit, entries }) => {
    const lesson = (e: PathEntry): boolean => e.kind === "lesson" && e.node.kind === "lesson";
    const number = entries.some(lesson) ? ++units : undefined;
    let lessons = 0;
    return { unit, number, entries: entries.map((e) => ({ ...e, number: lesson(e) ? ++lessons : undefined })) };
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

/**
 * A script track's nodes (ADR 0088), each done, available or locked: a row of its own beside the
 * path. A node opens when the one before it in the row is done; the row and the path never wait
 * for each other.
 */
export const scriptPathOf = (course: CourseView, state: LearnerState): readonly PathNode[] => {
  const done = new Set(state.completedNodes);
  return scriptNodes(course).map(({ node, unit }, i, all) => {
    const previous = all[i - 1];
    const status: NodeStatus = done.has(node.id) ? "done" : previous === undefined || done.has(previous.node.id) ? "available" : "locked";
    return { node: node.id, unit: unit.id, kind: "script", status };
  });
};
