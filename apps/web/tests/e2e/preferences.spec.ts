/**
 * Preferences: the text size of the language being learned. It is kept on the device and scales
 * only that language's words (and the answer field); the interface and the translations keep
 * their size. Classical Chinese is also set a quarter larger than the text around it (its
 * profile's fonts.scale, ADR 0071).
 *
 * Preferences opens from a course's page and from a lesson's header too, and goes back where it was
 * opened: a lesson goes on where it was. Opened from a course, it shows the size on a sentence of it.
 * Listening and speaking exercises can be turned off there for good, not only for an hour (S8).
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { lessonNodes, LISTENING, SPEAKING } from "@nabu/core/lesson";
import { activate, answer, expectRightAndContinue, historyBefore, loadCourse, logOf, pathUrl, planned, playSession, seedLog, sessionUrl, waitFor, type Mode } from "./solver.ts";

const NOW = new Date("2026-03-10T09:00:00Z");

const fontSize = (l: Locator): Promise<number> => l.evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize));
const rootSize = (page: Page): Promise<number> => page.evaluate(() => Number.parseFloat(getComputedStyle(document.documentElement).fontSize));

/** A lesson card's sizes: a Classical Chinese word, the element around it, an English gloss, the instruction. */
const sizes = async (page: Page): Promise<{ word: number; around: number; gloss: number; chrome: number }> => {
  const player = page.locator("[data-lesson-player]");
  const word = player.locator("[data-nabu-text][data-target] [data-kind=word]").first();
  const gloss = player.locator('[data-nabu-text][data-orthography="en-Latn/standard"] [data-kind=word]').first();
  await expect(word).toBeVisible();
  await expect(gloss).toBeVisible();
  return {
    word: await fontSize(word),
    around: await fontSize(player.locator("[data-nabu-text][data-target]").first()),
    gloss: await fontSize(gloss),
    chrome: await fontSize(player.locator("h2").first()),
  };
};

test("the text size of the language being learned is chosen in Preferences, and scales only that language", async ({ page }, info) => {
  test.skip(info.project.name !== "keyboard", "one desktop pass is enough");
  await page.clock.setFixedTime(NOW);
  const course = loadCourse("lzh", "lzh-Hant/standard");
  const request = { mode: "lesson", node: "lzh.u01.well-said" } as const;
  // The first card pairs Classical Chinese words with their English glosses.
  expect(planned(course, [], request, NOW, 7)[0]?.template).toBe("match-pairs");
  await page.goto(sessionUrl(course, request, 7));
  const before = await sizes(page);
  expect(before.word / before.around).toBeCloseTo(1.25, 2);
  const root = await rootSize(page);

  await page.goto("/#/preferences");
  const choices = page.locator("[data-preference=target-size] [data-target-size]");
  await expect(choices).toHaveText(["Smaller", "Default", "Large", "Larger", "Largest"]);
  await expect(page.getByRole("radio", { name: "Default" })).toBeChecked();
  const axe = await new AxeBuilder({ page }).include("[data-preferences]").analyze();
  expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);
  await page.locator("[data-target-size=largest]").click();
  // The interface around it keeps its size.
  expect(await rootSize(page)).toBe(root);

  // Kept on the device: a reload, then the same card.
  await page.reload();
  await expect(page.getByRole("radio", { name: "Largest" })).toBeChecked();
  await page.goto(sessionUrl(course, request, 7));
  const after = await sizes(page);
  expect(after.word / before.word).toBeCloseTo(1.75, 2);
  expect(after.gloss).toBe(before.gloss);
  expect(after.chrome).toBe(before.chrome);
  expect(await rootSize(page)).toBe(root);

  // Back to the default: as the course sets it.
  await page.goto("/#/preferences");
  await page.locator("[data-target-size=default]").click();
  await page.goto(sessionUrl(course, request, 7));
  expect((await sizes(page)).word).toBe(before.word);
});

/** --nabu-color-page in each theme (tokens.css). */
const PAGE = { light: "rgb(246, 245, 241)", dark: "rgb(22, 22, 20)" } as const;
const pageColour = (page: Page): Promise<string> => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
const seriousViolations = async (page: Page, scope: string): Promise<string[]> =>
  (await new AxeBuilder({ page }).include(scope).analyze()).violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);

