/**
 * Courses on the server, from the same compiled bundles the app plays (NABU_BUNDLES, default
 * the web app's committed bundles). The judge and the explanations read prompts and accept sets
 * from here, never from the request: a client cannot hand the judge its own accept set.
 */
import { existsSync, readFileSync } from "node:fs";
import { readCourse, type CourseView } from "@nabu/core/lesson";
import type { BundleManifest } from "@nabu/schema";

export const DEFAULT_BUNDLES = new URL("../../../web/public/bundles/", import.meta.url);
const NUMBERING = new URL("../../../../packages/i18n/src/generated/numbering-systems.json", import.meta.url);

export interface Courses {
  /** The course for an orthography it teaches, or undefined (unknown course or orthography). */
  readonly get: (course: string, orthography: string) => CourseView | undefined;
}

const SAFE_ID = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/u;

export const createCourses = (dir: URL = DEFAULT_BUNDLES): Courses => {
  const numberingSystems = JSON.parse(readFileSync(NUMBERING, "utf8")) as Record<string, string>;
  const views = new Map<string, CourseView | undefined>();
  const manifests = new Map<string, BundleManifest | undefined>();
  const manifestOf = (course: string): BundleManifest | undefined => {
    if (!manifests.has(course)) {
      const file = new URL(`${course}/manifest.json`, dir);
      manifests.set(course, SAFE_ID.test(course) && existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as BundleManifest) : undefined);
    }
    return manifests.get(course);
  };
  return {
    get: (course, orthography) => {
      const key = `${course}\u0000${orthography}`;
      if (views.has(key)) return views.get(key);
      const manifest = manifestOf(course);
      let view: CourseView | undefined;
      if (manifest !== undefined && (manifest.orthographies as readonly string[]).includes(orthography)) {
        const read = (path: string): unknown => (path === "manifest.json" ? manifest : JSON.parse(readFileSync(new URL(`${course}/${path}`, dir), "utf8")));
        const assembled = readCourse(read, numberingSystems, orthography);
        view = assembled.ok ? assembled.value : undefined;
      }
      views.set(key, view);
      return view;
    },
  };
};
