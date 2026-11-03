/**
 * Builds the service worker (sw/sw.ts) into sw.js next to the app (Phase 10). The worker gets the
 * list of this build's shell files (HTML, script, styles; fonts are kept as they are fetched) and
 * a version derived from their names, so a new build installs a new shell. In development,
 * /sw.js is built on request with an empty shell and leaves fetches alone (push still works).
 */
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { build, type InlineConfig, type Plugin, type ResolvedConfig } from "vite";

const ENTRY = fileURLToPath(new URL("./sw/sw.ts", import.meta.url));
/** Kept out of the shell: fetched (and kept) only where a script needs them. */
const LAZY = /\.(?:woff2?|ttf|otf)$/u;

const config = (opts: { precache: readonly string[]; version: string; dev: boolean; outDir?: string; write: boolean }): InlineConfig => ({
  configFile: false,
  logLevel: "warn",
  publicDir: false,
  define: {
    __NABU_PRECACHE__: JSON.stringify(opts.precache),
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
  return {
    name: "nabu-service-worker",
    configResolved(c) {
      resolved = c;
    },
    writeBundle(_options, bundle) {
      shell = Object.keys(bundle)
        .filter((f) => !LAZY.test(f) && !f.endsWith(".map"))
        .sort();
    },
    async closeBundle() {
      if (resolved === undefined || resolved.command !== "build" || shell.length === 0) return;
      const version = createHash("sha256").update(shell.join("\n")).digest("hex").slice(0, 16);
      await build(config({ precache: shell, version, dev: false, outDir: resolved.build.outDir, write: true }));
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split("?")[0] !== `${server.config.base}sw.js`) {
          next();
          return;
        }
        build(config({ precache: [], version: "dev", dev: true, write: false })).then(
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
