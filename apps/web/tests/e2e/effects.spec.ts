/**
 * Sound effects (a chime when an answer is right, a soft tone when wrong, a flourish at the end):
 * they play in a lesson while sound is on, and Preferences turns them off on their own, leaving
 * sound on. The test counts the oscillators the page starts (the effects are synthesized; clips are
 * <audio> elements), in a course without audio.
 */
import { expect, test, type Page } from "@playwright/test";
import { loadCourse, planned, playSession, sessionUrl } from "./solver.ts";

const SEED = 7;
const NOW = new Date("2026-03-10T09:00:00Z");
const NODE = "chg.u01.bread-and-tea";

test.beforeEach(async ({ page }, info) => {
  test.skip(info.project.name !== "keyboard", "one desktop pass is enough");
  await page.clock.setFixedTime(NOW);
  // Count the oscillators the page starts.
  await page.addInitScript(() => {
    const w = window as unknown as { __oscillators: number; AudioContext: typeof AudioContext };
    const Base = w.AudioContext;
    w.__oscillators = 0;
    w.AudioContext = class extends Base {
      override createOscillator(): OscillatorNode {
        w.__oscillators += 1;
        return super.createOscillator();
      }
    };
  });
});

const oscillators = (page: Page): Promise<number> => page.evaluate(() => (window as unknown as { __oscillators: number }).__oscillators);

/** The lesson with sound on (the solver's session URL turns it off). */
const playLesson = async (page: Page): Promise<void> => {
  const course = loadCourse("chg", "chg-Arab/standard");
  const request = { mode: "lesson", node: NODE } as const;
  const exercises = planned(course, [], request, NOW, SEED);
  await page.goto(sessionUrl(course, request, SEED).replace("&sound=off", ""));
  await playSession(page, exercises, "keyboard");
  await expect(page.locator("[data-lesson-player]")).toHaveAttribute("data-state", "finished");
};

test("right answers sound a chime while sound is on", async ({ page }) => {
  await playLesson(page);
  // Every right answer chimes (two bell notes of three partials), and the lesson ends with a flourish.
  expect(await oscillators(page)).toBeGreaterThanOrEqual(12);
});

test("sound effects are turned off in Preferences, apart from sound", async ({ page }) => {
  await page.goto("/#/preferences");
  const effects = page.locator("[data-preference=effects]");
  await expect(effects.locator("[data-effects-choice=on] input")).toBeChecked();
  await effects.locator("[data-effects-choice=off]").click();
  await expect(effects.locator("[data-effects-choice=off] input")).toBeChecked();
  // Sound itself stays on.
  await expect(page.locator("[data-preference=sound] [data-sound-choice=on] input")).toBeChecked();

  await playLesson(page);
  expect(await oscillators(page)).toBe(0);
});
