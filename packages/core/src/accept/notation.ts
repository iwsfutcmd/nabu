/**
 * Accept-set notation (gameplan §7.4): one alternative per line; `(a|b)` is
 * alternation, `[x]` is optional, a trailing ` @w` is a relative weight
 * (default 1), `#` starts a comment line, `\` escapes a special character.
 * Groups nest. The first line, with every optional part included and the first
 * branch of every alternation, is the canonical answer.
 */
import { err, ok, type Result } from "../result.ts";

export interface AcceptAlternative {
  readonly text: string;
  readonly weight: number;
  readonly line: number;
  readonly canonical: boolean;
}

export interface AcceptSet {
  readonly alternatives: readonly AcceptAlternative[];
  /** How many strings the notation expands to. */
  readonly paths: number;
  readonly warnings: readonly NotationWarning[];
}

export interface NotationError {
  readonly code: "unbalanced" | "empty" | "too-many-paths";
  readonly line: number;
  readonly message: string;
}

export interface NotationWarning {
  readonly code: "many-paths";
  readonly line: number;
  readonly paths: number;
}

type Node = { readonly t: "lit"; readonly s: string } | { readonly t: "alt"; readonly options: Seq[] } | { readonly t: "opt"; readonly seq: Seq };
type Seq = readonly Node[];

const parseLine = (cps: readonly string[]): Seq => {
  let i = 0;
  const parseAlt = (close: string | undefined): Seq[] => {
    const options: Node[][] = [[]];
    while (i < cps.length) {
      const c = cps[i] as string;
      if (c === close) return options;
      i++;
      if (c === ")" || c === "]") throw new Error(`unexpected "${c}"`);
      const current = options[options.length - 1] as Node[];
      if (c === "|") options.push([]);
      else if (c === "(") {
        const inner = parseAlt(")");
        if (cps[i++] !== ")") throw new Error('missing ")"');
        current.push({ t: "alt", options: inner });
      } else if (c === "[") {
        const inner = parseAlt("]");
        if (cps[i++] !== "]") throw new Error('missing "]"');
        current.push({ t: "opt", seq: inner.length === 1 ? (inner[0] as Seq) : [{ t: "alt", options: inner }] });
      } else if (c === "\\") {
        const next = cps[i++];
        if (next === undefined) throw new Error("dangling backslash");
        current.push({ t: "lit", s: next });
      } else current.push({ t: "lit", s: c });
    }
    if (close !== undefined) throw new Error(`missing "${close}"`);
    return options;
  };
  const top = parseAlt(undefined);
  return top.length === 1 ? (top[0] as Seq) : [{ t: "alt", options: top }];
};

const countSeq = (seq: Seq): number =>
  seq.reduce((n, node) => n * (node.t === "lit" ? 1 : node.t === "alt" ? node.options.reduce((m, o) => m + countSeq(o), 0) : countSeq(node.seq) + 1), 1);

/**
 * An accept set of exactly this text: every character the notation gives a meaning is escaped
 * (`(`, `)`, `[`, `]`, `|`, `\`, and `@` and `#`, so no weight or comment is read into it), so the
 * text is the one alternative.
 */
export const literalAccept = (text: string): string => text.replace(/[()[\]|\\@#]/gu, (c) => `\\${c}`);

/** Expands in canonical order: first branches and included optionals come first. */
const expandSeq = (seq: Seq): string[] =>
  seq.reduce<string[]>(
    (prefixes, node) => {
      const tails = node.t === "lit" ? [node.s] : node.t === "alt" ? node.options.flatMap(expandSeq) : [...expandSeq(node.seq), ""];
      return prefixes.flatMap((p) => tails.map((t) => p + t));
    },
    [""],
  );

const WEIGHT = /\s@(\d+(?:\.\d+)?)\s*$/u;

export const parseAcceptSet = (
  source: string,
  limits: { readonly maxPaths?: number; readonly warnPaths?: number } = {},
): Result<AcceptSet, readonly NotationError[]> => {
  const maxPaths = limits.maxPaths ?? 10_000;
  const warnPaths = limits.warnPaths ?? 1_000;
  const errors: NotationError[] = [];
  const warnings: NotationWarning[] = [];
  const alternatives: AcceptAlternative[] = [];
  let paths = 0;
  source.split(/\r?\n/u).forEach((raw, index) => {
    const line = index + 1;
    const trimmed = raw.trim();
    if (trimmed === "" || trimmed.startsWith("#")) return;
    const weightMatch = WEIGHT.exec(trimmed);
    const weight = weightMatch === null ? 1 : Number(weightMatch[1]);
    const body = weightMatch === null ? trimmed : trimmed.slice(0, weightMatch.index);
    let seq: Seq;
    try {
      seq = parseLine(Array.from(body.normalize("NFC")));
    } catch (e) {
      errors.push({ code: "unbalanced", line, message: (e as Error).message });
      return;
    }
    const count = countSeq(seq);
    paths += count;
    if (paths > maxPaths) {
      errors.push({ code: "too-many-paths", line, message: `expands to more than ${maxPaths} answers` });
      return;
    }
    if (count > warnPaths) warnings.push({ code: "many-paths", line, paths: count });
    for (const text of expandSeq(seq)) {
      if (text.trim() === "") {
        errors.push({ code: "empty", line, message: "an alternative expands to the empty string" });
        continue;
      }
      alternatives.push({ text, weight, line, canonical: alternatives.length === 0 });
    }
  });
  if (alternatives.length === 0 && errors.length === 0) errors.push({ code: "empty", line: 0, message: "no alternatives" });
  return errors.length > 0 ? err(errors) : ok({ alternatives, paths, warnings });
};
