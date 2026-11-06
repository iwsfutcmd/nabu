/**
 * Phase 4 acceptance for the local-first app (gameplan §16): with no account
 * and no server, a learner's progress lives in the device's event log and
 * survives reloads. One learner's first days in Persian:
 *   day 1, 09:00  lesson 1, one answer wrong: lesson 2 opens, one mistake is open
 *   (reload)      the path, XP and the mistake are still there
 *   day 1, 09:10  the mistakes session fixes it
 *   day 2         a review session; XP grows, and survives another reload
 * Each session is planned by the test from the log the page holds, at the
 * page's (fixed) clock, and must match what the app shows exercise by exercise.
 */
import { emptyLearnerState, pathNodes, placementOf, plan } from "@nabu/core/learner";
import { lessonNodes, runTest, type Exercise } from "@nabu/core/lesson";
import { expect, test, type Page } from "@playwright/test";
import { activate, canMiss, loadCourse, logOf, pathUrl, planned, playSession, type Mode } from "./solver.ts";

const SEED = 11;
const DAY = 86_400_000;

const statusOf = (page: Page, node: string) => page.locator(`[data-lesson="${node}"]`);
const practice = (page: Page, mode: "review" | "mistakes") => page.locator(`[data-practice-mode="${mode}"]`);
const xp = async (page: Page): Promise<number> => Number(await page.locator("[data-xp]").getAttribute("data-xp"));

test("progress, mistakes and review live on the device", async ({ page }, info) => {
  const mode = info.project.name as Mode;
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const course = loadCourse("fa", "fa-Arab/standard");
  const [first, second] = lessonNodes(course).map((n) => n.node.id);
  if (first === undefined || second === undefined) throw new Error("fa needs two lessons");

  // Day 1: a fresh device. Only the first lesson is open; nothing to practise yet.
  let now = new Date("2026-03-10T09:00:00Z");
  await page.clock.setFixedTime(now);
  await page.goto(pathUrl(course, SEED));
  await expect(statusOf(page, first)).toHaveAttribute("data-status", "available");
  await expect(statusOf(page, second)).toHaveAttribute("data-status", "locked");
  await expect(practice(page, "review")).toHaveAttribute("aria-disabled", "true");
  await expect(practice(page, "mistakes")).toHaveAttribute("aria-disabled", "true");
  expect(await xp(page)).toBe(0);

  const lesson = planned(course, [], { mode: "lesson", node: first }, now, SEED);
  const missed = lesson.find(canMiss);
  if (missed === undefined) throw new Error("no exercise to miss");
  await activate(page, mode, `[data-lesson="${first}"]`);
  const played = await playSession(page, lesson, mode, { miss: new Set([missed.id]) });
  expect(played.seen).toContain(`${missed.id}#2`);
  await expect(page.locator("[data-xp-earned]")).toBeVisible();
  await activate(page, mode, "[data-action=exit]");

  const afterLesson = async (): Promise<void> => {
    await expect(statusOf(page, first)).toHaveAttribute("data-status", "done");
    await expect(statusOf(page, second)).toHaveAttribute("data-status", "available");
    await expect(practice(page, "mistakes")).toHaveAttribute("data-count", "1");
    await expect(practice(page, "review")).not.toHaveAttribute("aria-disabled", "true");
  };
  await afterLesson();
  const xpAfterLesson = await xp(page);
  expect(xpAfterLesson).toBeGreaterThan(10);

  // Reload: everything comes back from IndexedDB.
  await page.reload();
  await afterLesson();
  expect(await xp(page)).toBe(xpAfterLesson);

  // Ten minutes later: the mistakes session brings the missed exercise back.
  now = new Date(now.getTime() + 10 * 60_000);
  await page.clock.setFixedTime(now);
  const fix = planned(course, await logOf(page, "fa"), { mode: "mistakes" }, now, SEED);
  expect(fix.map((e) => e.item)).toContain(missed.item);
  await activate(page, mode, '[data-practice-mode="mistakes"]');
  await playSession(page, fix, mode);
  await activate(page, mode, "[data-action=exit]");
  await expect(practice(page, "mistakes")).toHaveAttribute("aria-disabled", "true");

  // The next day: a review session.
  now = new Date(now.getTime() + DAY);
  await page.clock.setFixedTime(now);
  await page.reload();
  const before = await xp(page);
  const review = planned(course, await logOf(page, "fa"), { mode: "review" }, now, SEED);
  expect(review.length).toBeGreaterThanOrEqual(5);
  await activate(page, mode, '[data-practice-mode="review"]');
  await playSession(page, review, mode);
  await activate(page, mode, "[data-action=exit]");
  await expect.poll(() => xp(page)).toBeGreaterThan(before);
  const total = await xp(page);
  await page.reload();
  await expect(page.locator("[data-xp]")).toHaveAttribute("data-xp", String(total));
  await expect(page.locator("[data-xp-today]")).toHaveAttribute("data-xp-today", String(total - before));
  expect(errors).toEqual([]);
});

