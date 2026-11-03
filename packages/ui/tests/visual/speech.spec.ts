/**
 * Phase 9 in the visual matrix (gameplan §15): feedback after scored speaking, UI {en, en-XA,
 * ar-XB} × target {fa, yue-Hant-HK, uz-Latn, apc-Arab}; and choosing a Cantonese tone in each UI
 * locale. Fixture results, no recording.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { comparesPixels, expectNoClipping, platformFonts, settle } from "./checks.ts";
import { cellGlobals, cells, storyUrl } from "./matrix.ts";

const JYUTPING = "yue-Latn-HK-jyutping";

for (const cell of cells()) {
  if (cell.writingMode !== "horizontal-tb") continue;
  const screens = cell.target === "yue-Hant-HK" ? (["feedback", "tones"] as const) : (["feedback"] as const);
  for (const screen of screens) {
    test(`speech: ${cell.ui} × ${cell.target} × ${screen}`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(String(e)));
      page.on("console", (m) => {
        if (m.type() === "error" && !m.text().includes("fixture-s8.mp3") && !m.text().includes("404")) errors.push(m.text());
      });
      await page.goto(storyUrl(screen === "feedback" ? "player-speech--speaking-feedback" : "player-speech--tone-identify", cellGlobals(cell)));
      await settle(page, "[data-lesson-player]");
      const player = page.locator("[data-lesson-player]");
      await expect(page.locator("[data-ui-root]")).toHaveAttribute("dir", cell.uiDir);

      const isTarget = (lang: string | null): boolean => lang !== null && (lang === cell.targetLang || lang.startsWith(`${cell.targetLang}-`));
      const texts = await player.locator("[data-nabu-text]").evaluateAll((els) => els.map((e) => ({ lang: e.getAttribute("lang"), dir: e.getAttribute("dir") })));
      for (const t of texts) {
        expect(isTarget(t.lang) || t.lang === "en-Latn" || t.lang === JYUTPING, `${t.lang}`).toBe(true);
        expect(t.dir, `${t.lang}`).toBe(isTarget(t.lang) ? cell.targetDir : "ltr");
      }

      if (screen === "feedback") {
        await expect(page.locator("[data-feedback]")).toBeVisible();
        await expect(page.locator("[data-speech-result]")).toBeVisible();
        if (cell.target === "yue-Hant-HK") await expect(page.locator("[data-tone-feedback] li")).toHaveCount(1);
      } else {
        await expect(player.locator("[data-tone]")).toHaveCount(6);
        await expect(player.locator("input[type=radio]:checked")).toHaveCount(1);
      }

      const used = await platformFonts(page, "[data-lesson-player] :is(h2, p, li, label, button, span)");
      expect(used.filter((u) => !u.custom), "system-font fallback").toEqual([]);
      // Before answering, the tone screen shows no language data (the syllable appears after).
      if (screen === "feedback") await expectNoClipping(page, player);
      expect(await page.evaluate(() => document.scrollingElement!.scrollWidth <= document.scrollingElement!.clientWidth)).toBe(true);
      const axe = await new AxeBuilder({ page }).include("[data-lesson-player]").analyze();
      expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.help}`)).toEqual([]);
      expect(errors).toEqual([]);
      if (comparesPixels) await expect(player).toHaveScreenshot(`speech__${cell.name}__${screen}.png`);
    });
  }
}
