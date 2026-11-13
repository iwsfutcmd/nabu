/** The fixture courses as the app loads them (the committed bundles), for rendering players in tests. */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { assembleCourse, MEDIA_ROLES, type CourseView } from "@nabu/core/lesson";
import type { BundleManifest } from "@nabu/schema";

const ROOT = resolve(import.meta.dirname, "../../..");
const BUNDLES = join(ROOT, "apps/web/public/bundles");
const numberingSystems = JSON.parse(readFileSync(join(ROOT, "packages/i18n/src/generated/numbering-systems.json"), "utf8")) as Record<string, string>;

export const loadCourse = (id: string, orthography?: string): CourseView => {
  const manifest = JSON.parse(readFileSync(join(BUNDLES, id, "manifest.json"), "utf8")) as BundleManifest;
  const files = new Map<string, unknown>(
    manifest.files.filter((f) => !MEDIA_ROLES.has(f.role)).map((f) => [f.path, JSON.parse(readFileSync(join(BUNDLES, id, f.path), "utf8")) as unknown]),
  );
  const course = assembleCourse({ manifest, files, numberingSystems }, orthography);
  if (!course.ok) throw new Error(JSON.stringify(course.error));
  return course.value;
};
