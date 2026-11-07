/**
 * The reference library relay (ADR 0079). Course authors' sessions reach one Google Drive folder
 * through it with a fixed key: the session's environment keeps the key, and the relay keeps the
 * Google sign-in. Paths address everything, from that folder down.
 *
 *   GET  /v1/status                      the account and the folder
 *   GET  /v1/list?path=a/b               a folder's entries
 *   GET  /v1/stat?path=a/b.pdf           one entry
 *   GET  /v1/file?path=…[&export=mime]   content (Range passes through); Docs/Sheets/Slides export
 *   PUT  /v1/file?path=…[&parents=1]     create or replace a file (≤ 25 MB; scans go in through Drive)
 *   POST /v1/mkdir?path=…                make a folder and any missing above it
 *   POST /v1/move?from=…&to=…[&parents=1] rename and/or move
 *   POST /v1/trash?path=…                to Drive's trash (restorable); nothing is ever deleted
 *
 * GET /oauth/start and /oauth/callback sign the relay in (oauth.ts), only while it is signed out.
 * GET /, /privacy and /terms are the pages Google needs before the sign-in app can be published (pages.ts).
 */
import {
  accountEmail,
  childNamed,
  download,
  ensureFolder,
  entryOf,
  folderAt,
  getFile,
  kindOf,
  listChildren,
  locate,
  makeDrive,
  move,
  trash,
  upload,
  DRIVE_ID,
  type Drive,
  type DriveFile,
  type Fetch,
} from "./drive.ts";
import { finishSignIn, refreshingTokens, sameSecret, startSignIn, type Clock, type Secrets, type TokenCell } from "./oauth.ts";
import { fail, failure, json, ok, type Outcome } from "./outcome.ts";
import { pageFor } from "./pages.ts";
import { parsePath, within, type RefPath } from "./paths.ts";

/** The Worker's secrets (`wrangler secret put`). All optional here: a missing one is a 500, not a crash. */
export type Env = {
  readonly RELAY_KEY?: string;
  readonly ROOT_FOLDER_ID?: string;
  readonly GOOGLE_CLIENT_ID?: string;
  readonly GOOGLE_CLIENT_SECRET?: string;
  readonly GOOGLE_REFRESH_TOKEN?: string;
};

export type Deps = {
  readonly fetch: Fetch;
  readonly now: Clock;
  readonly random: (size: number) => Uint8Array;
  readonly cell: TokenCell;
};

/** Uploads go through the Worker's memory; big files (scans) go into Drive directly. */
export const MAX_UPLOAD = 25 * 1024 * 1024;
const MIN_KEY_LENGTH = 32;

const secretsOf = (env: Env): Outcome<Secrets> => {
  if ((env.RELAY_KEY ?? "").length < MIN_KEY_LENGTH) return fail(500, "misconfigured", "RELAY_KEY (32+ characters)");
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    return fail(500, "misconfigured", "GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET");
  }
  return ok({ relayKey: env.RELAY_KEY ?? "", clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET });
};

const bearer = (request: Request): string | null => /^Bearer\s+(\S+)$/u.exec(request.headers.get("authorization") ?? "")?.[1] ?? null;

type Context = { readonly drive: Drive; readonly root: DriveFile; readonly url: URL; readonly request: Request };

const pathParam = (url: URL, name: string): Outcome<RefPath> => parsePath(url.searchParams.get(name));

const flag = (url: URL, name: string): boolean => url.searchParams.get(name) === "1";

const status = async ({ drive, root }: Context): Promise<Outcome<Response>> => {
  const email = await accountEmail(drive);
  if (!email.ok) return email;
  return ok(json(200, { account: email.value, folder: entryOf(root) }));
};

const list = async ({ drive, root, url }: Context): Promise<Outcome<Response>> => {
  const path = pathParam(url, "path");
  if (!path.ok) return path;
  const folder = await folderAt(drive, root, path.value);
  if (!folder.ok) return folder;
  const children = await listChildren(drive, folder.value.id);
  if (!children.ok) return children;
  return ok(json(200, { path: path.value.join("/"), entries: children.value.map(entryOf) }));
};

