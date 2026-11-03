/**
 * Phase 0 acceptance: the demo exercise card renders correctly in every cell of
 * UI {en, en-XA, ar-XB} × target {fa, yue-Hant-HK, uz-Latn, apc-Arab} ×
 * {horizontal, vertical-rl where allowed}, at mobile and desktop widths.
 *
 * "Correctly" is checked structurally (lang/dir per language context, writing
 * mode, ruby, icon mirroring, progress direction, fonts actually used, no glyph
 * ink outside its container, no page overflow, axe) and, inside the pinned
 * container, against reviewed screenshots.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { comparesPixels, expectNoClipping, platformFonts, settle } from "./checks.ts";
import { cellGlobals, cells, storyUrl } from "./matrix.ts";

const STORY = "demo-exercise-card--from-toolbar";

/** First family each language context must actually render with (profile stack, else script default). */
const PRIMARY_FONT: Readonly<Record<string, string>> = {
  "fa-Arab-IR": "Vazirmatn",
  "yue-Hant-HK": "Noto Sans HK",
  "uz-Latn": "Noto Sans",
  "apc-Arab-LB": "Noto Naskh Arabic",
  "en-Latn": "Noto Sans",
};

for (const cell of cells()) {
  test(`exercise card: ${cell.ui} × ${cell.target} × ${cell.writingMode}`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });

    await page.goto(storyUrl(STORY, cellGlobals(cell)));
    await settle(page, "[data-exercise-card]");
    const card = page.locator("[data-exercise-card]");

    // UI context: chrome follows the UI locale.
    const root = page.locator("[data-ui-root]");
    await expect(root).toHaveAttribute("lang", cell.ui);
    await expect(root).toHaveAttribute("dir", cell.uiDir);
    expect(await card.evaluate((el) => getComputedStyle(el).direction)).toBe(cell.uiDir);
    expect(await card.evaluate((el) => getComputedStyle(el).writingMode)).toBe("horizontal-tb");

    // Every piece of language data: lang from its tag, dir from its script, never inherited from the chrome.
    const texts = await page.locator("[data-nabu-text]").evaluateAll((els) =>
      els.map((e) => ({ lang: e.getAttribute("lang"), dir: e.getAttribute("dir"), computed: getComputedStyle(e).direction })),
    );
    expect(texts.length).toBeGreaterThan(5);
    for (const t of texts) {
      const expected = t.lang === "en-Latn" ? "ltr" : cell.targetDir;
      expect([t.lang === "en-Latn" || t.lang === cell.targetLang, t.dir, t.computed]).toEqual([true, expected, expected]);
    }

    // Target context: answer row and word bank follow the target orthography.
    const region = page.locator("[data-target-region]");
    await expect(region).toHaveAttribute("dir", cell.targetDir);
    expect(await region.evaluate((el) => getComputedStyle(el).writingMode)).toBe(cell.writingMode);
    const input = page.locator("[data-answer-input]");
    await expect(input).toHaveAttribute("lang", cell.targetLang);
    await expect(input).toHaveAttribute("dir", cell.targetDir);
    await expect(input).toHaveAttribute("autocapitalize", "off");
    await expect(input).toHaveAttribute("autocorrect", "off");
    await expect(input).toHaveAttribute("spellcheck", "false");

    // Ruby: Jyutping over every Han character in horizontal text, hidden by default in vertical (§11.4).
    const rt = await page.locator("[data-target-region] rt").count();
    expect(rt).toBe(cell.target === "yue-Hant-HK" && cell.writingMode === "horizontal-tb" ? 9 : 0);

    // Vertical text really is laid out in columns: tiles stack along the block axis of the page.
    if (cell.writingMode !== "horizontal-tb") {
      const tile = await page.locator("[data-word-bank] [data-ink-container]").first().boundingBox();
      expect(tile).not.toBeNull();
      expect(tile!.height).toBeGreaterThan(tile!.width);
    }

    // Direction icons mirror with the chrome; media icons never do (§11.3).
    const transform = (sel: string) => page.locator(sel).evaluate((el) => getComputedStyle(el).transform);
    expect(await transform("[data-icon=arrow-forward]")).toBe(cell.uiDir === "rtl" ? "matrix(-1, 0, 0, 1, 0, 0)" : "none");
    expect(await transform("[data-icon=play]")).toBe("none");

    // The progress bar fills from the inline start: from the right in RTL chrome.
    const track = (await page.locator("[data-progress-track]").boundingBox())!;
    const fill = (await page.locator("[data-progress-fill]").boundingBox())!;
    if (cell.uiDir === "ltr") expect(Math.abs(fill.x - track.x)).toBeLessThan(1);
    else expect(Math.abs(fill.x + fill.width - (track.x + track.width))).toBeLessThan(1);

    // Fonts: every glyph comes from a self-hosted web font, and language data uses its own stack.
    const used = await platformFonts(page, "[data-exercise-card] :is(h2, p, label, button, [data-kind], ruby, rt)");
    expect(used.filter((u) => !u.custom), "system-font fallback (tofu risk, machine-dependent rendering)").toEqual([]);
    for (const [lang, family] of Object.entries(PRIMARY_FONT)) {
      if (lang !== "en-Latn" && lang !== cell.targetLang) continue;
      const tokens = await platformFonts(page, `[data-nabu-text][lang="${lang}"] [data-kind="word"]`);
      expect(tokens.length).toBeGreaterThan(0);
      // CDP reports the font file's own name; Fontsource's Noto Sans HK subsets call themselves "Noto Sans HK Thin".
      for (const t of tokens) expect(t.families.some((f) => f.startsWith(family)), `${t.selector} → ${t.families.join(", ")}`).toBe(true);
    }

    // No glyph (tall marks, ruby, descenders) leaks outside its tile or the prompt.
    await expectNoClipping(page, card);

    // No horizontal page scroll in either viewport.
    expect(await page.evaluate(() => document.scrollingElement!.scrollWidth <= document.scrollingElement!.clientWidth)).toBe(true);

    // Accessibility: no serious or critical axe violations.
    const axe = await new AxeBuilder({ page }).include("[data-exercise-card]").analyze();
    expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.help}`)).toEqual([]);

    expect(errors).toEqual([]);

    if (comparesPixels) await expect(card).toHaveScreenshot(`${cell.name}.png`);
  });
}
