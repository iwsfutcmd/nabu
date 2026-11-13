/**
 * Bundles in either format (ADR 0110). Format 1 defines each credit once, in the manifest's
 * `credits`, and files and clips name it by id; format 0 repeated the text on every file (`source`)
 * and clip (`credit`). A device may hold a course cached in either (the service worker keeps what it
 * fetched; downloads check sha256 and keep the manifest last), so the reader takes both alike: what
 * a course is, plays and downloads does not depend on how its credits are written.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { BundleManifest } from "@nabu/schema";
import { describe, expect, it } from "vitest";
import { assembleCourse, MEDIA_ROLES, type CourseView } from "../src/lesson/index.ts";
import { coreFiles, downloadPlan, offlineStatus, stalePaths } from "../src/offline/index.ts";

const ROOT = resolve(import.meta.dirname, "../../..");
const BUNDLES = join(ROOT, "apps/web/public/bundles");
const numberingSystems = JSON.parse(readFileSync(join(ROOT, "packages/i18n/src/generated/numbering-systems.json"), "utf8")) as Record<string, string>;

type Json = Record<string, unknown>;
interface Clip extends Json {
  readonly credit?: string;
}
type AudioIndex = { readonly items: Record<string, Record<string, Clip>> };
interface Bundle {
  readonly manifest: Json & { readonly files: readonly (Json & { readonly role: string; readonly path: string })[] };
  readonly files: ReadonlyMap<string, unknown>;
}

/** A committed bundle: its manifest and every file the app parses (media are URLs). */
const load = (id: string): Bundle => {
  const manifest = JSON.parse(readFileSync(join(BUNDLES, id, "manifest.json"), "utf8")) as Bundle["manifest"];
  const files = new Map(manifest.files.filter((f) => !MEDIA_ROLES.has(f.role)).map((f) => [f.path, JSON.parse(readFileSync(join(BUNDLES, id, f.path), "utf8")) as unknown]));
  return { manifest, files };
};

const indexPath = (b: Bundle): string | undefined => b.manifest.files.find((f) => f.role === "audio-index")?.path;

/** The bundle with every clip of its audio index rewritten. */
const withClips = (b: Bundle, clip: (c: Clip) => Clip): ReadonlyMap<string, unknown> => {
  const path = indexPath(b);
  if (path === undefined) return b.files;
  const index = b.files.get(path) as AudioIndex;
  const items = Object.fromEntries(Object.entries(index.items).map(([item, speeds]) => [item, Object.fromEntries(Object.entries(speeds).map(([speed, c]) => [speed, clip(c)]))]));
  return new Map([...b.files, [path, { items }]]);
};

const creditId = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex").slice(0, 8);

/** Format 0: each credit's text on its file (`source`) and clip. */
const format0 = (b: Bundle): Bundle => {
  if (b.manifest["formatVersion"] === 0) return b;
  const { credits, ...rest } = b.manifest as Bundle["manifest"] & { readonly credits: Record<string, string> };
  const text = (id: unknown): string => credits[id as string] as string;
  const files = rest.files.map(({ credit, ...f }) => (credit === undefined ? f : { ...f, source: text(credit) }));
  return { manifest: { ...rest, formatVersion: 0, files }, files: withClips(b, (c) => (c.credit === undefined ? c : { ...c, credit: text(c.credit) })) };
};

/** Format 1: each credit once, by id. */
const format1 = (b: Bundle): Bundle => {
  if (b.manifest["formatVersion"] === 1) return b;
  const credits: Record<string, string> = {};
  const id = (text: unknown): string => {
    const key = creditId(text as string);
    credits[key] = text as string;
    return key;
  };
  const files = b.manifest.files.map(({ source, ...f }) => (source === undefined ? f : { ...f, credit: id(source) }));
  const clips = withClips(b, (c) => (c.credit === undefined ? c : { ...c, credit: id(c.credit) }));
  return { manifest: { ...b.manifest, formatVersion: 1, files, credits }, files: clips };
};

const manifestOf = (b: Bundle): BundleManifest => b.manifest as unknown as BundleManifest;

const assemble = (b: Bundle): CourseView => {
  const course = assembleCourse({ manifest: manifestOf(b), files: b.files, numberingSystems });
  if (!course.ok) throw new Error(JSON.stringify(course.error));
  return course.value;
};

/** What a course plays: each item's clips, but for how their credit is written. */
const clipsOf = (course: CourseView): unknown => Object.fromEntries(Object.entries(course.audio).map(([item, speeds]) => [item, Object.fromEntries(Object.entries(speeds).map(([speed, { credit: _credit, ...clip }]) => [speed, clip]))]));

describe("a bundle in either format (ADR 0110)", () => {
  for (const id of ["tok", "apc"]) {
    it(`${id}: assembles, plays and downloads alike`, () => {
      const committed = load(id);
      const [old, now] = [format0(committed), format1(committed)];
      expect(old.manifest["formatVersion"]).toBe(0);
      expect(now.manifest["formatVersion"]).toBe(1);
      // The same credits either way, and fewer copies of them in format 1.
      const credits = now.manifest["credits"] as Record<string, string>;
      expect(Object.keys(credits).length).toBeGreaterThan(1);
      expect(JSON.stringify(now.manifest).length).toBeLessThan(JSON.stringify(old.manifest).length);
      for (const [key, text] of Object.entries(credits)) expect(creditId(text)).toBe(key);

      const [a, b] = [assemble(old), assemble(now)];
      expect(b.units).toEqual(a.units);
      expect(Object.keys(b.audio).length).toBeGreaterThan(0);
      expect(clipsOf(b)).toEqual(clipsOf(a));

      const [m0, m1] = [manifestOf(old), manifestOf(now)];
      const stored = new Set(coreFiles(m0).map((f) => f.path));
      expect(coreFiles(m1).map((f) => f.path)).toEqual([...stored]);
      expect(offlineStatus(m1, stored)).toEqual(offlineStatus(m0, stored));
      const plan = (m: BundleManifest): unknown => {
        const { files, bytes } = downloadPlan(m, new Set());
        return { bytes, files: files.map(({ path, sha256 }) => [path, sha256]) };
      };
      expect(plan(m1)).toEqual(plan(m0));
      expect(stalePaths(m1, [...stored, "audio/gone.mp3"])).toEqual(stalePaths(m0, [...stored, "audio/gone.mp3"]));
    });
  }
});
