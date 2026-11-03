import { expect, type Locator, type Page } from "@playwright/test";
import { PNG } from "pngjs";

/** Pixel comparison is meaningful only inside the pinned Playwright container. */
export const comparesPixels = process.env["NABU_VISUAL_ENV"] === "container";
if (process.env["CI"] && !comparesPixels) throw new Error("CI must run the visual suite inside the Playwright container");

/** Waits for the story, every web font it uses, and two frames of layout. */
export const settle = async (page: Page, selector: string): Promise<void> => {
  await page.locator(selector).first().waitFor();
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
};

export interface FontUse {
  readonly selector: string;
  readonly families: readonly string[];
  readonly custom: boolean;
}

/**
 * The fonts Chromium actually used for each element's own text nodes (CDP
 * CSS.getPlatformFontsForNode). Proves there is no tofu and no fallback to a
 * system font, which would also make screenshots machine-dependent.
 */
export const platformFonts = async (page: Page, selector: string): Promise<FontUse[]> => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("DOM.enable");
  await cdp.send("CSS.enable");
  const { root } = await cdp.send("DOM.getDocument", { depth: -1 });
  const { nodeIds } = await cdp.send("DOM.querySelectorAll", { nodeId: root.nodeId, selector });
  const out: FontUse[] = [];
  for (const nodeId of nodeIds) {
    const { fonts } = await cdp.send("CSS.getPlatformFontsForNode", { nodeId });
    const used = fonts.filter((f) => f.glyphCount > 0);
    if (used.length === 0) continue;
    const { outerHTML } = await cdp.send("DOM.getOuterHTML", { nodeId });
    out.push({ selector: outerHTML.slice(0, 120), families: used.map((f) => f.familyName), custom: used.every((f) => f.isCustomFont) });
  }
  await cdp.detach();
  return out;
};

/**
 * Counts "ink" pixels in a thin ring just outside an element's border box: any
 * glyph (or mark) that spills out of its container shows up there. The ring
 * starts `gap` px out so the container's own anti-aliased edge is ignored.
 * Requires a uniform background around the element (tiles and the prompt
 * have ≥ 8px of clear space).
 */
export const inkOutside = async (page: Page, element: Locator, gap = 1, ring = 3, tolerance = 48): Promise<number> => {
  await element.scrollIntoViewIfNeeded();
  const box = await element.boundingBox();
  if (box === null) throw new Error("element not visible");
  const scroll = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));
  const pad = gap + ring;
  const x = Math.floor(box.x + scroll.x) - pad;
  const y = Math.floor(box.y + scroll.y) - pad;
  const width = Math.ceil(box.x + scroll.x + box.width) + pad - x;
  const height = Math.ceil(box.y + scroll.y + box.height) + pad - y;
  const png = PNG.sync.read(await page.screenshot({ clip: { x, y, width, height }, fullPage: true, animations: "disabled", caret: "hide" }));
  const inRing = (px: number, py: number): boolean => px < ring || py < ring || px >= width - ring || py >= height - ring;
  const pixels: number[] = [];
  const counts = new Map<number, number>();
  for (let py = 0; py < png.height; py++) {
    for (let px = 0; px < png.width; px++) {
      if (!inRing(px, py)) continue;
      const i = (py * png.width + px) * 4;
      const rgb = ((png.data[i] as number) << 16) | ((png.data[i + 1] as number) << 8) | (png.data[i + 2] as number);
      pixels.push(rgb);
      counts.set(rgb, (counts.get(rgb) ?? 0) + 1);
    }
  }
  const background = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
  const channel = (c: number, shift: number): number => (c >> shift) & 0xff;
  return pixels.filter((p) => [16, 8, 0].some((s) => Math.abs(channel(p, s) - channel(background, s)) > tolerance)).length;
};

/** Ink check over every [data-ink-container] in scope. */
export const expectNoClipping = async (page: Page, scope: Locator): Promise<void> => {
  const containers = scope.locator("[data-ink-container]");
  const n = await containers.count();
  expect(n).toBeGreaterThan(0);
  for (let i = 0; i < n; i++) {
    const el = containers.nth(i);
    const ink = await inkOutside(page, el);
    expect(ink, `ink outside ${await el.getAttribute("data-ink-container")} #${i}: ${await el.innerText()}`).toBe(0);
  }
};
