/**
 * Words met in passages (ADR 0144): chg's last passage introduces words no lesson teaches. A learner
 * who took every lesson before it (a placement test) reads the passage, its new words listed before
 * its first line; the path then shows its drill, open while the next node needs nothing of it, and
 * the drill session, planned as the solver plans it, is played to its end by keyboard and by touch,
 * the words typed from their glosses. The drill is then done.
 */
import { drillNodes, type CourseView } from "@nabu/core/lesson";
import { placedKcs, pathNodes } from "@nabu/core/learner";
import type { LearnerEvent, OrthographyId } from "@nabu/schema";
import { expect, test } from "@playwright/test";
import { activate, loadCourse, pathUrl, planned, playSession, seedLog, seriousAxeViolations, sessionUrl } from "./solver.ts";

const NOW = new Date("2026-06-02T08:00:00Z");
const SEED = 9;

/**
 * The log of a learner placed out of every lesson before `story` (its words seeded, ADR 0111) who
 * has read every story up to it, `story` too.
 */
const readUpTo = (course: CourseView, story: string, at: Date): LearnerEvent[] => {
  const path = pathNodes(course);
  const before = path.slice(0, path.findIndex((e) => e.node.id === story) + 1);
  const placed = before.filter((e) => e.kind === "lesson").map((e) => e.node.id);
  const stories = before.filter((e) => e.kind === "story").map((e) => e.node.id);
  let n = 0;
  const base = (seconds: number, session: string) => {
    const time = new Date(at.getTime() + seconds * 1000).toISOString();
    return {
      id: `00000000-0000-7000-9000-${(++n).toString(16).padStart(12, "0")}`,
      schema: 1 as const,
      device: "e2e-drill",
      course: course.id,
      orthography: course.orthography as OrthographyId,
      support: course.supportKey,
      bundle: "0".repeat(64),
      session,
      clientTime: time,
      localDate: time.slice(0, 10),
      tz: "UTC",
    };
  };
  const summary = { completed: true, exercises: 0, correctFirstTry: 0, retries: 0, skipped: 0 };
  const placement = "00000000-0000-7000-9000-0000000000ff";
  const events: LearnerEvent[] = [
    { ...base(0, placement), type: "session_started", mode: "placement", seed: 1, exercises: 10, planner: "e2e" },
    { ...base(300, placement), type: "session_completed", mode: "placement", placed, seeded: placedKcs(course, placed), summary: { ...summary, exercises: 10, correctFirstTry: 10 } },
  ];
  stories.forEach((node, i) => {
    const session = `00000000-0000-7000-9000-${(0x1000 + i).toString(16).padStart(12, "0")}`;
    events.push({ ...base(400 + 2 * i, session), type: "session_started", mode: "story", node, seed: 1, exercises: 0, planner: "e2e" });
    events.push({ ...base(401 + 2 * i, session), type: "session_completed", mode: "story", node, summary });
  });
  return events;
};

test("a passage's new words, then its drill: each word presented, recognized and typed", async ({ page }, info) => {
  const course = loadCourse("chg", "chg-Arab/standard");
  const [drill] = drillNodes(course);
  const session = drill?.sessions[0];
  if (drill === undefined || session === undefined || drill.story === undefined) throw new Error("chg has a drill node");
  const mode = info.project.name === "touch" ? "touch" : "keyboard";
  const log = readUpTo(course, drill.node.drill.story, new Date(NOW.getTime() - 3_600_000));
  await page.clock.setFixedTime(NOW);
  await seedLog(page, log);

  // The passage lists its new words before its first line, each with its meaning.
  await page.goto(`/?seed=${SEED}&sound=off#/chg/chg-Arab.standard/story/${encodeURIComponent(drill.node.drill.story)}`);
  const words = page.locator("[data-story-reader] [data-new-words] [data-word]");
  await expect(words).toHaveCount(session.words.length);
  for (const kc of session.words) await expect(page.locator(`[data-new-words] [data-word="${kc.id}"] dd`)).not.toBeEmpty();

  // The path: the drill is open, nothing done, and shows the words it brings in.
  await page.goto(pathUrl(course, SEED));
  const entry = page.locator(`[data-drill-node="${drill.node.id}"]`);
  await expect(entry).toHaveAttribute("data-status", "available");
  await expect(entry.locator("[data-drill-progress]")).toHaveAttribute("data-drill-progress", `0/${String(drill.sessions.length)}`);
  expect(await seriousAxeViolations(page, "[data-course-path]")).toEqual([]);

  // The drill session, as the solver plans it: played to its end.
  const exercises = planned(course, log, { mode: "lesson", node: session.id }, NOW, SEED);
  expect(exercises.some((ex) => ex.template === "write-word" || ex.template === "complete-translation")).toBe(true);
  await activate(page, mode, `[data-drill-node="${drill.node.id}"]`);
  await expect(page).toHaveURL(new RegExp(`${encodeURIComponent(session.id).replace(/\./gu, "\\.")}$`, "u"));
  const { violations } = await playSession(page, exercises, mode);
  expect(violations).toEqual([]);

  // Done: the path says so.
  await page.goto(pathUrl(course, SEED));
  await expect(page.locator(`[data-drill-node="${drill.node.id}"]`)).toHaveAttribute("data-status", "done");
});

test("the drill session's URL opens it as a lesson", async ({ page }) => {
  const course = loadCourse("chg", "chg-Arab/standard");
  const [drill] = drillNodes(course);
  const session = drill?.sessions[0];
  if (drill === undefined || session === undefined) throw new Error("chg has a drill node");
  const log = readUpTo(course, drill.node.drill.story, new Date(NOW.getTime() - 3_600_000));
  await page.clock.setFixedTime(NOW);
  await seedLog(page, log);
  await page.goto(sessionUrl(course, { mode: "lesson", node: session.id }, SEED));
  await expect(page.locator("[data-lesson-player]")).toHaveAttribute("data-state", "answering");
  await expect(page).toHaveTitle(/Words of the story, 1 of 1/u);
});
