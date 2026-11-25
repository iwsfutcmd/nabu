/**
 * The lexicon's own files for the Data page's Lexicon and Language views and the rules explorer (debug
 * mode): each course's lexicon, lexicons/<lang>/lexemes.yaml and language.yaml (the course.yaml's
 * `lexicon:` names the language), and the profiles of the course's orthographies (profiles/<id>.yaml,
 * their `spell` statements with them: a bundle's profiles have none), parsed to JSON with nothing
 * dropped or reshaped, at lexicon-source/<course>.json. The app's bundles carry only what lessons need;
 * this is what the lexicon stores. Never part of a bundle.
 *
 * - The dev and preview servers serve it straight from courses/ and lexicons/ (`lexiconSource()`, a
 *   Vite plugin), as the audio check's data is served (audio-check.ts).
 * - `node lexicon-source.ts <dir>` writes it for a static site: Pages puts it beside the demo. A
 *   build without it (a self-hosted one) still shows the bundle's part, and says so.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import type { ServerResponse } from "node:http";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Connect, Plugin } from "vite";
import { parse } from "yaml";

const ROOT = resolve(import.meta.dirname, "../..");

/** What the page loads for a course: its lexicon's two files, as parsed. */
export interface LexiconSourceFile {
  readonly course: string;
  /** The lexicon's language (lexicons/<lexicon>/). */
  readonly lexicon: string;
  /** lexemes.yaml. */
  readonly lexemes: unknown;
  /** language.yaml. */
  readonly language: unknown;
  /** The profile of each of the course's orthographies, by id. */
  readonly profiles: Readonly<Record<string, unknown>>;
}

const ID = /^[a-z][a-z0-9-]*$/u;

/** An orthography's id (apc-Arab/standard), as its profile's file is named (apc-Arab.standard.yaml). */
const ORTHOGRAPHY = /^[a-z]{2,3}(-[A-Za-z0-9]+)*\/[a-z0-9-]+$/u;

const courseFile = (course: string, root: string): { readonly lexicon?: unknown; readonly orthographies?: unknown } | undefined => {
  if (!ID.test(course)) return undefined;
  const file = join(root, "courses", course, "course.yaml");
  return existsSync(file) ? ((parse(readFileSync(file, "utf8")) as { lexicon?: unknown; orthographies?: unknown } | null) ?? undefined) : undefined;
};

/** The course's lexicon, where it names one whose files exist. */
const lexiconOf = (course: string, root: string): string | undefined => {
  const lexicon = courseFile(course, root)?.lexicon;
  return typeof lexicon === "string" && ID.test(lexicon) && existsSync(join(root, "lexicons", lexicon, "lexemes.yaml")) ? lexicon : undefined;
};

/** The profiles of the course's orthographies, parsed, by id: those whose files exist. */
const profilesOf = (course: string, root: string): Readonly<Record<string, unknown>> => {
  const listed = courseFile(course, root)?.orthographies;
  const ids = Array.isArray(listed) ? listed.filter((o): o is string => typeof o === "string" && ORTHOGRAPHY.test(o)) : [];
  return Object.fromEntries(
    ids.flatMap((id) => {
      const file = join(root, "profiles", `${id.replace("/", ".")}.yaml`);
      return existsSync(file) ? [[id, parse(readFileSync(file, "utf8")) as unknown]] : [];
    }),
  );
};

export const coursesWithLexicon = (root: string = ROOT): readonly string[] =>
  readdirSync(join(root, "courses"))
    .filter((c) => lexiconOf(c, root) !== undefined)
    .sort();

/** A course's lexicon files, parsed; undefined for a course without one. */
export const lexiconSourceOf = (course: string, root: string = ROOT): LexiconSourceFile | undefined => {
  const lexicon = lexiconOf(course, root);
  if (lexicon === undefined) return undefined;
  const read = (name: string): unknown => {
    const file = join(root, "lexicons", lexicon, name);
    return existsSync(file) ? (parse(readFileSync(file, "utf8")) as unknown) : undefined;
  };
  return { course, lexicon, lexemes: read("lexemes.yaml"), language: read("language.yaml"), profiles: profilesOf(course, root) };
};

const PREFIX = "/lexicon-source/";
const FILE = /^([a-z][a-z0-9-]*)\.json$/u;

const send = (res: ServerResponse, status: number, body: string): void => {
  res.statusCode = status;
  res.setHeader("Content-Type", status === 200 ? "application/json" : "text/plain");
  res.setHeader("Cache-Control", "no-cache");
  res.end(body);
};

/** Answers /lexicon-source/<course>.json from the repository; anything else under it is a 404, never the app's page. */
export const lexiconSourceMiddleware =
  (root: string = ROOT): Connect.NextHandleFunction =>
  (req, res, next) => {
    let path: string;
    try {
      path = decodeURIComponent((req.url ?? "").split("?")[0] ?? "");
    } catch {
      send(res, 404, "not found");
      return;
    }
    const at = path.indexOf(PREFIX);
    if (at < 0) {
      next();
      return;
    }
    const course = FILE.exec(path.slice(at + PREFIX.length))?.[1];
    const data = course === undefined ? undefined : lexiconSourceOf(course, root);
    if (data === undefined) send(res, 404, "not found");
    else send(res, 200, JSON.stringify(data));
  };

/** Serves the lexicon's files in `vite` and `vite preview` (the e2e tests run the latter). */
export const lexiconSource = (root: string = ROOT): Plugin => ({
  name: "nabu-lexicon-source",
  configureServer: (server) => {
    server.middlewares.use(lexiconSourceMiddleware(root));
  },
  configurePreviewServer: (server) => {
    server.middlewares.use(lexiconSourceMiddleware(root));
  },
});

/** Writes every course's lexicon files under `out` (a static site). */
export const writeLexiconSource = (out: string, root: string = ROOT): readonly string[] => {
  const courses = coursesWithLexicon(root);
  mkdirSync(out, { recursive: true });
  for (const course of courses) writeFileSync(join(out, `${course}.json`), JSON.stringify(lexiconSourceOf(course, root)));
  return courses;
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [out] = process.argv.slice(2);
  if (out === undefined) {
    process.stderr.write("usage: node lexicon-source.ts <out-dir>\n");
    process.exit(2);
  }
  const written = writeLexiconSource(resolve(out));
  process.stdout.write(`lexicon source: ${written.join(", ")} → ${out}\n`);
}