test("placement: a learner who knows the first units starts after them", async ({ page }, info) => {
  const mode = info.project.name as Mode;
  const course = loadCourse("uz", "uz-Latn/standard");
  const now = new Date("2026-03-12T07:45:00Z");
  await page.clock.setFixedTime(now);
  await page.goto(pathUrl(course, SEED));

  // The test is adaptive (ADR 0075): what it asks depends on the answers. This learner knows the
  // first two units, and misses what they can miss after that, so the questions are known ahead.
  const planned = plan(course, emptyLearnerState(), { mode: "placement" }, { now: now.toISOString(), seed: SEED }).placement;
  if (planned === undefined) throw new Error("no placement test");
  const units = planned.test.blocks.map((b) => b.id);
  const unitOf = new Map(course.units.flatMap((u) => u.sentences.map((s) => [s.id, u.id] as const)));
  const knows = (e: Exercise): boolean => units.indexOf(unitOf.get(e.item) ?? "") < 2 || !canMiss(e);
  const answers = new Map<string, boolean>();
  const asked: Exercise[] = [];
  for (let next = runTest(planned.test, answers).next; next.length > 0; next = runTest(planned.test, answers).next) {
    const ex = next[0] as Exercise;
    asked.push(ex);
    answers.set(ex.id, knows(ex));
  }
  const placed = placementOf(planned, answers);
  const path = pathNodes(course);
  // The first two units, lessons and stories, then lessons of the third as far as its probes go
  // (this solver can miss only multiple-choice questions, so its tiles are always right).
  const firstTwo = path.filter((n) => units.indexOf(n.unit.id) < 2).map((n) => n.node.id);
  expect(placed.slice(0, firstTwo.length)).toEqual(firstTwo);
  expect(placed.every((n) => path.findIndex((p) => p.node.id === n) < path.findIndex((p) => p.unit.id === units[3]))).toBe(true);
  const next = path.find((n) => !placed.includes(n.node.id));
  if (next === undefined) throw new Error("this learner should not place out of everything");
  const nodeAt = (id: string) => page.locator(`[data-lesson="${id}"], [data-story-node="${id}"]`);

  await activate(page, mode, '[data-practice-mode="placement"]');
  const played = await playSession(page, asked, mode, { miss: new Set(asked.filter((e) => !knows(e)).map((e) => e.id)) });
  expect(played.seen).toEqual(asked.map((e) => e.id)); // asked once each, as the answers decided
  await activate(page, mode, "[data-action=exit]");

  // Lessons and stories: a unit passed places out of both.
  for (const node of placed) await expect(nodeAt(node)).toHaveAttribute("data-status", "done");
  await expect(nodeAt(next.node.id)).toHaveAttribute("data-status", "available");
  await expect(page.locator('[data-practice-mode="placement"]')).toHaveCount(0);
  await page.reload();
  await expect(nodeAt(next.node.id)).toHaveAttribute("data-status", "available");
});


