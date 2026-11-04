/**
 * Offline courses (Phase 10): what a device must store, what a download costs, and a course
 * restricted to the media a device has. Uses the committed bundles' manifests.
 */
import type { BundleManifest } from "@nabu/schema";
import { describe, expect, it } from "vitest";
import { emptyLearnerState, plan } from "../src/learner/index.ts";
import { lessonNodes, LISTENING } from "../src/lesson/index.ts";
import { coreFiles, downloadPlan, offlineStatus, removable, restrictMedia, stalePaths, unitFiles } from "../src/offline/index.ts";
import { loadCourse, manifestOf } from "./learner-fixtures.ts";

const fa = manifestOf("fa");
const paths = (files: readonly { path: string }[]): Set<string> => new Set(files.map((f) => f.path));

describe("offline status and downloads", () => {
  it("knows the core, each unit's media, and what is left to fetch", () => {
    const nothing = offlineStatus(fa, new Set());
    expect(nothing.core).toBe(false);
    expect(nothing.units.map((u) => u.state)).toEqual(fa.units.map(() => "missing"));
    expect(nothing.storedBytes).toBe(0);
    expect(nothing.bytes).toBe(fa.files.reduce((n, f) => n + f.bytes, 0));

    const core = paths(coreFiles(fa));
    expect([...core].every((p) => !p.startsWith("audio/") || p.startsWith("audio/index."))).toBe(true);
    const opened = offlineStatus(fa, core);
    expect(opened.core).toBe(true);
    expect(opened.complete).toBe(false);

    const [first, second] = fa.units;
    if (first === undefined || second === undefined) throw new Error("fa has two units");
    const one = downloadPlan(fa, core, [first.id]);
    expect(paths(one.files)).toEqual(new Set(first.assets));
    expect(one.bytes).toBe(offlineStatus(fa, core).units[0]?.missingBytes);

    const withFirst = new Set([...core, ...first.assets]);
    const status = offlineStatus(fa, withFirst);
    expect(status.units.find((u) => u.id === first.id)?.state).toBe("ready");
    // A later unit may share a picture or clip with the first: partial, until all of its own arrive.
    const shared = second.assets.filter((p) => withFirst.has(p)).length;
    expect(status.units.find((u) => u.id === second.id)?.state).toBe(shared === second.assets.length ? "ready" : shared > 0 ? "partial" : "missing");

    const all = downloadPlan(fa, new Set());
    expect(all.files.slice(0, core.size).every((f) => core.has(f.path))).toBe(true); // the core comes first
    expect(new Set(all.files.map((f) => f.path)).size).toBe(all.files.length); // each file once
    expect(offlineStatus(fa, paths(all.files)).complete).toBe(true);
    expect(downloadPlan(fa, paths(all.files)).files).toEqual([]);
  });

  it("frees only media no other unit uses, and finds files of an older version", () => {
    const file = (path: string, bytes: number) => ({ path, role: "audio" as const, sha256: "0".repeat(64), license: "CC0-1.0", bytes });
    const manifest: BundleManifest = {
      ...fa,
      files: [file("audio/a.mp3", 10), file("audio/shared.mp3", 20), file("audio/b.mp3", 30)],
      units: [
        { id: "u1", file: "units/u1.json", assets: ["audio/a.mp3", "audio/shared.mp3"] },
        { id: "u2", file: "units/u2.json", assets: ["audio/b.mp3", "audio/shared.mp3"] },
      ],
    };
    expect(removable(manifest, ["u1"]).map((f) => f.path)).toEqual(["audio/a.mp3"]);
    expect(removable(manifest, ["u1", "u2"]).map((f) => f.path)).toEqual(["audio/a.mp3", "audio/shared.mp3", "audio/b.mp3"]);
    expect(unitFiles(manifest, "nope")).toEqual([]);
    expect(stalePaths(manifest, ["audio/old.mp3", "audio/a.mp3", "units/u0.json"])).toEqual(["audio/old.mp3", "units/u0.json"]);
  });
});

describe("a course restricted to the media a device has", () => {
  const course = loadCourse("fa");
  const every = (): boolean => true;
  const none = (): boolean => false;

  it("is the same course when every medium is there", () => {
    expect(restrictMedia(course, every)).toBe(course);
  });

  it("drops clips and pictures it lacks, so no exercise needs them", () => {
    const bare = restrictMedia(course, none);
    expect(Object.keys(bare.audio)).toEqual([]);
    expect(bare.units.flatMap((u) => u.kcs).some((k) => k.image !== undefined)).toBe(false);
    const now = "2026-05-20T09:00:00.000Z";
    for (const { node } of lessonNodes(bare)) {
      const exercises = plan(bare, emptyLearnerState(), { mode: "lesson", node: node.id }, { now, seed: 3 }).exercises;
      expect(exercises.filter((e) => LISTENING.has(e.template) || e.template === "select-image").map((e) => e.template)).toEqual([]);
    }
  });

  it("keeps a clip's normal speed without its slow one", () => {
    const [id, item] = Object.entries(course.audio).find(([, a]) => a.slow !== undefined) ?? [];
    if (id === undefined || item?.slow === undefined) throw new Error("fa has a slow clip");
    const slow = item.slow.path;
    const kept = restrictMedia(course, (p) => p !== slow);
    expect(kept.audio[id]?.normal).toEqual(item.normal);
    expect(kept.audio[id]?.slow).toBeUndefined();
  });
});
