/**
 * Dead ends: a link to a lesson or story the course no longer has (an old bookmark, a tab restored
 * after an update) says so and links back to the course, instead of a blank page; a course that
 * fails to load can be tried again.
 */
import { expect, test } from "@playwright/test";

// Requests the page makes, not the worker's: route interception sees them all.
test.use({ serviceWorkers: "block" });

test.describe("links and loads that fail", () => {
  test.beforeEach(({ page: _ }, info) => {
    test.skip(info.project.name !== "keyboard", "one desktop pass is enough");
  });

  test("a lesson or story the course no longer has says so, and links back", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto("/?sound=off#/fa/fa-Arab.standard/fa.no-such-lesson");
    await expect(page.locator("[data-missing-node]")).toBeVisible();
    await page.locator("main a").click();
    await expect(page.locator("[data-course-path]")).toBeVisible();
    await page.goto("/?sound=off#/fa/fa-Arab.standard/story/fa.no-such-story");
    await expect(page.locator("[data-missing-node]")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("a course that fails to load can be tried again", async ({ page }) => {
    let fail = true;
    await page.route("**/bundles/fa/manifest.json", (route) => (fail ? route.abort() : route.continue()));
    await page.goto("/?sound=off#/fa/fa-Arab.standard");
    await expect(page.locator("[data-load-error]")).toBeVisible();
    fail = false;
    await page.locator("[data-action=retry]").click();
    await expect(page.locator("[data-course-path]")).toBeVisible();
  });
});
