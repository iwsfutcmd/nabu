/**
 * The learning path (gameplan §11.1): the course's nodes in order (lessons, and stories where
 * the course has one), each done, available or locked. A node opens when the one before it is
 * done, so a learner always has exactly one new node ahead, and done nodes stay open for
 * practice and rereading.
 *
 * A passage that introduces words (ADR 0144) is followed by its drill node: open once the passage
 * is read, done once each of its sessions is. Drills never hold back the path (D6): the node after
 * a drill opens when the one before the drill is done.
 */
import type { BundleNode, BundleUnit } from "@nabu/schema";
import { drillNodes } from "../lesson/drill.ts";
import { lessonNodes } from "../lesson/nodes.ts";
import { scriptNodes } from "../lesson/script.ts";
import type { CourseView } from "../lesson/course.ts";
import type { LearnerState } from "./state.ts";

export type NodeStatus = "done" | "available" | "locked";

export interface PathNode {
  readonly node: string;
  readonly unit: string;
  readonly kind: "lesson" | "story" | "script" | "drill";
  readonly status: NodeStatus;
  /**
   * A drill node's sessions (ADR 0144): how many are done, of how many, and the one it opens (the
   * first not done; once all are, the first again, for practice).
   */
  readonly drill?: { readonly done: number; readonly total: number; readonly next: string } | undefined;
}

/**
 * The node a path entry's session is planned for (a lesson request's `node`): its own, or, for a
 * drill node (ADR 0144), the session it opens.
 */
export const sessionNodeOf = (entry: PathNode): string => entry.drill?.next ?? entry.node;

/**
 * The path's nodes in order: lesson and practice nodes with sentences, story nodes with a story, and
 * drill nodes with words to drill in the orthography (ADR 0144).
 */
export interface PathEntry {
  readonly unit: BundleUnit;
  readonly node: BundleNode;
  readonly kind: "lesson" | "story" | "drill";
}

export const pathNodes = (course: CourseView): readonly PathEntry[] => {
  const lessons = new Set(lessonNodes(course).map((n) => n.node.id));
  const drills = new Set(drillNodes(course).map((d) => d.node.id));
  return course.units.flatMap((unit) => {
    const stories = new Set((unit.stories ?? []).map((s) => s.node));
    return unit.nodes.flatMap((node): PathEntry[] => {
      if (lessons.has(node.id)) return [{ unit, node, kind: "lesson" }];
      if (drills.has(node.id)) return [{ unit, node, kind: "drill" }];
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
  const drills = new Map(drillNodes(course).map((d) => [d.node.id, d]));
  // The node before each, drills left out: they never hold back the path (D6).
  let previous: string | undefined;
  return pathNodes(course).map(({ node, unit, kind }): PathNode => {
    const drill = kind === "drill" ? drills.get(node.id) : undefined;
    if (drill !== undefined) {
      const finished = drill.sessions.filter((s) => done.has(s.id)).length;
      const total = drill.sessions.length;
      const status: NodeStatus = finished === total ? "done" : done.has(drill.node.drill.story) ? "available" : "locked";
      const next = (drill.sessions.find((s) => !done.has(s.id)) ?? drill.sessions[0])?.id ?? node.id;
      return { node: node.id, unit: unit.id, kind, status, drill: { done: finished, total, next } };
    }
    const status: NodeStatus = done.has(node.id) ? "done" : previous === undefined || done.has(previous) ? "available" : "locked";
    previous = node.id;
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
