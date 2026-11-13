import { parseMessage, validate } from "messageformat";
import { describe, expect, it } from "vitest";
import { createTranslator, DRAFT_UI_LOCALES, loadTranslator, sourceCatalog, UI_LOCALES, type MessageId } from "../src/index.ts";

const strict = { onError: (e: unknown) => { throw e; } };
const FSI = "\u2068";
const PDI = "\u2069";
const RLO = "\u202E";

describe("en catalog", () => {
  const catalog = sourceCatalog();
  it.each(Object.entries(catalog.messages))("%s parses as MF2 and has a translator note", (_id, entry) => {
    expect(() => parseMessage(entry.message)).not.toThrow();
    expect(entry.description?.length ?? 0).toBeGreaterThan(10);
  });
  it("contains no hand-inserted bidi controls (MF2 isolates placeholders)", () => {
    for (const { message } of Object.values(catalog.messages)) expect(message).not.toMatch(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/);
  });
});

describe("en", async () => {
  const t = await loadTranslator("en", strict);
  it("formats, selects plurals, and isolates placeholders", () => {
    expect(t.dir).toBe("ltr");
    expect(t.format("exercise.action.check")).toBe("Check");
    expect(t.format("exercise.wordbank.remaining", { count: 1 })).toBe("1 tile left");
    expect(t.format("exercise.wordbank.remaining", { count: 4 })).toBe("4 tiles left");
    expect(t.format("exercise.instruction.write-in", { language: "Persian" })).toBe(`Write this in ${FSI}Persian${PDI}`);
  });
  it("reports missing messages", () => {
    expect(() => t.format("no.such" as MessageId)).toThrow(/Missing message/);
  });
});

describe("en-XA", async () => {
  const t = await loadTranslator("en-XA", strict);
  it("accents, brackets and expands, but keeps placeholders and plural logic", () => {
    const check = t.format("exercise.action.check");
    expect(check).toMatch(/^\[Çĥéçķ .+\]$/u);
    expect(check.length).toBeGreaterThanOrEqual("Check".length * 1.4);
    expect(t.format("exercise.wordbank.remaining", { count: 1 })).toMatch(/^\[1 ţîļé ļéƒţ/u);
    expect(t.format("exercise.wordbank.remaining", { count: 3 })).toMatch(/^\[3 ţîļéš ļéƒţ/u);
    expect(t.format("exercise.instruction.write-in", { language: "Persian" })).toContain(`${FSI}Persian${PDI}`);
    expect(t.dir).toBe("ltr");
  });
});

describe("ar-XB", async () => {
  const t = await loadTranslator("ar-XB", strict);
  it("is RTL and mirrors each word", () => {
    expect(t.dir).toBe("rtl");
    const check = t.format("exercise.action.check");
    expect(check).toBe(`\u200F${RLO}Check\u202C\u200F`);
    // Placeholders stay isolated; in an RTL message the isolate is direction-aware.
    expect(t.format("exercise.instruction.write-in", { language: "Persian" })).toMatch(/[\u2066-\u2068]Persian\u2069/u);
  });
});

describe("fallback along the parent chain", () => {
  it("uses the next catalog when a message is missing", () => {
    const t = createTranslator({
      locale: "en-IN",
      catalogs: [{ locale: "en-IN", messages: { "exercise.action.check": { message: "Check it" } } } as never, sourceCatalog()],
      ...strict,
    });
    expect(t.format("exercise.action.check")).toBe("Check it");
    expect(t.format("exercise.action.skip")).toBe("Skip");
  });
});

describe("draft catalogs (ADR 0070)", () => {
  it("are offered to reviewers only, never shipped", () => {
    expect(DRAFT_UI_LOCALES).toContain("fa");
    for (const l of DRAFT_UI_LOCALES) expect(UI_LOCALES).not.toContain(l);
  });

  it("load only when asked: otherwise the chrome stays in the shipped catalogs", async () => {
    const shipped = await loadTranslator("fa", strict);
    expect(shipped.dir).toBe("rtl");
    expect(shipped.format("exercise.action.check")).toBe(sourceCatalog().messages["exercise.action.check"]?.message);
    const draft = await loadTranslator("fa", { ...strict, drafts: true });
    expect(draft.format("exercise.action.check")).not.toBe(shipped.format("exercise.action.check"));
    expect(draft.format("exercise.action.check")).toMatch(/\p{Script=Arabic}/u);
    // Which catalogs each reads: what the web app's service worker keeps (ADR 0119).
    expect(shipped.catalogs).toEqual(["en"]);
    expect(draft.catalogs).toEqual(["fa", "en"]);
  });

  it("each loads in its own language when asked, and every message formats", async () => {
    for (const locale of DRAFT_UI_LOCALES) {
      const draft = await loadTranslator(locale, { ...strict, drafts: true });
      expect(draft.format("exercise.action.check"), locale).not.toBe(sourceCatalog().messages["exercise.action.check"]?.message);
      for (const [id, entry] of Object.entries(sourceCatalog().messages)) {
        // Each variable the English uses: a number where it is declared :number or :integer.
        const numeric = new Set([...entry.message.matchAll(/\{\$(\w+)\s+:(?:number|integer)/gu)].map((m) => m[1]));
        const values = Object.fromEntries([...validate(parseMessage(entry.message)).variables].map((v) => [v, numeric.has(v) ? 3 : "x"]));
        expect(() => draft.format(id as MessageId, values), `${locale} ${id}`).not.toThrow();
      }
    }
  });

  it("format numbers in the locale's own digits", async () => {
    const draft = await loadTranslator("fa", { ...strict, drafts: true });
    expect(draft.format("app.account.password-hint", { min: 8 })).toContain("\u06F8");
  });
});
