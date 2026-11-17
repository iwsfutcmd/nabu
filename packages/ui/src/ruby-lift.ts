/**
 * Readings set by each word's own ink (ADR 0131 amendment). Nastaliq stacks letters high above the
 * line (یکی cascades rise to 2.44 em of the word's size in chg), far over where a browser sets ruby,
 * while a short word (سن) stays well under it. One clearance for every word left the reading either
 * in the strokes of a tall word or floating far over a short one; this lifts each reading to a gap
 * over its own word: the word's ink, less where the reading's baseline sits of its own accord.
 *
 * Both are measured in the browser, by what it draws and lays out, never by what an engine's metrics
 * say (Chromium and Gecko set ruby, and report text bounds, differently):
 * - A word's ink: the top row the word inks when drawn on a canvas in its font (`inkOf`).
 * - Where a reading's baseline sits unlifted (`naturalOf`): a hidden probe built as <T> builds a reading,
 *   with T.module.css's own classes and fonts, and a zero-size mark on each baseline. The probe also
 *   checks that the canvas sets the word as the page does (the same width), so a font still loading
 *   is never measured in its stead.
 * - Then in place (`calibrate`): the probe is set at one size, and a browser rounds where it sets ruby
 *   to whole pixels (Chromium: 0.07 em at 20 px). Once a text is laid out, one of its own readings is
 *   measured the same way at its own size, and its words are lifted again by that, before it is painted.
 * Each is kept once known. Until then (and where there is no document, as in tests) a word has no lift,
 * and the stylesheet's own clearance, safe for every word, holds.
 */
import { useEffect, useLayoutEffect, useState, type RefObject } from "react";
import styles from "./T.module.css";

/** From the top of a word's ink to its reading's baseline, in the word's em: room for g, y and ǧ to hang. */
export const RUBY_GAP = 0.35;

/** How far to lift a reading over where it sits of its own accord, in the word's em: never below it. */
export const rubyLift = (ink: number, natural: number): number => Math.max(0, ink + RUBY_GAP - natural);

/** The size words are drawn at to measure them (px): measurements are ratios to it. */
const SIZE = 50;
/** The canvas rows over a word's baseline, in em: room for the tallest Nastaliq cascade. */
const ROOM = 3;
/** An alpha that counts as ink: above antialiasing fringes and any noise a browser adds to canvas reads. */
const INKED = 64;

/** What the reading layer is set in, beside the word's own font. */
export interface RubyFonts {
  /** The word's font stack (fontStackFor's `family`) and line height. */
  readonly family: string;
  readonly lineHeight: number;
  /** The reading's font stack, where its layer names a language (ADR 0071). */
  readonly ruby: string | undefined;
  /** The text's script subtag, which T.module.css selects on. */
  readonly script: string;
}

const inks = new Map<string, number>();
const naturals = new Map<string, number>();
let context: CanvasRenderingContext2D | null | undefined;

const hasDocument = (): boolean => typeof document !== "undefined" && "fonts" in document;

/**
 * Whether the stack's first family is in for a text. Only the first: `check` over the whole stack is
 * false while a fallback face that covers the text is unloaded, which it stays if never needed.
 */
const fontsReady = (family: string, text: string): boolean => hasDocument() && document.fonts.check(`${SIZE}px ${family.split(",")[0] ?? family}`, text);

const canvas = (): CanvasRenderingContext2D | null => {
  context ??= hasDocument() ? document.createElement("canvas").getContext("2d", { willReadFrequently: true }) : null;
  return context;
};

/**
 * How far a word's ink rises over its baseline, in its em: the top inked row when the canvas draws it.
 * None where the canvas reads back noise (a browser that scrambles canvas reads against fingerprinting:
 * the margin before the word must be blank).
 */
const inkOf = (family: string, surface: string): number | undefined => {
  const key = `${family}\u0000${surface}`;
  const known = inks.get(key);
  if (known !== undefined) return known;
  const ctx = canvas();
  if (ctx === null || !fontsReady(family, surface)) return undefined;
  const font = `${SIZE}px ${family}`;
  ctx.font = font;
  const width = Math.ceil(ctx.measureText(surface).width) + SIZE;
  const baseline = ROOM * SIZE;
  // Resizing clears the canvas and its state.
  ctx.canvas.width = width;
  ctx.canvas.height = baseline + SIZE;
  ctx.font = font;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.fillStyle = "#000";
  ctx.fillText(surface, SIZE / 2, baseline);
  const pixels = ctx.getImageData(0, 0, width, baseline).data;
  const inked = (row: number, col: number): boolean => (pixels[(row * width + col) * 4 + 3] ?? 0) >= INKED;
  // The margin before the word is blank unless the read-back is noise.
  for (let row = 0; row < baseline; row += 1) for (let col = 0; col < SIZE / 4; col += 1) if (inked(row, col)) return undefined;
  let top = baseline;
  for (let row = 0; row < baseline && top === baseline; row += 1) {
    for (let col = 0; col < width; col += 1) {
      if (inked(row, col)) {
        top = row;
        break;
      }
    }
  }
  const ink = (baseline - top) / SIZE;
  inks.set(key, ink);
  return ink;
};

/** A zero-size box on its line's baseline: where a baseline is, in any engine. */
const baselineMark = (): HTMLSpanElement => {
  const mark = document.createElement("span");
  mark.style.cssText = "display:inline-block;inline-size:0;block-size:0;vertical-align:baseline";
  return mark;
};

/**
 * Where a reading's baseline sits over its word's, unlifted, in the word's em: a hidden probe set as
 * <T> sets a lifted reading (T.module.css, `--nabu-ruby-lift: 0`). None until the canvas sets the
 * sample as the page does (its font is in for both).
 */
