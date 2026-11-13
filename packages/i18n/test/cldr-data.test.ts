import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { cldrMeta, fontStackFor, maximize, parseTag, scriptInfo, scriptOf, uiFontStack } from "../src/index.ts";

describe("generated CLDR data", () => {
  it("matches the pinned cldr-json packages", () => {
    const script = resolve(import.meta.dirname, "../scripts/generate-cldr.ts");
    expect(() => execFileSync(process.execPath, [script, "--check"], { stdio: "pipe" })).not.toThrow();
  });
  it("records its provenance", () => {
    expect(cldrMeta.cldrVersion).toBe("49");
    expect(cldrMeta.license).toBe("Unicode-3.0");
  });
  it("trims likely subtags only of languages whose script is Latin and that nothing here writes", () => {
    const full = (
      JSON.parse(readFileSync(createRequire(import.meta.url).resolve("cldr-core/supplemental/likelySubtags.json"), "utf8")) as {
        supplemental: { likelySubtags: Record<string, string> };
      }
    ).supplemental.likelySubtags;
    let dropped = 0;
    for (const [tag, likely] of Object.entries(full)) {
      const kept = maximize(tag);
      if (kept === likely) continue;
      // Left out: the tag stays as it is, so it has no script, and CLDR's is Latin (left to right).
      dropped++;
      expect(kept, tag).toBe(parseTag(tag).language === "und" ? likely : tag);
      expect(parseTag(likely).script, tag).toBe("Latn");
      expect(scriptOf(tag), tag).toBe(parseTag(tag).script);
    }
    expect(dropped).toBeGreaterThan(5000);
    // What the app and its courses write keeps its entries: Toki Pona is Latin, with no CLDR locale data.
    for (const tag of ["tok", "grc", "hbo", "apc", "lzh", "yue", "en", "fa", "uz", "zh", "ar", "dv", "rhg", "iu"]) expect(maximize(tag), tag).toBe(full[tag]);
  });

  it("has script flags from scriptMetadata plus the vertical overlay", () => {
    expect(scriptInfo("Arab")).toMatchObject({ rtl: true, shaping: "required" });
    expect(scriptInfo("Hant")).toMatchObject({ rtl: false, lbLetters: true, ime: true, vertical: { mode: "vertical-rl" } });
    expect(scriptInfo("Mong")).toMatchObject({ vertical: { mode: "vertical-lr", policy: "always" } });
    expect(scriptInfo("Latn")?.vertical).toBeUndefined();
    expect(scriptInfo("Qaaa")).toBeUndefined();
  });
});

describe("font stacks", () => {
  it("prefer the profile, then the script default", () => {
    expect(fontStackFor("fa-Arab", { stack: ["Vazirmatn", "Noto Naskh Arabic"], lineHeight: 1.9 })).toEqual({
      family: '"Vazirmatn", "Noto Naskh Arabic", sans-serif',
      lineHeight: 1.9,
      scale: 1,
    });
    // A profile may set its text larger than the text around it (Classical Chinese, ADR 0071).
    expect(fontStackFor("lzh-Hant", { stack: ["Noto Serif TC"], lineHeight: 1.7, scale: 1.25 }).scale).toBe(1.25);
    expect(fontStackFor("uz-Latn").family).toBe('"Noto Sans", sans-serif');
    expect(fontStackFor("apc-Arab").lineHeight).toBeGreaterThan(fontStackFor("uz-Latn").lineHeight);
    expect(uiFontStack("ar-XB").family.startsWith('"Noto Sans Arabic"')).toBe(true);
  });
});
