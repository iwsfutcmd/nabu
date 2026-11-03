/**
 * The visual checks must be able to fail: each detector runs against a
 * deliberately broken fixture story and must catch it.
 */
import { expect, test } from "@playwright/test";
import { inkOutside, platformFonts, settle } from "./checks.ts";
import { storyUrl } from "./matrix.ts";

test.describe("visual check fixtures", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 1000, "viewport-independent");

  test.beforeEach(async ({ page }) => {
    await page.goto(storyUrl("fixtures-visual-checks--clipped", { pseudoLocale: "off" }));
    await settle(page, "[data-ink-container]");
  });

  test("the ink check catches marks that spill out of a cramped box", async ({ page }) => {
    expect(await inkOutside(page, page.locator("[data-ink-container=fixture-clipped]"))).toBeGreaterThan(0);
    expect(await inkOutside(page, page.locator("[data-ink-container=fixture-ok]"))).toBe(0);
  });

  test("the font check catches a script no bundled font covers", async ({ page }) => {
    const used = await platformFonts(page, "[data-fixture=uncovered-script] [data-kind]");
    expect(used.length).toBe(1);
    expect(used[0]?.custom).toBe(false);
  });
});
