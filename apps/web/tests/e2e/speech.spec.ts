/**
 * Phase 9 in the app, through a real recording. Chromium's fake microphone plays
 * fixtures/yue-ngo-hai-hok-saang.wav (我係學生, synthesized with eSpeak NG: synthetic speech, used
 * only to drive the pipeline). Tones are not scored on the device (ADR 0093) and the e2e API runs no
 * speech server, so Cantonese speaking is rated by the learner (tier 0), as Persian's is.
 */
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { lessonNodes } from "@nabu/core/lesson";
import { answer, expectRightAndContinue, historyBefore, loadCourse, pathUrl, planned, seedLog, sessionUrl, waitFor } from "./solver.ts";

const MIC = join(import.meta.dirname, "fixtures/yue-ngo-hai-hok-saang.wav");
test.use({
  launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${MIC}`] },
  permissions: ["microphone"],
});

const NOW = new Date("2026-05-20T09:00:00Z");
const SEED = 7;

test("Cantonese speaking is rated by the learner: no tones scored on the device (ADR 0093)", async ({ page }, info) => {
  test.skip(info.project.name !== "keyboard", "one desktop pass is enough");
  await page.clock.setFixedTime(NOW);
  const course = loadCourse("yue", "yue-Hant-HK/standard");
  const plans = ["yue.greetings", "yue.copula", "yue.who", "yue.yum-cha"].map((node) => {
    const history = historyBefore(course, node, NOW);
    return { node, history, exercises: planned(course, history, { mode: "lesson", node }, NOW, SEED) };
  });
  // No scored speaking card is planned: speaking is the self-rated card.
  expect(plans.flatMap((p) => p.exercises).filter((e) => e.template === "speak" || e.template === "listen-speak")).toEqual([]);
  const found = plans.flatMap((p) => {
    const at = p.exercises.findIndex((e) => e.template === "speak.tier-0");
    return at < 0 ? [] : [{ ...p, at }];
  })[0];
  if (found === undefined) throw new Error("no yue lesson plans a speaking exercise");
  if (found.history.length > 0) await seedLog(page, found.history);
  await page.goto(sessionUrl(course, { mode: "lesson", node: found.node }, SEED));
  for (const ex of found.exercises.slice(0, found.at)) {
    await waitFor(page, ex);
    await answer(page, ex, "keyboard");
    await expectRightAndContinue(page, "keyboard", ex);
  }
  const ex = found.exercises[found.at];
  if (ex === undefined) throw new Error("no exercise");
  await waitFor(page, ex);
  const recorder = page.locator("[data-recorder]");
  await page.locator("[data-recorder] [data-action=record]").click();
  await expect(recorder).toHaveAttribute("data-recorder", "recording");
  await page.waitForTimeout(2500); // the fake microphone plays the sentence
  await page.locator("[data-recorder] [data-action=stop]").click();
  await expect(recorder).toHaveAttribute("data-recorder", "done");
  await expect(page.locator("[data-action=play-recording]")).toBeVisible();
  await expect(page.locator("[data-speech-result]")).toHaveCount(0);
});

test("rating yourself: a recording keeps going until it is stopped, then plays back", async ({ page }, info) => {
  test.skip(info.project.name !== "keyboard", "one desktop pass is enough");
  await page.clock.setFixedTime(NOW);
  // Persian has no scoring on the device: its speaking exercises are rated by the learner (tier 0).
  const course = loadCourse("fa", "fa-Arab/standard");
  const found = lessonNodes(course).flatMap(({ node }) => {
    const history = historyBefore(course, node.id, NOW);
    const exercises = planned(course, history, { mode: "lesson", node: node.id }, NOW, SEED);
    const at = exercises.findIndex((e) => e.template === "speak.tier-0");
    return at < 0 ? [] : [{ node: node.id, history, exercises, at }];
  })[0];
  if (found === undefined) throw new Error("no fa lesson plans a speaking exercise");
  if (found.history.length > 0) await seedLog(page, found.history);
  await page.goto(sessionUrl(course, { mode: "lesson", node: found.node }, SEED));
  for (const ex of found.exercises.slice(0, found.at)) {
    await waitFor(page, ex);
    await answer(page, ex, "keyboard");
    await expectRightAndContinue(page, "keyboard", ex);
  }
  const ex = found.exercises[found.at];
  if (ex === undefined) throw new Error("no exercise");
  await waitFor(page, ex);
  const recorder = page.locator("[data-recorder]");
  await page.locator("[data-recorder] [data-action=record]").click();
  await expect(recorder).toHaveAttribute("data-recorder", "recording");
  await page.waitForTimeout(1000);
  await expect(recorder).toHaveAttribute("data-recorder", "recording");
  await page.locator("[data-recorder] [data-action=stop]").click();
  await expect(recorder).toHaveAttribute("data-recorder", "done");
  await expect(page.locator("[data-action=play-recording]")).toBeVisible();
});

test("can't speak now: a speaking card can be put off, and speaking stays out for an hour", async ({ page }, info) => {
  test.skip(info.project.name !== "keyboard", "one desktop pass is enough");
  await page.clock.setFixedTime(NOW);
  const course = loadCourse("yue", "yue-Hant-HK/standard");
  const found = ["yue.greetings", "yue.copula", "yue.who", "yue.yum-cha"].flatMap((node) => {
    const history = historyBefore(course, node, NOW);
    const exercises = planned(course, history, { mode: "lesson", node }, NOW, SEED);
    const at = exercises.findIndex((e) => e.template === "speak.tier-0");
    return at < 0 ? [] : [{ node, history, exercises, at }];
  })[0];
  if (found === undefined) throw new Error("no yue lesson plans a speaking exercise");
  if (found.history.length > 0) await seedLog(page, found.history);
  await page.goto(sessionUrl(course, { mode: "lesson", node: found.node }, SEED));
  for (const ex of found.exercises.slice(0, found.at)) {
    await waitFor(page, ex);
    await answer(page, ex, "keyboard");
    await expectRightAndContinue(page, "keyboard", ex);
  }
  const ex = found.exercises[found.at];
  if (ex === undefined) throw new Error("no exercise");
  await waitFor(page, ex);
  await page.locator("[data-action=cant-speak]").click();
  // The card moves on, and no speaking card comes up again in this session.
  await expect(page.locator("[data-lesson-player]")).not.toHaveAttribute("data-exercise", ex.id);
  await page.locator("[data-action=quit]").click();
  await page.goto(pathUrl(course, SEED));
  await expect(page.locator("[data-speaking-off]")).toBeVisible();
  await page.locator("[data-action=speaking-on]").click();
  await expect(page.locator("[data-speaking-off]")).toHaveCount(0);
});
