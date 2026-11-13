/**
 * Fonts come with their text (ADR 0119, R7 in the 2026-11 review): the stylesheet that blocks the
 * first paint declares no Han faces, so a learner of any other course never waits for them. The
 * Han families' stylesheet loads with the first text set in them, and that text is in its own
 * family, not a system font.
 */
import { expect, test, type Page } from "@playwright/test";

/** How many faces the page declares for a family, and whether one of them has loaded. */
const facesOf = (page: Page, family: string): Promise<{ declared: number; loaded: boolean }> =>
  page.evaluate((f) => {
    const faces = [...document.fonts].filter((face) => face.family.replace(/"/gu, "") === f);
    return { declared: faces.length, loaded: faces.some((face) => face.status === "loaded") };
  }, family);

test("the Han fonts load with Han text, never before it", async ({ page }, info) => {
  test.skip(info.project.name !== "keyboard", "one desktop pass is enough");
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("/?sound=off#/");
  await expect(page.locator("[data-course-list]")).toBeVisible();
  await page.locator('[data-course="es"] [data-course-link]').click();
  await expect(page.locator("[data-course-path=es]")).toBeVisible();
  expect(await facesOf(page, "Noto Sans HK")).toEqual({ declared: 0, loaded: false });
  expect(await facesOf(page, "Noto Serif TC")).toEqual({ declared: 0, loaded: false });

  // A Cantonese course's path previews its words: their family comes with them.
  await page.goto("/?sound=off#/");
  await page.locator('[data-course="yue"] [data-course-link]').click();
  await expect(page.locator("[data-course-path=yue]")).toBeVisible();
  await expect(page.locator('[data-preview] [lang="yue-Hant-HK"]').first()).toBeVisible();
  await expect.poll(async () => (await facesOf(page, "Noto Sans HK")).loaded).toBe(true);
  const text = (await page.locator('[data-preview] [lang="yue-Hant-HK"]').first().textContent()) ?? "";
  expect(await page.evaluate((t) => document.fonts.check('16px "Noto Sans HK"', t), text)).toBe(true);
  expect(errors).toEqual([]);
});
