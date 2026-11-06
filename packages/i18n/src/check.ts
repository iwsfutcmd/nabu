/**
 * The catalog check (Phase 12, ADR 0070): what a UI catalog must be before it can ship, for every
 * message in it.
 * - **syntax:** it parses as MF2, and its data model is valid (a selector has an annotation, a `*`
 *   variant exists…).
 * - **placeholders:** it uses exactly the source (English) message's variables.
 * - **plurals:** a plural selector covers every CLDR plural category of the locale (other through `*`),
 *   and names no category the locale lacks.
 * - **invisible:** the file holds no literal invisible characters (write ZWNJ as \u200C in the JSON),
 *   and no message holds bidi embedding, override or isolate controls (the formatter isolates).
 * - **unknown-key**, **missing**, **stale** (translated from English whose wording has changed since; a change
 *   of meaning gets a new key instead): missing messages fall back to English, so for a shipped catalog a
 *   missing one is an error.
 *
 * Pure: the script (scripts/check-catalogs.ts) reads the files.
 */
import { parseMessage, validate, type Model } from "messageformat";

type Message = Model.Message;
import { asciiUppercase } from "@nabu/core/text";
import type { MessageCatalog } from "@nabu/schema";

export type CatalogCode = "json" | "locale" | "provenance" | "syntax" | "placeholders" | "plural-missing" | "plural-unknown" | "invisible" | "unknown-key" | "missing" | "stale";

export interface CatalogDiagnostic {
  readonly code: CatalogCode;
  readonly severity: "error" | "warning";
  readonly key?: string | undefined;
  /** 1-based line in the file, where one applies. */
  readonly line?: number | undefined;
  readonly detail: string;
}

/** Literal invisible characters a catalog file may not hold (write them as JSON escapes). */
const INVISIBLE = /[\u00AD\u061C\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/u;
/** Bidi embedding, override and isolate controls: never in a message, escaped or not (MF2 isolates placeholders). */
const BIDI_CONTROLS = /[\u202A-\u202E\u2066-\u2069]/u;
const PLURAL_FUNCTIONS = new Set(["number", "integer"]);
const hex = (c: string): string => `U+${asciiUppercase((c.codePointAt(0) ?? 0).toString(16)).padStart(4, "0")}`;

/**
 * A short fingerprint of a source message (cyrb53 over its NFC text, as 14 hex digits): a
 * translation records the one it was made from, so a change to the English shows.
 */
export const sourceHash = (message: string): string => {
  const text = message.normalize("NFC");
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    // Code units are fine here: this hashes the text, it never shows or cuts it.
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, "0");
};

