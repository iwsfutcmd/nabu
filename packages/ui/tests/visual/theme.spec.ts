/**
 * Dark theme: every story in dark, with chrome left to right (en), right to left (ar-XB) and a
 * vertical target (Cantonese, vertical-rl). Each one sets color-scheme dark, paints the dark page
 * and passes axe's colour-contrast rule; pixels in the pinned container. The light theme is the
 * rest of the matrix, unchanged.
 */
import AxeBuilder from "@axe-core/playwright";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { comparesPixels, settle } from "./checks.ts";
import { storyUrl } from "./matrix.ts";

const INDEX = resolve(import.meta.dirname, "../../storybook-static/index.json");
if (!existsSync(INDEX)) throw new Error("build Storybook first (pnpm build-storybook)");
const STORIES = Object.values((JSON.parse(readFileSync(INDEX, "utf8")) as { entries: Record<string, { id: string; type: string }> }).entries)
  .filter((e) => e.type === "story" && !e.id.startsWith("fixtures-")) // the check fixtures are broken on purpose
  .map((e) => e.id);

const BASE = { uiLocale: "en", pseudoLocale: "off", target: "fa", dir: "auto", writingMode: "horizontal-tb", theme: "dark" };
const CELLS = [
  { name: "en", dir: "ltr", globals: BASE },
  { name: "ar-XB", dir: "rtl", globals: { ...BASE, pseudoLocale: "ar-XB" } },
  { name: "en-vertical", dir: "ltr", globals: { ...BASE, target: "yue-Hant-HK", writingMode: "vertical-rl" } },
] as const;

/** --nabu-color-page in dark (tokens.css). */
const DARK_PAGE = "rgb(22, 22, 20)";

test.describe("dark theme", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 1000, "one viewport is enough for the dark pass");

  test("has stories to check", () => {
    expect(STORIES.length).toBeGreaterThan(10);
  });

  for (const cell of CELLS) {
    for (const id of STORIES) {
      test(`${id} × ${cell.name}`, async ({ page }) => {
        const errors: string[] = [];
        page.on("pageerror", (e) => errors.push(String(e)));
        await page.goto(storyUrl(id, cell.globals));
        await settle(page, "[data-ui-root]");
        await expect(page.locator("[data-ui-root]")).toHaveAttribute("dir", cell.dir);
        await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
        expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe("dark");
        expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(DARK_PAGE);

        const axe = await new AxeBuilder({ page }).include("#storybook-root").withRules(["color-contrast"]).analyze();
        expect(axe.violations.flatMap((v) => v.nodes.map((n) => `${v.id}: ${n.target.join(" ")} ${n.failureSummary ?? ""}`))).toEqual([]);
        expect(errors).toEqual([]);

        if (comparesPixels) await expect(page.locator("#storybook-root")).toHaveScreenshot(`dark__${id}__${cell.name}.png`);
      });
    }
  }
});
