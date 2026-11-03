/**
 * Draws the app's icons and splash screens (CC0-1.0, drawn for Nabu): three cuneiform wedges,
 * after the god of writing the project is named for, in white on the UI's accent colour. Renders
 * one SVG at every size the Android and iOS projects use, with the Chromium Playwright ships.
 *
 *   node apps/mobile/scripts/icons.ts
 */
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const RES = join(ROOT, "android/app/src/main/res");
const ASSETS = join(ROOT, "ios/App/App/Assets.xcassets");
const ACCENT = "#1f6b4f"; // --nabu-color-accent (packages/ui/src/tokens.css)

/** One wedge: a triangular head at (x, y) and a tapering tail, pointing along `angle` degrees. */
const wedge = (x: number, y: number, length: number, angle: number): string =>
  `<path transform="translate(${x} ${y}) rotate(${angle})" d="M0 -14 L22 0 L0 14 Z M18 -3.5 L${length} -1.2 L${length} 1.2 L18 3.5 Z"/>`;

/** The glyph on a 100×100 canvas: a horizontal wedge over two vertical ones. */
const GLYPH = `<g fill="#fff">${wedge(18, 26, 64, 0)}${wedge(32, 42, 46, 90)}${wedge(58, 42, 46, 90)}</g>`;

type Shape = "square" | "round" | "foreground" | "full";

/** The icon as SVG at `size` px: the glyph scaled to `scale` of the canvas, on a background of `shape`. */
const svg = (size: number, shape: Shape, scale: number, width = size, height = size): string => {
  const g = Math.min(width, height) * scale;
  const background =
    shape === "foreground" ? "" : shape === "round" ? `<circle cx="${width / 2}" cy="${height / 2}" r="${width / 2}" fill="${ACCENT}"/>` : shape === "square" ? `<rect width="${width}" height="${height}" rx="${width * 0.18}" fill="${ACCENT}"/>` : `<rect width="${width}" height="${height}" fill="${ACCENT}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${background}<g transform="translate(${(width - g) / 2} ${(height - g) / 2}) scale(${g / 100})">${GLYPH}</g></svg>`;
};

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
const render = async (file: string, markup: string, width: number, height: number, transparent: boolean): Promise<void> => {
  await page.setViewportSize({ width, height });
  await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent">${markup}</body></html>`);
  writeFileSync(file, await page.locator("svg").screenshot({ omitBackground: transparent }));
};

// Android launcher icons: legacy square and round, and the adaptive foreground (108 dp canvas,
// glyph inside the 66 dp safe zone), per density.
const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 } as const;
for (const [density, k] of Object.entries(DENSITIES)) {
  const dir = join(RES, `mipmap-${density}`);
  await render(join(dir, "ic_launcher.png"), svg(48 * k, "square", 0.7), 48 * k, 48 * k, true);
  await render(join(dir, "ic_launcher_round.png"), svg(48 * k, "round", 0.62), 48 * k, 48 * k, true);
  await render(join(dir, "ic_launcher_foreground.png"), svg(108 * k, "foreground", 0.5), 108 * k, 108 * k, true);
}
writeFileSync(join(RES, "values/ic_launcher_background.xml"), `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${ACCENT}</color>\n</resources>\n`);

// Android splash screens, portrait and landscape.
const SPLASHES: readonly (readonly [string, number, number])[] = [
  ["drawable", 480, 320],
  ["drawable-land-mdpi", 480, 320],
  ["drawable-land-hdpi", 800, 480],
  ["drawable-land-xhdpi", 1280, 720],
  ["drawable-land-xxhdpi", 1600, 960],
  ["drawable-land-xxxhdpi", 1920, 1280],
  ["drawable-port-mdpi", 320, 480],
  ["drawable-port-hdpi", 480, 800],
  ["drawable-port-xhdpi", 720, 1280],
  ["drawable-port-xxhdpi", 960, 1600],
  ["drawable-port-xxxhdpi", 1280, 1920],
];
for (const [dir, w, h] of SPLASHES) await render(join(RES, dir, "splash.png"), svg(0, "full", 0.3, w, h), w, h, false);

// iOS: the 1024 px app icon (opaque, square; the system rounds it) and the splash image.
await render(join(ASSETS, "AppIcon.appiconset/AppIcon-512@2x.png"), svg(1024, "full", 0.62), 1024, 1024, false);
for (const name of ["splash-2732x2732.png", "splash-2732x2732-1.png", "splash-2732x2732-2.png"]) await render(join(ASSETS, "Splash.imageset", name), svg(0, "full", 0.18, 2732, 2732), 2732, 2732, false);

await browser.close();
