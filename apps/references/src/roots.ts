/**
 * Where the relay reaches (ADR 0090).
 *
 * - One folder, ROOT_FOLDER_ID: paths start inside it (ADR 0079).
 * - Several, ROOTS="nabu=<id>,books=<id>": paths start with a root's name, and the top of the relay
 *   (path "") lists the roots. The top is a folder that exists only here (TOP_ID): its listing is
 *   seeded from ROOTS, so reaching a root costs no Drive call.
 *
 * Nothing else in Drive is reachable: a root's parent folder, a sibling of it, or anything above it.
 */
import { DRIVE_ID, FOLDER, TOP_ID, getFile, kindOf, type Drive, type DriveFile, type Listings } from "./drive.ts";
import { fail, ok, type Outcome } from "./outcome.ts";
import { nameKey } from "./paths.ts";

export const MAX_ROOTS = 4;

export type RootSpec =
  | { readonly single: string }
  | { readonly named: readonly { readonly name: string; readonly id: string }[] };

export type Roots = {
  /** Where every path starts: the one root, or the folder above the named roots. */
  readonly top: DriveFile;
  /** Drive id → name, for each named root (empty for one root). */
  readonly named: ReadonlyMap<string, string>;
};

/** A root's name: one path segment someone can type. */
const ROOT_NAME = /^[\p{L}\p{N}._-]+$/u;

const goodName = (name: string): boolean =>
  ROOT_NAME.test(name) && nameKey(name) === name && name !== "." && name !== "..";

export const rootSpecOf = (env: { readonly ROOTS?: string; readonly ROOT_FOLDER_ID?: string }): Outcome<RootSpec> => {
  const roots = (env.ROOTS ?? "").trim();
  if (roots !== "") {
    const named: { name: string; id: string }[] = [];
    for (const part of roots.split(",")) {
      const [name, id, ...rest] = part.trim().split("=");
      if (name === undefined || id === undefined || rest.length > 0 || !goodName(name) || !DRIVE_ID.test(id)) {
        return fail(500, "misconfigured", "ROOTS: name=id,name=id");
      }
      named.push({ name, id });
    }
    if (named.length > MAX_ROOTS || new Set(named.map((root) => root.name)).size !== named.length) {
      return fail(500, "misconfigured", `ROOTS: at most ${MAX_ROOTS}, each name once`);
    }
    return ok({ named });
  }
  const single = env.ROOT_FOLDER_ID ?? "";
  return DRIVE_ID.test(single) ? ok({ single }) : fail(500, "misconfigured", "ROOTS or ROOT_FOLDER_ID");
};

/** The roots for one request; named roots are seeded into `listings` under the top. */
export const loadRoots = async (drive: Drive, spec: RootSpec, listings: Listings): Promise<Outcome<Roots>> => {
  if ("single" in spec) {
    const root = await getFile(drive, spec.single);
    if (!root.ok) return root;
    if (kindOf(root.value) !== "folder") return fail(500, "misconfigured", "ROOT_FOLDER_ID is not a folder");
    return ok({ top: root.value, named: new Map() });
  }
  listings.set(
    TOP_ID,
    spec.named.map(({ name, id }) => ({ id, name, mimeType: FOLDER })),
  );
  return ok({
    top: { id: TOP_ID, name: "", mimeType: FOLDER },
    named: new Map(spec.named.map(({ name, id }) => [id, name])),
  });
};

/** Drive calls loading the roots costs a request: one for a single root, none for named roots. */
export const rootCalls = (spec: RootSpec): number => ("single" in spec ? 1 : 0);
