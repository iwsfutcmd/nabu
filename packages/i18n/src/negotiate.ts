/**
 * UI locale negotiation (gameplan §11.2): the user's setting, then
 * Accept-Language / navigator.languages, then the default. Each request walks
 * its CLDR parent chain (en-IN → en-001 → en) and matches available locales
 * after likely-subtag expansion, so zh-TW matches zh-Hant but never zh-Hans.
 *
 * Pseudo-locales (en-XA, ar-XB) match only when requested exactly. They are
 * never a fallback for a real locale.
 */
import { formatTag, parentChain, parseTag, sameLocale } from "./locale.ts";

export interface NegotiationInput {
  /** The user's explicit setting, if any. Wins over everything else. */
  readonly userSetting?: string | undefined;
  /** An Accept-Language header value, or navigator.languages. */
  readonly accepted?: string | readonly string[] | undefined;
  /** Real UI locales that have catalogs. */
  readonly available: readonly string[];
  /** Pseudo-locales that may be selected only by exact request. */
  readonly pseudo?: readonly string[];
  readonly defaultLocale: string;
}

export interface Negotiated {
  /** The catalog locale to load. */
  readonly locale: string;
  /** The locale for Intl formatting: `locale` plus the request's -u- extension (numbering system, calendar…). */
  readonly formattingLocale: string;
  /** Which request produced the match, or "default". */
  readonly source: "user" | "accept-language" | "default";
}

/** Parses an Accept-Language header (RFC 9110 §12.5.4) into tags ordered by quality. */
export const parseAcceptLanguage = (header: string): readonly string[] =>
  header
    .split(",")
    .map((part, index) => {
      const [range = "", ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      const quality = q === undefined ? 1 : Number(q.slice(2));
      return { range: range.trim(), quality: Number.isFinite(quality) ? quality : 0, index };
    })
    .filter((r) => r.range !== "" && r.range !== "*" && r.quality > 0)
    .sort((a, b) => b.quality - a.quality || a.index - b.index)
    .map((r) => r.range);

const tryParse = (tag: string): ReturnType<typeof parseTag> | undefined => {
  try {
    return parseTag(tag);
  } catch {
    return undefined;
  }
};

const matchOne = (requested: string, available: readonly string[], pseudo: readonly string[]): string | undefined => {
  const parsed = tryParse(requested);
  if (parsed === undefined) return undefined;
  const bare = formatTag({ ...parsed, extensions: [] });
  const exactPseudo = pseudo.find((p) => formatTag({ ...parseTag(p), extensions: [] }) === bare);
  if (exactPseudo !== undefined) return exactPseudo;
  for (const candidate of parentChain(bare)) {
    if (candidate === "und") break;
    const hit = available.find((a) => sameLocale(a, candidate));
    if (hit !== undefined) return hit;
  }
  return undefined;
};

const withExtensions = (locale: string, requested: string): string => {
  const ext = tryParse(requested)?.extensions.filter((e) => e.startsWith("u-")) ?? [];
  return ext.length === 0 ? locale : formatTag({ ...parseTag(locale), extensions: ext });
};

export const negotiateLocale = (input: NegotiationInput): Negotiated => {
  const pseudo = input.pseudo ?? [];
  const accepted =
    input.accepted === undefined ? [] : typeof input.accepted === "string" ? parseAcceptLanguage(input.accepted) : input.accepted;
  const requests: { tag: string; source: Negotiated["source"] }[] = [
    ...(input.userSetting ? [{ tag: input.userSetting, source: "user" as const }] : []),
    ...accepted.map((tag) => ({ tag, source: "accept-language" as const })),
  ];
  for (const { tag, source } of requests) {
    const hit = matchOne(tag, input.available, pseudo);
    if (hit !== undefined) return { locale: hit, formattingLocale: withExtensions(hit, tag), source };
  }
  return { locale: input.defaultLocale, formattingLocale: input.defaultLocale, source: "default" };
};
