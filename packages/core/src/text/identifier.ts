/**
 * Usernames (gameplan §12.7) under Unicode's security rules. Data is passed in (the generated
 * UTS #39 files in @nabu/i18n), so core stays pure.
 *
 * - **Key:** uniqueness is decided on NFKC_Casefold (UAX #44): Ali, ALI and Ａｌｉ are one name.
 * - **Characters:** letters, marks and digits whose Identifier_Status is Allowed (UTS #39 §3.1),
 *   joined by single `_`, `-` or `.`; ZWNJ only between Arabic-script letters (UAX #31 A1), so
 *   Persian names like کتاب\u200Cخوان work.
 * - **Mixed scripts:** Moderately Restrictive (UTS #39 §5.2): one script; or Latin with Han and
 *   kana, bopomofo or hangul; or Latin plus one other recommended script that is not Cyrillic or
 *   Greek (whose letters pass for Latin ones).
 * - **Confusables:** names whose skeletons (UTS #39 §4) match are the same name for uniqueness,
 *   so раураl (Cyrillic) cannot pose as paypal.
 */
import { err, ok, type Result } from "../result.ts";
import { caseFold } from "./case.ts";
import { graphemeCount } from "./graphemes.ts";

export interface SecurityData {
  /** confusables.txt: code point → prototype. */
  readonly confusables: Readonly<Record<string, string>>;
  /** Identifier_Status=Allowed, as sorted inclusive code point ranges. */
  readonly allowed: readonly (readonly [number, number])[];
  /** ISO 15924 codes to test Script_Extensions against (every encoded script). */
  readonly scripts: readonly string[];
}

export type UsernameError = "length" | "characters" | "separators" | "mixed-script";

export interface Username {
  /** As entered, NFKC: what is displayed. */
  readonly display: string;
  /** NFKC_Casefold: unique per instance. */
  readonly key: string;
  /** UTS #39 skeleton of the key: also unique, so confusable names collide. */
  readonly skeleton: string;
}

export const USERNAME_LENGTH = { min: 3, max: 30 } as const;

const IGNORABLE = /\p{Default_Ignorable_Code_Point}/gu;

/**
 * NFKC_Casefold (UAX #44 §5.7.4): NFKC, full case folding, NFKC again, default ignorables
 * removed. Full folding goes further than the grader's caseFold, which keeps ß: here ß is ss.
 */
export const nfkcCasefold = (s: string): string =>
  caseFold(s.normalize("NFKC"), "und")
    .replace(/ß/gu, "ss")
    .normalize("NFKC")
    .replace(IGNORABLE, "")
    .normalize("NFKC");

/** The UTS #39 skeleton: NFD, each code point to its prototype, NFD. */
export const skeleton = (s: string, data: Pick<SecurityData, "confusables">): string =>
  [...s.normalize("NFD")]
    .map((c) => data.confusables[c] ?? c)
    .join("")
    .normalize("NFD");

const isAllowed = (cp: number, ranges: SecurityData["allowed"]): boolean => {
  let lo = 0;
  let hi = ranges.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const r = ranges[mid] as readonly [number, number];
    if (cp < r[0]) hi = mid - 1;
    else if (cp > r[1]) lo = mid + 1;
    else return true;
  }
  return false;
};

const ZWNJ = "\u200C";
const SEPARATORS = new Set(["_", "-", "."]);
const ARABIC = /\p{Script_Extensions=Arab}/u;
const COMMON = /^[\p{Script=Zyyy}\p{Script=Zinh}]$/u;

const regexes = new Map<string, RegExp>();
const scxOf = (c: string, scripts: readonly string[]): ReadonlySet<string> => {
  const out = new Set<string>();
  for (const s of scripts) {
    let r = regexes.get(s);
    if (r === undefined) {
      try {
        r = new RegExp(`^\\p{Script_Extensions=${s}}$`, "u");
      } catch {
        continue; // a CLDR code with no Unicode script property (Hans, Jpan, …)
      }
      regexes.set(s, r);
    }
    if (r.test(c)) out.add(s);
  }
  return out;
};

const HIGHLY: readonly (readonly string[])[] = [
  ["Latn", "Hani", "Hira", "Kana"],
  ["Latn", "Hani", "Bopo"],
  ["Latn", "Hani", "Hang"],
];

/** Moderately Restrictive (UTS #39 §5.2) over the characters' Script_Extensions. */
export const scriptsAllowed = (s: string, scripts: readonly string[]): boolean => {
  const sets = [...s].filter((c) => !COMMON.test(c)).map((c) => scxOf(c, scripts));
  if (sets.length === 0) return true;
  const covered = (allowed: ReadonlySet<string>): boolean => sets.every((x) => [...x].some((sc) => allowed.has(sc)));
  // Single script: the resolved script set (the intersection) is not empty.
  const [first, ...rest] = sets;
  if ([...(first ?? [])].some((sc) => rest.every((x) => x.has(sc)))) return true;
  if (HIGHLY.some((combo) => covered(new Set(combo)))) return true;
  const others = new Set(sets.flatMap((x) => [...x]).filter((sc) => sc !== "Latn" && sc !== "Cyrl" && sc !== "Grek"));
  return [...others].some((sc) => covered(new Set(["Latn", sc])));
};

/** Checks a username; on success, its display form, key and skeleton. */
export const checkUsername = (input: string, data: SecurityData): Result<Username, UsernameError> => {
  // NFKC first: fullwidth letters from an IME, or a ligature, become the plain letters they stand for.
  const display = input.normalize("NFKC").trim();
  const length = graphemeCount(display);
  if (length < USERNAME_LENGTH.min || length > USERNAME_LENGTH.max) return err("length");
  const chars = [...display];
  for (const [i, c] of chars.entries()) {
    if (SEPARATORS.has(c)) {
      const prev = chars[i - 1];
      const next = chars[i + 1];
      if (prev === undefined || next === undefined || SEPARATORS.has(prev) || SEPARATORS.has(next)) return err("separators");
      continue;
    }
    if (c === ZWNJ) {
      // UAX #31 A1, simplified: only inside Arabic-script words.
      const prev = chars[i - 1];
      const next = chars[i + 1];
      if (prev === undefined || next === undefined || !ARABIC.test(prev) || !ARABIC.test(next)) return err("characters");
      continue;
    }
    if (!/[\p{L}\p{M}\p{Nd}]/u.test(c) || !isAllowed(c.codePointAt(0) ?? 0, data.allowed)) return err("characters");
  }
  if (!scriptsAllowed(display, data.scripts)) return err("mixed-script");
  const key = nfkcCasefold(display);
  return ok({ display, key, skeleton: skeleton(key, data) });
};

/** Display names are free-form (rendered in <bdi>): NFC, trimmed, 1–50 graphemes, no control or bidi characters. */
export const checkDisplayName = (input: string): Result<string, "length" | "characters"> => {
  const name = input.normalize("NFC").trim();
  const length = graphemeCount(name);
  if (length < 1 || length > 50) return err("length");
  if (/[\p{Cc}\u2028\u2029\u202A-\u202E\u2066-\u2069\u200E\u200F\u061C]/u.test(name)) return err("characters");
  return ok(name);
};
