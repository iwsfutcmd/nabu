/**
 * Phase 5 acceptance (gameplan §16): karaoke highlighting is within 80 ms on the fixtures.
 *
 * In the real app, a target-language prompt with a clip is played; every time the highlighted
 * token changes, the clip's own clock (currentTime) is recorded. Each token must light up
 * within 80 ms of its start in the clip's timings, which for synthesized clips are the
 * synthesizer's own word onsets.
 */
import { lessonNodes, type Exercise } from "@nabu/core/lesson";
import { expect, test } from "@playwright/test";
import { answer, expectRightAndContinue, historyBefore, loadCourse, planned, seedLog, sessionUrl, waitFor } from "./solver.ts";

const NOW = new Date("2026-03-10T09:00:00Z");
const SEED = 7;
const PROMPTED = new Set<Exercise["template"]>(["choose-translation", "translate-tap.l2-l1", "speak.tier-0"]);

declare global {
  interface Window {
    nabuAudio?: HTMLMediaElement;
    nabuKaraoke?: { token: number; ms: number }[];
  }
}

test("karaoke follows the clip within 80 ms", async ({ page }, info) => {
  test.skip(info.project.name !== "keyboard", "one desktop pass is enough");
  const course = loadCourse("fa", "fa-Arab/standard");
  // The first lesson whose plan shows a target prompt that has a clip with timings.
  let found: { node: string; exercises: readonly Exercise[]; at: number } | undefined;
  for (const { node } of lessonNodes(course)) {
    const exercises = planned(course, historyBefore(course, node.id, NOW), { mode: "lesson", node: node.id }, NOW, SEED);
    const at = exercises.findIndex((e) => PROMPTED.has(e.template) && (course.audio[e.item]?.normal.timings?.length ?? 0) > 1);
    if (at >= 0) {
      found = { node: node.id, exercises, at };
      break;
    }
  }
  if (found === undefined) throw new Error("no prompt with a timed clip in fa");
  const { node, exercises, at } = found;
  const target = exercises[at] as Exercise;
  const timings = course.audio[target.item]?.normal.timings ?? [];

  // Remember the element that plays, and record the clip's clock at each highlight change.
  await page.addInitScript(() => {
    const play = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "play")?.value as (this: HTMLMediaElement) => Promise<void>;
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
      window.nabuAudio = this;
      return play.call(this);
    };
  });
  await page.clock.setFixedTime(NOW);
  const history = historyBefore(course, node, NOW);
  if (history.length > 0) await seedLog(page, history);
  await page.goto(sessionUrl(course, { mode: "lesson", node }, SEED));
  for (const ex of exercises.slice(0, at)) {
    await waitFor(page, ex);
    await answer(page, ex, "keyboard");
    await expectRightAndContinue(page, "keyboard", ex);
  }
  await waitFor(page, target);

  await page.evaluate(() => {
    window.nabuKaraoke = [];
    const prompt = document.querySelector("[data-lesson-player] [data-ink-container=prompt]");
    if (prompt === null) throw new Error("no prompt");
    new MutationObserver(() => {
      const lit = prompt.querySelector("[data-highlight]");
      const audio = window.nabuAudio;
      if (lit === null || audio === undefined) return;
      const token = Number(lit.getAttribute("data-index"));
      const log = window.nabuKaraoke ?? [];
      if (log.at(-1)?.token !== token) log.push({ token, ms: audio.currentTime * 1000 });
    }).observe(prompt, { subtree: true, attributes: true, attributeFilter: ["data-highlight"], childList: true });
  });
  await page.locator("[data-lesson-player] [data-ink-container=prompt] [data-action=play]").click();
  await page.waitForFunction(() => window.nabuAudio?.ended === true, undefined, { timeout: 20_000 });

  const log = (await page.evaluate(() => window.nabuKaraoke)) ?? [];
  expect(log.map((l) => l.token)).toEqual(timings.map((t) => t.token));
  for (const [i, entry] of log.entries()) {
    const start = timings[i]?.startMs ?? 0;
    expect(Math.abs(entry.ms - start), `token ${entry.token}: lit at ${entry.ms.toFixed(0)} ms, starts at ${start} ms`).toBeLessThanOrEqual(80);
  }
});
