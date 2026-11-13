/**
 * Continue and the learning pace (ADR 0105): the course page's main action goes to the next lesson,
 * or to practice first once enough words are slipping, with "New lesson anyway" beside it (D6); a
 * line says why, and the learner can set the pace themselves (D5), which this device remembers.
 */
import { continueOf, paceOf, replay } from "@nabu/core/learner";
import { lessonNodes } from "@nabu/core/lesson";
import { expect, test } from "@playwright/test";
import { freshIds, historyBefore, loadCourse, seedLog, seriousAxeViolations } from "./solver.ts";

const NOW = new Date("2026-05-12T09:00:00Z");
const DAY = 86_400_000;

test.beforeEach(({ page: _ }, info) => {
  test.skip(info.project.name !== "keyboard", "one desktop pass is enough");
});

test("Continue starts the next lesson, and a pace the learner sets is kept", async ({ page }) => {
  const course = loadCourse("fa", "fa-Arab/standard");
  const first = lessonNodes(course)[0]?.node.id;
  await page.clock.setFixedTime(NOW);
  await page.goto("/?sound=off#/fa/fa-Arab.standard");
  const area = page.locator("[data-continue]");
  await expect(area).toHaveAttribute("data-continue", "path");
  await expect(area.locator("[data-action=continue]")).toHaveAttribute("href", new RegExp(`${first ?? "-"}`));
  await expect(area.locator("[data-action=new-lesson]")).toHaveCount(0);
  expect(await seriousAxeViolations(page, "[data-continue]")).toEqual([]);

  await area.locator("[data-field=pace]").selectOption("accelerate");
  await expect(area).toHaveAttribute("data-pace", "accelerate");
  await expect(area).toHaveAttribute("data-pace-reason", "chosen");
  await expect(area.locator("[data-pace-line]")).toBeVisible();
  await page.reload();
  await expect(page.locator("[data-continue] [data-field=pace]")).toHaveValue("accelerate");
  await page.locator("[data-continue] [data-field=pace]").selectOption("auto");
  await expect(page.locator("[data-continue]")).toHaveAttribute("data-pace-reason", "steady");
});

test("with many words slipping, Continue offers practice first and a new lesson anyway", async ({ page }) => {
  const course = loadCourse("fa", "fa-Arab/standard");
  const lessons = lessonNodes(course);
  const node = lessons[Math.min(20, lessons.length - 1)]?.node.id;
  if (node === undefined) throw new Error("fa has lessons");
  // Lessons done a month ago and nothing since: their words have slipped.
  const history = freshIds(historyBefore(course, node, new Date(NOW.getTime() - 30 * DAY)));
  const pace = paceOf(course, replay(history), NOW.toISOString());
  const to = continueOf(course, replay(history), pace);
  expect(to.kind).toBe("practice");

  await page.clock.setFixedTime(NOW);
  await seedLog(page, history);
  await page.goto("/?sound=off#/fa/fa-Arab.standard");
  const area = page.locator("[data-continue]");
  await expect(area).toHaveAttribute("data-continue", "practice");
  await expect(area).toHaveAttribute("data-pace", pace.band);
  await expect(area.locator("[data-pace-line]")).toBeVisible();
  // Beside it, the next node on the path, whatever its kind (here, a story the history skipped).
  const next = to.kind === "practice" ? to.next?.node : undefined;
  if (next === undefined) throw new Error("the path goes on");
  await expect(area.locator("[data-action=new-lesson]")).toHaveAttribute("href", new RegExp(next.replace(/\./gu, "\\.")));
  await area.locator("[data-action=continue]").click();
  await expect(page.locator("[data-lesson-player]")).toBeVisible();
  expect(page.url()).toContain("review");
});
