/**
 * The web app manifest (manifest.webmanifest): what a browser needs to install the app, to open
 * from a home screen or the desktop in a window of its own, beside the service worker that keeps
 * it working offline (ADR 0047). Nothing in it is written by hand:
 *
 * - its name and description are the UI catalog's (app.name, landing.tagline), in the default
 *   UI locale, with that locale's lang and dir;
 * - its colours are the light theme's page colour (tokens.css), as index.html's theme-color;
 * - its icons are public/icons, drawn with the native apps' by apps/mobile/scripts/icons.ts.
 *
 * The build writes it beside index.html, which links it; the dev server writes it on request.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DEFAULT_UI_LOCALE, loadTranslator } from "@nabu/i18n";
import type { Plugin } from "vite";

const TOKENS = resolve(import.meta.dirname, "../../packages/ui/src/tokens.css");
const FILE = "manifest.webmanifest";

/** A design token's value in the light theme: its declaration in tokens.css's first `:root` rule. */
export const lightToken = (name: string, css: string = readFileSync(TOKENS, "utf8")): string => {
  const plain = css.replace(/\/\*[\s\S]*?\*\//gu, "");
  const at = plain.indexOf(":root {");
  const body = at < 0 ? "" : plain.slice(plain.indexOf("{", at) + 1, plain.indexOf("}", at));
  const declaration = body
    .split(";")
    .map((d) => d.trim())
    .find((d) => d.startsWith(`${name}:`));
  if (declaration === undefined) throw new Error(`tokens.css: :root sets no ${name}`);
  return declaration.slice(name.length + 1).trim();
};

/** The icons (public/icons), as the manifest lists them; index.html links the favicon and Apple's icon. */
const ICONS = [
  { src: "icons/nabu.svg", sizes: "any", type: "image/svg+xml" },
  { src: "icons/nabu-192.png", sizes: "192x192", type: "image/png" },
  { src: "icons/nabu-512.png", sizes: "512x512", type: "image/png" },
  // The whole square is background: each platform cuts its own shape from it.
  { src: "icons/nabu-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
] as const;

/** The manifest. Its URLs are relative to it, so one build works at any path (Pages serves the demo under one). */
export const webManifest = async (): Promise<Record<string, unknown>> => {
  const t = await loadTranslator(DEFAULT_UI_LOCALE);
  const page = lightToken("--nabu-color-page");
  return {
    name: t.format("app.name"),
    short_name: t.format("app.name"),
    description: t.format("landing.tagline"),
    lang: t.locale,
    dir: t.dir,
    start_url: "./",
    scope: "./",
    display: "standalone",
    background_color: page,
    theme_color: page,
    icons: ICONS,
  };
};

const json = async (): Promise<string> => `${JSON.stringify(await webManifest(), null, 2)}\n`;

export const manifest = (): Plugin => {
  let base = "/";
  return {
    name: "nabu-web-manifest",
    configResolved(config) {
      base = config.base;
    },
    // Emitted into the bundle, so the service worker's shell (vite-sw.ts) keeps it too.
    async generateBundle() {
      this.emitFile({ type: "asset", fileName: FILE, source: await json() });
    },
    transformIndexHtml: () => [{ tag: "link", attrs: { rel: "manifest", href: `${base}${FILE}` }, injectTo: "head" }],
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split("?")[0] !== `${server.config.base}${FILE}`) {
          next();
          return;
        }
        json().then(
          (body) => {
            res.setHeader("Content-Type", "application/manifest+json");
            res.end(body);
          },
          (e: unknown) => next(e),
        );
      });
    },
  };
};
