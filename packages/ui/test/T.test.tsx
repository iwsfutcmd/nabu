import type { SchemeId, TaggedText } from "@nabu/schema";
import { describe, expect, it } from "vitest";
import { demoExercise } from "../src/demo/fixtures.ts";
import { T } from "../src/T.tsx";
import { render } from "./render.tsx";

const attr = (html: string, name: string): string | undefined => new RegExp(`${name}="([^"]*)"`).exec(html)?.[1];

describe("<T>", () => {
  it("sets lang from the tag and dir from the script", () => {
    const fa = render(<T text={demoExercise("fa").answer} />);
    expect(attr(fa, "lang")).toBe("fa-Arab-IR");
    expect(attr(fa, "dir")).toBe("rtl");
    expect(attr(fa, "data-script")).toBe("Arab");
    const uz = render(<T text={demoExercise("uz-Latn").answer} />);
    expect(attr(uz, "dir")).toBe("ltr");
    const apc = render(<T text={demoExercise("apc-Arab").answer} />);
    expect(attr(apc, "dir")).toBe("rtl");
  });

  it("uses the orthography profile's fonts and line height", () => {
    const fa = render(<T text={demoExercise("fa").answer} />);
    expect(fa).toContain("--nabu-text-font:&quot;Vazirmatn&quot;, &quot;Noto Naskh Arabic&quot;, sans-serif");
    expect(fa).toContain("--nabu-text-line-height:1.9");
  });

  it("falls back to the script's stack without a profile", () => {
    expect(render(<T text={demoExercise("uz-Latn").prompt} />)).toContain("--nabu-text-font:&quot;Noto Sans&quot;, sans-serif");
  });

  it("wraps whole tokens, never single letters of a cursive word", () => {
    const html = render(<T text={demoExercise("fa").answer} />);
    // ک\u200Cتاب\u200Cها is one span whose only content is the whole word, ZWNJ included.
    expect(html).toContain('data-kind="word" data-index="0">کتاب\u200Cها</span>');
    expect(html.match(/data-kind="word"/g)).toHaveLength(4);
  });

  it("renders ruby only when a layer is chosen", () => {
    const yue = demoExercise("yue-Hant-HK").answer;
    expect(render(<T text={yue} />)).not.toContain("<ruby");
    const html = render(<T text={yue} ruby={"jyutping" as SchemeId} />);
    expect(html).toContain("<ruby");
    expect(html).toContain("我<rt>ngo5</rt>哋<rt>dei6</rt>");
  });

  it("marks short numbers for tate-chū-yoko", () => {
    const text = {
      lang: "yue-Hant-HK",
      orthography: "yue-Hant-HK/standard",
      tokens: [
        { surface: "12", kind: "number" },
        { surface: "點", kind: "word" },
        { surface: "2026", kind: "number" },
      ],
    } as unknown as TaggedText;
    const html = render(<T text={text} />);
    expect(html.match(/data-tcy="true"/g)).toHaveLength(1);
  });
});
