/** Usernames under UTS #39 (gameplan §12.7), with the generated Unicode 16 data. */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { checkDisplayName, checkUsername, nfkcCasefold, skeleton, type SecurityData } from "../src/text/index.ts";

const GENERATED = resolve(import.meta.dirname, "../../i18n/src/generated");
const read = (f: string): unknown => JSON.parse(readFileSync(join(GENERATED, f), "utf8"));
const data: SecurityData = {
  confusables: (read("confusables.json") as { map: Record<string, string> }).map,
  allowed: (read("identifier-allowed.json") as { ranges: [number, number][] }).ranges,
  scripts: Object.keys(read("script-metadata.json") as Record<string, unknown>),
};

const ZWNJ = "\u200C";
const verdict = (name: string): string => {
  const r = checkUsername(name, data);
  return r.ok ? "ok" : r.error;
};

describe("NFKC_Casefold and skeletons", () => {
  it("folds width, case and compatibility forms into one key", () => {
    expect(nfkcCasefold("Ａｌｉ")).toBe("ali");
    expect(nfkcCasefold("ALI")).toBe("ali");
    expect(nfkcCasefold("Straße")).toBe("strasse");
    expect(nfkcCasefold(`کتاب${ZWNJ}خوان`)).toBe("کتابخوان"); // ZWNJ is default-ignorable
  });

  it("confusable names share a skeleton", () => {
    const cyrillic = "раураl"; // раураl
    expect(skeleton(nfkcCasefold(cyrillic), data)).toBe(skeleton("paypal", data));
    expect(skeleton("rn", data)).toBe(skeleton("m", data));
    // Persian keheh and yeh against their Arabic look-alikes.
    expect(skeleton("کی", data)).toBe(skeleton("كي", data));
  });
});

describe("usernames", () => {
  it.each([
    ["maryam_1", "ok"],
    ["مریم", "ok"],
    [`کتاب${ZWNJ}خوان`, "ok"],
    ["ali.علی", "ok"], // Latin plus one other recommended script
    ["我哋_ngo", "ok"], // Latin with Han
    ["Азиз", "ok"],
    ["Aziz_Азиз", "mixed-script"], // Latin with Cyrillic
    ["ab", "length"],
    ["a".repeat(31), "length"],
    ["a__b", "separators"],
    ["_abc", "separators"],
    ["abc.", "separators"],
    ["ab!c", "characters"],
    [`ab${ZWNJ}cd`, "characters"], // ZWNJ outside Arabic script
    ["ab\u202Ecd", "characters"], // a bidi override
    ["abc\u{1F600}", "characters"],
  ])("%s → %s", (name, expected) => {
    expect(verdict(name)).toBe(expected);
  });

  it("keys and skeletons: one name in many guises, never two names that look alike", () => {
    const a = checkUsername("Ali", data);
    const b = checkUsername("ALI", data);
    if (!a.ok || !b.ok) throw new Error("rejected");
    expect(a.value.key).toBe(b.value.key);
    expect(a.value.display).toBe("Ali");
    const latin = checkUsername("copy", data);
    const cyrillic = checkUsername("сору", data); // all Cyrillic: с о р у
    if (!latin.ok || !cyrillic.ok) throw new Error("rejected");
    expect(cyrillic.value.key).not.toBe(latin.value.key);
    expect(cyrillic.value.skeleton).toBe(latin.value.skeleton);
  });
});

describe("display names", () => {
  it("are free-form, but without controls or bidi overrides", () => {
    expect(checkDisplayName("  Maryam 🌸 ")).toEqual({ ok: true, value: "Maryam 🌸" });
    expect(checkDisplayName("مریم جان")).toEqual({ ok: true, value: "مریم جان" });
    expect(checkDisplayName("evil\u202Eeman")).toEqual({ ok: false, error: "characters" });
    expect(checkDisplayName("   ")).toEqual({ ok: false, error: "length" });
  });
});
