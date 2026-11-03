/**
 * BCP 47 parsing, likely subtags and CLDR parent chains, driven by the CLDR
 * tables generated into src/generated (pinned CLDR version, see cldr-meta.json).
 *
 * We deliberately do not use the engine's Intl.Locale#maximize as the source of
 * truth: its CLDR data depends on the browser version (gameplan §17). It serves
 * as a cross-check in tests instead.
 */
import likelySubtags from "./generated/likely-subtags.json" with { type: "json" };
import parentLocales from "./generated/parent-locales.json" with { type: "json" };
import { asciiLowercase, asciiTitlecase, asciiUppercase } from "@nabu/core/text";

export interface ParsedTag {
  readonly language: string;
  readonly script?: string;
  readonly region?: string;
  readonly variants: readonly string[];
  /** Extensions and private use, verbatim and lowercased, e.g. ["u-nu-arabext"]. */
  readonly extensions: readonly string[];
}

const LIKELY = likelySubtags as Readonly<Record<string, string>>;
const PARENTS = parentLocales.parentLocale as Readonly<Record<string, string>>;
const NONLIKELY_SCRIPT_PARENT = parentLocales.nonlikelyScriptParent;

/** Parses a well-formed BCP 47 tag and canonicalizes its case. Throws on malformed input. */
export const parseTag = (tag: string): ParsedTag => {
  const subtags = tag.replaceAll("_", "-").split("-");
  const first = subtags[0] ?? "";
  if (!/^[A-Za-z]{2,3}$|^[A-Za-z]{5,8}$/.test(first) && asciiLowercase(first) !== "root") {
    throw new RangeError(`Not a BCP 47 language tag: "${tag}"`);
  }
  const language = asciiLowercase(first) === "root" ? "und" : asciiLowercase(first);
  let i = 1;
  let script: string | undefined;
  let region: string | undefined;
  if (/^[A-Za-z]{4}$/.test(subtags[i] ?? "")) script = asciiTitlecase(subtags[i++] as string);
  if (/^(?:[A-Za-z]{2}|[0-9]{3})$/.test(subtags[i] ?? "")) region = asciiUppercase(subtags[i++] as string);
  const variants: string[] = [];
  while (/^(?:[A-Za-z0-9]{5,8}|[0-9][A-Za-z0-9]{3})$/.test(subtags[i] ?? "")) variants.push(asciiLowercase(subtags[i++] as string));
  const extensions: string[] = [];
  while (i < subtags.length) {
    const singleton = asciiLowercase(subtags[i++] as string);
    if (!/^[0-9a-z]$/.test(singleton)) throw new RangeError(`Not a BCP 47 language tag: "${tag}"`);
    const body: string[] = [];
    const isPrivate = singleton === "x";
    while (i < subtags.length && (isPrivate || !/^[0-9A-Za-z]$/.test(subtags[i] as string))) {
      body.push(asciiLowercase(subtags[i++] as string));
    }
    if (body.length === 0) throw new RangeError(`Empty extension in "${tag}"`);
    extensions.push([singleton, ...body].join("-"));
  }
  return { language, ...(script && { script }), ...(region && { region }), variants, extensions };
};

export const formatTag = (t: ParsedTag): string =>
  [t.language, t.script, t.region, ...t.variants, ...t.extensions].filter((s) => s !== undefined).join("-");

/** Language, script and region only. */
const core = (t: Pick<ParsedTag, "language" | "script" | "region">): string =>
  [t.language, t.script, t.region].filter((s) => s !== undefined).join("-");

/**
 * Add Likely Subtags (UTS #35 Part 1 §4.3). Fields present in the input are kept;
 * missing ones come from the first matching CLDR rule. Returns undefined if
 * nothing matches (CLDR always has "und", so that only happens for bad input).
 */
export const maximize = (tag: string): string => {
  const t = parseTag(tag);
  const { language: l, script: s, region: r } = t;
  const lookups = [
    s && r ? `${l}-${s}-${r}` : undefined,
    r ? `${l}-${r}` : undefined,
    s ? `${l}-${s}` : undefined,
    l,
    s ? `und-${s}` : undefined,
  ];
  for (const key of lookups) {
    if (key === undefined) continue;
    const hit = LIKELY[key];
    if (hit !== undefined) {
      const m = parseTag(hit);
      return formatTag({
        ...t,
        language: l === "und" ? m.language : l,
        ...((s ?? m.script) && { script: (s ?? m.script) as string }),
        ...((r ?? m.region) && { region: (r ?? m.region) as string }),
      });
    }
  }
  return formatTag(t);
};

/** The script a tag is written in: its explicit script subtag, else the likely one. */
export const scriptOf = (tag: string): string | undefined => parseTag(tag).script ?? parseTag(maximize(tag)).script;

/**
 * CLDR parent of a locale (UTS #35 Part 1 §4.1.3): explicit parentLocale data
 * first, then the non-likely-script rule (uz-Cyrl → root, not uz), then
 * truncation. Returns "und" (root) at the top; root has no parent.
 */
export const parentOf = (tag: string): string | undefined => {
  const t = parseTag(tag);
  const key = formatTag({ ...t, extensions: [] });
  if (key === "und") return undefined;
  const explicit = PARENTS[key];
  if (explicit !== undefined) return explicit === "root" ? "und" : explicit;
  if (t.variants.length > 0) return formatTag({ ...t, variants: t.variants.slice(0, -1), extensions: [] });
  if (t.region !== undefined) return core({ language: t.language, ...(t.script && { script: t.script }) });
  if (t.script !== undefined) {
    const likely = parseTag(maximize(t.language)).script;
    if (likely !== t.script && NONLIKELY_SCRIPT_PARENT !== null) return "und";
    return t.language;
  }
  return "und";
};

/**
 * The CLDR locale id for a tag: the script subtag is present exactly when it is
 * not the default script of the language (zh-TW → zh-Hant-TW, en-Latn-IN → en-IN,
 * pa-PK → pa-Arab-PK). Parent-locale data is keyed by these ids. Extensions are dropped.
 */
export const cldrLocaleId = (tag: string): string => {
  const t = parseTag(tag);
  if (t.language === "und") return formatTag({ ...t, extensions: [] });
  const regional = parseTag(maximize(core({ language: t.language, ...(t.region && { region: t.region }) })));
  const script = t.script ?? regional.script;
  const languageDefault = parseTag(maximize(t.language)).script;
  const { script: _drop, ...rest } = t;
  return formatTag({ ...rest, ...(script !== languageDefault && script !== undefined && { script }), extensions: [] });
};

/** The full inheritance chain of a tag's CLDR locale id, ending at "und" (root). */
export const parentChain = (tag: string): readonly string[] => {
  const chain: string[] = [];
  let current: string | undefined = cldrLocaleId(tag);
  while (current !== undefined && chain.length < 16) {
    chain.push(current);
    current = parentOf(current);
  }
  return chain;
};

/** True when two tags denote the same locale once likely subtags are added. */
export const sameLocale = (a: string, b: string): boolean => {
  const strip = (x: string): string => core(parseTag(maximize(formatTag({ ...parseTag(x), variants: [], extensions: [] }))));
  return strip(a) === strip(b);
};
