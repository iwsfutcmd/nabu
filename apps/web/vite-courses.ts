/**
 * What the course list says of each course (the review's S4): its levels, its size, and whether
 * it has listening and speaking, read from the bundles the app serves (public/bundles) when the app
 * is built, or when the dev server is asked. Nothing about a course is written twice: a course
 * added to the bundles describes itself. The app imports it as `virtual:nabu-courses`.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { BundleManifest } from "@nabu/schema";
import type { Plugin } from "vite";

export interface CourseSummary {
  /** Units with lessons (an alphabet's own unit left out). */
  readonly units: number;
  readonly lessons: number;
  /** The first and the last unit's CEFR level, where the units say. */
  readonly levels?: readonly [string, string];
  /** Listening exercises: the course practises listening (`facets`) with a voice rated good (ADR 0091). */
  readonly listening: boolean;
  /** Speaking exercises (`facets`). */
  readonly speaking: boolean;
}

const CEFR = ["A1", "A2", "B1", "B2", "C1", "C2"];

interface UnitFile {
  readonly cefr?: string;
  readonly nodes: readonly { readonly kind: string }[];
}

/** Every course of a bundles directory (index.json and a directory per course), by id. */
export const courseSummaries = (bundles: string): Record<string, CourseSummary> => {
  const read = <T>(path: string): T => JSON.parse(readFileSync(join(bundles, path), "utf8")) as T;
  const index = read<{ courses: readonly { readonly id: string; readonly manifest: string }[] }>("index.json");
  return Object.fromEntries(
    index.courses.map(({ id, manifest: path }) => {
      const manifest = read<BundleManifest>(path);
      const units = manifest.units.map((u) => read<UnitFile>(join(id, u.file))).filter((u) => u.nodes.some((n) => n.kind === "lesson"));
      const levels = units.flatMap((u) => (u.cefr !== undefined && CEFR.includes(u.cefr) ? [u.cefr] : [])).sort((a, b) => CEFR.indexOf(a) - CEFR.indexOf(b));
      const facets: readonly string[] | undefined = manifest.facets;
      const has = (facet: string): boolean => facets === undefined || facets.includes(facet);
      const voiced = manifest.files.some((f) => f.role === "audio") && (manifest.audioQuality ?? "good") === "good";
      const summary: CourseSummary = {
        units: units.length,
        lessons: units.reduce((n, u) => n + u.nodes.filter((x) => x.kind === "lesson").length, 0),
        ...(levels.length === 0 ? {} : { levels: [levels[0] as string, levels.at(-1) as string] as const }),
        listening: has("listen") && voiced,
        speaking: has("speak"),
      };
      return [id, summary] as const;
    }),
  );
};

const ID = "virtual:nabu-courses";

export const courses = (): Plugin => ({
  name: "nabu-courses",
  resolveId: (id) => (id === ID ? `\0${ID}` : undefined),
  load(id) {
    if (id !== `\0${ID}`) return undefined;
    const bundles = resolve(import.meta.dirname, "public/bundles");
    // `pnpm bundles` rewrites the index: the dev server reads the courses again.
    this.addWatchFile(join(bundles, "index.json"));
    return `export default ${JSON.stringify(courseSummaries(bundles))};`;
  },
});
