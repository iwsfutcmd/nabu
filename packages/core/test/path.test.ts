/**
 * The path by unit (S11 in the 2026-11 review): lessons numbered within their unit, units numbered
 * as the course list counts them, a generated drill's unit without a number, and a script track's
 * unit off the path.
 */
import { describe, expect, it } from "vitest";
import { pathNodes, pathUnits } from "../src/learner/index.ts";
import { loadCourse, manifestOf } from "./learner-fixtures.ts";

describe("pathUnits", () => {
  it("numbers lessons within each unit, and units in course order", () => {
    const fa = loadCourse("fa");
    const units = pathUnits(fa);
    // The same entries as the path, in the same order.
    expect(units.flatMap((u) => u.entries.map((e) => e.node.id))).toEqual(pathNodes(fa).map((e) => e.node.id));
    const taught = units.filter((u) => u.number !== undefined);
    expect(taught.map((u) => u.number)).toEqual(taught.map((_, i) => i + 1));
    for (const { entries } of taught) {
      const lessons = entries.filter((e) => e.node.kind === "lesson");
      expect(lessons.map((e) => e.number)).toEqual(lessons.map((_, i) => i + 1));
      // A story has no number of its own.
      expect(entries.filter((e) => e.kind === "story").every((e) => e.number === undefined)).toBe(true);
    }
  });

  it("leaves a generated drill's unit unnumbered, after the units it follows", () => {
    for (const id of ["fa", "yue"]) {
      const units = pathUnits(loadCourse(id));
      const last = units.at(-1);
      expect(last?.unit.id, id).toBe("drill-numbers");
      expect(last?.number, id).toBeUndefined();
      expect(last?.entries.map((e) => [e.node.kind, e.number]), id).toEqual([["practice", undefined]]);
      // As many numbered units as the course's own units: what the course list says it has.
      expect(units.filter((u) => u.number !== undefined), id).toHaveLength(manifestOf(id).units.length - 1);
    }
  });

  it("leaves a script track's unit off the path (ADR 0088)", () => {
    const grc = loadCourse("grc");
    const units = pathUnits(grc);
    expect(units.map((u) => u.unit.id)).not.toContain("abc");
    expect(units[0]?.number).toBe(1);
    expect(units[0]?.entries[0]?.number).toBe(1);
  });
});
