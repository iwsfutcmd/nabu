/**
 * The next step at the end of a session (ADR 0113, D34): after a lesson it is the course page's
 * Continue (practice first once enough words are slipping, with the next lesson beside it); right
 * after practice it is the next lesson or story on the path, whatever Continue says, with more
 * practice beside it.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { continueOf, paceOf, plan, replay, type PathNode } from "@nabu/core/learner";
import { assembleCourse, lessonNodes, MEDIA_ROLES, type CourseView } from "@nabu/core/lesson";
import { createTranslator, sourceCatalog } from "@nabu/i18n";
import type { BundleManifest, LearnerEvent, OrthographyId } from "@nabu/schema";
import { describe, expect, it } from "vitest";
import { nextStepOf, practises } from "../../src/session-end.ts";

const ROOT = resolve(import.meta.dirname, "../../../..");
const BUNDLES = join(ROOT, "apps/web/public/bundles");
const numberingSystems = JSON.parse(readFileSync(join(ROOT, "packages/i18n/src/generated/numbering-systems.json"), "utf8")) as Record<string, string>;
const manifest = JSON.parse(readFileSync(join(BUNDLES, "fa", "manifest.json"), "utf8")) as BundleManifest;

const loadCourse = (): CourseView => {
  const files = new Map<string, unknown>(manifest.files.filter((f) => !MEDIA_ROLES.has(f.role)).map((f) => [f.path, JSON.parse(readFileSync(join(BUNDLES, "fa", f.path), "utf8")) as unknown]));
  const course = assembleCourse({ manifest, files, numberingSystems });
  if (!course.ok) throw new Error(JSON.stringify(course.error));
  return course.value;
};

const course = loadCourse();
const NOW = new Date("2026-05-12T09:00:00Z");
const DAY = 86_400_000;
const t = createTranslator({ locale: "en", catalogs: [sourceCatalog()] });

/** A learner who did every lesson before `node` around `at`, every answer right: the events their device holds. */
const historyBefore = (node: string, at: Date): LearnerEvent[] => {
  const lessons = lessonNodes(course).map((n) => n.node.id);
  const events: LearnerEvent[] = [];
  let n = 0;
  let clock = at.getTime();
  const uuid = (): string => `00000000-0000-7000-8000-${(++n).toString(16).padStart(12, "0")}`;
  for (const id of lessons.slice(0, lessons.indexOf(node))) {
    const exercises = plan(course, replay(events), { mode: "lesson", node: id }, { now: new Date(clock).toISOString(), seed: 1 }).exercises;
    const session = uuid();
    const base = () => {
      clock += 10_000;
      const time = new Date(clock).toISOString();
      const common = { id: uuid(), schema: 1 as const, device: "unit", course: course.id, orthography: course.orthography as OrthographyId, support: course.supportKey, bundle: manifest.id };
      return { ...common, session, clientTime: time, localDate: time.slice(0, 10), tz: "UTC" };
    };
    events.push({ ...base(), type: "session_started", mode: "lesson", node: id, seed: 1, exercises: exercises.length, planner: "unit" });
    for (const ex of exercises) {
      events.push({
        ...base(),
        type: "answer_submitted",
        exercise: { id: ex.id, template: ex.template, item: ex.item, kcs: [...ex.kcs] },
        attempt: 1,
        input: { method: "choice", latencyMs: 3000 },
        outcome: { kind: "CORRECT", notes: [], kcs: ex.kcs.map((kc) => ({ kc, status: "right" as const })) },
      });
    }
    const graded = exercises.filter((e) => e.template !== "speak.tier-0").length;
    events.push({ ...base(), type: "session_completed", mode: "lesson", node: id, summary: { completed: true, exercises: graded, correctFirstTry: graded, retries: 0, skipped: 0 } });
  }
  return events;
};

const REVIEW = "#/fa/review";
const hrefOf = (node: PathNode): string => `#/fa/${node.node}`;

