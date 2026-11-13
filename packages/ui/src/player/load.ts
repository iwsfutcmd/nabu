/**
 * Loads a compiled course bundle over HTTP (gameplan §7.5 stage 9): the
 * manifest, then every unit, profile, table and keyboard it lists, and hands
 * them to core's pure assembleCourse(). Images stay URLs.
 */
import { assembleCourse, coreFiles, type CourseView } from "@nabu/core/lesson";
import numberingSystems from "@nabu/i18n/generated/numbering-systems.json" with { type: "json" };
import type { BundleManifest } from "@nabu/schema";

export interface CourseIndexEntry {
  readonly id: string;
  readonly target: string;
  readonly orthographies: readonly string[];
  readonly support: readonly string[];
  readonly manifest: string;
  readonly bundle: string;
}

export interface LoadedCourse {
  readonly course: CourseView;
  readonly manifest: BundleManifest;
  readonly imageUrl: (path: string) => string;
}

const json = async <T>(url: string): Promise<T> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return (await response.json()) as T;
};

/** `base` is the URL of the bundles directory, ending in "/". */
export const fetchCourseIndex = async (base: string): Promise<readonly CourseIndexEntry[]> =>
  (await json<{ courses: readonly CourseIndexEntry[] }>(`${base}index.json`)).courses;

export const fetchCourse = async (base: string, id: string, orthography?: string): Promise<LoadedCourse> => {
  const root = `${base}${id}/`;
  const manifest = await json<BundleManifest>(`${root}manifest.json`);
  const files = new Map(await Promise.all(coreFiles(manifest).map(async (f) => [f.path, await json<unknown>(`${root}${f.path}`)] as const)));
  const course = assembleCourse({ manifest, files, numberingSystems }, orthography);
  if (!course.ok) throw new Error(`${id}: ${JSON.stringify(course.error)}`);
  return { course: course.value, manifest, imageUrl: (path) => `${root}${path}` };
};
