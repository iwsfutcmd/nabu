import { fail, ok, type Outcome } from "./outcome.ts";

/** A path inside the reference folder, as its names' keys (nameKey). [] is the folder itself. */
export type RefPath = readonly string[];

const CONTROLS = /\p{Cc}/gu;

/**
 * How a name is compared, listed and addressed: NFC (CLAUDE.md: NFC at every boundary), so a name
 * Drive holds in NFD (as macOS often writes it) is found by its NFC spelling; and without control
 * characters, which no one can type. Names taken from library catalogues carry them: MARC's
 * non-sorting marks, U+0098 and U+009C, around a leading article ("\u0098The\u009c fundamentals of…").
 */
export const nameKey = (name: string): string => name.normalize("NFC").replace(CONTROLS, "");

/** Parses a `path` parameter into name keys; none may be empty, "." or "..". */
export const parsePath = (raw: string | null): Outcome<RefPath> => {
  const trimmed = (raw ?? "").replace(/^\/+|\/+$/gu, "");
  if (trimmed === "") return ok([]);
  const names = trimmed.split("/").map(nameKey);
  const bad = names.some((name) => name === "" || name === "." || name === "..");
  return bad ? fail(400, "bad-path") : ok(names);
};

/** Whether `inner` is `outer` or inside it. */
export const within = (inner: RefPath, outer: RefPath): boolean =>
  outer.length <= inner.length && outer.every((name, i) => inner[i] === name);
