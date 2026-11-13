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
import { lessonNodes } from "@nabu/core/lesson";
import { expect, test } from "@playwright/test";
import { answer, expectRightAndContinue, graded, historyBefore, loadCourse, logOf, planned, playSession, seedLog, sessionUrl, waitFor, type Mode } from "./solver.ts";

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
        .toMatchObject({ mode: "lesson", orthography, summary: { completed: true, exercises: graded(exercises), correctFirstTry: graded(exercises), retries: 0, skipped: 0 } });
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
  // The readings switch is in the header's display menu (P12).
  await page.locator("[data-lesson-player] [data-action=display]").click();
  await page.locator("[data-display-menu] [data-toggle=readings]").click();
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
  // The choice is in the header's display menu (P12).
  await page.locator("[data-lesson-player] [data-action=display]").click();
  const readings = page.locator("[data-display-menu] [data-toggle=readings]");
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
  await page.locator("[data-lesson-player] [data-action=display]").click();
  await page.locator("[data-display-menu] [data-toggle=readings] [data-reading=off]").click();
  await expect(page.locator("[data-lesson-player] rt")).toHaveCount(0);
});

test("vertical text on a phone keeps the readings, turns only the Cantonese and leaves Check in sight (W6)", async ({ page }, info) => {
  test.skip(info.project.name !== "touch", "a phone: the touch pass");
  await page.clock.setFixedTime(NOW);
  const course = loadCourse("yue", "yue-Hant-HK/standard");
  const node = "yue.yum-cha";
  const history = historyBefore(course, node, NOW);
  if (history.length > 0) await seedLog(page, history);
  const exercises = planned(course, history, { mode: "lesson", node }, NOW, SEED);
  const [first] = exercises;
  if (first?.template !== "translate-tap.l1-l2") throw new Error("yue.yum-cha opens on a word bank");
  expect(first.tiles.length).toBeGreaterThan(6);
  await page.goto(sessionUrl(course, { mode: "lesson", node }, SEED));
  const player = page.locator("[data-lesson-player]");
  await expect(player).toHaveAttribute("data-state", "answering");
  const bank = player.locator("[data-word-bank]");
  const readings = await bank.locator("rt").count();
  expect(readings).toBeGreaterThan(0);

  // Vertical text, from the header's display menu.
  await player.locator("[data-action=display]").tap();
  await page.locator("[data-display-menu] [data-toggle=vertical]").tap();
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-display-menu]")).toHaveCount(0);
  const region = player.locator("[data-target-region]");
  await expect(region).toHaveAttribute("data-writing-mode", "vertical-rl");
  expect(await region.evaluate((el) => getComputedStyle(el).writingMode)).toBe("vertical-rl");
  // The readings stay, beside the columns.
  await expect(bank.locator("rt")).toHaveCount(readings);
  // The bank goes on in columns beside the answer, not down the screen: Check is in sight.
  const viewport = page.viewportSize();
  const check = await player.locator("[data-action=check]").boundingBox();
  expect(check!.y + check!.height).toBeLessThanOrEqual(viewport!.height);

  // On through the lesson's banks to a card whose prompt is Cantonese.
  const at = exercises.findIndex((e) => e.template === "translate-tap.l2-l1");
  expect(at).toBeGreaterThan(0);
  for (const ex of exercises.slice(0, at)) {
    await waitFor(page, ex);
    if (ex.template === "translate-tap.l1-l2") await expect(region).toHaveAttribute("data-writing-mode", "vertical-rl");
    await answer(page, ex, "touch");
    await expectRightAndContinue(page, "touch", ex);
  }
  const prompted = exercises[at];
  if (prompted === undefined) throw new Error("no card with a Cantonese prompt");
  await waitFor(page, prompted);
  // Its text turns into a column with its readings; its play buttons and their label stay horizontal.
  const prompt = player.locator("[data-ink-container=prompt]");
  await expect(prompt).toHaveAttribute("data-writing-mode", "vertical-rl");
  expect(await prompt.locator("p[data-nabu-text]").evaluate((el) => getComputedStyle(el).writingMode)).toBe("vertical-rl");
  await expect(prompt.locator("rt").first()).toBeVisible();
  for (const chrome of await prompt.locator("[data-audio-buttons]").all()) expect(await chrome.evaluate((el) => getComputedStyle(el).writingMode)).toBe("horizontal-tb");
});

test("Persian marks vowels on new words until the learner chooses, and the choice holds for the course (P12)", async ({ page }, info) => {
  test.skip(info.project.name !== "keyboard", "one desktop pass is enough");
  await page.clock.setFixedTime(NOW);
  const course = loadCourse("fa", "fa-Arab/standard");
  const [first, second] = lessonNodes(course).map((n) => n.node.id);
  if (first === undefined || second === undefined) throw new Error("fa has two lessons");
  const player = page.locator("[data-lesson-player]");
  const menu = page.locator("[data-display-menu] [data-toggle=marks]");
  await page.goto(sessionUrl(course, { mode: "lesson", node: first }, SEED));
  await expect(player).toHaveAttribute("data-state", "answering");
  // The profile's default (on-for-new-words): marks on the words not yet known.
  await player.locator("[data-action=display]").click();
  await expect(menu).toHaveAttribute("data-marks-shown", "new");
  await expect(menu.locator("[data-marks]")).toHaveText(["All words", "New words", "None"]);
  await menu.locator("[data-marks=hide]").click();
  await expect(menu).toHaveAttribute("data-marks-shown", "hide");
  // Another lesson of the course starts from the learner's choice.
  await page.goto(sessionUrl(course, { mode: "lesson", node: second }, SEED));
  await expect(player).toHaveAttribute("data-state", "answering");
  await player.locator("[data-action=display]").click();
  await expect(menu).toHaveAttribute("data-marks-shown", "hide");
});


test("quitting says what is kept, in the app's face, and goes straight back to the path (P8)", async ({ page }, info) => {
  test.skip(info.project.name !== "keyboard", "one desktop pass is enough");
  await page.clock.setFixedTime(NOW);
  const course = loadCourse("es", "es-Latn/standard");
  const node = "es.u01.como-estas";
  const history = historyBefore(course, node, NOW);
  if (history.length > 0) await seedLog(page, history);
  const [first] = planned(course, history, { mode: "lesson", node }, NOW, SEED);
  if (first === undefined) throw new Error("the lesson has cards");
  await page.goto(sessionUrl(course, { mode: "lesson", node }, SEED));
  await waitFor(page, first);
  await answer(page, first, "keyboard");
  await expectRightAndContinue(page, "keyboard", first);
  await page.locator("[data-lesson-player] [data-action=quit]").click();
  const dialog = page.locator("[data-quit-dialog]");
  await expect(dialog).toHaveAttribute("data-mode", "lesson");
  await expect(dialog.locator("[data-quit-kept]")).toContainText("Your answers so far are kept");
  // The chrome's face, not the browser's serif fallback: the dialog is portalled out of the app's root.
  expect(await dialog.evaluate((el) => getComputedStyle(el).fontFamily)).toContain("Noto Sans");
  await page.locator("[data-action=quit-confirm]").click();
  await expect(page.locator("[data-course-path]")).toBeVisible();
  // The session ends unfinished, scored over what was answered.
  await expect
    .poll(async () => (await logOf(page, "es")).find((e) => e.type === "session_completed" && e.node === node))
    .toMatchObject({ summary: { completed: false, exercises: graded([first]) } });
});
