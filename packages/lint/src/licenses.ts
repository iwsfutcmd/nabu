/**
 * The license check (gameplan §17): what ships (the web app, the API, the mobile shell) carries no
 * copyleft code. Run by `pnpm license-check` in CI, over `pnpm licenses list --prod --json`.
 *
 * An SPDX expression passes when it can be satisfied with allowed licenses alone: one side of an
 * OR, both sides of an AND. Anything else fails, an unknown or missing license included, so a new
 * license is a decision (add it here, with why) rather than an accident.
 */

/** Permissive licenses: use, change and ship, keeping the notice. */
export const ALLOWED: ReadonlySet<string> = new Set([
  "MIT",
  "MIT-0",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "ISC",
  "0BSD",
  "CC0-1.0",
  "Unlicense",
  "BlueOak-1.0.0",
  "Unicode-3.0",
  "Unicode-DFS-2016",
  "Python-2.0",
  "Zlib",
]);

/** SPDX operators, in either case the spec allows. */
const OPERATORS: Readonly<Record<string, "AND" | "OR" | "WITH">> = { AND: "AND", and: "AND", OR: "OR", or: "OR", WITH: "WITH", with: "WITH" };
const operator = (token: string | undefined): "AND" | "OR" | "WITH" | undefined => (token === undefined ? undefined : OPERATORS[token]);

type Expression = { readonly op: "license"; readonly id: string } | { readonly op: "and" | "or"; readonly left: Expression; readonly right: Expression };

/** A small SPDX expression parser: identifiers (with an optional "+"), AND, OR, parentheses. WITH exceptions keep their base license. */
export const parseSpdx = (text: string): Expression => {
  const tokens = text.replace(/[()]/gu, " $& ").trim().split(/\s+/u);
  let at = 0;
  const peek = (): string | undefined => tokens[at];
  const primary = (): Expression => {
    const t = tokens[at++];
    if (t === undefined) throw new Error(`incomplete license expression: ${text}`);
    if (t === "(") {
      const e = or();
      if (tokens[at++] !== ")") throw new Error(`unbalanced license expression: ${text}`);
      return e;
    }
    // "GPL-2.0 WITH Classpath-exception-2.0": the exception does not change the base license here.
    if (operator(peek()) === "WITH") at += 2;
    return { op: "license", id: t.replace(/\+$/u, "") };
  };
  const and = (): Expression => {
    let e = primary();
    while (operator(peek()) === "AND") {
      at++;
      e = { op: "and", left: e, right: primary() };
    }
    return e;
  };
  const or = (): Expression => {
    let e = and();
    while (operator(peek()) === "OR") {
      at++;
      e = { op: "or", left: e, right: and() };
    }
    return e;
  };
  const e = or();
  if (at !== tokens.length) throw new Error(`unexpected "${tokens[at]}" in license expression: ${text}`);
  return e;
};

const satisfiable = (e: Expression, allowed: ReadonlySet<string>): boolean =>
  e.op === "license" ? allowed.has(e.id) : e.op === "and" ? satisfiable(e.left, allowed) && satisfiable(e.right, allowed) : satisfiable(e.left, allowed) || satisfiable(e.right, allowed);

/** Whether a package's license (an SPDX expression, as npm metadata gives it) may ship. */
export const mayShip = (license: string | undefined, allowed: ReadonlySet<string> = ALLOWED): boolean => {
  if (license === undefined || license.trim() === "" || license === "Unknown" || license === "UNLICENSED") return false;
  try {
    return satisfiable(parseSpdx(license.replace(/^\((.*)\)$/u, "$1")), allowed);
  } catch {
    return false;
  }
};

export interface Shipped {
  readonly name: string;
  readonly version: string;
  readonly license: string;
}

/** What may not ship, from `pnpm licenses list --json` (licenses → packages). */
export const refused = (listing: Readonly<Record<string, readonly { readonly name: string; readonly versions?: readonly string[]; readonly version?: string }[]>>): Shipped[] =>
  Object.entries(listing)
    .filter(([license]) => !mayShip(license))
    .flatMap(([license, packages]) => packages.map((p) => ({ name: p.name, version: p.versions?.join(", ") ?? p.version ?? "", license })))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
