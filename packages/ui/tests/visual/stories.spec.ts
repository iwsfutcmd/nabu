/**
 * Every story renders under en, en-XA and ar-XB (gameplan §11.9) with the
 * chrome direction its locale implies and without runtime errors. New stories
 * join automatically: the list comes from Storybook's own index.json.
 */
import { expect, test } from "@playwright/test";
import { comparesPixels, settle } from "./checks.ts";
import { storyUrl, UI_LOCALES } from "./matrix.ts";

interface IndexEntry {
  readonly id: string;
  readonly type: "story" | "docs";
}

test.describe("every story × pseudo-locales", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 1000, "one viewport is enough for the smoke pass");

  test("index lists stories", async ({ request }) => {
    const index = (await (await request.get("/index.json")).json()) as { entries: Record<string, IndexEntry> };
    expect(Object.values(index.entries).filter((e) => e.type === "story").length).toBeGreaterThan(1);
  });

  for (const [ui, dir] of Object.entries(UI_LOCALES)) {
    test(`all stories render in ${ui}`, async ({ page, request }) => {
      const index = (await (await request.get("/index.json")).json()) as { entries: Record<string, IndexEntry> };
      const stories = Object.values(index.entries).filter((e) => e.type === "story");
      for (const story of stories) {
        const errors: string[] = [];
        page.removeAllListeners("pageerror");
        page.on("pageerror", (e) => errors.push(String(e)));
        await page.goto(storyUrl(story.id, { uiLocale: "en", pseudoLocale: ui === "en" ? "off" : ui }));
        await settle(page, "[data-ui-root]");
        await expect(page.locator("[data-ui-root]"), story.id).toHaveAttribute("dir", dir);
        await expect(page.locator("[data-ui-root]"), story.id).toHaveAttribute("lang", ui);
        expect(errors, story.id).toEqual([]);
        // The exercise card, the player, corrections, review and the word list have their own matrices; the check fixtures are broken on purpose.
        if (comparesPixels && !story.id.startsWith("demo-exercise-card") && !story.id.startsWith("player-") && !story.id.startsWith("corrections-") && !story.id.startsWith("review-") && !story.id.startsWith("words-") && !story.id.startsWith("fixtures-")) {
          await expect(page.locator("#storybook-root")).toHaveScreenshot(`story__${story.id}__${ui}.png`);
        }
      }
    });
  }
});
