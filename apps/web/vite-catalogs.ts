/**
 * The UI catalogs as the app ships them: each message's text and nothing else. A catalog's
 * descriptions (context for translators), translation fingerprints and provenance are for the
 * people who translate and for the catalog check (ADR 0070); the translator reads only `message`
 * (packages/i18n/src/catalog.ts). English's descriptions were half of the catalog in the main
 * chunk (the review's R9).
 */
import type { Plugin } from "vite";

const CATALOG = /[\\/]packages[\\/]i18n[\\/]messages[\\/][^\\/]+\.json$/u;

interface Catalog {
  readonly locale: string;
  readonly messages: Readonly<Record<string, { readonly message: string }>>;
}

/** A catalog with each message's text only: the shape the translator reads. */
const shipped = (source: string): string => {
  const catalog = JSON.parse(source) as Catalog;
  const messages = Object.fromEntries(Object.entries(catalog.messages).map(([key, entry]) => [key, { message: entry.message }]));
  return JSON.stringify({ locale: catalog.locale, messages });
};

export const catalogs = (): Plugin => ({
  name: "nabu-catalogs",
  // Before Vite turns the JSON into a module.
  enforce: "pre",
  transform(code, id) {
    if (!CATALOG.test(id.split("?")[0] ?? "")) return undefined;
    return { code: shipped(code), map: null };
  },
});
