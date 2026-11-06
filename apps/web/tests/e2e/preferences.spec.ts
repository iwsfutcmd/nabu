/**
 * Preferences: the text size of the language being learned. It is kept on the device and scales
 * only that language's words (and the answer field); the interface and the translations keep
 * their size. Classical Chinese is also set a quarter larger than the text around it (its
 * profile's fonts.scale, ADR 0071).
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
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
