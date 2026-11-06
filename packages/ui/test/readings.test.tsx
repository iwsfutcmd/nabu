import type { SchemeId } from "@nabu/schema";
import type { JSX } from "react";
import { describe, expect, it } from "vitest";
import { DEMO_ORTHOGRAPHIES } from "../src/demo/profiles.ts";
import { defaultRuby, ReadingsControl, rubyLayersOf, useReadings } from "../src/player/Readings.tsx";
import { render } from "./render.tsx";

const yue = DEMO_ORTHOGRAPHIES.get("yue-Hant-HK/standard");
const lzh = DEMO_ORTHOGRAPHIES.get("lzh-Hant/standard");

const Control = ({ orthography, chosen }: { readonly orthography: string; readonly chosen?: SchemeId | false }): JSX.Element => {
  const readings = useReadings(DEMO_ORTHOGRAPHIES.get(orthography), "horizontal-tb", chosen);
  return (
    <>
      <ReadingsControl readings={readings} />
      <output data-shown={readings.shown === false ? "off" : readings.shown} />
    </>
  );
};

describe("reading layers (ADR 0071)", () => {
  it("lists every ruby layer of a profile, in order", () => {
    expect(rubyLayersOf(yue).map((l) => l.scheme)).toEqual(["jyutping"]);
    expect(rubyLayersOf(lzh).map((l) => l.scheme)).toEqual(["pinyin", "jyutping", "baxter"]);
  });

  it("starts from the learner's choice, else the profile's default", () => {
    // yue says nothing: its one layer shows in horizontal text, as before.
    expect(defaultRuby(yue)).toBe("jyutping");
    expect(defaultRuby(yue, false)).toBe(false);
    // Classical Chinese marks every layer off: characters first.
    expect(defaultRuby(lzh)).toBe(false);
    expect(defaultRuby(lzh, "baxter" as SchemeId)).toBe("baxter");
    // A choice another orthography made is no layer here.
    expect(defaultRuby(lzh, "furigana" as SchemeId)).toBe(false);
  });

  it("is a switch for one layer and a choice for several", () => {
    const one = render(<Control orthography="yue-Hant-HK/standard" />);
    expect(one).toContain('data-toggle="readings"');
    expect(one).toContain('role="switch"');
    expect(one).toContain('data-shown="jyutping"');
    const several = render(<Control orthography="lzh-Hant/standard" chosen={"jyutping" as SchemeId} />);
    expect(several).not.toContain('role="switch"');
    expect([...several.matchAll(/data-reading="([^"]+)"/g)].map((m) => m[1])).toEqual(["off", "pinyin", "jyutping", "baxter"]);
    for (const label of ["Readings", "Off", "Pinyin", "Jyutping", "Middle Chinese (Baxter)"]) expect(several).toContain(label);
    expect(several).toContain('data-shown="jyutping"');
  });
});
