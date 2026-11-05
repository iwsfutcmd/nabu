/**
 * The audio check's data (ADR 0060): each course's audio index as JSON, with its clips and
 * reference voices, at audio-check/<course>/. It covers every clip, the ones held back from
 * the learners' bundles too, with what the round-trip check heard. Never part of a bundle.
 *
 * - The dev and preview servers serve it straight from courses/ (`audioCheck()`, a Vite plugin).
 * - `node audio-check.ts <dir> [<bundles>]` writes it for a static site: Pages puts it beside the
 *   demo. Clips the demo's bundles already carry are not copied again: the data points at them.
 */
import { copyFileSync, createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import type { ServerResponse } from "node:http";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { AudioIndex, AudioVoice } from "@nabu/schema";
import type { Connect, Plugin } from "vite";
import { parse } from "yaml";

const COURSES = resolve(import.meta.dirname, "../../courses");

/** What the page loads for a course: its voices (from course.yaml) and its audio index. */
export interface AudioCheckData {
  readonly course: string;
  readonly voices: readonly AudioVoice[];
  readonly index: AudioIndex;
  /** Clips a bundle beside the app also carries, by file: their path from the app's base. */
  readonly bundled?: Readonly<Record<string, string>>;
}

const COURSE = /^[a-z][a-z0-9-]*$/u;
/** The only files served: clips/<hex>.mp3 and voices/<id>.wav, as `nabu audio` names them. */
const FILE = /^(clips\/[0-9a-f]{16}\.mp3|voices\/[a-z][a-z0-9-]*\.wav)$/u;

export const coursesWithAudio = (root: string = COURSES): readonly string[] =>
  readdirSync(root)
    .filter((c) => COURSE.test(c) && existsSync(join(root, c, "audio", "index.yaml")))
    .sort();

export const dataOf = (course: string, root: string = COURSES): AudioCheckData => {
  const source = parse(readFileSync(join(root, course, "course.yaml"), "utf8")) as { audio?: { voices?: AudioVoice[] } };
  const index = parse(readFileSync(join(root, course, "audio", "index.yaml"), "utf8")) as AudioIndex;
  return { course, voices: source.audio?.voices ?? [], index };
};

const send = (res: ServerResponse, type: string, body: string | NodeJS.ReadableStream): void => {
  res.setHeader("Content-Type", type);
  res.setHeader("Cache-Control", "no-cache");
  if (typeof body === "string") res.end(body);
  else body.pipe(res);
};

/** Answers /audio-check/... from courses/; anything else goes on to the next handler. */
const middleware =
  (root: string): Connect.NextHandleFunction =>
  (req, res, next) => {
    const path = decodeURIComponent((req.url ?? "").split("?")[0] ?? "");
    const at = path.indexOf("/audio-check/");
    if (at < 0) {
      next();
      return;
    }
    const rest = path.slice(at + "/audio-check/".length);
    if (rest === "index.json") {
      send(res, "application/json", JSON.stringify({ courses: coursesWithAudio(root) }));
      return;
    }
    const slash = rest.indexOf("/");
    const course = rest.slice(0, slash);
    const file = rest.slice(slash + 1);
    if (slash < 0 || !COURSE.test(course) || !existsSync(join(root, course, "audio", "index.yaml"))) {
      next();
      return;
    }
    if (file === "index.json") {
      send(res, "application/json", JSON.stringify(dataOf(course, root)));
      return;
    }
    const local = join(root, course, "audio", file);
    if (!FILE.test(file) || !existsSync(local)) {
      next();
      return;
    }
    send(res, file.endsWith(".mp3") ? "audio/mpeg" : "audio/wav", createReadStream(local));
  };

/** Serves the audio check's data in `vite` and `vite preview` (the e2e tests run the latter). */
export const audioCheck = (root: string = COURSES): Plugin => ({
  name: "nabu-audio-check",
  configureServer: (server) => {
    server.middlewares.use(middleware(root));
  },
  configurePreviewServer: (server) => {
    server.middlewares.use(middleware(root));
  },
});

/**
 * A clip's copy in the course's bundle, if `bundles` (the app's bundles/ directory) has it: bundles
 * name their clips by sha256, and the bytes are the same (the compiler copies them).
 */
const bundledAt = (bundles: string, course: string, sha256: string): string | undefined => {
  const path = `${course}/audio/${sha256.slice(0, 16)}.mp3`;
  return existsSync(join(bundles, path)) ? `bundles/${path}` : undefined;
};

/**
 * Writes every course's data, clips and reference voices under `out` (a static site). With
 * `bundles`, the clips a bundle carries are left to it: Pages publishes far fewer files.
 */
export const writeAudioCheck = (out: string, root: string = COURSES, bundles?: string): readonly string[] => {
  const courses = coursesWithAudio(root);
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "index.json"), JSON.stringify({ courses }));
  for (const course of courses) {
    const source = dataOf(course, root);
    const bundled: Record<string, string> = {};
    if (bundles !== undefined) {
      for (const clip of source.index.clips) {
        const at = bundledAt(bundles, course, clip.sha256);
        if (at !== undefined) bundled[clip.file] = at;
      }
    }
    const data: AudioCheckData = { ...source, bundled };
    const dir = join(out, course);
    mkdirSync(join(dir, "clips"), { recursive: true });
    writeFileSync(join(dir, "index.json"), JSON.stringify(data));
    const files = [...data.index.clips.map((c) => c.file).filter((f) => bundled[f] === undefined), ...(data.index.references ?? []).map((r) => r.file)];
    for (const file of files) {
      if (!FILE.test(file)) throw new Error(`${course}: unexpected audio file ${file}`);
      mkdirSync(join(dir, file, ".."), { recursive: true });
      copyFileSync(join(root, course, "audio", file), join(dir, file));
    }
  }
  return courses;
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [out, bundles] = process.argv.slice(2);
  if (out === undefined) {
    process.stderr.write("usage: node audio-check.ts <out-dir> [<bundles-dir>]\n");
    process.exit(2);
  }
  const written = writeAudioCheck(resolve(out), COURSES, bundles === undefined ? undefined : resolve(bundles));
  process.stdout.write(`audio check: ${written.join(", ")} → ${out}\n`);
}
