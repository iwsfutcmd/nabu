import type { SchemeId, TaggedText } from "@nabu/schema";
import { describe, expect, it } from "vitest";
import { demoExercise } from "../src/demo/fixtures.ts";
import { T } from "../src/T.tsx";
import { NabuUiProvider } from "../src/context.tsx";
import { DEMO_ORTHOGRAPHIES } from "../src/demo/profiles.ts";
import { render, translator } from "./render.tsx";

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

  it("tags each ruby layer with its own language (ADR 0071)", () => {
    const text = {
      lang: "lzh-Hant",
      orthography: "lzh-Hant/standard",
      tokens: [
        {
          surface: "君子",
          kind: "word",
          ruby: {
            pinyin: [
              { base: "君", text: "jūn" },
              { base: "子", text: "zǐ" },
            ],
            baxter: [
              { base: "君", text: "kjun" },
              { base: "子", text: "tsiX" },
            ],
          },
        },
      ],
    } as unknown as TaggedText;
    expect(render(<T text={text} ruby={"pinyin" as SchemeId} />)).toContain('君<rt lang="zh-Latn-pinyin">jūn</rt>子<rt lang="zh-Latn-pinyin">zǐ</rt>');
    expect(render(<T text={text} ruby={"baxter" as SchemeId} />)).toContain('君<rt lang="ltc-Latn-x-baxter">kjun</rt>子<rt lang="ltc-Latn-x-baxter">tsiX</rt>');
    // Latin readings are set in the Latin face, whose tone letters (ū, ǖ) the CJK face lacks.
    expect(render(<T text={text} ruby={"pinyin" as SchemeId} />)).toContain("--nabu-ruby-font:&quot;Noto Sans&quot;, sans-serif");
    expect(render(<T text={text} />)).not.toContain("--nabu-ruby-font");
  });

  it("sets an orthography's text larger where its profile says so (Classical Chinese, ADR 0071)", () => {
    const lzh = { lang: "lzh-Hant", orthography: "lzh-Hant/standard", tokens: [{ surface: "善", kind: "word" }] } as unknown as TaggedText;
    const html = render(<T text={lzh} />);
    expect(html).toContain("data-scaled");
    expect(html).toContain("--nabu-text-scale:1.25");
    // Other courses are set at the size around them, as before.
    const yue = render(<T text={demoExercise("yue-Hant-HK").answer} />);
    expect(yue).not.toContain("data-scaled");
    expect(yue).not.toContain("--nabu-text-scale");
  });

  it("marks only the language being learned for the learner's text size (ADR 0071)", () => {
    const lzh = { lang: "lzh-Hant", orthography: "lzh-Hant/standard", tokens: [{ surface: "善", kind: "word" }] } as unknown as TaggedText;
    const en = { lang: "en-Latn", orthography: "en-Latn/standard", tokens: [{ surface: "good", kind: "word" }] } as unknown as TaggedText;
    const inCourse = (text: TaggedText): string =>
      render(
        <NabuUiProvider translator={translator()} orthographies={DEMO_ORTHOGRAPHIES} targets={new Set(["lzh-Hant/standard"])}>
          <T text={text} />
        </NabuUiProvider>,
      );
    expect(inCourse(lzh)).toContain("data-target");
    expect(inCourse(en)).not.toContain("data-target");
    // Outside a course nothing is a target.
    expect(render(<T text={lzh} />)).not.toContain("data-target");
  });

  it("sets sitelen pona in its own face, a word a box, with each logograph's word as ruby (ADR 0086)", () => {
    const sp = {
      lang: "tok-Qaap",
      orthography: "tok-Qaap/sitelen-pona",
      tokens: [
        { surface: "\u{F1934}", kind: "word", sense: "mi", ruby: { lasina: [{ base: "\u{F1934}", text: "mi" }] } },
        { surface: "\u{F1936}", kind: "word", sense: "moku", ruby: { lasina: [{ base: "\u{F1936}", text: "moku" }] } },
      ],
    } as unknown as TaggedText;
    const html = render(
      <NabuUiProvider translator={translator()} orthographies={DEMO_ORTHOGRAPHIES}>
        <T text={sp} ruby={"lasina" as SchemeId} />
      </NabuUiProvider>,
    );
    expect(attr(html, "lang")).toBe("tok-Qaap");
    expect(attr(html, "dir")).toBe("ltr");
    expect(attr(html, "data-script")).toBe("Qaap");
    expect(html).toContain("--nabu-text-font:&quot;sitelen seli kiwen juniko&quot;, sans-serif");
    expect(html).toContain("<rt");
    expect(html).toContain(">moku</rt>");
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