test("the theme matches the browser until the learner chooses light or dark, and a choice holds from the first paint", async ({ page, browser }, info) => {
  test.skip(info.project.name !== "keyboard", "one desktop pass is enough");
  await page.clock.setFixedTime(NOW);
  // By default the theme follows the browser, and changes with it.
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/#/preferences");
  const choices = page.locator("[data-preference=theme] [data-theme-choice]");
  await expect(choices).toHaveText(["Match the browser", "Light", "Dark"]);
  await expect(page.getByRole("radio", { name: "Match the browser" })).toBeChecked();
  await expect(page.locator("html")).not.toHaveAttribute("data-theme");
  expect(await pageColour(page)).toBe(PAGE.dark);
  expect(await seriousViolations(page, "[data-preferences]")).toEqual([]);
  await page.emulateMedia({ colorScheme: "light" });
  expect(await pageColour(page)).toBe(PAGE.light);

  // Dark, chosen: whatever the browser prefers, and the browser's own chrome follows.
  await page.locator("[data-theme-choice=dark]").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await pageColour(page)).toBe(PAGE.dark);
  await expect(page.locator('meta[name=theme-color][data-theme-for="dark"]')).toHaveAttribute("media", "all");
  await expect(page.locator('meta[name=theme-color][data-theme-for="light"]')).toHaveAttribute("media", "not all");

  // Kept on the device. A course's page and a lesson in dark meet contrast (axe), right to left too.
  await page.reload();
  await expect(page.getByRole("radio", { name: "Dark" })).toBeChecked();
  const fa = loadCourse("fa", "fa-Arab/standard");
  await page.goto("/?sound=off#/fa/fa-Arab.standard");
  await expect(page.locator("[data-course-path]")).toBeVisible();
  expect(await pageColour(page)).toBe(PAGE.dark);
  expect(await seriousViolations(page, "[data-course-path]")).toEqual([]);
  const first = { mode: "lesson", node: lessonNodes(fa)[0]?.node.id ?? "" } as const;
  await page.goto(sessionUrl(fa, first, 7));
  await expect(page.locator("[data-lesson-player]")).toBeVisible();
  expect(await seriousViolations(page, "[data-lesson-player]")).toEqual([]);

  // Light, chosen, while the browser prefers dark; then back to matching the browser.
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/#/preferences");
  await page.locator("[data-theme-choice=light]").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(await pageColour(page)).toBe(PAGE.light);
  await page.locator("[data-theme-choice=system]").click();
  await expect(page.locator("html")).not.toHaveAttribute("data-theme");
  expect(await pageColour(page)).toBe(PAGE.dark);
  await expect(page.locator('meta[name=theme-color][data-theme-for="light"]')).toHaveAttribute("media", "(prefers-color-scheme: light)");

  // From the first paint: index.html applies a chosen theme before any of the app's code runs.
  const context = await browser.newContext({ colorScheme: "light", serviceWorkers: "block" });
  const fresh = await context.newPage();
  await fresh.addInitScript(() => localStorage.setItem("nabu.theme", "dark"));
  await fresh.route(/\.(js|mjs|ts|tsx)(\?.*)?$/u, (route) => route.abort());
  await fresh.goto("/");
  await expect(fresh.locator("html")).toHaveAttribute("data-theme", "dark");
  await context.close();
});

