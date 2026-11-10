/**
 * POST /v1/describe: set the Drive description of many files in one request.
 *
 * Body: `{"files": [{"path": "books/a.pdf", "description": "lang:apc form:grammar"}, …]}`. Drive
 * shows a file's description in its details pane and searches it, so a library can carry its tags
 * there (bookshelf's catalogue tags). Each file is found as /v1/stat finds it and its description
 * set, in order; the folder listings read along the way are kept for the whole request, as in
 * /v1/moves (batch.ts). An empty description clears it.
 *
 * Within the free plan's subrequests: before each file the relay counts the listings it doesn't
 * hold yet and the update, and stops when the next would not fit; it also stops at the first
 * failure. Files after a stop are "not-attempted": send them again. The answer is 200 with a
 * result for every file. A root itself is never described.
 */
import { cost } from "./batch.ts";
import { entryOf, locate, setDescription, TOP_ID, type Drive, type DriveFile, type Entry, type Listings } from "./drive.ts";
import { fail, json, ok, type Outcome } from "./outcome.ts";
import { parsePath, type RefPath } from "./paths.ts";

export const MAX_FILES = 100;
/** Tags, not essays: well under what Drive keeps. */
export const MAX_DESCRIPTION = 4000;

type Item = { readonly path: string; readonly refPath: RefPath; readonly description: string };

type Result =
  | { readonly path: string; readonly status: "described"; readonly entry: Entry }
  | { readonly path: string; readonly status: "failed"; readonly error: string; readonly detail?: string }
  | { readonly path: string; readonly status: "not-attempted" };

type Context = {
  readonly drive: Drive;
  readonly root: DriveFile;
  readonly listings: Listings;
  readonly request: Request;
  readonly budget: number;
};

const parseItems = (body: unknown): Outcome<readonly Item[]> => {
  if (typeof body !== "object" || body === null) return fail(400, "bad-batch", "a JSON object");
  const { files } = body as { files?: unknown };
  if (!Array.isArray(files) || files.length === 0 || files.length > MAX_FILES) {
    return fail(400, "bad-batch", `"files": 1 to ${MAX_FILES} files`);
  }
  const items: Item[] = [];
  for (const [index, item] of files.entries()) {
    const { path, description } = (item ?? {}) as { path?: unknown; description?: unknown };
    if (typeof path !== "string" || typeof description !== "string") {
      return fail(400, "bad-batch", `file ${index}: "path" and "description"`);
    }
    if (description.length > MAX_DESCRIPTION) return fail(400, "bad-batch", `file ${index}: description over ${MAX_DESCRIPTION}`);
    const refPath = parsePath(path);
    if (!refPath.ok || refPath.value.length === 0) return fail(400, "bad-path", `file ${index}`);
    items.push({ path, refPath: refPath.value, description: description.normalize("NFC") });
  }
  return ok(items);
};

const describeOne = async (
  drive: Drive,
  root: DriveFile,
  path: RefPath,
  description: string,
  listings: Listings,
): Promise<Outcome<DriveFile>> => {
  const found = await locate(drive, root, path, listings);
  if (!found.ok) return found;
  const { file, parent } = found.value;
  if (parent === null || parent.id === TOP_ID) return fail(400, "not-in-a-root", "a root itself");
  return setDescription(drive, file, description);
};

export const describeBatch = async ({ drive, root, listings, request, budget }: Context): Promise<Outcome<Response>> => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, "bad-batch", "not JSON");
  }
  const items = parseItems(body);
  if (!items.ok) return items;
  let calls = 0;
  const counted: Drive = {
    request: (url, init) => {
      calls += 1;
      return drive.request(url, init);
    },
  };
  const results: Result[] = [];
  let stopped: "failure" | "budget" | null = null;
  for (const { path, refPath, description } of items.value) {
    if (stopped === null && calls + cost(listings, root, refPath) + 1 > budget) stopped = "budget";
    if (stopped !== null) {
      results.push({ path, status: "not-attempted" });
      continue;
    }
    const done = await describeOne(counted, root, refPath, description, listings);
    if (done.ok) {
      results.push({ path, status: "described", entry: entryOf(done.value) });
    } else {
      const { error, detail } = done.failure;
      results.push({ path, status: "failed", error, ...(detail === undefined ? {} : { detail }) });
      stopped = "failure";
    }
  }
  return ok(json(200, { results, stopped, driveCalls: calls }));
};