const fontsKey = (fonts: RubyFonts): string => [fonts.family, fonts.lineHeight, fonts.ruby ?? "", fonts.script].join("\u0000");

/** The key of a natural position measured in place: the fonts, at a size in pixels. */
const sizedKey = (fonts: RubyFonts, size: number): string => `${fontsKey(fonts)}\u0000${size.toFixed(2)}`;

const naturalOf = (fonts: RubyFonts, sample: string): number | undefined => {
  const key = fontsKey(fonts);
  const known = naturals.get(key);
  if (known !== undefined) return known;
  const ctx = canvas();
  if (ctx === null || document.body === null || !fontsReady(fonts.family, sample) || (fonts.ruby !== undefined && !fontsReady(fonts.ruby, "x"))) return undefined;
  const text = document.createElement("p");
  text.className = styles.text;
  text.dataset.script = fonts.script;
  text.setAttribute("aria-hidden", "true");
  text.style.cssText = `position:absolute;visibility:hidden;inset-block-start:0;inset-inline-start:0;margin:0;white-space:nowrap;font-size:${SIZE}px`;
  text.style.setProperty("--nabu-text-font", fonts.family);
  text.style.setProperty("--nabu-text-line-height", String(fonts.lineHeight));
  if (fonts.ruby !== undefined) text.style.setProperty("--nabu-ruby-font", fonts.ruby);
  const token = document.createElement("span");
  token.className = styles.token;
  const ruby = document.createElement("ruby");
  ruby.className = styles.ruby;
  ruby.dataset.lift = "";
  ruby.style.setProperty("--nabu-ruby-lift", "0");
  const base = document.createTextNode(sample);
  const wordBaseline = baselineMark();
  const rt = document.createElement("rt");
  const reading = document.createElement("span");
  reading.className = styles.reading;
  const readingBaseline = baselineMark();
  reading.append("x", readingBaseline);
  rt.append(reading);
  ruby.append(base, wordBaseline, rt);
  token.append(ruby);
  text.append(token);
  document.body.append(text);
  try {
    // The canvas must set the word as the page does, or its ink would be another font's.
    const range = document.createRange();
    range.selectNodeContents(base);
    const laidOut = range.getBoundingClientRect().width;
    ctx.font = `${SIZE}px ${fonts.family}`;
    const drawn = ctx.measureText(sample).width;
    if (laidOut === 0 || Math.abs(drawn - laidOut) / laidOut > 0.02) return undefined;
    const size = parseFloat(getComputedStyle(token).fontSize) || SIZE;
    const natural = (wordBaseline.getBoundingClientRect().top - readingBaseline.getBoundingClientRect().top) / size;
    naturals.set(key, natural);
    return natural;
  } finally {
    text.remove();
  }
};

/**
 * Where a laid-out reading's baseline sits unlifted, at its own size: its baseline over its word's,
 * in the word's em, less the lift it was given. Marks go in for the measurement and come out at once.
 */
const calibrate = (ruby: HTMLElement, size: number): number | undefined => {
  const rt = ruby.querySelector("rt");
  const reading = rt?.querySelector(`.${styles.reading}`);
  const lift = parseFloat(ruby.style.getPropertyValue("--nabu-ruby-lift"));
  if (rt === null || reading === null || reading === undefined || Number.isNaN(lift)) return undefined;
  const wordBaseline = baselineMark();
  const readingBaseline = baselineMark();
  ruby.insertBefore(wordBaseline, rt);
  reading.append(readingBaseline);
  const above = (wordBaseline.getBoundingClientRect().top - readingBaseline.getBoundingClientRect().top) / size;
  wordBaseline.remove();
  readingBaseline.remove();
  return above - lift;
};

/**
 * Each word's lift (`rubyLift`), once its fonts are in; nothing while `on` is false (a text with no
 * reading shown, or a script the stylesheet does not lift). `ref` is the text's element: once it is
 * laid out, one of its readings sets the natural position at its own size (`calibrate`), and the text
 * is lifted again before it is painted. The text re-renders when fonts finish loading, so a word
 * measured late is lifted then.
 */
export const useRubyLift = (fonts: RubyFonts, on: boolean, ref: RefObject<HTMLElement | null>): ((surface: string) => number | undefined) => {
  const [, setLoaded] = useState(0);
  const [size, setSize] = useState<number | undefined>(undefined);
  useEffect(() => {
    if (!on || !hasDocument()) return;
    const loaded = (): void => setLoaded((n) => n + 1);
    document.fonts.addEventListener("loadingdone", loaded);
    return () => document.fonts.removeEventListener("loadingdone", loaded);
  }, [on]);
  useLayoutEffect(() => {
    const ruby = on ? ref.current?.querySelector<HTMLElement>("ruby[data-lift]") : undefined;
    if (ruby === null || ruby === undefined) return;
    const px = parseFloat(getComputedStyle(ruby).fontSize);
    if (!(px > 0)) return;
    const key = sizedKey(fonts, px);
    if (!naturals.has(key)) {
      const natural = calibrate(ruby, px);
      if (natural !== undefined) naturals.set(key, natural);
    }
    if (naturals.has(key) && px !== size) setSize(px);
  });
  return (surface) => {
    if (!on) return undefined;
    const ink = inkOf(fonts.family, surface);
    if (ink === undefined) return undefined;
    const natural = (size === undefined ? undefined : naturals.get(sizedKey(fonts, size))) ?? naturalOf(fonts, surface);
    return natural === undefined ? undefined : rubyLift(ink, natural);
  };
};
