/**
 * Phase 6: the story reader in the visual matrix (gameplan §15): UI {en, en-XA, ar-XB} × target
 * {fa, yue-Hant-HK, uz-Latn, apc-Arab} × {horizontal, vertical where allowed}, on two screens:
 * reading (four lines, a translation open, a word glossed) and a question (building a line from
 * its tiles). Vertical cells are the reading screen: each line's text turns into columns, its
 * reading beside them, while names, buttons, translations and the chrome stay horizontal (§11.4,
 * ADR 0118). Same structural checks as the player; pixels in the pinned container.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { comparesPixels, expectNoClipping, platformFonts, settle } from "./checks.ts";
import { cellGlobals, cells, storyUrl } from "./matrix.ts";

const SCREENS = ["reading", "question"] as const;
const JYUTPING = "yue-Latn-HK-jyutping";

for (const cell of cells()) {
  for (const screen of SCREENS) {
    if (cell.writingMode !== "horizontal-tb" && screen !== "reading") continue;
    test(`story: ${cell.ui} × ${cell.target} × ${cell.writingMode} × ${screen}`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(String(e)));
      page.on("console", (m) => {
        if (m.type() === "error") errors.push(m.text());
      });
      await page.goto(storyUrl(`reading-story-reader--${screen}`, cellGlobals(cell)));
      await settle(page, "[data-story-reader]");
      const reader = page.locator("[data-story-reader]");

      // Chrome follows the UI locale and never turns vertical.
      await expect(page.locator("[data-ui-root]")).toHaveAttribute("dir", cell.uiDir);
      expect(await reader.evaluate((el) => getComputedStyle(el).direction)).toBe(cell.uiDir);
      expect(await reader.evaluate((el) => getComputedStyle(el).writingMode)).toBe("horizontal-tb");

      // Language data: lang from its own tag, dir from its script.
      const isTarget = (lang: string | null): boolean => lang !== null && (lang === cell.targetLang || lang.startsWith(`${cell.targetLang}-`));
      const texts = await reader.locator("[data-nabu-text]").evaluateAll((els) =>
        els.map((e) => ({ lang: e.getAttribute("lang"), dir: e.getAttribute("dir"), computed: getComputedStyle(e).direction })),
      );
      expect(texts.length).toBeGreaterThan(4);
      for (const t of texts) {
        expect(isTarget(t.lang) || t.lang === "en-Latn" || t.lang === JYUTPING, `${t.lang}`).toBe(true);
        const expected = isTarget(t.lang) ? cell.targetDir : "ltr";
        expect([t.dir, t.computed]).toEqual([expected, expected]);
      }

      if (screen === "reading") {
        const transcript = page.locator("[data-story-transcript]");
        await expect(transcript).toHaveAttribute("data-writing-mode", cell.writingMode);
        expect(await transcript.locator("[data-line]").count()).toBeGreaterThanOrEqual(4);
        // Words are buttons for tap-for-gloss; one is open, and the panel explains it.
        await expect(transcript.locator("button[aria-pressed=true]")).toHaveCount(1);
        await expect(page.locator("[data-gloss-panel] [data-gloss-kc]")).not.toHaveCount(0);
        await expect(transcript.locator("[data-action=translate][aria-expanded=true]")).toHaveCount(1);
        // Only the lines' text may turn: the transcript, the names, the buttons and the translations
        // stay horizontal, as the chrome does (ADR 0118).
        expect(await transcript.evaluate((el) => getComputedStyle(el).writingMode)).toBe("horizontal-tb");
        const lineText = transcript.locator("[data-line] p[data-nabu-text]").first();
        expect(await lineText.evaluate((el) => getComputedStyle(el).writingMode)).toBe(cell.writingMode);
        for (const chrome of ["[data-action=translate]", "[data-action=play]"]) {
          const modes = await transcript.locator(chrome).evaluateAll((els) => els.map((el) => getComputedStyle(el).writingMode));
          expect(modes.length, chrome).toBeGreaterThan(0);
          expect(new Set(modes), chrome).toEqual(new Set(["horizontal-tb"]));
        }
        // No empty block pushing Continue down: the newest line ends where its content does, and the
        // transcript where the newest line does.
        const gaps = await transcript.evaluate((el) => {
          const line = el.querySelector("[data-line]:last-child");
          if (line === null) return [Number.POSITIVE_INFINITY];
          const content = Math.max(...[...line.children].map((c) => c.getBoundingClientRect().bottom));
          const bottom = line.getBoundingClientRect().bottom;
          return [bottom - content, el.getBoundingClientRect().bottom - bottom];
        });
        for (const gap of gaps) expect(gap).toBeLessThan(24);
        if (cell.writingMode !== "horizontal-tb") {
          // Columns: each line's text runs top to bottom, its reading beside it (yue shows Jyutping).
          const line = await lineText.boundingBox();
          expect(line!.height).toBeGreaterThan(line!.width);
          await expect(transcript.locator("rt").first()).toBeVisible();
        }
      }

      if (screen === "question") {
        await expect(page.locator("[data-story-question]")).toBeVisible();
        const region = page.locator("[data-target-region]");
        await expect(region).toHaveAttribute("dir", cell.targetDir);
        await expect(page.locator("[data-placed-tile]")).toHaveCount(1);
      }

      const used = await platformFonts(page, "[data-story-reader] :is(h2, p, dt, dd, label, button, [data-kind], ruby, rt)");
      expect(used.filter((u) => !u.custom), "system-font fallback").toEqual([]);

      await expectNoClipping(page, reader);
      expect(await page.evaluate(() => document.scrollingElement!.scrollWidth <= document.scrollingElement!.clientWidth)).toBe(true);

      const axe = await new AxeBuilder({ page }).include("[data-story-reader]").analyze();
      expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.help}`)).toEqual([]);
      expect(errors).toEqual([]);

      if (comparesPixels) await expect(reader).toHaveScreenshot(`story__${cell.name}__${screen}.png`);
    });
  }
}
