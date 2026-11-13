/**
 * MF2 catalog loading and formatting with `messageformat` 4.x, the polyfill of
 * the proposed Intl.MessageFormat (gameplan §5.2, §11.2).
 *
 * Catalogs are JSON files in messages/<locale>.json (schemas/message-catalog.schema.json).
 * English is the only real UI locale at launch; en-XA and ar-XB are derived
 * from it (see pseudo.ts). A message missing from a catalog falls back along
 * the locale's CLDR parent chain (en-IN → en-001 → en).
 */
import { MessageFormat, parseMessage, type MessagePart } from "messageformat";
import type { MessageCatalog } from "@nabu/schema";
import en from "../messages/en.json" with { type: "json" };
import { parentChain } from "./locale.ts";
import { PSEUDO_LOCALES, pseudoLocalizeMessage, type PseudoLocale } from "./pseudo.ts";
import { directionOf, type Direction } from "./script.ts";

export type MessageId = keyof typeof en.messages;
export type MessageValues = Readonly<Record<string, unknown>>;

/** Real UI locales and how to load them. Add a line per shipped locale: reviewed and complete (ADR 0070). */
const CATALOGS: Readonly<Record<string, () => Promise<MessageCatalog>>> = {
  en: () => Promise.resolve(en as unknown as MessageCatalog),
};

/**
 * Draft catalogs (ADR 0070): checked in CI, shipped to nobody. A reviewer sees one in place with
 * `?ui=<locale>&drafts=1` in the web app, or from Storybook's UI-locale menu. A catalog moves to
 * CATALOGS when a native reviewer signs it off.
 */
const DRAFTS: Readonly<Record<string, () => Promise<MessageCatalog>>> = {
  ar: async () => (await import("../messages/ar.json", { with: { type: "json" } })).default as unknown as MessageCatalog,
  fa: async () => (await import("../messages/fa.json", { with: { type: "json" } })).default as unknown as MessageCatalog,
  uz: async () => (await import("../messages/uz.json", { with: { type: "json" } })).default as unknown as MessageCatalog,
  "uz-Cyrl": async () => (await import("../messages/uz-Cyrl.json", { with: { type: "json" } })).default as unknown as MessageCatalog,
  "zh-Hant-HK": async () => (await import("../messages/zh-Hant-HK.json", { with: { type: "json" } })).default as unknown as MessageCatalog,
};

/** The source locale every pseudo-locale is derived from. */
export const PSEUDO_SOURCE = "en";

export const UI_LOCALES: readonly string[] = Object.keys(CATALOGS);
/** Locales with a draft catalog, for reviewers only. */
export const DRAFT_UI_LOCALES: readonly string[] = Object.keys(DRAFTS).filter((l) => !(l in CATALOGS));
export const DEFAULT_UI_LOCALE = "en";
export { PSEUDO_LOCALES };

export const isPseudoLocale = (locale: string): locale is PseudoLocale =>
  (PSEUDO_LOCALES as readonly string[]).includes(locale);

export interface Translator {
  /** The UI locale, possibly a pseudo-locale. */
  readonly locale: string;
  /** The locale passed to Intl formatters (UI locale plus any -u- extensions). */
  readonly formattingLocale: string;
  /** Direction of the UI chrome, from the locale's script. */
  readonly dir: Direction;
  /** The locales of the catalogs it reads, most specific first: the web app keeps those offline (ADR 0119). */
  readonly catalogs: readonly string[];
  readonly format: (id: MessageId, values?: MessageValues) => string;
  readonly formatToParts: (id: MessageId, values?: MessageValues) => MessagePart<string>[];
  readonly has: (id: string) => id is MessageId;
}

export interface TranslatorOptions {
  readonly locale: string;
  readonly formattingLocale?: string | undefined;
  /** Catalogs from most to least specific. */
  readonly catalogs: readonly MessageCatalog[];
  /** Called on MF2 resolution errors. Defaults to console.warn; tests should throw. */
  readonly onError?: ((error: unknown) => void) | undefined;
}

export const createTranslator = (options: TranslatorOptions): Translator => {
  const { locale, catalogs } = options;
  const formattingLocale = options.formattingLocale ?? locale;
  const dir = directionOf(locale);
  const pseudo = isPseudoLocale(locale) ? locale : undefined;
  const onError = options.onError ?? ((error: unknown) => console.warn(error));
  const compiled = new Map<string, MessageFormat>();

  const sourceOf = (id: string): string | undefined => {
    for (const catalog of catalogs) {
      const entry = catalog.messages[id];
      if (entry !== undefined) return entry.message;
    }
    return undefined;
  };

  const formatter = (id: string): MessageFormat | undefined => {
    const cached = compiled.get(id);
    if (cached !== undefined) return cached;
    const source = sourceOf(id);
    if (source === undefined) return undefined;
    const model = parseMessage(source);
    const mf = new MessageFormat(formattingLocale, pseudo ? pseudoLocalizeMessage(model, pseudo) : model, {
      dir,
      bidiIsolation: "default",
    });
    compiled.set(id, mf);
    return mf;
  };

  const missing = (id: string): string => {
    onError(new Error(`Missing message "${id}" for ${locale}`));
    return `{${id}}`;
  };

  return {
    locale,
    formattingLocale,
    dir,
    catalogs: catalogs.map((c) => c.locale),
    format: (id, values) => formatter(id)?.format(values, onError) ?? missing(id),
    formatToParts: (id, values) => formatter(id)?.formatToParts(values, onError) ?? [{ type: "text", value: missing(id) }],
    has: (id): id is MessageId => sourceOf(id) !== undefined,
  };
};

/** Loads the catalogs for a UI locale (or pseudo-locale) along its parent chain; with `drafts`, draft catalogs too (reviewers). */
export const loadTranslator = async (
  locale: string,
  options: Omit<TranslatorOptions, "locale" | "catalogs"> & { readonly drafts?: boolean | undefined } = {},
): Promise<Translator> => {
  const { drafts = false, ...rest } = options;
  const loaderOf = (l: string): (() => Promise<MessageCatalog>) | undefined => CATALOGS[l] ?? (drafts ? DRAFTS[l] : undefined);
  const chain = isPseudoLocale(locale) ? [PSEUDO_SOURCE] : parentChain(locale).filter((l) => loaderOf(l) !== undefined);
  if (!chain.includes(DEFAULT_UI_LOCALE)) chain.push(DEFAULT_UI_LOCALE);
  const catalogs = await Promise.all(chain.map((l) => (loaderOf(l) as () => Promise<MessageCatalog>)()));
  return createTranslator({ ...rest, locale, catalogs });
};

/** Synchronous English translator for tests and server-side defaults. */
export const sourceCatalog = (): MessageCatalog => en as unknown as MessageCatalog;
