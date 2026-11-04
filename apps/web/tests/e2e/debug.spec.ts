/**
 * Debug mode: ?debug=1 turns on, for this device, a gallery with one card of every kind the
 * course can make, and a label on every card saying which kind it is. Nothing played in the
 * gallery is recorded.
 */
import { cardGallery } from "@nabu/core/lesson";
import { expect, test } from "@playwright/test";
import { loadCourse, logOf } from "./solver.ts";

test.beforeEach(({ page: _ }, info) => {
  test.skip(info.project.name !== "keyboard", "one desktop pass is enough");
});

test("every kind of card can be tried from the gallery, and none of it is recorded", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const course = loadCourse("yue", "yue-Hant-HK/standard");
  const gallery = cardGallery(course, 7);
  await page.goto("/?sound=off#/yue/yue-Hant-HK.standard");
  await expect(page.locator("[data-course-path]")).toBeVisible();
  await expect(page.locator("[data-cards-link]")).toHaveCount(0);

  await page.goto("/?sound=off&debug=1#/yue/yue-Hant-HK.standard");
  await page.locator("[data-cards-link]").click();
  await expect(page.locator("[data-cards-page=yue]")).toBeVisible();
  await expect(page.locator("[data-card]")).toHaveCount(gallery.length);
  await expect(page.locator("[data-card][data-available=true]")).toHaveCount(gallery.filter((c) => c.exercise !== undefined).length);

  const before = (await logOf(page, "yue")).length;
  for (const template of ["gap-fill", "char-read", "match-pairs"]) {
    await page.locator(`[data-card="${template}"] [data-action=try-card]`).click();
    await expect(page.locator("[data-lesson-player]")).toBeVisible();
    await expect(page.locator("[data-debug-template]")).toHaveAttribute("data-debug-template", template);
    await page.locator("[data-action=quit]").click();
    await page.locator("[data-action=quit-confirm]").click();
    await page.locator("[data-action=exit]").click();
    await expect(page.locator("[data-cards-page=yue]")).toBeVisible();
  }
  await page.locator("[data-action=play-all-cards]").click();
  await expect(page.locator("[data-debug-template]")).toHaveAttribute("data-debug-template", gallery.find((c) => c.exercise !== undefined)?.template ?? "");
  expect((await logOf(page, "yue")).length).toBe(before);

  // ?debug=0 turns it off again.
  await page.goto("/?sound=off&debug=0#/yue/yue-Hant-HK.standard");
  await expect(page.locator("[data-course-path]")).toBeVisible();
  await expect(page.locator("[data-cards-link]")).toHaveCount(0);
  expect(errors).toEqual([]);
});
