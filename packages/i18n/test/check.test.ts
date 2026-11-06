import { describe, expect, it } from "vitest";
import type { MessageCatalog } from "@nabu/schema";
import en from "../messages/en.json" with { type: "json" };
import { checkCatalog, sourceHash, type CatalogDiagnostic } from "../src/check.ts";

const source = en as unknown as MessageCatalog;
const draft = { author: "llm:test-model@0000000000", status: "draft" };
const reviewed = { author: "llm:test-model@0000000000", status: "reviewed", reviewedBy: "human:reviewer", reviewedAt: "2026-11-06" };

/** A catalog file's text, as it would be written (JSON escapes for invisibles: JSON.stringify keeps them literal, so callers choose). */
const file = (locale: string, messages: Record<string, { message: string; source?: string }>, provenance: object | null = draft): string =>
  `${JSON.stringify({ locale, ...(provenance === null ? {} : { provenance }), messages }, null, 2)}\n`;
/** The text with ZWNJ written as the JSON escape, as the catalogs keep it. */
const escaped = (raw: string): string => raw.replaceAll("\u200C", "\\u200c");
const check = (raw: string, locale: string, shipped = false): CatalogDiagnostic[] => checkCatalog(raw, { fileLocale: locale, source, shipped });
const codes = (ds: readonly CatalogDiagnostic[]): string[] => ds.map((d) => `${d.severity}:${d.code}${d.key === undefined ? "" : `:${d.key}`}`);
const errors = (ds: readonly CatalogDiagnostic[]): CatalogDiagnostic[] => ds.filter((d) => d.severity === "error");

const FA_RIGHT = "{{{$target} \u067E\u0627\u0633\u062E \u062F\u0631\u0633\u062A}}";
const FA_HINT = ".input {$min :number}\n{{\u062F\u0633\u062A\u200C\u06A9\u0645 {$min} \u0646\u0648\u06CC\u0633\u0647}}";

