/**
 * Readings set by each word's own ink (ADR 0131 amendment). Nastaliq stacks letters high above the
 * line (یکی cascades rise to 2.44 em of the word's size in chg), far over the em box a browser sets
 * ruby on, while a short word (سن) stays well under it. One clearance for every word left the
 * reading either in the strokes of a tall word or floating far over a short one; this lifts each
 * reading to just above its own word: the word's ink, measured, plus a gap, less where the browser
 * puts a reading of its own accord.
 *
 * Measured once a word's font is in (`document.fonts.check`), and kept: canvas `measureText` for a
 * word's ink, and a hidden probe, once per font, for where the browser sets ruby (Chromium: on the em
 * box, 0.8 em above the baseline in Noto Nastaliq Urdu). Until then (and where there is no document,
 * as in tests) a word has no lift, and the stylesheet's own clearance, safe for every word, holds.
 */
import { useEffect, useState } from "react";

/** Between the top of a word's ink and its reading's line box, in the word's em. */
export const RUBY_GAP = 0.2;

/** How far to lift a reading over where the browser sets it, in the word's em: never below it. */
export const rubyLift = (ink: number, offset: number): number => Math.max(0, ink + RUBY_GAP - offset);

/** The size measurements are made at: they are ratios to it. */
const SIZE = 100;

const inks = new Map<string, number>();
const offsets = new Map<string, number>();
let context: CanvasRenderingContext2D | null | undefined;

/**
 * Whether the stack's first family is in for a text. Only the first: `check` over the whole stack is
 * false while a fallback face that covers the text is unloaded, which it stays if never needed.
 */
const fontsReady = (family: string, text: string): boolean =>
  typeof document !== "undefined" && "fonts" in document && document.fonts.check(`${SIZE}px ${family.split(",")[0] ?? family}`, text);

const canvas = (): CanvasRenderingContext2D | null => {
  context ??= typeof document === "undefined" ? null : document.createElement("canvas").getContext("2d");
  return context;
};

/** How far a word's ink rises over its baseline, in its em. */
const inkOf = (family: string, surface: string): number | undefined => {
  const key = `${family}\u0000${surface}`;
  const known = inks.get(key);
  if (known !== undefined) return known;
  const ctx = canvas();
  if (ctx === null || !fontsReady(family, surface)) return undefined;
  ctx.font = `${SIZE}px ${family}`;
  const ink = ctx.measureText(surface).actualBoundingBoxAscent / SIZE;
  inks.set(key, ink);
  return ink;
};

/**
 * Where the browser sets a reading of its own accord: the bottom of a ruby annotation with no
 * padding, over the baseline, in the base's em. A hidden probe in the word's font and line height.
 */
const offsetOf = (family: string, lineHeight: number, sample: string): number | undefined => {
  const key = `${family}\u0000${lineHeight}`;
  const known = offsets.get(key);
  if (known !== undefined) return known;
  if (!fontsReady(family, sample) || document.body === null) return undefined;
  const probe = document.createElement("div");
  probe.setAttribute("aria-hidden", "true");
  probe.style.cssText = `position:absolute;visibility:hidden;inset-block-start:0;inset-inline-start:0;white-space:nowrap;font-family:${family};font-size:${SIZE}px;line-height:${lineHeight}`;
  const ruby = document.createElement("ruby");
  ruby.append(sample);
  const rt = document.createElement("rt");
  rt.style.cssText = "font-size:0.55em;line-height:1;padding:0";
  rt.append(sample);
  ruby.append(rt);
  const baseline = document.createElement("span");
  baseline.style.cssText = "display:inline-block;inline-size:0;block-size:0;vertical-align:baseline";
  probe.append(ruby, baseline);
  document.body.append(probe);
  const offset = (baseline.getBoundingClientRect().top - rt.getBoundingClientRect().bottom) / SIZE;
  probe.remove();
  offsets.set(key, offset);
  return offset;
};

/**
 * Each word's lift (`rubyLift`) in a font, once its font is in; nothing while `on` is false (a text
 * with no reading shown, or a script the stylesheet does not lift). The text re-renders when fonts
 * finish loading, so a word measured late is lifted then.
 */
export const useRubyLift = (family: string, lineHeight: number, on: boolean): ((surface: string) => number | undefined) => {
  const [, setLoaded] = useState(0);
  useEffect(() => {
    if (!on || typeof document === "undefined" || !("fonts" in document)) return;
    const loaded = (): void => setLoaded((n) => n + 1);
    document.fonts.addEventListener("loadingdone", loaded);
    return () => document.fonts.removeEventListener("loadingdone", loaded);
  }, [on]);
  return (surface) => {
    if (!on) return undefined;
    const ink = inkOf(family, surface);
    const offset = ink === undefined ? undefined : offsetOf(family, lineHeight, surface);
    return ink === undefined || offset === undefined ? undefined : rubyLift(ink, offset);
  };
};
