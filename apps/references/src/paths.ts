import { fail, ok, type Outcome } from "./outcome.ts";

/** A path inside the reference folder, as its names: NFC, none empty, "." or "..". [] is the folder itself. */
export type RefPath = readonly string[];

/** Control characters (C0, DEL, C1) never name anything worth reaching. */
const CONTROL = /\p{Cc}/u;

/**
 * Parses a `path` parameter. Names are compared in NFC (CLAUDE.md: NFC at every boundary), so a
 * name Drive holds in NFD (as macOS often writes it) is still found by its NFC spelling.
 */
export const parsePath = (raw: string | null): Outcome<RefPath> => {
  const trimmed = (raw ?? "").normalize("NFC").replace(/^\/+|\/+$/gu, "");
  if (trimmed === "") return ok([]);
  const names = trimmed.split("/");
  const bad = names.some((name) => name === "" || name === "." || name === ".." || CONTROL.test(name));
  return bad ? fail(400, "bad-path") : ok(names);
};

/** Whether `inner` is `outer` or inside it. */
export const within = (inner: RefPath, outer: RefPath): boolean =>
  outer.length <= inner.length && outer.every((name, i) => inner[i] === name);