const parsed = (source: string): { readonly ok: true; readonly message: Message; readonly variables: ReadonlySet<string> } | { readonly ok: false; readonly error: string } => {
  try {
    const message = parseMessage(source);
    return { ok: true, message, variables: new Set(validate(message).variables) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
};

/** For each plural selector of a select message: its position and whether it selects ordinals. */
const pluralSelectors = (message: Message): { readonly index: number; readonly type: Intl.PluralRuleType }[] => {
  if (message.type !== "select") return [];
  const result: { index: number; type: Intl.PluralRuleType }[] = [];
  message.selectors.forEach((selector, index) => {
    const declaration = message.declarations.find((d) => d.name === selector.name);
    const fn = declaration?.value.functionRef;
    if (fn === undefined || !PLURAL_FUNCTIONS.has(fn.name)) return;
    const select = fn.options?.["select"];
    const mode = select?.type === "literal" ? select.value : "plural";
    if (mode === "exact") return;
    result.push({ index, type: mode === "ordinal" ? "ordinal" : "cardinal" });
  });
  return result;
};

/** CLDR's order, for messages people read. */
const CATEGORY_ORDER: readonly Intl.LDMLPluralRule[] = ["zero", "one", "two", "few", "many", "other"];

const isNumberKey = (key: string): boolean => /^-?\d+(\.\d+)?$/u.test(key);

/** The plural problems of one parsed message, for a locale. */
const pluralDiagnostics = (key: string, message: Message, locale: string): CatalogDiagnostic[] => {
  if (message.type !== "select") return [];
  const out: CatalogDiagnostic[] = [];
  for (const { index, type } of pluralSelectors(message)) {
    const categories = [...new Intl.PluralRules(locale, { type }).resolvedOptions().pluralCategories].sort((a, b) => CATEGORY_ORDER.indexOf(a) - CATEGORY_ORDER.indexOf(b));
    const keys = new Set(message.variants.map((v) => v.keys[index]).flatMap((k) => (k?.type === "literal" ? [k.value] : [])));
    const missing = categories.filter((c) => c !== "other" && !keys.has(c));
    if (missing.length > 0) out.push({ code: "plural-missing", severity: "error", key, detail: `${type} selector ${index + 1} lacks ${missing.join(", ")} (${locale} has ${categories.join(", ")})` });
    const unknown = [...keys].filter((k) => !isNumberKey(k) && !(categories as readonly string[]).includes(k));
    if (unknown.length > 0) out.push({ code: "plural-unknown", severity: "warning", key, detail: `${type} selector ${index + 1} names ${unknown.join(", ")}, which ${locale} never selects (${categories.join(", ")})` });
  }
  return out;
};

/** The line (1-based) where `"key":` first appears in the raw file, if it does. */
const lineOf = (raw: string, key: string): number | undefined => {
  const at = raw.indexOf(`"${key}":`);
  return at < 0 ? undefined : raw.slice(0, at).split("\n").length;
};

export interface CheckOptions {
  /** The file name's locale (messages/<locale>.json). */
  readonly fileLocale: string;
  /** The source catalog (English). Checking the source itself compares it with itself. */
  readonly source: MessageCatalog;
  /** Whether the app ships this catalog (catalog.ts lists it): then a missing message is an error. */
  readonly shipped: boolean;
}

/** Every problem with one catalog file, its raw JSON text. */
export const checkCatalog = (raw: string, options: CheckOptions): CatalogDiagnostic[] => {
  const out: CatalogDiagnostic[] = [];
  raw.split("\n").forEach((text, i) => {
    const m = INVISIBLE.exec(text);
    if (m !== null) out.push({ code: "invisible", severity: "error", line: i + 1, detail: `a literal ${hex(m[0])}: write it as a JSON escape (\\u${(m[0].codePointAt(0) ?? 0).toString(16).padStart(4, "0")})` });
  });
  let catalog: MessageCatalog;
  try {
    catalog = JSON.parse(raw) as MessageCatalog;
  } catch (e) {
    return [...out, { code: "json", severity: "error", detail: e instanceof Error ? e.message : String(e) }];
  }
  const { source, fileLocale, shipped } = options;
  const isSource = catalog.locale === source.locale;
  if (catalog.locale !== fileLocale) out.push({ code: "locale", severity: "error", detail: `the file is ${fileLocale}.json but says locale ${catalog.locale}` });
  const provenance = (catalog as { provenance?: { status?: string } }).provenance;
  if (!isSource && provenance === undefined) out.push({ code: "provenance", severity: "error", detail: "a translated catalog says who wrote it and whether it is reviewed (provenance)" });
  if (shipped && !isSource && provenance?.status === "draft") out.push({ code: "provenance", severity: "error", detail: "a draft catalog cannot ship: a native reviewer signs it off first (status reviewed)" });

  for (const [key, entry] of Object.entries(catalog.messages)) {
    const line = lineOf(raw, key);
    const original = source.messages[key];
    if (original === undefined) {
      out.push({ code: "unknown-key", severity: "error", key, line, detail: "not a message of the source catalog" });
      continue;
    }
    if (BIDI_CONTROLS.test(entry.message)) out.push({ code: "invisible", severity: "error", key, line, detail: "bidi controls in a message: the formatter isolates placeholders" });
    const mine = parsed(entry.message);
    if (!mine.ok) {
      out.push({ code: "syntax", severity: "error", key, line, detail: mine.error });
      continue;
    }
    const theirs = parsed(original.message);
    if (theirs.ok) {
      const extra = [...mine.variables].filter((v) => !theirs.variables.has(v));
      const lost = [...theirs.variables].filter((v) => !mine.variables.has(v));
      if (extra.length > 0 || lost.length > 0) {
        const parts = [extra.length > 0 ? `uses ${extra.map((v) => `$${v}`).join(", ")}, which the source does not` : "", lost.length > 0 ? `drops ${lost.map((v) => `$${v}`).join(", ")}` : ""].filter((p) => p !== "");
        out.push({ code: "placeholders", severity: "error", key, line, detail: parts.join("; ") });
      }
    }
    out.push(...pluralDiagnostics(key, mine.message, catalog.locale).map((d) => ({ ...d, line })));
    const stamped = (entry as { source?: string }).source;
    if (!isSource && stamped !== undefined && stamped !== sourceHash(original.message)) {
      out.push({ code: "stale", severity: "warning", key, line, detail: "translated from an English message whose wording has changed since: check the translation, then stamp it again" });
    }
  }
  if (!isSource) {
    const missing = Object.keys(source.messages).filter((k) => catalog.messages[k] === undefined);
    if (missing.length > 0) {
      out.push({ code: "missing", severity: shipped ? "error" : "warning", detail: `${missing.length} of ${Object.keys(source.messages).length} messages untranslated (they show in English): ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? ", …" : ""}` });
    }
  }
  return out;
};