test("Preferences opens from a course's page, shows the text size on a sentence of the course, and goes back to it", async ({ page }, info) => {
  test.skip(info.project.name !== "keyboard", "one desktop pass is enough");
  await page.clock.setFixedTime(NOW);
  const fa = loadCourse("fa", "fa-Arab/standard");
  await page.goto(pathUrl(fa, 7));
  // The path's previews: a word of the course, and its meaning under it.
  const pathWord = page.locator("[data-course-path] [data-preview-item] [data-nabu-text][data-target] [data-kind=word]").first();
  const pathGloss = page.locator('[data-course-path] [data-preview-item] [data-nabu-text][lang="en-Latn"] [data-kind=word]').first();
  await expect(pathWord).toBeVisible();
  const before = { word: await fontSize(pathWord), gloss: await fontSize(pathGloss) };

  await page.locator("[data-course-path] [data-preferences-link]").click();
  await expect(page.locator("[data-preferences]")).toBeVisible();
  const back = page.locator('[data-preferences-back=""]');
  await expect(back).toHaveText("Back to the course");
  const sample = page.locator("[data-target-size-sample=fa]");
  // The course's name is a placeholder, so MF2 isolates it (FSI … PDI).
  await expect(sample.locator("figcaption")).toHaveText("\u2068Persian\u2069 at this size:");
  const sampleWord = sample.locator("[data-nabu-text][data-target] [data-kind=word]").first();
  const sampleGloss = sample.locator('[data-nabu-text][lang="en-Latn"] [data-kind=word]').first();
  const at = { word: await fontSize(sampleWord), gloss: await fontSize(sampleGloss) };
  await page.locator("[data-target-size=largest]").click();
  // The sample grows as the size is chosen; its translation keeps its size.
  await expect.poll(() => fontSize(sampleWord)).toBeCloseTo(at.word * 1.75, 1);
  expect(await fontSize(sampleGloss)).toBe(at.gloss);

  // Back on the course's page, its words take the size too (the path is inside CourseUiProvider).
  await back.click();
  await expect(page.locator("[data-course-path]")).toBeVisible();
  await expect(page).toHaveURL(/#\/fa\/fa-Arab\.standard$/u);
  expect(await fontSize(pathWord)).toBeCloseTo(before.word * 1.75, 1);
  expect(await fontSize(pathGloss)).toBe(before.gloss);
});

test("Preferences opens from a lesson's header, and the lesson goes on where it was", async ({ page }, info) => {
  const mode = info.project.name as Mode;
  await page.clock.setFixedTime(NOW);
  const fa = loadCourse("fa", "fa-Arab/standard");
  const node = lessonNodes(fa)[0]?.node.id ?? "";
  const exercises = planned(fa, [], { mode: "lesson", node }, NOW, 7);
  const third = exercises[2];
  if (third === undefined) throw new Error("a short lesson");
  await page.goto(pathUrl(fa, 7));
  await activate(page, mode, `[data-lesson="${node}"]`);
  for (const ex of exercises.slice(0, 2)) {
    await waitFor(page, ex);
    await answer(page, ex, mode);
    await expectRightAndContinue(page, mode, ex);
  }
  await waitFor(page, third);
  // The answers so far are in the log before the lesson is left (a reload would lose an unwritten one).
  await expect.poll(async () => (await logOf(page, "fa")).filter((e) => e.type === "answer_submitted").length).toBe(2);

  // The header's link: no question asked (a new navigation, ADR 0108), and the way back says where to.
  await activate(page, mode, "[data-lesson-player] [data-action=preferences]");
  await expect(page.locator("[data-preferences]")).toBeVisible();
  await expect(page.locator("[data-quit-dialog]")).toHaveCount(0);
  await expect(page.locator('[data-preferences-back=""]')).toHaveText("Back to the lesson");
  await activate(page, mode, '[data-preferences-back=""]');
  await waitFor(page, third);
  expect((await logOf(page, "fa")).filter((e) => e.type === "session_started")).toHaveLength(1);
});

test("on a narrow phone the lesson's header keeps every button in sight", async ({ page }, info) => {
  test.skip(info.project.name !== "touch", "a phone's screen");
  await page.setViewportSize({ width: 320, height: 640 });
  const fa = loadCourse("fa", "fa-Arab/standard");
  await page.goto(sessionUrl(fa, { mode: "lesson", node: lessonNodes(fa)[0]?.node.id ?? "" }, 7));
  const header = page.locator("[data-lesson-player] header");
  await expect(header).toBeVisible();
  const card = await page.locator("[data-lesson-player]").boundingBox();
  for (const action of ["quit", "display", "sound", "preferences"]) {
    const box = await header.locator(`[data-action=${action}]`).boundingBox();
    if (box === null || card === null) throw new Error(`${action} is not laid out`);
    expect(box.x, action).toBeGreaterThanOrEqual(card.x);
    expect(box.x + box.width, action).toBeLessThanOrEqual(card.x + card.width);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBe(0);
});

const exercisesChoice = (page: Page, modality: "listening" | "speaking", choice: "on" | "off"): Locator => page.locator(`[data-preference=${modality}] [data-exercises-choice=${choice}]`);

test("listening off in Preferences: no listening exercises, until it is turned back on", async ({ page }, info) => {
  test.skip(info.project.name !== "keyboard", "one desktop pass is enough");
  await page.clock.setFixedTime(NOW);
  const apc = loadCourse("apc", "apc-Arab/standard");
  const request = { mode: "lesson", node: lessonNodes(apc)[0]?.node.id ?? "" } as const;
  const without = planned(apc, [], request, NOW, 7, "UTC", LISTENING);
  expect(planned(apc, [], request, NOW, 7).some((ex) => LISTENING.has(ex.template))).toBe(true);
  expect(without.some((ex) => LISTENING.has(ex.template))).toBe(false);

  await page.goto("/#/preferences");
  await expect(page.locator("[data-preference=listening] [data-exercises-choice]")).toHaveText(["On", "Off"]);
  await expect(exercisesChoice(page, "listening", "on").locator("input")).toBeChecked();
  await exercisesChoice(page, "listening", "off").click();
  // Kept on the device.
  await page.reload();
  await expect(exercisesChoice(page, "listening", "off").locator("input")).toBeChecked();

  // The course's page says so, and its lesson comes without listening.
  await page.goto(pathUrl(apc, 7));
  await expect(page.locator("[data-listening-off]")).toHaveAttribute("data-listening-off", "setting");
  await expect(page.locator("[data-listening-off]")).toContainText("You turned listening exercises off on this device.");
  await page.goto(sessionUrl(apc, request, 7));
  await playSession(page, without, "keyboard");

  // On again from the course's page: the notice goes, and Preferences says so.
  await page.goto(pathUrl(apc, 7));
  await page.locator("[data-action=listening-on]").click();
  await expect(page.locator("[data-listening-off]")).toHaveCount(0);
  await page.goto("/#/preferences");
  await expect(exercisesChoice(page, "listening", "on").locator("input")).toBeChecked();
});

test("a break from listening can be kept for good from the course's page", async ({ page }, info) => {
  test.skip(info.project.name !== "keyboard", "one desktop pass is enough");
  await page.clock.setFixedTime(NOW);
  const apc = loadCourse("apc", "apc-Arab/standard");
  await page.goto(pathUrl(apc, 7));
  // "Can't listen now" was pressed: listening is off for the next hour.
  await page.evaluate((until) => localStorage.setItem("nabu.listening-off-until", String(until)), NOW.getTime() + 3_600_000);
  await page.reload();
  const notice = page.locator("[data-listening-off]");
  await expect(notice).toHaveAttribute("data-listening-off", "break");
  await page.locator("[data-action=listening-keep-off]").click();
  await expect(notice).toHaveAttribute("data-listening-off", "setting");
  // Hours later it is still off.
  await page.clock.setFixedTime(new Date(NOW.getTime() + 3 * 3_600_000));
  await page.reload();
  await expect(notice).toHaveAttribute("data-listening-off", "setting");
  await page.goto("/#/preferences");
  await expect(exercisesChoice(page, "listening", "off").locator("input")).toBeChecked();
});

test("speaking off in Preferences: no speaking exercises", async ({ page }, info) => {
  test.skip(info.project.name !== "keyboard", "one desktop pass is enough");
  await page.clock.setFixedTime(NOW);
  const yue = loadCourse("yue", "yue-Hant-HK/standard");
  // A lesson that plans a speaking card, after the lessons before it.
  const found = lessonNodes(yue)
    .slice(0, 6)
    .flatMap(({ node }) => {
      const history = historyBefore(yue, node.id, NOW);
      return planned(yue, history, { mode: "lesson", node: node.id }, NOW, 7).some((ex) => SPEAKING.has(ex.template)) ? [{ node: node.id, history }] : [];
    })[0];
  if (found === undefined) throw new Error("no early yue lesson plans a speaking card");
  const request = { mode: "lesson", node: found.node } as const;
  const without = planned(yue, found.history, request, NOW, 7, "UTC", SPEAKING);
  expect(without.some((ex) => SPEAKING.has(ex.template))).toBe(false);
  if (found.history.length > 0) await seedLog(page, found.history);

  await page.goto("/#/preferences");
  await exercisesChoice(page, "speaking", "off").click();
  await page.goto(pathUrl(yue, 7));
  await expect(page.locator("[data-speaking-off]")).toHaveAttribute("data-speaking-off", "setting");
  await page.goto(sessionUrl(yue, request, 7));
  await playSession(page, without, "keyboard");
});
