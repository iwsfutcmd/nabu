/**
 * Phase 8 in the visual matrix (gameplan §15, §16): Explain My Answer and a roleplay
 * conversation, UI {en, en-XA, ar-XB} × target {fa, yue-Hant-HK, uz-Latn, apc-Arab}, horizontal.
 * The acceptance case is ar-XB × yue: an English explanation quoting Cantonese inside RTL chrome,
 * every segment in its own language and direction, isolated. Fixture data, no model.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { comparesPixels, expectNoClipping, platformFonts, settle } from "./checks.ts";
import { cellGlobals, cells, storyUrl } from "./matrix.ts";

const SCREENS = { explain: "ai-explain-and-roleplay--explain-my-answer", roleplay: "ai-explain-and-roleplay--roleplay" } as const;
const ROOTS = { explain: "[data-explanation]", roleplay: "[data-roleplay]" } as const;

for (const cell of cells()) {
  if (cell.writingMode !== "horizontal-tb") continue;
  for (const screen of ["explain", "roleplay"] as const) {
    test(`ai: ${cell.ui} × ${cell.target} × ${screen}`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(String(e)));
      page.on("console", (m) => {
        if (m.type() === "error") errors.push(m.text());
      });
      await page.goto(storyUrl(SCREENS[screen], cellGlobals(cell)));
      await settle(page, ROOTS[screen]);
      const root = page.locator(ROOTS[screen]);

      // Chrome follows the UI locale.
      await expect(page.locator("[data-ui-root]")).toHaveAttribute("dir", cell.uiDir);
      expect(await root.evaluate((el) => getComputedStyle(el).direction)).toBe(cell.uiDir);

      // Every piece of language data carries its own lang and direction, and is isolated.
      const isTarget = (lang: string | null): boolean => lang !== null && (lang === cell.targetLang || lang.startsWith(`${cell.targetLang}-`));
      const texts = await root.locator("[data-nabu-text]").evaluateAll((els) =>
        els.map((e) => ({ lang: e.getAttribute("lang"), dir: e.getAttribute("dir"), computed: getComputedStyle(e).direction, bidi: getComputedStyle(e).unicodeBidi })),
      );
      expect(texts.length).toBeGreaterThan(3);
      for (const t of texts) {
        expect(isTarget(t.lang) || t.lang === "en-Latn", `${t.lang}`).toBe(true);
        const expected = isTarget(t.lang) ? cell.targetDir : "ltr";
        expect([t.dir, t.computed]).toEqual([expected, expected]);
        expect(t.bidi, `${t.lang} isolated`).toMatch(/isolate|plaintext/u);
      }

      if (screen === "explain") {
        // Prose in English, the quote in the target, the learner's words quoted from the answer.
        const segments = await root.locator("[data-segment]").evaluateAll((els) => els.map((e) => [e.getAttribute("data-segment"), e.querySelector("[data-nabu-text]")?.getAttribute("lang")]));
        expect(segments.some(([kind, lang]) => kind === "support" && lang === "en-Latn")).toBe(true);
        expect(segments.some(([kind, lang]) => kind === "target" && isTarget(lang ?? null))).toBe(true);
        expect(segments.some(([kind, lang]) => kind === "ref" && isTarget(lang ?? null))).toBe(true);
        // The acceptance case: the paragraph is English, so it runs left to right in any UI.
        const prose = root.locator("[data-explanation-text]");
        await expect(prose).toHaveAttribute("lang", "en-Latn");
        expect(await prose.evaluate((el) => getComputedStyle(el).direction)).toBe("ltr");
        await expect(root.locator("[data-explained-answer] [data-highlight]")).not.toHaveCount(0);
        await expect(root.locator("[data-provenance]")).toBeVisible();
        await expect(root.locator("[data-rate=up]")).toHaveAttribute("aria-pressed", "true");
      } else {
        await expect(root.locator("[data-turn]")).toHaveCount(3);
        await expect(root.locator("[data-action=translation][aria-expanded=true]")).toHaveCount(1);
        await expect(root.locator("[data-answer-input]")).toHaveAttribute("dir", cell.targetDir);
        // Scenario texts are English blocks: left to right, even in RTL chrome.
        for (const dd of await root.locator("dd > p").all()) expect(await dd.evaluate((el) => getComputedStyle(el).direction)).toBe("ltr");
      }

      const used = await platformFonts(page, `${ROOTS[screen]} :is(h2, h3, p, dt, dd, label, button, span)`);
      expect(used.filter((u) => !u.custom), "system-font fallback").toEqual([]);
      await expectNoClipping(page, root);
      expect(await page.evaluate(() => document.scrollingElement!.scrollWidth <= document.scrollingElement!.clientWidth)).toBe(true);

      const axe = await new AxeBuilder({ page }).include(ROOTS[screen]).analyze();
      expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.help}`)).toEqual([]);
      expect(errors).toEqual([]);

      if (comparesPixels) await expect(root).toHaveScreenshot(`ai__${cell.name}__${screen}.png`);
    });
  }
}
