/**
 * Phase 3 acceptance: Playwright completes one lesson per fixture course, by
 * keyboard (number keys, Enter, Backspace) and by touch (taps; text from the
 * device keyboard), with axe finding no serious violations on any screen.
 * Between them the two passes cover all six orthographies and every template.
 */
import { expect, test } from "@playwright/test";
import { answer, expectRightAndContinue, lesson, lessonUrl, loadCourse, seriousAxeViolations, waitFor, type Mode } from "./solver.ts";

const SEED = 7;

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

      const course = loadCourse(id, orthography);
      const exercises = lesson(course, node, SEED);
      expect(exercises.length).toBeGreaterThan(3);
      await page.goto(lessonUrl(id, orthography, node, SEED));

      const violations: string[] = [];
      for (const ex of exercises) {
        await waitFor(page, ex);
        if (mode === "keyboard") violations.push(...(await seriousAxeViolations(page)).map((v) => `${ex.id}: ${v}`));
        await answer(page, ex, mode);
        await expect(page.locator("[data-feedback]")).toBeVisible();
        if (mode === "keyboard") violations.push(...(await seriousAxeViolations(page)).map((v) => `${ex.id} feedback: ${v}`));
        await expectRightAndContinue(page, mode, ex);
      }

      await expect(page.locator("[data-lesson-player]")).toHaveAttribute("data-state", "finished");
      const summary = await page.evaluate(() => window.nabuEvents?.at(-1));
      expect(summary).toEqual({
        type: "session_completed",
        lesson: node,
        summary: { completed: true, exercises: exercises.length, correctFirstTry: exercises.length, retries: 0, skipped: 0 },
      });
      if (mode === "keyboard") violations.push(...(await seriousAxeViolations(page)).map((v) => `summary: ${v}`));
      expect(violations).toEqual([]);
      expect(errors).toEqual([]);
    });
  }
}
