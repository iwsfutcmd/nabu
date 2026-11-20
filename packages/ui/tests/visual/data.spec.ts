/**
 * The Data page's browser (debug mode) in the visual matrix: UI {en, en-XA, ar-XB} × {fa,
 * yue-Hant-HK, uz-Latn, apc-Arab}, horizontal (a list is not set in columns), on its three lists: a
 * word with the ways its sentences write it, a form with the words that carry it, and a sentence
 * with its words. Every text keeps its own language's direction whatever the chrome's; ids and tags
 * read left to right.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { comparesPixels, expectNoClipping, platformFonts, settle } from "./checks.ts";
import { cellGlobals, cells, storyUrl } from "./matrix.ts";

const VIEWS = ["words", "forms", "sentences"] as const;

for (const cell of cells()) {
  if (cell.writingMode !== "horizontal-tb") continue;
  for (const view of VIEWS) {
    test(`data: ${cell.ui} × ${cell.target} × ${view}`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(String(e)));
      page.on("console", (m) => {
        if (m.type() === "error") errors.push(m.text());
      });
      await page.goto(storyUrl(`data--${view}`, cellGlobals(cell)));
      await settle(page, "[data-data-browser]");
      const browser = page.locator("[data-data-browser]");
      await expect(page.locator("[data-ui-root]")).toHaveAttribute("dir", cell.uiDir);
      await expect(browser.locator("[data-data-view]")).toHaveAttribute("data-data-view", view);
      const rows = browser.locator("[data-data-row]");
      expect(await rows.count()).toBeGreaterThanOrEqual(1);

      // Language data: lang from its own tag, dir from its script, whatever the chrome's.
      const texts = await rows.locator("[data-nabu-text]").evaluateAll((els) => els.map((e) => ({ lang: e.getAttribute("lang") ?? "", dir: e.getAttribute("dir") })));
      expect(texts.length).toBeGreaterThan(0);
      for (const t of texts) {
        if (t.lang.startsWith(cell.targetLang)) expect(t.dir, t.lang).toBe(cell.targetDir);
        if (t.lang.startsWith("en")) expect(t.dir, t.lang).toBe("ltr");
      }
      // Ids and tags are code: left to right in a right-to-left interface too.
      const id = rows.first().locator("[data-entry-id]");
      expect(await id.evaluate((el) => getComputedStyle(el).direction)).toBe("ltr");
      if (view !== "forms") {
        // A word's parts stand in the word's own direction.
        const parts = rows.first().locator("[data-parts]").first();
        if ((await parts.count()) > 0) await expect(parts).toHaveAttribute("dir", cell.targetDir);
      }

      // The interface's own text, ids and tags, and text in the language being learned, are set in
      // the app's fonts. A meaning may cite a word of that language inside English (a course's
      // glosses do), which its English face has no letters for: not checked here.
      const used = await platformFonts(page, `[data-data-browser] :is(h2, label, button, code, [data-parts-asked], [data-data-found], [data-nabu-text][lang^="${cell.targetLang}"] :is([data-kind], rt))`);
      expect(used.filter((u) => !u.custom), "system-font fallback").toEqual([]);
      await expectNoClipping(page, browser);
      expect(await page.evaluate(() => document.scrollingElement!.scrollWidth <= document.scrollingElement!.clientWidth)).toBe(true);
      const axe = await new AxeBuilder({ page }).include("[data-data-browser]").analyze();
      expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.help}`)).toEqual([]);
      expect(errors).toEqual([]);
      if (comparesPixels) await expect(browser).toHaveScreenshot(`data__${cell.name}__${view}.png`);
    });
  }
}
