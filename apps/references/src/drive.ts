/**
 * The few Drive API v3 calls the relay makes. Everything is reached from the reference folder
 * down, by listing a folder's children: the relay never takes a file id from a caller, never
 * searches the whole Drive and never follows a shortcut, so nothing outside the folder is reachable.
 */
import { fail, ok, type Outcome } from "./outcome.ts";
import { nameKey, type RefPath } from "./paths.ts";

export type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export type DriveFile = {
  readonly id: string;
  readonly name: string;
  readonly mimeType: string;
  readonly size?: string;
  readonly modifiedTime?: string;
  readonly md5Checksum?: string;
};

export const FOLDER = "application/vnd.google-apps.folder";
export const SHORTCUT = "application/vnd.google-apps.shortcut";
const NATIVE = "application/vnd.google-apps.";

/** What a Google-native file (Docs, Sheets, Slides) downloads as when the caller names no format. */
export const DEFAULT_EXPORT: Readonly<Record<string, string>> = {
  "application/vnd.google-apps.document": "text/markdown",
  "application/vnd.google-apps.spreadsheet": "text/csv",
  "application/vnd.google-apps.presentation": "text/plain",
};

export const API = "https://www.googleapis.com/drive/v3";
export const UPLOAD = "https://www.googleapis.com/upload/drive/v3";
const FIELDS = "id,name,mimeType,size,modifiedTime,md5Checksum";
const ALL_DRIVES = "supportsAllDrives=true";
/** Drive ids are URL-safe base64-ish; checked before one goes into a query. */
export const DRIVE_ID = /^[A-Za-z0-9_-]+$/u;
/**
 * The folder above the roots when the relay has several (ROOTS, roots.ts). It exists only in the
 * relay: its listing is the roots, and nothing is ever made in it, moved into or out of it, or
 * trashed from it.
 */
export const TOP_ID = "relay-roots";

export type Entry = {
  /** The name as the relay compares it (nameKey): NFC, without control characters. */
  readonly name: string;
  /** The name as Drive holds it, only where it differs from `name` (NFD, MARC's marks), so a caller can see and fix it. */
  readonly rawName?: string;
  /** native: a Google Doc, Sheet or Slides file (downloads as an export). A shortcut is never followed. */
  readonly kind: "folder" | "file" | "native" | "shortcut";
  readonly mimeType: string;
  readonly size?: number;
  readonly modified?: string;
  readonly md5?: string;
};

export const kindOf = (file: DriveFile): Entry["kind"] =>
  file.mimeType === FOLDER
    ? "folder"
    : file.mimeType === SHORTCUT
      ? "shortcut"
      : file.mimeType.startsWith(NATIVE)
        ? "native"
        : "file";

export const entryOf = (file: DriveFile): Entry => ({
  name: nameKey(file.name),
  ...(nameKey(file.name) === file.name ? {} : { rawName: file.name }),
  kind: kindOf(file),
  mimeType: file.mimeType,
  ...(file.size === undefined ? {} : { size: Number(file.size) }),
  ...(file.modifiedTime === undefined ? {} : { modified: file.modifiedTime }),
  ...(file.md5Checksum === undefined ? {} : { md5: file.md5Checksum }),
});

/** An access token for Drive, refreshed when it lapses. */
export type Tokens = { readonly get: () => Promise<Outcome<string>>; readonly invalidate: () => void };

export type Drive = { readonly request: (url: string, init?: RequestInit) => Promise<Outcome<Response>> };

const DETAIL_LIMIT = 300;

const failureOf = async (response: Response): Promise<Outcome<never>> => {
  const detail = (await response.text()).slice(0, DETAIL_LIMIT);
  switch (response.status) {
    case 404:
      return fail(404, "not-found", detail);
    case 403:
      return fail(403, "drive-forbidden", detail);
    case 416:
      return fail(416, "bad-range", detail);
    case 429:
      return fail(429, "drive-rate-limited", detail);
    default:
      return fail(502, "drive-error", `${response.status}: ${detail}`);
  }
};

/** Drive with the account's token on every call; one retry with a fresh token after a 401. */
export const makeDrive = (fetchFn: Fetch, tokens: Tokens): Drive => ({
  request: async (url, init = {}) => {
    for (let attempt = 0; ; attempt++) {
      const token = await tokens.get();
      if (!token.ok) return token;
      const headers = new Headers(init.headers);
      headers.set("authorization", `Bearer ${token.value}`);
      const response = await fetchFn(url, { ...init, headers });
      if (response.status === 401 && attempt === 0) {
        tokens.invalidate();
        continue;
      }
      return response.ok ? ok(response) : failureOf(response);
    }
  },
});

