/**
 * Builds the service worker (sw/sw.ts) into sw.js next to the app (Phase 10). The worker gets the
 * list of this build's shell files (HTML, script, styles, the web app manifest, and the public
 * directory's own files such as the icons; fonts are kept as they are fetched, the course bundles
 * as the app stores them), the UI catalogs' files by locale (it keeps the learner's with the shell,
 * ADR 0119) and a version derived from them, so a new build installs a new shell. In development,
 * /sw.js is built on request with an empty shell and leaves fetches alone (push still works).
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build, type InlineConfig, type Plugin, type ResolvedConfig } from "vite";

const ENTRY = fileURLToPath(new URL("./sw/sw.ts", import.meta.url));
/** Kept out of the shell: fetched (and kept) only where a script needs them. */
const LAZY = /\.(?:woff2?|ttf|otf)$/u;
/**
 * Modules kept out of the shell with their stylesheets, and kept as they are fetched: the
 * stylesheets of fonts loaded with their text (packages/ui/src/fonts-*.css: the Han families, ADR
 * 0119) and the demo card (`?target=`), which no learner opens.
 */
const ON_DEMAND = /[\\/]packages[\\/]ui[\\/]src[\\/](?:fonts-[^\\/]+\.css|demo[\\/]index\.ts)$/u;
/** A UI catalog (packages/i18n/messages/<locale>.json): the worker keeps only those the learner's pages read. */
const CATALOG = /[\\/]packages[\\/]i18n[\\/]messages[\\/]([^\\/]+)\.json$/u;
/** The public directory's course bundles: offline keeps them course by course (BUNDLE_CACHE), never in the shell. */
const BUNDLES = "bundles";

/** The public directory's files but the bundles (and a desktop's dotfiles), as paths from the app's root ("icons/nabu.svg"). */
const publicFiles = (dir: string, prefix = ""): string[] =>
  readdirSync(join(dir, prefix), { withFileTypes: true }).flatMap((e) => {
    const path = `${prefix}${e.name}`;
    if (e.name.startsWith(".")) return [];
    if (e.isDirectory()) return path === BUNDLES ? [] : publicFiles(dir, `${path}/`);
    return e.isFile() ? [path] : [];
  });

/** A UI catalog's files, by locale. */
type Catalogs = Readonly<Record<string, readonly string[]>>;

const config = (opts: { precache: readonly string[]; catalogs: Catalogs; version: string; dev: boolean; outDir?: string; write: boolean }): InlineConfig => ({
  configFile: false,
  logLevel: "warn",
  publicDir: false,
  define: {
    __NABU_PRECACHE__: JSON.stringify(opts.precache),
    __NABU_CATALOGS__: JSON.stringify(opts.catalogs),
    __NABU_VERSION__: JSON.stringify(opts.version),
    __NABU_DEV__: JSON.stringify(opts.dev),
  },
  build: {
    write: opts.write,
    ...(opts.outDir === undefined ? {} : { outDir: opts.outDir }),
    emptyOutDir: false,
    copyPublicDir: false,
    sourcemap: false,
    reportCompressedSize: false,
    lib: { entry: ENTRY, formats: ["iife"], name: "nabuServiceWorker", fileName: () => "sw.js" },
  },
});

export const serviceWorker = (): Plugin => {
  let resolved: ResolvedConfig | undefined;
  let shell: string[] = [];
  let catalogs: Record<string, string[]> = {};
  /** Every file of the build: a new one makes a new version, even outside the shell. */
  let files: string[] = [];
  /** The public files' contents: their names carry no hash, so a changed icon still makes a new shell. */
  let stamp = "";
  return {
    name: "nabu-service-worker",
    configResolved(c) {
      resolved = c;
    },
    writeBundle(_options, bundle) {
      const dir = resolved?.publicDir ?? "";
      const own = dir === "" || !existsSync(dir) ? [] : publicFiles(dir).filter((f) => !LAZY.test(f));
      catalogs = {};
      const out = new Set<string>();
      for (const [file, output] of Object.entries(bundle)) {
        if (output.type === "asset") {
          // A stylesheet loaded on its own (the fonts' by fonts.ts) names the module it came from.
          if (output.originalFileNames.some((f) => ON_DEMAND.test(f))) out.add(file);
          continue;
        }
        const from = output.facadeModuleId ?? "";
        const locale = CATALOG.exec(from)?.[1];
        if (locale !== undefined) {
          (catalogs[locale] ??= []).push(file);
          out.add(file);
        } else if (ON_DEMAND.test(from)) {
          out.add(file);
          for (const css of output.viteMetadata?.importedCss ?? []) out.add(css);
        }
      }
      files = [...Object.keys(bundle).filter((f) => !f.endsWith(".map")), ...own].sort();
      shell = files.filter((f) => !LAZY.test(f) && !out.has(f));
      stamp = own
        .sort()
        .map((f) => createHash("sha256").update(readFileSync(join(dir, f))).digest("hex"))
        .join("\n");
    },
    async closeBundle() {
      if (resolved === undefined || resolved.command !== "build" || shell.length === 0) return;
      const version = createHash("sha256").update(files.join("\n")).update(stamp).digest("hex").slice(0, 16);
      await build(config({ precache: shell, catalogs, version, dev: false, outDir: resolved.build.outDir, write: true }));
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split("?")[0] !== `${server.config.base}sw.js`) {
          next();
          return;
        }
        build(config({ precache: [], catalogs: {}, version: "dev", dev: true, write: false })).then(
          (out) => {
            const outputs = (Array.isArray(out) ? out : [out]) as { output: { type: string; fileName: string; code?: string }[] }[];
            const chunk = outputs.flatMap((o) => o.output).find((o) => o.type === "chunk" && o.fileName === "sw.js");
            res.setHeader("Content-Type", "text/javascript");
            res.setHeader("Service-Worker-Allowed", server.config.base);
            res.end(chunk?.code ?? "");
          },
          (e: unknown) => next(e),
        );
      });
    },
  };
};
