/**
 * POST /v1/moves: many moves in one request.
 *
 * Body: `{"moves": [{"from": "a/b.pdf", "to": "c/d/b.pdf"}, …], "parents": true}`. Each move does
 * what /v1/move does, in order, but the folder listings read along the way are kept for the whole
 * request (and kept current as files move), so a folder is listed once however many moves touch it.
 *
 * A Worker on Cloudflare's free plan may make 50 subrequests. Before each move the relay estimates
 * its Drive calls (listings it doesn't hold yet, folders to make, the move itself) and stops when
 * the next move would not fit in DRIVE_BUDGET. It also stops at the first failure. Moves after a
 * stop are "not-attempted": send them again. The answer is 200 with a result for every move.
 */
import {
  childNamed,
  ensureFolder,
  entryOf,
  FOLDER,
  locate,
  move,
  type Drive,
  type DriveFile,
  type Entry,
  type Listings,
} from "./drive.ts";
import { fail, json, ok, type Outcome } from "./outcome.ts";
import { nameKey, parsePath, within, type RefPath } from "./paths.ts";

export const MAX_MOVES = 100;
/** Drive calls a batch may make itself: the request has already made up to two (token, root). */
export const DRIVE_BUDGET = 44;

type Batch = {
  readonly moves: readonly { readonly from: string; readonly to: string; readonly fromPath: RefPath; readonly toPath: RefPath }[];
  readonly parents: boolean;
};

type Result =
  | { readonly from: string; readonly to: string; readonly status: "moved"; readonly entry: Entry }
  | { readonly from: string; readonly to: string; readonly status: "failed"; readonly error: string; readonly detail?: string }
  | { readonly from: string; readonly to: string; readonly status: "not-attempted" };

type Context = { readonly drive: Drive; readonly root: DriveFile; readonly request: Request };

const parseBatch = (body: unknown): Outcome<Batch> => {
  if (typeof body !== "object" || body === null) return fail(400, "bad-batch", "a JSON object");
  const { moves, parents } = body as { moves?: unknown; parents?: unknown };
  if (!Array.isArray(moves) || moves.length === 0 || moves.length > MAX_MOVES) {
    return fail(400, "bad-batch", `"moves": 1 to ${MAX_MOVES} moves`);
  }
  const parsed: Batch["moves"][number][] = [];
  for (const [index, item] of moves.entries()) {
    const { from, to } = (item ?? {}) as { from?: unknown; to?: unknown };
    if (typeof from !== "string" || typeof to !== "string") return fail(400, "bad-batch", `move ${index}: "from" and "to"`);
    const fromPath = parsePath(from);
    const toPath = parsePath(to);
    if (!fromPath.ok || !toPath.ok) return fail(400, "bad-path", `move ${index}`);
    parsed.push({ from, to, fromPath: fromPath.value, toPath: toPath.value });
  }
  return ok({ moves: parsed, parents: parents === true });
};

/** Drive calls needed to reach `path` with what is kept: listings to read, folders to make. */
export const cost = (listings: Listings, root: DriveFile, path: RefPath): number => {
  let here = root;
  for (const [index, name] of path.entries()) {
    const children = listings.get(here.id);
    if (children === undefined) return path.length - index;
    const next = children.find((child) => nameKey(child.name) === name);
    // Missing: each folder still to make is one call; the last name is the file, made by the move.
    if (next === undefined || next.mimeType !== FOLDER) return Math.max(0, path.length - 1 - index);
    here = next;
  }
  return 0;
};

const moveOne = async (
  drive: Drive,
  root: DriveFile,
  from: RefPath,
  to: RefPath,
  parents: boolean,
  listings: Listings,
): Promise<Outcome<DriveFile>> => {
  if (from.length === 0 || to.length === 0) return fail(400, "bad-path", "not the folder itself");
  if (to.length > from.length && within(to, from)) return fail(400, "into-itself");
  const source = await locate(drive, root, from, listings);
  if (!source.ok) return source;
  const { file, parent } = source.value;
  if (parent === null) return fail(400, "bad-path");
  const name = to[to.length - 1] ?? "";
  const above = to.slice(0, -1);
  let folder: DriveFile;
  if (parents) {
    const made = await ensureFolder(drive, root, above, listings);
    if (!made.ok) return made;
    folder = made.value;
  } else {
    const found = await locate(drive, root, above, listings);
    if (!found.ok) return found;
    if (found.value.file.mimeType !== FOLDER) return fail(409, "not-a-folder");
    folder = found.value.file;
  }
  const clash = await childNamed(drive, folder, name, listings);
  if (!clash.ok) return clash;
  // The file itself is no clash: renaming it to its own cleaned name cleans it in Drive.
  if (clash.value !== null && clash.value.id !== file.id) return fail(409, "exists");
  const moved = await move(drive, file, parent, folder, name);
  if (!moved.ok) return moved;
  const left = listings.get(parent.id);
  if (left !== undefined) {
    const at = left.findIndex((child) => child.id === file.id);
    if (at >= 0) left.splice(at, 1);
  }
  listings.get(folder.id)?.push(moved.value);
  return ok(moved.value);
};

export const moveBatch = async ({ drive, root, request }: Context): Promise<Outcome<Response>> => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, "bad-batch", "not JSON");
  }
  const batch = parseBatch(body);
  if (!batch.ok) return batch;
  let calls = 0;
  const counted: Drive = {
    request: (url, init) => {
      calls += 1;
      return drive.request(url, init);
    },
  };
  const listings: Listings = new Map();
  const results: Result[] = [];
  let stopped: "failure" | "budget" | null = null;
  for (const { from, to, fromPath, toPath } of batch.value.moves) {
    if (stopped === null && calls + cost(listings, root, fromPath) + cost(listings, root, toPath) + 1 > DRIVE_BUDGET) {
      stopped = "budget";
    }
    if (stopped !== null) {
      results.push({ from, to, status: "not-attempted" });
      continue;
    }
    const done = await moveOne(counted, root, fromPath, toPath, batch.value.parents, listings);
    if (done.ok) {
      results.push({ from, to, status: "moved", entry: entryOf(done.value) });
    } else {
      const { error, detail } = done.failure;
      results.push({ from, to, status: "failed", error, ...(detail === undefined ? {} : { detail }) });
      stopped = "failure";
    }
  }
  return ok(json(200, { results, stopped, driveCalls: calls }));
};
