/**
 * Phase 3 acceptance, on the Phase 4 app: Playwright completes one lesson per
 * fixture course, by keyboard (number keys, Enter, Backspace) and by touch
 * (taps; text from the device keyboard), with axe finding no serious
 * violations on any screen. Between them the two passes cover every
 * orthography.
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
    ["lzh", "lzh-Hant/standard", "lzh.u01.well-said"],
    ["es", "es-Latn/standard", "es.u01.como-estas"],
    ["hbo", "hbo-Hebr/tiberian", "hbo.u01.light"],
    ["tok", "tok-Latn/standard", "tok.u01.hello"],
  ],
  touch: [
    ["fa", "fa-Arab/standard", "fa.i-am"],
    ["yue", "yue-Hant-HK/standard", "yue.yum-cha"],
    ["uz", "uz-Cyrl/standard", "uz.my"],
    ["apc", "apc-Latn/arabizi", "apc.how-are-you"],
    ["lzh", "lzh-Hant/standard", "lzh.u01.it-is"],
    ["es", "es-Latn/standard", "es.u01.soy"],
    ["hbo", "hbo-Hebr/tiberian", "hbo.u01.the-day"],
    ["tok", "tok-Qaap/sitelen-pona", "tok.u01.person"],
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

test("Cantonese words show their Jyutping, as sentences do, and the toggle hides it", async ({ page }, info) => {
  test.skip(info.project.name !== "keyboard", "one desktop pass is enough");
  await page.clock.setFixedTime(NOW);
  const course = loadCourse("yue", "yue-Hant-HK/standard");
  const request = { mode: "lesson", node: "yue.greetings" } as const;
  const [first] = planned(course, [], request, NOW, SEED);
  expect(first?.template).toBe("match-pairs");
  await page.goto(sessionUrl(course, request, SEED));
  const player = page.locator("[data-lesson-player]");
  await expect(player).toHaveAttribute("data-state", "answering");
  // Every word on the Cantonese side carries its reading.
  const words = player.locator("[data-pair^=left]");
  await expect(words).not.toHaveCount(0);
  for (const word of await words.all()) await expect(word.locator("rt")).not.toHaveCount(0);
  await page.locator("[data-toggle=readings]").click();
  await expect(player.locator("rt")).toHaveCount(0);
});

test("Classical Chinese shows no readings until the learner picks one, and keeps the choice (ADR 0071)", async ({ page }, info) => {
  test.skip(info.project.name !== "keyboard", "one desktop pass is enough");
  await page.clock.setFixedTime(NOW);
  const course = loadCourse("lzh", "lzh-Hant/standard");
  const request = { mode: "lesson", node: "lzh.u01.well-said" } as const;
  const exercises = planned(course, [], request, NOW, SEED);
  // Read and written only: nothing to hear, say or transcribe.
  expect(exercises.map((e) => e.template).filter((t) => /speak|listen|tone|char-read|reading|transcribe/u.test(t))).toEqual([]);
  await page.goto(sessionUrl(course, request, SEED));
  const player = page.locator("[data-lesson-player]");
  await expect(player).toHaveAttribute("data-state", "answering");
  await expect(player.locator("rt")).toHaveCount(0);
  const readings = page.locator("[data-toggle=readings]");
  await expect(readings.locator("[data-reading]")).toHaveText(["Off", "Pinyin", "Jyutping", "Middle Chinese (Baxter)"]);
  await readings.locator("[data-reading=pinyin]").click();
  await expect(player.locator("rt").first()).toHaveAttribute("lang", "zh-Latn-pinyin");
  await expect(player.getByText("shàn").first()).toBeVisible();
  await readings.locator("[data-reading=baxter]").click();
  await expect(player.locator("rt").first()).toHaveAttribute("lang", "ltc-Latn-x-baxter");
  await expect(player.getByText("dzyenX").first()).toBeVisible();
  // The next session starts with the layer the learner chose.
  await page.goto(sessionUrl(course, { mode: "lesson", node: "lzh.u01.it-is" }, SEED));
  await expect(page.locator("[data-lesson-player]")).toHaveAttribute("data-state", "answering");
  await expect(page.locator("[data-lesson-player] rt").first()).toHaveAttribute("lang", "ltc-Latn-x-baxter");
  await page.locator("[data-toggle=readings] [data-reading=off]").click();
  await expect(page.locator("[data-lesson-player] rt")).toHaveCount(0);
});

