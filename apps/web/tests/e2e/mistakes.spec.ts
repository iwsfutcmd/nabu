/**
 * The mistakes count on a course's page is what a mistakes session holds. While listening is off
 * ("Can't listen now"), a mistake on a listening card waits: it is not counted, and the session
 * would leave it out. Turning listening back on counts it, and the session brings it back.
 */
import { practicableMistakes, replay } from "@nabu/core/learner";
import { LISTENING, lessonNodes } from "@nabu/core/lesson";
import type { LearnerEvent } from "@nabu/schema";
import { expect, test } from "@playwright/test";
import { freshIds, historyBefore, loadCourse, planned, seedLog, sessionUrl } from "./solver.ts";

const NOW = new Date("2026-05-12T09:00:00Z");

test.beforeEach(({ page: _ }, info) => {
  test.skip(info.project.name !== "keyboard", "one desktop pass is enough");
});

test("a listening mistake waits while listening is off, and is counted again once it is back on", async ({ page }) => {
  const course = loadCourse("apc", "apc-Arab/standard");
  const third = lessonNodes(course)[2]?.node.id;
  if (third === undefined) throw new Error("apc has three lessons");
  const history = historyBefore(course, third, NOW);
  // One listening card from those lessons, answered wrong a minute ago.
  const heard = history.flatMap((e) => (e.type === "answer_submitted" && LISTENING.has(e.exercise.template) ? [e] : []))[0];
  if (heard === undefined) throw new Error("apc's first lessons have a listening card");
  const missed: LearnerEvent = {
    ...heard,
    id: "00000000-0000-7000-8000-0000000fffff",
    clientTime: new Date(NOW.getTime() - 60_000).toISOString(),
    localDate: NOW.toISOString().slice(0, 10),
    outcome: { kind: "WRONG", notes: [], kcs: heard.exercise.kcs.map((kc) => ({ kc, status: "wrong" as const })) },
  };
  const log = freshIds([...history, missed]);
  const state = replay(log);
  expect(state.mistakes.map((m) => m.template)).toEqual([heard.exercise.template]);
  expect(practicableMistakes(course, state, { exclude: LISTENING })).toEqual([]);

  await page.clock.setFixedTime(NOW);
  await seedLog(page, log);
  // "Can't listen now" was pressed: listening is off for the next hour.
  await page.evaluate((until) => localStorage.setItem("nabu.listening-off-until", String(until)), NOW.getTime() + 3_600_000);
  await page.goto("/?sound=off#/apc/apc-Arab.standard");
  await page.reload();
  const mistakes = page.locator('[data-practice-mode="mistakes"]');
  await expect(page.locator("[data-listening-off]")).toBeVisible();
  await expect(mistakes).toHaveAttribute("aria-disabled", "true");
  await expect(mistakes).toHaveAttribute("data-count", "0");

  // Listening back on: the mistake is counted, and the session brings it back.
  await page.locator("[data-action=listening-on]").click();
  await expect(mistakes).toHaveAttribute("data-count", "1");
  const session = planned(course, log, { mode: "mistakes" }, NOW, 7);
  expect(session.map((ex) => ex.item)).toEqual([heard.exercise.item]);
  await page.goto(sessionUrl(course, { mode: "mistakes" }, 7));
  await expect(page.locator("[data-lesson-player]")).toBeVisible();
  await expect(page.locator("[data-empty-session]")).toHaveCount(0);
});
