import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { OrthographyProfile, TaggedText } from "@nabu/schema";
import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import { DemoExerciseCard } from "../src/demo/DemoExerciseCard.tsx";
import { effectiveWritingMode, rubyScheme } from "../src/demo/ExerciseCard.tsx";
import { DEMO_TARGETS, demoExercise, type DemoTarget } from "../src/demo/fixtures.ts";
import { DEMO_ORTHOGRAPHIES } from "../src/demo/profiles.ts";
import { render } from "./render.tsx";

const SCHEMAS = resolve(import.meta.dirname, "../../../schemas");
const ajv = new Ajv2020({ strict: true });
ajv.addKeyword({ keyword: "tsType", schemaType: "string" });
for (const f of ["common", "tagged-text"]) ajv.addSchema(JSON.parse(readFileSync(`${SCHEMAS}/${f}.schema.json`, "utf8")) as object);
const validate = ajv.getSchema("https://nabu.invalid/schemas/v0/tagged-text.schema.json")!;

const targets = Object.keys(DEMO_TARGETS) as DemoTarget[];
const allTexts = (t: DemoTarget): TaggedText[] => {
  const e = demoExercise(t);
  return [e.prompt, e.answer, ...e.distractors];
};

describe("demo fixtures", () => {
  it.each(targets)("%s: every TaggedText is schema-valid", (target) => {
    for (const text of allTexts(target)) {
      const ok = validate(text);
      expect(validate.errors ?? []).toEqual([]);
      expect(ok).toBe(true);
    }
  });

  it.each(targets)("%s: NFC, ruby bases and morphs concatenate to the surface", (target) => {
    for (const text of allTexts(target)) {
      for (const token of text.tokens) {
        expect(token.surface.normalize("NFC")).toBe(token.surface);
        for (const segments of Object.values(token.ruby ?? {})) expect(segments.map((s) => s.base).join("")).toBe(token.surface);
        if (token.morphs) expect(token.morphs.map((m) => m.surface).join("")).toBe(token.surface);
      }
    }
  });

  it("uses the profile code points: Persian keheh/yeh, Uzbek U+02BB, Arabic kaf in apc", () => {
    const surface = (t: DemoTarget): string => demoExercise(t).answer.tokens.map((x) => x.surface).join("");
    expect(surface("fa")).toMatch(/ک/u);
    expect(surface("fa")).not.toMatch(/[كي]/u);
    expect(surface("uz-Latn")).toContain("oʻzbek");
    expect(surface("apc-Arab")).toContain("بدّك");
  });
});

describe("writing mode policy", () => {
  const profile = (id: string): OrthographyProfile => DEMO_ORTHOGRAPHIES.get(id)!;
  it("allows vertical-rl only where the profile does", () => {
    expect(effectiveWritingMode(profile("yue-Hant-HK/standard"), "vertical-rl")).toBe("vertical-rl");
    expect(effectiveWritingMode(profile("yue-Hant-HK/standard"), "vertical-lr")).toBe("horizontal-tb");
    for (const id of ["fa-Arab/standard", "uz-Latn/standard", "apc-Arab/standard"]) {
      expect(effectiveWritingMode(profile(id), "vertical-rl")).toBe("horizontal-tb");
    }
  });
  it("keeps always-vertical orthographies vertical", () => {
    const mong = { id: "mn-Mong/standard", lang: "mn-Mong", segmentation: { content: "whitespace", runtime: "grapheme" }, normalize: ["nfc"], layout: { vertical: "vertical-lr", verticalPolicy: "always" } } as unknown as OrthographyProfile;
    expect(effectiveWritingMode(mong, "horizontal-tb")).toBe("vertical-lr");
  });
  it("finds the ruby layer", () => {
    expect(rubyScheme(profile("yue-Hant-HK/standard"))).toBe("jyutping");
    expect(rubyScheme(profile("fa-Arab/standard"))).toBeUndefined();
  });
});

describe("exercise card markup", () => {
  it.each(targets)("%s: the answer field carries the target lang and dir, with IME-friendly attributes", (target) => {
    const html = render(<DemoExerciseCard target={target} />);
    const input = /<input[^>]*data-answer-input[^>]*>/.exec(html)?.[0] ?? "";
    expect(input).toContain(`lang="${demoExercise(target).answer.lang}"`);
    expect(input).toMatch(/dir="(ltr|rtl)"/);
    // HTML attribute names are case-insensitive; React's SSR keeps the camelCase prop spelling.
    expect(input).toMatch(/autocapitalize="off"/i);
    expect(input).toMatch(/autocorrect="off"/i);
    expect(input).toMatch(/spellcheck="false"/i);
  });
  it("formats chrome through MF2, including plurals and isolated placeholders", () => {
    const html = render(<DemoExerciseCard target="yue-Hant-HK" />);
    expect(html).toContain("Write this in \u2068Cantonese\u2069");
    expect(html).toContain("5 tiles left"); // 3 remaining + 2 distractors
  });
});