const sendJson = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "content-type": "application/json; charset=utf-8" },
  body: JSON.stringify(body),
});

const fileOf = async (response: Response): Promise<DriveFile> => (await response.json()) as DriveFile;

export const getFile = async (drive: Drive, id: string): Promise<Outcome<DriveFile>> => {
  if (!DRIVE_ID.test(id)) return fail(500, "bad-id");
  const response = await drive.request(`${API}/files/${id}?fields=${FIELDS}&${ALL_DRIVES}`);
  return response.ok ? ok(await fileOf(response.value)) : response;
};

/**
 * Folder listings kept for one request, by folder id, so a batch lists each folder once. Whoever
 * changes a folder in Drive keeps its listing current (createFolder does; the batch route does for
 * moves).
 */
export type Listings = Map<string, DriveFile[]>;

export const listChildren = async (
  drive: Drive,
  folderId: string,
  listings?: Listings,
): Promise<Outcome<readonly DriveFile[]>> => {
  if (!DRIVE_ID.test(folderId)) return fail(500, "bad-id");
  const cached = listings?.get(folderId);
  if (cached !== undefined) return ok(cached);
  if (folderId === TOP_ID) return fail(500, "bad-id");
  const files: DriveFile[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed = false`,
      fields: `nextPageToken,files(${FIELDS})`,
      pageSize: "1000",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
    });
    if (pageToken !== undefined) params.set("pageToken", pageToken);
    const response = await drive.request(`${API}/files?${params.toString()}`);
    if (!response.ok) return response;
    const page = (await response.value.json()) as { files?: DriveFile[]; nextPageToken?: string };
    files.push(...(page.files ?? []));
    pageToken = page.nextPageToken;
  } while (pageToken !== undefined);
  listings?.set(folderId, files);
  return ok(files);
};

/** The one child of `folder` whose name has this key (nameKey), if any. */
export const childNamed = async (
  drive: Drive,
  folder: DriveFile,
  name: string,
  listings?: Listings,
): Promise<Outcome<DriveFile | null>> => {
  const children = await listChildren(drive, folder.id, listings);
  if (!children.ok) return children;
  const matches = children.value.filter((child) => nameKey(child.name) === name);
  const [only, ...others] = matches;
  if (others.length > 0) return fail(409, "ambiguous", `${matches.length} entries share this name`);
  return ok(only ?? null);
};

/** Where a path leads: the file or folder, and the folder it is in (null for the reference folder). */
export type Located = { readonly file: DriveFile; readonly parent: DriveFile | null };

export const locate = async (
  drive: Drive,
  root: DriveFile,
  path: RefPath,
  listings?: Listings,
): Promise<Outcome<Located>> => {
  let here: Located = { file: root, parent: null };
  for (const name of path) {
    if (here.file.mimeType !== FOLDER) return fail(404, "not-found");
    const child = await childNamed(drive, here.file, name, listings);
    if (!child.ok) return child;
    if (child.value === null) return fail(404, "not-found");
    here = { file: child.value, parent: here.file };
  }
  return ok(here);
};

export const createFolder = async (
  drive: Drive,
  parent: DriveFile,
  name: string,
  listings?: Listings,
): Promise<Outcome<DriveFile>> => {
  if (parent.id === TOP_ID) return fail(400, "not-in-a-root");
  const response = await drive.request(
    `${API}/files?fields=${FIELDS}&${ALL_DRIVES}`,
    sendJson("POST", { name, mimeType: FOLDER, parents: [parent.id] }),
  );
  if (!response.ok) return response;
  const made = await fileOf(response.value);
  listings?.get(parent.id)?.push(made);
  listings?.set(made.id, []);
  return ok(made);
};

/** The folder at `path`, making any that are missing (mkdir -p). */
export const ensureFolder = async (
  drive: Drive,
  root: DriveFile,
  path: RefPath,
  listings?: Listings,
): Promise<Outcome<DriveFile>> => {
  let here = root;
  for (const name of path) {
    const child = await childNamed(drive, here, name, listings);
    if (!child.ok) return child;
    if (child.value === null) {
      const made = await createFolder(drive, here, name, listings);
      if (!made.ok) return made;
      here = made.value;
    } else if (child.value.mimeType === FOLDER) {
      here = child.value;
    } else {
      return fail(409, "not-a-folder", name);
    }
  }
  return ok(here);
};

/** The folder at `path`, which must exist. */
export const folderAt = async (
  drive: Drive,
  root: DriveFile,
  path: RefPath,
  listings?: Listings,
): Promise<Outcome<DriveFile>> => {
  const found = await locate(drive, root, path, listings);
  if (!found.ok) return found;
  return found.value.file.mimeType === FOLDER ? ok(found.value.file) : fail(409, "not-a-folder");
};

/**
 * Writes content through a resumable upload session: a new file in `parent`, or new content for
 * `existing`. Two requests, and the body is sent once, whole, with its length.
 */
export const upload = async (
  drive: Drive,
  target: { readonly parent: DriveFile; readonly name: string } | { readonly existing: DriveFile },
  body: ArrayBuffer,
  contentType: string,
): Promise<Outcome<DriveFile>> => {
  if ("parent" in target && target.parent.id === TOP_ID) return fail(400, "not-in-a-root");
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "x-upload-content-type": contentType,
    "x-upload-content-length": String(body.byteLength),
  };
  const session =
    "existing" in target
      ? await drive.request(`${UPLOAD}/files/${target.existing.id}?uploadType=resumable&fields=${FIELDS}&${ALL_DRIVES}`, {
          method: "PATCH",
          headers,
          body: "{}",
        })
      : await drive.request(`${UPLOAD}/files?uploadType=resumable&fields=${FIELDS}&${ALL_DRIVES}`, {
          method: "POST",
          headers,
          body: JSON.stringify({ name: target.name, parents: [target.parent.id], mimeType: contentType }),
        });
  if (!session.ok) return session;
  const location = session.value.headers.get("location");
  if (location?.startsWith(`${UPLOAD}/`) !== true) return fail(502, "drive-error", "no upload session");
  const sent = await drive.request(location, { method: "PUT", headers: { "content-type": contentType }, body });
  return sent.ok ? ok(await fileOf(sent.value)) : sent;
};

/** Renames and/or moves a file or folder; `to` is its new folder, `from` its current one. */
export const move = async (
  drive: Drive,
  file: DriveFile,
  from: DriveFile,
  to: DriveFile,
  name: string,
): Promise<Outcome<DriveFile>> => {
  if (from.id === TOP_ID || to.id === TOP_ID) return fail(400, "not-in-a-root");
  const params = new URLSearchParams({ fields: FIELDS, supportsAllDrives: "true" });
  if (from.id !== to.id) {
    params.set("addParents", to.id);
    params.set("removeParents", from.id);
  }
  const response = await drive.request(`${API}/files/${file.id}?${params.toString()}`, sendJson("PATCH", { name }));
  return response.ok ? ok(await fileOf(response.value)) : response;
};

/** Sets a file's description, which Drive shows in its details pane and searches; "" clears it. */
export const setDescription = async (drive: Drive, file: DriveFile, description: string): Promise<Outcome<DriveFile>> => {
  if (file.id === TOP_ID) return fail(400, "not-in-a-root");
  const response = await drive.request(
    `${API}/files/${file.id}?fields=${FIELDS}&${ALL_DRIVES}`,
    sendJson("PATCH", { description }),
  );
  return response.ok ? ok(await fileOf(response.value)) : response;
};

/** Moves to Drive's trash, where the owner can restore it for 30 days. The relay never deletes. */
export const trash = async (drive: Drive, file: DriveFile): Promise<Outcome<DriveFile>> => {
  const response = await drive.request(
    `${API}/files/${file.id}?fields=${FIELDS}&${ALL_DRIVES}`,
    sendJson("PATCH", { trashed: true }),
  );
  return response.ok ? ok(await fileOf(response.value)) : response;
};

/** The file's bytes (a Range header passes through) or, for a Google-native file, an export. */
export const download = async (
  drive: Drive,
  file: DriveFile,
  options: { readonly range: string | null; readonly exportAs: string | null },
): Promise<Outcome<Response>> => {
  if (kindOf(file) === "native") {
    const format = options.exportAs ?? DEFAULT_EXPORT[file.mimeType];
    if (format === undefined) return fail(409, "export-required", file.mimeType);
    const params = new URLSearchParams({ mimeType: format });
    return drive.request(`${API}/files/${file.id}/export?${params.toString()}`);
  }
  const headers: Record<string, string> = options.range === null ? {} : { range: options.range };
  return drive.request(`${API}/files/${file.id}?alt=media&${ALL_DRIVES}`, { headers });
};

export const accountEmail = async (drive: Drive): Promise<Outcome<string>> => {
  const response = await drive.request(`${API}/about?fields=user(emailAddress)`);
  if (!response.ok) return response;
  const about = (await response.value.json()) as { user?: { emailAddress?: string } };
  return ok(about.user?.emailAddress ?? "");
};
