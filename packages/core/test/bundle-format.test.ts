/**
 * The bundle format a build reads (the manifest's `formatVersion`). Format 2 has lexemes where a
 * bundle had KCs (ADR 0145): its units, tokens and files are other shapes than format 1's. Format 3
 * is format 2 with the token kind `lexical` where it was `word`. Format 4 is format 3 whose profiles
 * and schemes state what they write of the sound (ADR 0148, no `soundAlike` or `variants` any more)
 * and whose lexemes carry their `leftovers`. Format 5 is format 4 whose lexicon lists its cells and
 * principal parts and whose lexemes carry their `paradigm` (docs/rules-design.md, stage 4: the
 * compiler lists the forms, the device looks them up), so the reader takes format 5 and nothing else.
 * A device may still hold a course cached in an older
 * format (the service worker keeps what it fetched): that bundle is refused whole, by its version,
 * never read as if it were the new one; the app fetches the course again.
 *
 * Formats 0 and 1 differed only in how credits were written (ADR 0110), and the reader took both
 * alike. Both were bundles of KCs: neither is read any more.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { BundleManifest } from "@nabu/schema";
import { describe, expect, it } from "vitest";
import { assembleCourse, BUNDLE_FORMAT } from "../src/lesson/index.ts";
import { coreFiles } from "../src/offline/index.ts";

const ROOT = resolve(import.meta.dirname, "../../..");
const BUNDLES = join(ROOT, "apps/web/public/bundles");
const numberingSystems = JSON.parse(readFileSync(join(ROOT, "packages/i18n/src/generated/numbering-systems.json"), "utf8")) as Record<string, string>;

/** A committed bundle: its manifest and every file the app parses (media are URLs). */
const load = (id: string): { readonly manifest: BundleManifest; readonly files: ReadonlyMap<string, unknown> } => {
  const manifest = JSON.parse(readFileSync(join(BUNDLES, id, "manifest.json"), "utf8")) as BundleManifest;
  const files = new Map(coreFiles(manifest).map((f) => [f.path, JSON.parse(readFileSync(join(BUNDLES, id, f.path), "utf8")) as unknown]));
  return { manifest, files };
};

describe("the bundle format a build reads", () => {
  for (const id of ["tok", "apc"]) {
    it(`${id}: the committed bundle is of the format this build reads, and assembles`, () => {
      const { manifest, files } = load(id);
      expect(manifest.formatVersion).toBe(BUNDLE_FORMAT);
      const course = assembleCourse({ manifest, files, numberingSystems });
      expect(course.ok).toBe(true);
      if (!course.ok) return;
      expect(course.value.lexicon.lexemes.length).toBeGreaterThan(0);
      expect(course.value.units.length).toBe(manifest.units.length);
    });

    it(`${id}: a bundle of another format is refused, by its version, whatever else it holds`, () => {
      const { manifest, files } = load(id);
      // Formats 0 and 1 (KCs), 2 (tokens of kind `word`), 3 (soundAlike), 4 (no paradigms): a device may hold one cached; a later one, and none at all.
      for (const version of [0, 1, 2, 3, 4, BUNDLE_FORMAT + 1, undefined]) {
        const other = { ...manifest, formatVersion: version } as unknown as BundleManifest;
        expect(assembleCourse({ manifest: other, files, numberingSystems })).toEqual({ ok: false, error: { code: "format", version } });
      }
    });
  }
});