/** What the end of a session offers after this history, and where each of its buttons goes. */
const endOf = (events: readonly LearnerEvent[], practised: boolean) => {
  const state = replay(events);
  const went: string[] = [];
  const next = nextStepOf({ course, state, now: NOW, pace: "auto", hrefOf, review: REVIEW, practised, go: (to) => went.push(to), t });
  const continued = continueOf(course, state, paceOf(course, state, NOW.toISOString()));
  const go = (): readonly string[] => {
    next?.go();
    return went.splice(0);
  };
  const beside = (): readonly string[] => {
    next?.beside?.go();
    return went.splice(0);
  };
  return { next, continued, go, beside };
};

/** What the end screen calls the path node: a lesson or the story. */
const kindOf = (node: PathNode | undefined): string | undefined => (node === undefined ? undefined : node.kind === "story" ? "story" : "lesson");

describe("the next step at the end of a session", () => {
  const lessons = lessonNodes(course);
  const late = lessons[Math.min(20, lessons.length - 1)]?.node.id;
  const early = lessons[2]?.node.id;
  if (late === undefined || early === undefined) throw new Error("fa has lessons");
  // Lessons done a month ago and nothing since: their words have slipped, and Continue says practice first.
  const slipped = historyBefore(late, new Date(NOW.getTime() - 30 * DAY));
  // Two lessons done two days ago: Continue says the next lesson.
  const fresh = historyBefore(early, new Date(NOW.getTime() - 2 * DAY));

  it("counts review, mistakes and any other practice as practice; not a lesson, a story or a placement test", () => {
    expect((["review", "mistakes"] as const).map(practises)).toEqual([true, true]);
    expect((["lesson", "story", "placement"] as const).map(practises)).toEqual([false, false, false]);
  });

  it("after a lesson, offers what Continue does: practice first and why, the next lesson beside it", () => {
    const end = endOf(slipped, false);
    expect(end.continued.kind).toBe("practice");
    const node = end.continued.kind === "practice" ? end.continued.next : undefined;
    if (node === undefined) throw new Error("the path goes on");
    expect(end.next?.to).toEqual({ kind: "practice" });
    expect(end.next?.why).toMatch(/words are slipping/u);
    expect(end.next?.beside?.to.kind).toBe(kindOf(node));
    expect(end.go()).toEqual([REVIEW]);
    expect(end.beside()).toEqual([hrefOf(node)]);
  });

  it("right after practice, offers the next lesson whatever Continue says, more practice beside it (D34)", () => {
    const end = endOf(slipped, true);
    // Continue would still say practice first.
    expect(end.continued.kind).toBe("practice");
    const node = end.continued.kind === "practice" ? end.continued.next : undefined;
    if (node === undefined) throw new Error("the path goes on");
    expect(end.next?.to.kind).toBe(kindOf(node));
    expect(end.next?.why).toBeUndefined();
    expect(end.next?.beside?.to).toEqual({ kind: "practice" });
    expect(end.go()).toEqual([hrefOf(node)]);
    expect(end.beside()).toEqual([REVIEW]);
  });

  it("right after practice with few words slipping: the next lesson, more practice still beside it (D34)", () => {
    const end = endOf(fresh, true);
    if (end.continued.kind !== "path") throw new Error(`Continue says ${end.continued.kind}`);
    expect(end.next?.to).toEqual({ kind: "lesson", number: 3 });
    expect(end.next?.beside?.to).toEqual({ kind: "practice" });
    expect(end.go()).toEqual([hrefOf(end.continued.next)]);
    expect(end.beside()).toEqual([REVIEW]);
  });

  it("after a lesson with few words slipping: the next lesson, and nothing beside it", () => {
    const end = endOf(fresh, false);
    expect(end.next?.to).toEqual({ kind: "lesson", number: 3 });
    expect(end.next?.beside).toBeUndefined();
    expect(end.next?.why).toBeUndefined();
  });
});
