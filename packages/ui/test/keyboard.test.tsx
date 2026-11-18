/**
 * An answer field names the languages the Android app asks the device keyboard for (ADR 0143):
 * its own language, then its orthography profile's keyboard, else its macrolanguage, then its script.
 */
import type { TaggedText } from "@nabu/schema";
import { describe, expect, it } from "vitest";
import { AnswerInput } from "../src/player/AnswerInput.tsx";
import { render } from "./render.tsx";

const field = (lang: string, orthography: string): string =>
  render(
    <AnswerInput
      value=""
      base={{ lang, orthography } as Pick<TaggedText, "lang" | "orthography">}
      dir="ltr"
      label="Answer"
      disabled={false}
      extraKeys={[]}
      onInput={() => undefined}
      onCompositionStart={() => undefined}
      onCompositionEnd={() => undefined}
      onSubmit={() => undefined}
    />,
  );

describe("the answer field's keyboard (ADR 0143)", () => {
  it("names its own language, then the keyboard its orthography's profile chose", () => {
    expect(field("hbo-Hebr", "hbo-Hebr/tiberian")).toContain('data-keyboard="hbo he und-Hebr"');
    expect(field("fa-Arab", "fa-Arab/standard")).toContain('data-keyboard="fa und-Arab"');
    // Toki Pona on a Latin keyboard of no language (Gboard's Alphabet) before English.
    expect(field("tok-Latn", "tok-Latn/standard")).toContain('data-keyboard="tok und-Latn en"');
  });

  it("without one, its language and that language's macrolanguage in its script", () => {
    expect(field("yue-Hant-HK", "yue-Hant-HK/standard")).toContain('data-keyboard="yue-HK zh-Hant-HK und-Hant"');
  });
});
