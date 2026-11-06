/**
 * `pnpm check:catalogs`: the catalog check (src/check.ts, ADR 0070) over every UI catalog in
 * messages/. Errors fail; warnings (untranslated messages in a draft, stale translations) are listed.
 *
 *   node scripts/check-catalogs.ts                     check every catalog
 *   node scripts/check-catalogs.ts --stamp fa          record, for each fa message without one, the
 *                                                      fingerprint of the English it translates
 *   node scripts/check-catalogs.ts --stamp fa key ...  stamp these keys again (after checking them)
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import type { MessageCatalog } from "@nabu/schema";
import { UI_LOCALES } from "../src/catalog.ts";
import { checkCatalog, sourceHash } from "../src/check.ts";

const dir = new URL("../messages/", import.meta.url);
const read = (locale: string): string => readFileSync(new URL(`${locale}.json`, dir), "utf8");
const source = JSON.parse(read("en")) as MessageCatalog;

/** JSON as the catalogs keep it: two-space indent, and invisible characters as escapes (never literal). */
const serialize = (catalog: unknown): string =>
  `${JSON.stringify(catalog, null, 2)}\n`.replace(/[\u00AD\u061C\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/gu, (c) => `\\u${(c.codePointAt(0) ?? 0).toString(16).padStart(4, "0")}`);

const args = process.argv.slice(2);
if (args[0] === "--stamp") {
  const [, locale, ...keys] = args;
  if (locale === undefined) throw new Error("--stamp needs a locale");
  const catalog = JSON.parse(read(locale)) as { messages: Record<string, { message: string; source?: string }> };
  let stamped = 0;
  for (const [key, entry] of Object.entries(catalog.messages)) {
    const original = source.messages[key];
    if (original === undefined) continue;
    if (keys.length > 0 ? !keys.includes(key) : entry.source !== undefined) continue;
    entry.source = sourceHash(original.message);
    stamped++;
  }
  writeFileSync(new URL(`${locale}.json`, dir), serialize(catalog));
  console.log(`stamped ${stamped} message(s) in ${locale}.json`);
  process.exit(0);
}

const locales = readdirSync(dir)
  .filter((f) => f.endsWith(".json"))
  .map((f) => f.slice(0, -".json".length))
  .sort();
let errors = 0;
for (const locale of locales) {
  const shipped = UI_LOCALES.includes(locale);
  const diagnostics = checkCatalog(read(locale), { fileLocale: locale, source, shipped });
  const count = Object.keys((JSON.parse(read(locale)) as MessageCatalog).messages).length;
  for (const d of diagnostics) {
    const where = `messages/${locale}.json${d.line === undefined ? "" : `:${d.line}`}`;
    console[d.severity === "error" ? "error" : "warn"](`${where}: ${d.severity} [${d.code}]${d.key === undefined ? "" : ` ${d.key}`}: ${d.detail}`);
  }
  const bad = diagnostics.filter((d) => d.severity === "error").length;
  errors += bad;
  console.log(`${bad === 0 ? "✓" : "✗"} ${locale}${shipped ? " (shipped)" : " (not shipped)"}: ${count} messages, ${bad} error(s), ${diagnostics.length - bad} warning(s)`);
}
process.exit(errors > 0 ? 1 : 0);
