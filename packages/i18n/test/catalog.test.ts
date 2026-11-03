import { parseMessage } from "messageformat";
import { describe, expect, it } from "vitest";
import { createTranslator, loadTranslator, sourceCatalog, type MessageId } from "../src/index.ts";

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
