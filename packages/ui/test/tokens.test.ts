/**
 * The colour tokens in both themes (tokens.css). Dark applies when the learner chooses it
 * (data-theme="dark") or chooses nothing and the browser prefers it: the two blocks must say the
 * same, and every colour light sets, dark sets too. Every pairing the components use meets
 * WCAG 2.2 AA: 4.5:1 for text, 3:1 for the marks inside status icons and the focus ring.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(import.meta.dirname, "../src/tokens.css"), "utf8").replace(/\/\*[\s\S]*?\*\//gu, "");

/** The declarations of the first rule whose selector is exactly `selector`. */
const block = (selector: string): ReadonlyMap<string, string> => {
  const at = css.indexOf(`${selector} {`);
  if (at < 0) throw new Error(`no rule ${selector}`);
  const body = css.slice(css.indexOf("{", at) + 1, css.indexOf("}", at));
  return new Map(
    body
      .split(";")
      .map((d) => d.trim())
      .filter((d) => d !== "")
      .map((d) => [d.slice(0, d.indexOf(":")).trim(), d.slice(d.indexOf(":") + 1).trim()] as const),
  );
};

const light = block(":root");
const chosen = block(':root[data-theme="dark"]');
const preferred = block(':root:not([data-theme="light"])');

const luminance = (hex: string): number => {
  const h = hex.slice(1).length === 3 ? [...hex.slice(1)].map((c) => c + c).join("") : hex.slice(1);
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = Number.parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

/** Text colours and the backgrounds the components set them on. */
const TEXT: Readonly<Record<string, readonly string[]>> = {
  text: ["page", "surface", "tile", "track", "focus-bg", "correct-bg", "wrong-bg"],
  muted: ["page", "surface", "tile", "focus-bg", "correct-bg", "wrong-bg"],
  accent: ["page", "surface", "tile", "focus-bg", "wrong-bg"],
  "accent-text": ["accent", "wrong", "correct"],
  correct: ["page", "surface", "correct-bg"],
  wrong: ["page", "surface", "wrong-bg"],
};
/** Graphics: the mark inside a filled status icon, and the focus ring. */
const GRAPHICS: Readonly<Record<string, readonly string[]>> = {
  "on-status": ["correct", "wrong"],
  accent: ["page", "surface", "tile"],
};

describe("colour tokens", () => {
  it("say the same in dark, whether chosen or preferred by the browser", () => {
    expect([...preferred]).toEqual([...chosen]);
    expect(chosen.get("color-scheme")).toBe("dark");
    expect(light.get("color-scheme")).toBe("light");
  });

  it("set every colour in dark that light sets", () => {
    const colours = [...light.keys()].filter((k) => k.startsWith("--nabu-color-"));
    expect(colours.length).toBeGreaterThan(15);
    expect(colours.filter((k) => !chosen.has(k))).toEqual([]);
    expect([...chosen.keys()].filter((k) => k !== "color-scheme" && !light.has(k))).toEqual([]);
  });

  for (const [theme, tokens] of [
    ["light", light],
    ["dark", chosen],
  ] as const) {
    const colour = (name: string): string => {
      const value = tokens.get(`--nabu-color-${name}`);
      if (value === undefined || !/^#[0-9a-f]{3,6}$/iu.test(value)) throw new Error(`${theme}: --nabu-color-${name} is ${String(value)}`);
      return value;
    };
    it(`meet AA in ${theme}`, () => {
      const failing = [
        ...Object.entries(TEXT).flatMap(([fg, bgs]) => bgs.map((bg) => ({ fg, bg, ratio: contrast(colour(fg), colour(bg)), min: 4.5 }))),
        ...Object.entries(GRAPHICS).flatMap(([fg, bgs]) => bgs.map((bg) => ({ fg, bg, ratio: contrast(colour(fg), colour(bg)), min: 3 }))),
      ].filter((p) => p.ratio < p.min);
      expect(failing).toEqual([]);
    });
  }
});