const stat = async ({ drive, root, url }: Context): Promise<Outcome<Response>> => {
  const path = pathParam(url, "path");
  if (!path.ok) return path;
  const found = await locate(drive, root, path.value);
  return found.ok ? ok(json(200, entryOf(found.value.file))) : found;
};

const PASSED_HEADERS = ["content-type", "content-length", "content-range", "accept-ranges"];

const read = async ({ drive, root, url, request }: Context): Promise<Outcome<Response>> => {
  const path = pathParam(url, "path");
  if (!path.ok) return path;
  const found = await locate(drive, root, path.value);
  if (!found.ok) return found;
  const kind = kindOf(found.value.file);
  if (kind === "folder" || kind === "shortcut") return fail(409, `is-${kind}`);
  const response = await download(drive, found.value.file, {
    range: request.headers.get("range"),
    exportAs: url.searchParams.get("export"),
  });
  if (!response.ok) return response;
  const headers = new Headers({ "cache-control": "no-store" });
  for (const name of PASSED_HEADERS) {
    const value = response.value.headers.get(name);
    if (value !== null) headers.set(name, value);
  }
  const md5 = found.value.file.md5Checksum;
  if (md5 !== undefined && kind === "file") headers.set("x-md5", md5);
  return ok(new Response(response.value.body, { status: response.value.status, headers }));
};

/** The folder a new path goes into (made with parents=1), and the name it takes there. */
const destination = async (
  { drive, root, url }: Context,
  path: RefPath,
): Promise<Outcome<{ readonly folder: DriveFile; readonly name: string }>> => {
  const name = path[path.length - 1];
  if (name === undefined) return fail(400, "bad-path");
  const above = path.slice(0, -1);
  const folder = flag(url, "parents") ? await ensureFolder(drive, root, above) : await folderAt(drive, root, above);
  return folder.ok ? ok({ folder: folder.value, name }) : folder;
};

const write = async (context: Context): Promise<Outcome<Response>> => {
  const { drive, url, request } = context;
  const path = pathParam(url, "path");
  if (!path.ok) return path;
  const declared = request.headers.get("content-length");
  if (declared === null) return fail(411, "length-required");
  if (Number(declared) > MAX_UPLOAD) return fail(413, "too-large", `≤ ${MAX_UPLOAD} bytes; put large files into Drive itself`);
  const body = await request.arrayBuffer();
  if (body.byteLength > MAX_UPLOAD) return fail(413, "too-large");
  const contentType = request.headers.get("content-type") ?? "application/octet-stream";
  const where = await destination(context, path.value);
  if (!where.ok) return where;
  const existing = await childNamed(drive, where.value.folder, where.value.name);
  if (!existing.ok) return existing;
  if (existing.value !== null) {
    const kind = kindOf(existing.value);
    if (kind !== "file") return fail(409, `is-${kind}`);
    const written = await upload(drive, { existing: existing.value }, body, contentType);
    return written.ok ? ok(json(200, entryOf(written.value))) : written;
  }
  const written = await upload(drive, { parent: where.value.folder, name: where.value.name }, body, contentType);
  return written.ok ? ok(json(201, entryOf(written.value))) : written;
};

const mkdir = async ({ drive, root, url }: Context): Promise<Outcome<Response>> => {
  const path = pathParam(url, "path");
  if (!path.ok) return path;
  const folder = await ensureFolder(drive, root, path.value);
  return folder.ok ? ok(json(200, entryOf(folder.value))) : folder;
};

