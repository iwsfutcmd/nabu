/**
 * The rules explorer (debug mode) in the visual matrix: UI {en, en-XA, ar-XB} × its stories on fixed
 * courses (apc's shereb merged with the present's lexemes and -ni, apc's pinned a7mar, tok's moku with sitelen pona
 * stating no spelling), horizontal (it is a page of lists, not set in columns). Every text keeps its
 * own language's direction whatever the chrome's; ids, features, rules and branches read left to
 * right; nothing is clipped, nothing overflows, no serious axe violation, no runtime error.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { comparesPixels, expectNoClipping, platformFonts, settle } from "./checks.ts";
import { storyUrl, UI_LOCALES } from "./matrix.ts";

const STORIES = [
  { id: "realised", lang: "apc", dir: "rtl" },
  { id: "pinned", lang: "apc", dir: "rtl" },
  { id: "unspelled", lang: "tok", dir: "ltr" },
] as const;

for (const [ui, uiDir] of Object.entries(UI_LOCALES)) {
  for (const story of STORIES) {
    test(`rules explorer: ${ui} × ${story.id}`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(String(e)));
      page.on("console", (m) => {
        if (m.type() === "error") errors.push(m.text());
      });
      await page.goto(storyUrl(`data-rules-explorer--${story.id}`, { uiLocale: "en", pseudoLocale: ui === "en" ? "off" : ui, target: "fa", dir: "auto", writingMode: "horizontal-tb" }));
      await settle(page, "[data-rules-explorer] [data-rules-result]");
      const root = page.locator("[data-rules-explorer]");
      await expect(page.locator("[data-ui-root]")).toHaveAttribute("dir", uiDir);
      await expect(root.locator("[data-rules-result]")).toHaveAttribute("data-rules-result", "ok");

      // Language data: lang from its own tag, dir from its script, whatever the chrome's.
      const texts = await root.locator("[data-rules-live] [data-nabu-text]").evaluateAll((els) => els.map((e) => ({ lang: e.getAttribute("lang") ?? "", dir: e.getAttribute("dir") })));
      expect(texts.length).toBeGreaterThan(0);
      for (const t of texts) if (t.lang.startsWith(story.lang) && !t.lang.includes("-Latn") && !t.lang.includes("-Qaap")) expect(t.dir, t.lang).toBe(story.dir);
      // Rules, branches, ids and features are code: left to right in a right-to-left interface too.
      const step = root.locator("[data-rule-step]").first();
      if ((await step.count()) > 0) expect(await step.evaluate((el) => getComputedStyle(el).direction)).toBe("ltr");
      const feature = root.locator("[data-feature] code").first();
      if ((await feature.count()) > 0) expect(await feature.evaluate((el) => getComputedStyle(el).direction)).toBe("ltr");

      const used = await platformFonts(page, `[data-rules-explorer] :is(h2, label, button, code)`);
      expect(used.filter((u) => !u.custom), "system-font fallback").toEqual([]);
      await expectNoClipping(page, root);
      expect(await page.evaluate(() => document.scrollingElement!.scrollWidth <= document.scrollingElement!.clientWidth)).toBe(true);
      const axe = await new AxeBuilder({ page }).include("[data-rules-explorer]").analyze();
      expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.help}`)).toEqual([]);
      expect(errors).toEqual([]);
      if (comparesPixels) await expect(root.locator("[data-rules-live]")).toHaveScreenshot(`rules__${ui}__${story.id}.png`);
    });
  }
}
