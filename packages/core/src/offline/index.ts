/**
 * Offline courses (gameplan §16 Phase 10), pure: what a device must keep to use a course with no
 * network, what a download costs, and a course view restricted to the media it has.
 *
 * - The **core** of a course is every non-media file: the manifest's units, profiles, tables,
 *   keyboards and audio index. Opening a course reads all of it, so a device that has opened a
 *   course once can teach its text offline.
 * - **Units** are the download unit for media: each lists the audio and images its items use
 *   (stage 9 of the compiler). Downloading a unit makes its listening exercises and pictures work
 *   offline; until then, the planner never offers what needs a missing clip or picture.
 *
 * The shell does the I/O (fetching, checking hashes, storing) and passes in which paths it has.
 */
import type { BundleAudioItem, BundleFile, BundleManifest, BundleUnit } from "@nabu/schema";
import { coreFiles, type CourseView } from "../lesson/course.ts";

export { coreFiles };

export type UnitState = "ready" | "partial" | "missing";

export interface UnitOffline {
  readonly id: string;
  readonly state: UnitState;
  /** All of the unit's media, and what is still to download. */
  readonly bytes: number;
  readonly missingBytes: number;
  /** What removing the unit would free: its stored media that no other unit uses (`removable`). */
  readonly freeBytes: number;
}

export interface OfflineStatus {
  /** Whether the course's text works offline: every non-media file is stored. */
  readonly core: boolean;
  readonly coreBytes: number;
  readonly units: readonly UnitOffline[];
  /** Everything the course would take, and what is stored of it. */
  readonly bytes: number;
  readonly storedBytes: number;
  /** Core and every unit are stored. */
  readonly complete: boolean;
}

export interface DownloadPlan {
  /** Files to fetch, the core first, each once. */
  readonly files: readonly BundleFile[];
  readonly bytes: number;
}

const sum = (files: readonly BundleFile[]): number => files.reduce((n, f) => n + f.bytes, 0);

/** The media of one unit (none for an unknown unit). */
export const unitFiles = (manifest: BundleManifest, unit: string): readonly BundleFile[] => {
  const assets = new Set(manifest.units.find((u) => u.id === unit)?.assets ?? []);
  return manifest.files.filter((f) => assets.has(f.path));
};

export const offlineStatus = (manifest: BundleManifest, stored: ReadonlySet<string>): OfflineStatus => {
  const core = coreFiles(manifest);
  const units = manifest.units.map((u): UnitOffline => {
    const files = unitFiles(manifest, u.id);
    const missing = files.filter((f) => !stored.has(f.path));
    const state: UnitState = missing.length === 0 ? "ready" : missing.length === files.length ? "missing" : "partial";
    const free = removable(manifest, [u.id]).filter((f) => stored.has(f.path));
    return { id: u.id, state, bytes: sum(files), missingBytes: sum(missing), freeBytes: sum(free) };
  });
  const coreReady = core.every((f) => stored.has(f.path));
  return {
    core: coreReady,
    coreBytes: sum(core),
    units,
    bytes: sum(manifest.files),
    storedBytes: sum(manifest.files.filter((f) => stored.has(f.path))),
    complete: coreReady && units.every((u) => u.state === "ready"),
  };
};

/** What to fetch so the core and the given units (all of them by default) are stored. */
export const downloadPlan = (manifest: BundleManifest, stored: ReadonlySet<string>, units: readonly string[] = manifest.units.map((u) => u.id)): DownloadPlan => {
  const seen = new Set<string>();
  const files = [...coreFiles(manifest), ...units.flatMap((u) => unitFiles(manifest, u))].filter((f) => {
    if (stored.has(f.path) || seen.has(f.path)) return false;
    seen.add(f.path);
    return true;
  });
  return { files, bytes: sum(files) };
};

/** What removing these units frees: their media that no other stored unit uses. */
export const removable = (manifest: BundleManifest, units: readonly string[]): readonly BundleFile[] => {
  const gone = new Set(units);
  const kept = new Set(manifest.units.filter((u) => !gone.has(u.id)).flatMap((u) => u.assets));
  return units.flatMap((u) => unitFiles(manifest, u)).filter((f, i, all) => !kept.has(f.path) && all.findIndex((g) => g.path === f.path) === i);
};

/** Stored paths the manifest no longer lists (an older version of the course): safe to delete. */
export const stalePaths = (manifest: BundleManifest, stored: Iterable<string>): readonly string[] => {
  const listed = new Set(manifest.files.map((f) => f.path));
  return [...stored].filter((p) => !listed.has(p)).sort();
};

const keepClips = (item: BundleAudioItem, has: (path: string) => boolean): BundleAudioItem | undefined => {
  if (!has(item.normal.path)) return undefined;
  if (item.slow === undefined || has(item.slow.path)) return item;
  const { slow: _slow, ...normal } = item;
  return normal;
};

/**
 * The course as a device can teach it with the media it has: clips and pictures it lacks are
 * left out, so templates that need them are never built (listening exists only where a clip
 * does). With every medium present, the course comes back unchanged (the same object).
 */
export const restrictMedia = (course: CourseView, has: (path: string) => boolean): CourseView => {
  const audio: Record<string, BundleAudioItem> = {};
  let audioChanged = false;
  for (const [id, item] of Object.entries(course.audio)) {
    const kept = keepClips(item, has);
    if (kept !== item) audioChanged = true;
    if (kept !== undefined) audio[id] = kept;
  }
  let unitsChanged = false;
  const units = course.units.map((unit): BundleUnit => {
    if (!unit.kcs.some((k) => k.image !== undefined && !has(k.image))) return unit;
    unitsChanged = true;
    return {
      ...unit,
      kcs: unit.kcs.map((k) => {
        if (k.image === undefined || has(k.image)) return k;
        const { image: _image, ...rest } = k;
        return rest;
      }),
    };
  });
  if (!audioChanged && !unitsChanged) return course;
  return { ...course, audio: audioChanged ? audio : course.audio, units: unitsChanged ? units : course.units };
};
