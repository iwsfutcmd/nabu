import type { LearnerEvent } from "@nabu/schema";
import { describe, expect, it } from "vitest";
import { studiedCourses } from "../src/learner/index.ts";
import { idFactory } from "./learner-fixtures.ts";

const nextId = idFactory();
const BUNDLE = "0".repeat(64);

/** An event of `type` in a course and writing system, recorded at `clientTime` (device time with its offset). */
const event = (type: "session_started" | "progress_reset" | "session_completed", course: string, orthography: string, clientTime: string, id = nextId()): LearnerEvent => {
  const base = { id, schema: 1, device: "test", course, orthography, support: "en", bundle: BUNDLE, session: nextId(), clientTime, localDate: clientTime.slice(0, 10), tz: "UTC" };
  if (type === "session_started") return { ...base, type, mode: "lesson", node: `${course}.n1`, seed: 1, exercises: 3, planner: "test" } as LearnerEvent;
  if (type === "progress_reset") return { ...base, type } as LearnerEvent;
  return { ...base, type, mode: "lesson", node: `${course}.n1`, summary: { completed: true, exercises: 3, correctFirstTry: 3, retries: 0, skipped: 0 } } as LearnerEvent;
};

describe("where the learner left off (S1)", () => {
  it("lists the courses studied, the latest first, each in the writing system of its latest start", () => {
    const log = [
      event("session_started", "uz", "uz-Latn/standard", "2026-05-01T09:00:00Z"),
      event("session_started", "fa", "fa-Arab/standard", "2026-05-02T09:00:00Z"),
      event("session_started", "uz", "uz-Cyrl/standard", "2026-05-03T09:00:00Z"),
    ];
    expect(studiedCourses(log)).toEqual([
      { course: "uz", orthography: "uz-Cyrl/standard", at: "2026-05-03T09:00:00Z" },
      { course: "fa", orthography: "fa-Arab/standard", at: "2026-05-02T09:00:00Z" },
    ]);
  });

  it("counts a start over as a start; nothing but a start moves a course", () => {
    const log = [
      event("session_started", "fa", "fa-Arab/standard", "2026-05-01T09:00:00Z"),
      event("session_started", "es", "es-Latn/standard", "2026-05-02T09:00:00Z"),
      // A session's end comes later than its start: the course is where it was.
      event("session_completed", "fa", "fa-Arab/standard", "2026-05-03T09:00:00Z"),
      event("progress_reset", "apc", "apc-Arab/standard", "2026-05-04T09:00:00Z"),
      { id: nextId(), schema: 1, type: "goal_set", device: "test", days: 5, clientTime: "2026-05-05T09:00:00Z", localDate: "2026-05-05", tz: "UTC" } as LearnerEvent,
    ];
    expect(studiedCourses(log).map((s) => s.course)).toEqual(["apc", "es", "fa"]);
  });

  it("orders by when each start happened, not by where it is in the log", () => {
    // Synced from another device after this one's session, though it began earlier (09:00 at +02:00 is 07:00Z).
    const log = [event("session_started", "es", "es-Latn/standard", "2026-05-01T08:30:00Z"), event("session_started", "fa", "fa-Arab/standard", "2026-05-01T09:00:00+02:00")];
    expect(studiedCourses(log).map((s) => s.course)).toEqual(["es", "fa"]);
    expect(studiedCourses([...log].reverse()).map((s) => s.course)).toEqual(["es", "fa"]);
  });

  it("breaks a tie in time by id, as the log orders it", () => {
    const at = "2026-05-01T09:00:00Z";
    const log = [event("session_started", "fa", "fa-Arab/standard", at, "00000000-0000-7000-8000-00000000000b"), event("session_started", "es", "es-Latn/standard", at, "00000000-0000-7000-8000-00000000000a")];
    expect(studiedCourses(log).map((s) => s.course)).toEqual(["fa", "es"]);
    expect(studiedCourses([])).toEqual([]);
  });
});
