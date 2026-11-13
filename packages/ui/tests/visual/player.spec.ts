/**
 * Phase 3: the lesson player in the visual matrix (gameplan §15): UI {en,
 * en-XA, ar-XB} × target {fa, yue-Hant-HK, uz-Latn, apc-Arab} × {horizontal,
 * vertical where allowed}, on three screens: the word bank, typing (with the
 * special-character bar where the orthography has one) and feedback with the
 * answer diff; vertical cells show the word bank and a target prompt (a card
 * that first shows a new word). Same structural checks as the exercise card;
 * pixels in the pinned container.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { comparesPixels, expectNoClipping, platformFonts, settle } from "./checks.ts";
import { cellGlobals, cells, storyUrl } from "./matrix.ts";

const SCREENS = ["tiles", "typing", "feedback", "new-words"] as const;
const JYUTPING = "yue-Latn-HK-jyutping";

for (const cell of cells()) {
  for (const screen of SCREENS) {
    // Vertical text applies to the word bank and target prompts (§11.4): the bank, and a target
    // prompt (new-words, vertical cells only).
    if (cell.writingMode === "horizontal-tb" ? screen === "new-words" : screen !== "tiles" && screen !== "new-words") continue;
    test(`player: ${cell.ui} × ${cell.target} × ${cell.writingMode} × ${screen}`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(String(e)));
      page.on("console", (m) => {
        if (m.type() === "error") errors.push(m.text());
      });
      await page.goto(storyUrl(`player-lesson-player--${screen}`, cellGlobals(cell)));
      await settle(page, "[data-lesson-player]");
      const player = page.locator("[data-lesson-player]");

      // Chrome follows the UI locale; the player never inherits a writing mode.
      await expect(page.locator("[data-ui-root]")).toHaveAttribute("dir", cell.uiDir);
      expect(await player.evaluate((el) => getComputedStyle(el).direction)).toBe(cell.uiDir);
      expect(await player.evaluate((el) => getComputedStyle(el).writingMode)).toBe("horizontal-tb");

      // Language data: lang from its own tag, dir from its script.
      const texts = await player.locator("[data-nabu-text]").evaluateAll((els) =>
        els.map((e) => ({ lang: e.getAttribute("lang"), dir: e.getAttribute("dir"), computed: getComputedStyle(e).direction })),
      );
      expect(texts.length).toBeGreaterThan(0);
      // Course content may carry a region the demo fixture does not (uz-Latn-UZ for uz-Latn).
      const isTarget = (lang: string | null): boolean => lang !== null && (lang === cell.targetLang || lang.startsWith(`${cell.targetLang}-`));
      for (const t of texts) {
        expect(isTarget(t.lang) || t.lang === "en-Latn" || t.lang === JYUTPING, `${t.lang}`).toBe(true);
        const expected = isTarget(t.lang) ? cell.targetDir : "ltr";
        expect([t.dir, t.computed]).toEqual([expected, expected]);
      }

      if (screen === "tiles") {
        const region = page.locator("[data-target-region]");
        await expect(region).toHaveAttribute("dir", cell.targetDir);
        expect(await region.evaluate((el) => getComputedStyle(el).writingMode)).toBe(cell.writingMode);
        await expect(page.locator("[data-placed-tile]")).toHaveCount(1);
        if (cell.writingMode !== "horizontal-tb") {
          const tile = await page.locator("[data-word-bank] [data-ink-container]").first().boundingBox();
          expect(tile!.height).toBeGreaterThan(tile!.width);
          // Columns at most 16rem long: a long bank goes on in more columns, never down past Check (ADR 0118).
          const { height, rem } = await region.evaluate((el) => ({ height: el.getBoundingClientRect().height, rem: Number.parseFloat(getComputedStyle(document.documentElement).fontSize) }));
          expect(height).toBeLessThanOrEqual(16 * rem + 1);
        }
      }

      if (screen === "new-words") {
        // Only the target text turns: its play buttons and their label stay horizontal (ADR 0118),
        // and the reading layer shows beside the column as it does above a line (yue: Jyutping).
        const prompt = page.locator("[data-ink-container=prompt]");
        await expect(prompt).toHaveAttribute("data-writing-mode", cell.writingMode);
        expect(await prompt.evaluate((el) => getComputedStyle(el).writingMode)).toBe("horizontal-tb");
        const text = prompt.locator("p[data-nabu-text]");
        expect(await text.evaluate((el) => getComputedStyle(el).writingMode)).toBe(cell.writingMode);
        await expect(text.locator("rt").first()).toBeVisible();
        const buttons = prompt.locator("[data-audio-buttons]");
        if ((await buttons.count()) > 0) expect(await buttons.evaluate((el) => getComputedStyle(el).writingMode)).toBe("horizontal-tb");
      }

      if (screen === "typing") {
        const input = page.locator("[data-answer-input]");
        expect(isTarget(await input.getAttribute("lang"))).toBe(true);
        await expect(input).toHaveAttribute("dir", cell.targetDir);
        await expect(input).toHaveAttribute("spellcheck", "false");
      }

      if (screen === "feedback") {
        await expect(page.locator("[data-feedback]")).toHaveAttribute("data-verdict", /^(WRONG|WRONG_WORD)$/u);
        await expect(page.locator("[data-solution]")).toBeVisible();
        // The differing word is marked, never by colour alone.
        const marked = page.locator("[data-answer-diff] [data-highlight]");
        await expect(marked).toHaveCount(1);
        expect(await marked.evaluate((el) => getComputedStyle(el).textDecorationLine)).toContain("underline");
      }

      // Every glyph from a self-hosted web font: no tofu, no machine-dependent fallback.
      const used = await platformFonts(page, "[data-lesson-player] :is(h2, p, label, button, [data-kind], ruby, rt, li)");
      expect(used.filter((u) => !u.custom), "system-font fallback").toEqual([]);

      await expectNoClipping(page, player);
      expect(await page.evaluate(() => document.scrollingElement!.scrollWidth <= document.scrollingElement!.clientWidth)).toBe(true);

      const axe = await new AxeBuilder({ page }).include("[data-lesson-player]").analyze();
      expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.help}`)).toEqual([]);
      expect(errors).toEqual([]);

      if (comparesPixels) await expect(player).toHaveScreenshot(`player__${cell.name}__${screen}.png`);
    });
  }
}
