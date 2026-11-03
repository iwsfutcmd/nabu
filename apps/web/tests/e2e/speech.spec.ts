/**
 * Phase 9 in the app: a scored speaking exercise through a real recording. Chromium's fake
 * microphone plays fixtures/yue-ngo-hai-hok-saang.wav (我係學生, synthesized with eSpeak NG:
 * synthetic speech, used only to drive the pipeline). The recording is scored on the device (tones),
 * the outcome is logged without any audio or transcript, and the learner's pitch range is kept on
 * this device only. How well tones are heard is the tone evaluation's job, not this test's.
 */
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import type { LearnerEvent } from "@nabu/schema";
import { answer, expectRightAndContinue, historyBefore, loadCourse, logOf, planned, seedLog, sessionUrl, waitFor } from "./solver.ts";

const MIC = join(import.meta.dirname, "fixtures/yue-ngo-hai-hok-saang.wav");
test.use({
  launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${MIC}`] },
  permissions: ["microphone"],
});

const NOW = new Date("2026-05-20T09:00:00Z");
const SEED = 7;

test("a scored speaking exercise: record, scored on the device, logged without audio", async ({ page }, info) => {
  test.skip(info.project.name !== "keyboard", "one desktop pass is enough");
  await page.clock.setFixedTime(NOW);
  const course = loadCourse("yue", "yue-Hant-HK/standard");
  // The first lesson whose plan has a scored speaking exercise.
  const found = ["yue.greetings", "yue.copula", "yue.who", "yue.yum-cha"].flatMap((node) => {
    const history = historyBefore(course, node, NOW);
    const exercises = planned(course, history, { mode: "lesson", node }, NOW, SEED);
    const at = exercises.findIndex((e) => e.template === "speak");
    return at < 0 ? [] : [{ node, history, exercises, at }];
  })[0];
  if (found === undefined) throw new Error("no yue lesson plans a scored speaking exercise");
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

  await page.locator("[data-action=record]").click();
  await expect(page.locator("[data-recorder=recording]")).toBeVisible();
  await page.waitForTimeout(2500); // the fake microphone plays the sentence
  await page.locator("[data-action=stop]").click();
  const feedback = page.locator("[data-feedback]");
  await expect(feedback).toBeVisible({ timeout: 15_000 });
  await expect(page.locator("[data-speech-result]")).toBeVisible();

  const logged = (await logOf(page, "yue")).find((e): e is Extract<LearnerEvent, { type: "answer_submitted" }> => e.type === "answer_submitted" && e.exercise.id === ex.id);
  expect(logged).toBeDefined();
  expect(logged?.input.method).toBe("voice");
  expect(logged?.input).not.toHaveProperty("raw"); // no transcript, no audio
  expect(["CORRECT", "PARTIAL", "WRONG"]).toContain(logged?.outcome.kind);
  // The pitch range stays on this device: three numbers, no audio.
  const range = await page.evaluate(() => localStorage.getItem("nabu.voice-calibration"));
  expect(Object.keys(JSON.parse(range ?? "{}") as object).sort()).toEqual(["frames", "mean", "sd"]);
});
