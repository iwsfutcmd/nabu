/**
 * Where the learner left off (S1 in the 2026-11 review): Home continues the course studied last, in
 * the writing system it was studied in, with the course page's next step; the courses studied come
 * first in the list, the latest first, each saying when it was last practised. The device's log
 * gives each course's latest start without the whole log being read.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { emptyLearnerState, pathNodes, studiedCourses, type Studied } from "@nabu/core/learner";
import { assembleCourse, lessonNodes, MEDIA_ROLES, type CourseView } from "@nabu/core/lesson";
import { createTranslator, sourceCatalog } from "@nabu/i18n";
import type { BundleManifest, LearnerEvent, OrthographyId } from "@nabu/schema";
import type { CourseIndexEntry } from "@nabu/ui/player";
import { describe, expect, it } from "vitest";
import { lastPractised, orderCourses, resumeOf, stepLine, stepOf } from "../../src/left-off.ts";
import { openStore } from "../../src/store.ts";

const ROOT = resolve(import.meta.dirname, "../../../..");
const BUNDLES = join(ROOT, "apps/web/public/bundles");
const numberingSystems = JSON.parse(readFileSync(join(ROOT, "packages/i18n/src/generated/numbering-systems.json"), "utf8")) as Record<string, string>;
const manifest = JSON.parse(readFileSync(join(BUNDLES, "fa", "manifest.json"), "utf8")) as BundleManifest;
const fa = ((): CourseView => {
  const files = new Map<string, unknown>(manifest.files.filter((f) => !MEDIA_ROLES.has(f.role)).map((f) => [f.path, JSON.parse(readFileSync(join(BUNDLES, "fa", f.path), "utf8")) as unknown]));
  const course = assembleCourse({ manifest, files, numberingSystems });
  if (!course.ok) throw new Error(JSON.stringify(course.error));
  return course.value;
})();
const t = createTranslator({ locale: "en", catalogs: [sourceCatalog()] });
const NONE_OFF = new Set<never>();

const entry = (id: string, orthographies: readonly string[]): CourseIndexEntry => ({ id, target: id, orthographies, support: ["en"], manifest: `${id}/manifest.json`, bundle: id });
const INDEX = [entry("es", ["es-Latn/standard"]), entry("fa", ["fa-Arab/standard"]), entry("uz", ["uz-Latn/standard", "uz-Cyrl/standard"])];
const studied = (course: string, orthography: string, at: string): Studied => ({ course, orthography: orthography as Studied["orthography"], at });

describe("Home's course list and where it continues", () => {
  const byId = (a: CourseIndexEntry, b: CourseIndexEntry): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

  it("lists the courses studied first, the latest first, then the others in name order", () => {
    const log = [studied("uz", "uz-Cyrl/standard", "2026-05-03T09:00:00Z"), studied("fa", "fa-Arab/standard", "2026-05-01T09:00:00Z")];
    expect(orderCourses(INDEX, log, byId).map((c) => c.id)).toEqual(["uz", "fa", "es"]);
    expect(orderCourses(INDEX, [], byId).map((c) => c.id)).toEqual(["es", "fa", "uz"]);
  });

  it("continues the latest course this app has, in the writing system it was studied in", () => {
    // A course this deployment no longer has is passed over.
    const log = [studied("lzh", "lzh-Hant/standard", "2026-05-04T09:00:00Z"), studied("uz", "uz-Cyrl/standard", "2026-05-03T09:00:00Z")];
    expect(resumeOf(log, INDEX)).toMatchObject({ entry: { id: "uz" }, orthography: "uz-Cyrl/standard" });
    // A writing system the course no longer has: its first.
    expect(resumeOf([studied("uz", "uz-Arab/standard", "2026-05-03T09:00:00Z")], INDEX)).toMatchObject({ entry: { id: "uz" }, orthography: "uz-Latn/standard" });
    expect(resumeOf([], INDEX)).toBeUndefined();
  });

  it("says when a course was last practised, by local dates", () => {
    const now = new Date("2026-05-20T12:00:00Z");
    const ago = (ms: number): string => lastPractised(t, new Date(now.getTime() - ms).toISOString(), now);
    const DAY = 86_400_000;
    // The time is a placeholder, so MF2 isolates it (FSI … PDI).
    expect(ago(3_600_000)).toBe("Last practised \u2068today\u2069");
    expect(ago(DAY)).toBe("Last practised \u2068yesterday\u2069");
    expect(ago(3 * DAY)).toBe("Last practised \u20683 days ago\u2069");
    expect(ago(8 * DAY)).toBe("Last practised \u2068last week\u2069");
    expect(ago(65 * DAY)).toBe("Last practised \u20682 months ago\u2069");
    // A clock that ran ahead on another device is still today.
    expect(ago(-DAY)).toBe("Last practised \u2068today\u2069");
  });
});

describe("the next step Home offers", () => {
  it("is the course page's Continue: the next lesson, named as the path names it", () => {
    const step = stepOf(fa, emptyLearnerState(), new Date("2026-05-20T12:00:00Z"), "auto", NONE_OFF);
    expect(step).toMatchObject({ kind: "path", node: { node: lessonNodes(fa)[0]?.node.id } });
    expect(stepLine(t, fa, step)).toBe("Next: \u2068Unit 1, lesson 1\u2069");
  });

  it("once the path is done and nothing is slipping, says so", () => {
    const state = { ...emptyLearnerState(), completedNodes: pathNodes(fa).map((n) => n.node.id) };
    const step = stepOf(fa, state, new Date("2026-05-20T12:00:00Z"), "auto", NONE_OFF);
    expect(step).toEqual({ kind: "done" });
    expect(stepLine(t, fa, step)).toBe(t.format("app.continue.done"));
    // Practice for words due, with none slipping, comes only then: the same line, never "0 words are slipping".
    expect(stepLine(t, fa, { kind: "practice", node: undefined, slipping: 0 })).toBe(t.format("app.continue.done"));
    expect(stepLine(t, fa, { kind: "practice", node: undefined, slipping: 12 })).toMatch(/^12 words are slipping/u);
  });
});

describe("each course's latest start, from the device's log", () => {
  let n = 0;
  const event = (type: "session_started" | "progress_reset" | "answer_submitted", course: string, orthography: string, clientTime: string): LearnerEvent => {
    const base = { id: `00000000-0000-7000-8000-${(++n).toString(16).padStart(12, "0")}`, schema: 1, device: "unit", course, orthography: orthography as OrthographyId, support: "en", bundle: "0".repeat(64), session: "00000000-0000-7000-8000-ffffffffffff", clientTime, localDate: clientTime.slice(0, 10), tz: "UTC" };
    if (type === "session_started") return { ...base, type, mode: "lesson", node: `${course}.n1`, seed: 1, exercises: 1, planner: "unit" } as LearnerEvent;
    if (type === "progress_reset") return { ...base, type } as LearnerEvent;
    return {
      ...base,
      type,
      exercise: { id: "x", template: "choose-translation", item: "s", kcs: [] },
      attempt: 1,
      input: { method: "choice", latencyMs: 1000 },
      outcome: { kind: "CORRECT", notes: [], kcs: [] },
    } as LearnerEvent;
  };

  it("finds each course's latest session start or start over, and nothing else", async () => {
    const store = await openStore();
    await store.append([
      event("session_started", "uz", "uz-Latn/standard", "2026-05-01T09:00:00Z"),
      event("session_started", "uz", "uz-Cyrl/standard", "2026-05-02T09:00:00Z"),
      event("answer_submitted", "uz", "uz-Cyrl/standard", "2026-05-02T09:01:00Z"),
      event("session_started", "fa", "fa-Arab/standard", "2026-05-03T09:00:00Z"),
      event("progress_reset", "fa", "fa-Arab/standard", "2026-05-04T09:00:00Z"),
      event("answer_submitted", "es", "es-Latn/standard", "2026-05-05T09:00:00Z"),
    ]);
    const starts = await store.latestStarts();
    expect(starts.map((e) => [e.type, e.type === "goal_set" ? undefined : e.course, e.clientTime]).sort()).toEqual([
      ["progress_reset", "fa", "2026-05-04T09:00:00Z"],
      ["session_started", "uz", "2026-05-02T09:00:00Z"],
    ]);
    expect(studiedCourses(starts)).toEqual([studied("fa", "fa-Arab/standard", "2026-05-04T09:00:00Z"), studied("uz", "uz-Cyrl/standard", "2026-05-02T09:00:00Z")]);
  });
});
