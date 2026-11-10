/**
 * GET /v1/find?q=words[&in=path]: files and folders whose names contain every word, inside the roots.
 *
 * Drive searches names across the whole account (a word matches the start of a word in the name,
 * in any case). The relay then climbs each hit's parents. Hits under a root come back with their
 * path; anything else is dropped unread, its name never leaving the relay. A book can be found
 * wherever it has been filed, so courses cite books by author, title and year, never by path.
 *
 * Climbing costs a Drive call per folder not yet seen. Within FIND_BUDGET calls the relay answers
 * what it has climbed and says `truncated`.
 */
import { API, DRIVE_ID, entryOf, type Drive, type DriveFile, type Entry } from "./drive.ts";
import { fail, json, ok, type Outcome } from "./outcome.ts";
import { nameKey, parsePath, within, type RefPath } from "./paths.ts";

export const MAX_WORDS = 8;
const PAGE = 50;
const MAX_DEPTH = 32;
/** Drive calls find may make itself (the search included), after the token and roots. */
export const FIND_BUDGET = 40;

type Found = DriveFile & { readonly parents?: readonly string[] };

const FIELDS = "id,name,mimeType,size,modifiedTime,md5Checksum,parents";

/** A word as a Drive query string: backslashes and quotes escaped. */
const quoted = (word: string): string => `'${word.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'`;

export type FindContext = {
  readonly drive: Drive;
  readonly url: URL;
  /** The one root's id, or the named roots by id. */
  readonly roots: ReadonlyMap<string, string | null>;
};

export const find = async ({ drive, url, roots }: FindContext): Promise<Outcome<Response>> => {
  const words = (url.searchParams.get("q") ?? "")
    .split(/\s+/u)
    .map(nameKey)
    .filter((word) => word !== "");
  if (words.length === 0 || words.length > MAX_WORDS) return fail(400, "bad-query", `1 to ${MAX_WORDS} words`);
  const inside = parsePath(url.searchParams.get("in"));
  if (!inside.ok) return inside;

  let calls = 0;
  const call = (path: string): Promise<Outcome<Response>> => {
    calls += 1;
    return drive.request(`${API}${path}`);
  };
  const params = new URLSearchParams({
    q: [...words.map((word) => `name contains ${quoted(word)}`), "trashed = false"].join(" and "),
    fields: `files(${FIELDS})`,
    pageSize: String(PAGE),
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true",
  });
  const searched = await call(`/files?${params.toString()}`);
  if (!searched.ok) return searched;
  const hits = ((await searched.value.json()) as { files?: Found[] }).files ?? [];

  /** Folders climbed so far: id → its name and parent (null above the account's top). */
  const climbed = new Map<string, { readonly name: string; readonly parent: string | null }>();
  let truncated = false;

  /** A hit's path from its root, or null when it lies outside every root. */
  const pathOf = async (hit: Found): Promise<RefPath | null | "budget"> => {
    if (roots.has(hit.id)) {
      const name = roots.get(hit.id);
      return name === null || name === undefined ? [] : [name];
    }
    const names = [nameKey(hit.name)];
    let id = hit.parents?.[0];
    for (let depth = 0; id !== undefined && depth < MAX_DEPTH; depth++) {
      if (roots.has(id)) {
        const name = roots.get(id);
        return [...(name === null || name === undefined ? [] : [name]), ...names.reverse()];
      }
      let folder = climbed.get(id);
      if (folder === undefined) {
        if (calls >= FIND_BUDGET || !DRIVE_ID.test(id)) return "budget";
        const got = await call(`/files/${id}?fields=id,name,parents&supportsAllDrives=true`);
        if (!got.ok) return null;
        const meta = (await got.value.json()) as Found;
        folder = { name: meta.name, parent: meta.parents?.[0] ?? null };
        climbed.set(id, folder);
      }
      names.push(nameKey(folder.name));
      id = folder.parent ?? undefined;
    }
    return null;
  };

  const results: (Entry & { readonly path: string })[] = [];
  for (const hit of hits) {
    const path = await pathOf(hit);
    if (path === "budget") {
      truncated = true;
      break;
    }
    if (path === null || !within(path, inside.value)) continue;
    results.push({ ...entryOf(hit), path: path.join("/") });
  }
  const collator = new Intl.Collator("und");
  results.sort((a, b) => collator.compare(a.path, b.path));
  return ok(json(200, { query: words.join(" "), results, truncated: truncated || hits.length === PAGE }));
};
