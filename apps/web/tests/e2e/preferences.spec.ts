/**
 * Preferences: the text size scales everything in the app, is kept on the device, and Classical
 * Chinese is set larger than the text around it (its profile's fonts.scale, ADR 0071).
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { loadCourse, sessionUrl, planned } from "./solver.ts";

const NOW = new Date("2026-03-10T09:00:00Z");

const rootSize = (page: Page): Promise<number> => page.evaluate(() => Number.parseFloat(getComputedStyle(document.documentElement).fontSize));

test("the text size is chosen in Preferences, kept on the device, and scales the lessons", async ({ page }, info) => {
  test.skip(info.project.name !== "keyboard", "one desktop pass is enough");
  await page.clock.setFixedTime(NOW);
  await page.goto("/");
  const base = await rootSize(page);
  await page.locator("[data-preferences-link]").click();
  const sizes = page.locator("[data-preference=text-size] [data-text-size]");
  await expect(sizes).toHaveText(["Smaller", "Default", "Large", "Larger", "Largest"]);
  await expect(page.getByRole("radio", { name: "Default" })).toBeChecked();
  const axe = await new AxeBuilder({ page }).include("[data-preferences]").analyze();
  expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);

  await page.locator("[data-text-size=largest]").click();
  await expect.poll(() => rootSize(page)).toBeCloseTo(base * 1.5, 1);

  // Kept on the device: a reload, then a Classical Chinese lesson.
  await page.reload();
  await expect.poll(() => rootSize(page)).toBeCloseTo(base * 1.5, 1);
  await expect(page.getByRole("radio", { name: "Largest" })).toBeChecked();
  await expect(page.locator("html")).toHaveAttribute("data-nabu-text-size", "largest");
  const course = loadCourse("lzh", "lzh-Hant/standard");
  const request = { mode: "lesson", node: "lzh.u01.well-said" } as const;
  expect(planned(course, [], request, NOW, 7).length).toBeGreaterThan(3);
  await page.goto(sessionUrl(course, request, 7));
  const word = page.locator("[data-lesson-player] [data-nabu-text][data-scaled] [data-kind=word]").first();
  await expect(word).toBeVisible();
  // The characters are a quarter larger than the text around them, at the chosen size.
  const sizes2 = await word.evaluate((el) => ({ word: Number.parseFloat(getComputedStyle(el).fontSize), around: Number.parseFloat(getComputedStyle(el.parentElement as Element).fontSize) }));
  expect(sizes2.word / sizes2.around).toBeCloseTo(1.25, 2);
  expect(sizes2.around).toBeGreaterThanOrEqual(base * 1.5 - 0.5);

  // Back to the default: the browser's own size again.
  await page.goto("/#/preferences");
  await page.locator("[data-text-size=default]").click();
  await expect.poll(() => rootSize(page)).toBeCloseTo(base, 1);
});
