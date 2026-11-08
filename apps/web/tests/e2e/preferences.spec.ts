/**
 * Preferences: the text size of the language being learned. It is kept on the device and scales
 * only that language's words (and the answer field); the interface and the translations keep
 * their size. Classical Chinese is also set a quarter larger than the text around it (its
 * profile's fonts.scale, ADR 0071).
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { lessonNodes } from "@nabu/core/lesson";
import { loadCourse, planned, sessionUrl } from "./solver.ts";

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
