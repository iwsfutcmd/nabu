/**
 * The first-run home screen explains itself (the 2026-11 review's S4): what Nabu is and how to
 * start, then the courses in the order of their names, each card a link to its course, saying what
 * it teaches, its levels and size, and what it leaves out; a course in several writing systems
 * offers each, and says the learner can switch any time.
 */
import { expect, test } from "@playwright/test";
import { seriousAxeViolations } from "./solver.ts";

test.describe("home", () => {
  test.beforeEach(({ page: _ }, info) => {
    test.skip(info.project.name !== "keyboard", "one desktop pass is enough");
  });

  test("a new learner is told what Nabu is and how to start; each course says what it is", async ({ page }) => {
    await page.goto("/?sound=off#/");
    await expect(page.locator("[data-home-intro]")).toBeVisible();
    await expect(page.locator("[data-game]")).toHaveCount(0);
    const cards = page.locator("[data-course-list] > [data-course]");
    const names = await cards.locator("h2").allInnerTexts();
    expect(names).toEqual([...names].sort((a, b) => new Intl.Collator("en").compare(a, b)));

    // The whole card is the course's link, to its first writing system.
    const es = page.locator('[data-course="es"]');
    await expect(es.locator("[data-course-link]")).toHaveAttribute("href", "#/es/es-Latn.standard");
    await expect(es.locator("[data-course-about]")).toBeVisible();
    // Reading courses say what they leave out; a course with listening says nothing.
    await expect(page.locator('[data-course="lzh"] [data-course-leaves]')).toBeVisible();
    await expect(page.locator('[data-course="hbo"] [data-course-leaves]')).toBeVisible();
    await expect(es.locator("[data-course-leaves]")).toHaveCount(0);

    // Several writing systems: each one a link, and a word that switching later is fine.
    const uz = page.locator('[data-course="uz"]');
    await expect(uz.locator("[data-orthography]")).toHaveCount(2);
    await uz.locator('[data-orthography="uz-Cyrl/standard"]').click();
    await expect(page.locator("[data-course-path=uz]")).toBeVisible();
    await expect(page).toHaveURL(/#\/uz\/uz-Cyrl\.standard$/u);
    await page.goBack();
    await page.locator('[data-course="fa"] [data-course-about]').click({ force: true }); // anywhere on the card
    await expect(page.locator("[data-course-path=fa]")).toBeVisible();
    await page.goBack();
    expect(await seriousAxeViolations(page, "main")).toEqual([]);
  });
});