const relocate = async (context: Context): Promise<Outcome<Response>> => {
  const { drive, root, url } = context;
  const from = pathParam(url, "from");
  if (!from.ok) return from;
  const to = pathParam(url, "to");
  if (!to.ok) return to;
  if (from.value.length === 0 || to.value.length === 0) return fail(400, "bad-path", "not the folder itself");
  if (within(to.value, from.value)) return fail(400, "into-itself");
  const source = await locate(drive, root, from.value);
  if (!source.ok) return source;
  const where = await destination(context, to.value);
  if (!where.ok) return where;
  const clash = await childNamed(drive, where.value.folder, where.value.name);
  if (!clash.ok) return clash;
  if (clash.value !== null) return fail(409, "exists");
  const { file, parent } = source.value;
  if (parent === null) return fail(400, "bad-path");
  const moved = await move(drive, file, parent, where.value.folder, where.value.name);
  return moved.ok ? ok(json(200, entryOf(moved.value))) : moved;
};

const discard = async ({ drive, root, url }: Context): Promise<Outcome<Response>> => {
  const path = pathParam(url, "path");
  if (!path.ok) return path;
  if (path.value.length === 0) return fail(400, "bad-path", "not the folder itself");
  const found = await locate(drive, root, path.value);
  if (!found.ok) return found;
  const trashed = await trash(drive, found.value.file);
  return trashed.ok ? ok(json(200, { trashed: entryOf(trashed.value) })) : trashed;
};

type Route = (context: Context) => Promise<Outcome<Response>>;

const ROUTES: Readonly<Record<string, Readonly<Record<string, Route>>>> = {
  "/v1/status": { GET: status },
  "/v1/list": { GET: list },
  "/v1/stat": { GET: stat },
  "/v1/file": { GET: read, PUT: write },
  "/v1/mkdir": { POST: mkdir },
  "/v1/move": { POST: relocate },
  "/v1/trash": { POST: discard },
};

const signIn = async (request: Request, url: URL, env: Env, deps: Deps): Promise<Response> => {
  const secrets = secretsOf(env);
  if (!secrets.ok) return failure(secrets.failure);
  // Open only while signed out: to sign in again, delete the secret first (README).
  if (env.GOOGLE_REFRESH_TOKEN) return json(409, { error: "already-signed-in" });
  if (url.pathname === "/oauth/start") return startSignIn(url, secrets.value, deps.now, deps.random);
  const done = await finishSignIn(request, url, secrets.value, deps.fetch, deps.now);
  return done.ok ? done.value : failure(done.failure);
};

export const handle = async (request: Request, env: Env, deps: Deps): Promise<Response> => {
  const url = new URL(request.url);
  const shown = request.method === "GET" ? pageFor(url.pathname) : null;
  if (shown !== null) return shown;
  if (request.method === "GET" && (url.pathname === "/oauth/start" || url.pathname === "/oauth/callback")) {
    return signIn(request, url, env, deps);
  }
  const methods = ROUTES[url.pathname];
  if (methods === undefined) return json(404, { error: "no-such-route" });
  const secrets = secretsOf(env);
  if (!secrets.ok) return failure(secrets.failure);
  const key = bearer(request);
  if (key === null || !(await sameSecret(key, secrets.value.relayKey))) {
    return json(401, { error: "unauthorized" }, { "www-authenticate": "Bearer" });
  }
  const route = methods[request.method];
  if (route === undefined) return json(405, { error: "method-not-allowed" }, { allow: Object.keys(methods).join(", ") });
  if (!env.GOOGLE_REFRESH_TOKEN) return json(503, { error: "not-signed-in" });
  const rootId = env.ROOT_FOLDER_ID ?? "";
  if (!DRIVE_ID.test(rootId)) return failure({ status: 500, error: "misconfigured", detail: "ROOT_FOLDER_ID" });
  const tokens = refreshingTokens(deps.fetch, secrets.value, env.GOOGLE_REFRESH_TOKEN, deps.cell, deps.now);
  const drive = makeDrive(deps.fetch, tokens);
  const root = await getFile(drive, rootId);
  if (!root.ok) return failure(root.failure);
  if (kindOf(root.value) !== "folder") return failure({ status: 500, error: "misconfigured", detail: "ROOT_FOLDER_ID is not a folder" });
  const result = await route({ drive, root: root.value, url, request });
  return result.ok ? result.value : failure(result.failure);
};