describe("the catalog check", () => {
  it("passes the source catalog", () => {
    expect(check(`${JSON.stringify(en, null, 2)}\n`, "en", true)).toEqual([]);
  });

  it("passes a good draft, listing what is untranslated as a warning", () => {
    const ds = check(escaped(file("fa", { "achievement.right": { message: FA_RIGHT }, "app.account.password-hint": { message: FA_HINT } })), "fa");
    expect(errors(ds)).toEqual([]);
    expect(codes(ds)).toEqual(["warning:missing"]);
  });

  it("refuses literal invisible characters, and wants them as JSON escapes", () => {
    const raw = file("fa", { "app.account.password-hint": { message: FA_HINT } });
    expect(raw).toContain("\u200C");
    const ds = check(raw, "fa");
    expect(codes(errors(ds))).toEqual(["error:invisible"]);
    expect(ds[0]?.line).toBeGreaterThan(1);
    // The same text with the escape is fine.
    expect(errors(check(escaped(raw), "fa"))).toEqual([]);
  });

  it("refuses bidi controls in a message, even escaped (the formatter isolates)", () => {
    const raw = file("fa", { "achievement.right": { message: FA_RIGHT.replace("{$target}", "\u2067{$target}\u2069") } }).replace(/\u2067/u, "\\u2067").replace(/\u2069/u, "\\u2069");
    expect(codes(errors(check(raw, "fa")))).toEqual(["error:invisible:achievement.right"]);
  });

  it("refuses MF2 that does not parse or is not a valid data model", () => {
    expect(codes(errors(check(file("fa", { "achievement.right": { message: "{{{$target}" } }), "fa")))).toEqual(["error:syntax:achievement.right"]);
    expect(codes(errors(check(file("fa", { "achievement.right": { message: ".match $target\none {{a}}\n* {{b}}" } }), "fa")))).toEqual(["error:syntax:achievement.right"]);
  });

  it("wants exactly the source's placeholders", () => {
    const dropped = check(file("fa", { "app.account.password-hint": { message: "{{short}}" } }), "fa");
    expect(codes(errors(dropped))).toEqual(["error:placeholders:app.account.password-hint"]);
    expect(dropped[0]?.detail).toContain("drops $min");
    const added = check(file("fa", { "app.account.password-hint": { message: ".input {$min :number}\n{{{$min} {$max}}}" } }), "fa");
    expect(added.find((d) => d.code === "placeholders")?.detail).toContain("uses $max");
  });

  it("wants a plural selector to cover the locale's CLDR categories (Arabic has six)", () => {
    const english = source.messages["achievement.right"]?.message ?? "";
    const ds = check(file("ar", { "achievement.right": { message: english } }), "ar");
    expect(codes(errors(ds))).toEqual(["error:plural-missing:achievement.right"]);
    expect(ds[0]?.detail).toContain("zero, two, few, many");
    const full = ".input {$target :number}\n.match $target\nzero {{a}}\none {{b}}\ntwo {{c}}\nfew {{d}}\nmany {{e}}\n* {{f}}";
    expect(errors(check(file("ar", { "achievement.right": { message: full } }), "ar"))).toEqual([]);
  });

  it("warns about categories the locale never selects, and leaves exact numbers alone", () => {
    const message = ".input {$target :number}\n.match $target\n0 {{zero}}\none {{a}}\nfew {{b}}\n* {{c}}";
    expect(codes(check(file("fa", { "achievement.right": { message } }), "fa")).filter((c) => c.startsWith("warning:plural"))).toEqual(["warning:plural-unknown:achievement.right"]);
  });

  it("reads ordinal selectors by the ordinal rules, and leaves exact selection alone", () => {
    const ordinal = ".input {$target :number select=ordinal}\n.match $target\none {{st}}\n* {{th}}";
    const ds = check(file("en-GB", { "achievement.right": { message: ordinal } }), "en-GB");
    expect(codes(errors(ds))).toEqual(["error:plural-missing:achievement.right"]);
    expect(ds[0]?.detail).toContain("ordinal selector 1 lacks two, few");
    const exact = ".input {$target :number select=exact}\n.match $target\n1 {{one}}\n* {{more}}";
    expect(errors(check(file("ar", { "achievement.right": { message: exact } }), "ar"))).toEqual([]);
  });

  it("knows only the source's keys", () => {
    expect(codes(errors(check(file("fa", { "no.such.message": { message: "{{x}}" } }), "fa")))).toEqual(["error:unknown-key:no.such.message"]);
  });

  it("flags a translation of English whose wording has changed", () => {
    const english = source.messages["app.account.password-hint"]?.message ?? "";
    expect(codes(check(file("fa", { "app.account.password-hint": { message: FA_HINT.replace("\u200C", ""), source: sourceHash(english) } }), "fa")).includes("warning:stale:app.account.password-hint")).toBe(false);
    expect(codes(check(file("fa", { "app.account.password-hint": { message: FA_HINT.replace("\u200C", ""), source: sourceHash(`${english} `) } }), "fa"))).toContain("warning:stale:app.account.password-hint");
  });

  it("ships only a reviewed, complete catalog", () => {
    const one = { "achievement.right": { message: FA_RIGHT } };
    expect(codes(errors(check(file("fa", one), "fa", true)))).toEqual(["error:provenance", "error:missing"]);
    expect(codes(errors(check(file("fa", one, reviewed), "fa", true)))).toEqual(["error:missing"]);
    expect(codes(errors(check(file("fa", one, null), "fa")))).toEqual(["error:provenance"]);
  });

  it("wants the file's name to be its locale", () => {
    expect(codes(errors(check(file("fa", {}), "ar")))).toEqual(["error:locale"]);
  });

  it("fingerprints source messages by their NFC text", () => {
    expect(sourceHash("caf\u00E9")).toBe(sourceHash("cafe\u0301"));
    expect(sourceHash("a")).not.toBe(sourceHash("b"));
    expect(sourceHash("a")).toMatch(/^[0-9a-f]{14}$/u);
  });
});
