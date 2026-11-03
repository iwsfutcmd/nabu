/**
 * Phase 3 acceptance, on the Phase 4 app: Playwright completes one lesson per
 * fixture course, by keyboard (number keys, Enter, Backspace) and by touch
 * (taps; text from the device keyboard), with axe finding no serious
 * violations on any screen. Between them the two passes cover all six
 * orthographies.
 *
 * Lessons are planned from the learner's history, so each test fixes the
 * page's clock, writes the history of a learner who finished the earlier
 * lessons into the device's log, and plans the same session the app plans.
 */
import { expect, test } from "@playwright/test";
import { historyBefore, loadCourse, logOf, planned, playSession, seedLog, sessionUrl, type Mode } from "./solver.ts";

const SEED = 7;
const NOW = new Date("2026-03-10T09:00:00Z");

/** [course, orthography, lesson node] per input mode. */
const RUNS: Readonly<Record<Mode, readonly (readonly [string, string, string])[]>> = {
  keyboard: [
    ["fa", "fa-Arab/standard", "fa.book"],
    ["yue", "yue-Hant-HK/standard", "yue.who"],
    ["uz", "uz-Latn/standard", "uz.i-am"],
    ["apc", "apc-Arab/standard", "apc.cafe"],
  ],
  touch: [
    ["fa", "fa-Arab/standard", "fa.i-am"],
    ["yue", "yue-Hant-HK/standard", "yue.yum-cha"],
    ["uz", "uz-Cyrl/standard", "uz.my"],
    ["apc", "apc-Latn/arabizi", "apc.how-are-you"],
  ],
};

for (const mode of ["keyboard", "touch"] as const) {
  for (const [id, orthography, node] of RUNS[mode]) {
    test(`${mode}: ${id} (${orthography}) completes ${node}`, async ({ page }, info) => {
      test.skip(info.project.name !== mode, `the ${mode} pass runs in the ${mode} project`);
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(String(e)));
      page.on("console", (m) => {
        if (m.type() === "error") errors.push(m.text());
      });
      await page.clock.setFixedTime(NOW);

      const course = loadCourse(id, orthography);
      const history = historyBefore(course, node, NOW);
      if (history.length > 0) await seedLog(page, history);
      const request = { mode: "lesson", node } as const;
      const exercises = planned(course, history, request, NOW, SEED);
      expect(exercises.length).toBeGreaterThan(3);
      await page.goto(sessionUrl(course, request, SEED));

      const { seen, violations } = await playSession(page, exercises, mode, { axe: mode === "keyboard" });
      expect(seen).toEqual(exercises.map((e) => e.id));
      await expect(page.locator("[data-lesson-player]")).toHaveAttribute("data-state", "finished");
      await expect(page.locator("[data-xp-earned]")).toBeVisible();

      // The device's log holds the session, credited and summarized.
      await expect
        .poll(async () => (await logOf(page, id)).find((e) => e.type === "session_completed" && e.node === node))
        .toMatchObject({ mode: "lesson", orthography, summary: { completed: true, exercises: exercises.length, correctFirstTry: exercises.length, retries: 0, skipped: 0 } });
      expect(violations).toEqual([]);
      expect(errors).toEqual([]);
    });
  }
}
