/**
 * Normalization steps (gameplan §6.3–6.4). Each is a pure string → string
 * function compiled from one profile step. The same pipeline runs over accept
 * sets at compile time (through core-cli) and over learner answers at runtime.
 */
import type { NormalizeStep } from "@nabu/schema";

export type StepFn = (text: string) => string;

/** Literal replacement, longest key first, left to right; replaced text is not rescanned. */
export const literalMap = (map: Readonly<Record<string, string>>): StepFn => {
  const byFirst = new Map<string, [string, string][]>();
  for (const [rawKey, value] of Object.entries(map)) {
    const key = rawKey.normalize("NFC");
    if (key === "") continue;
    const first = String.fromCodePoint(key.codePointAt(0) as number);
    const list = byFirst.get(first) ?? [];
    list.push([key, value.normalize("NFC")]);
    byFirst.set(first, list);
  }
  for (const list of byFirst.values()) list.sort((a, b) => b[0].length - a[0].length);
  return (text) => {
    let out = "";
    let i = 0;
    while (i < text.length) {
      const cp = text.codePointAt(i) as number;
      const ch = String.fromCodePoint(cp);
      const hit = byFirst.get(ch)?.find(([key]) => text.startsWith(key, i));
      if (hit === undefined) {
        out += ch;
        i += ch.length;
      } else {
        out += hit[1];
        i += hit[0].length;
      }
    }
    return out;
  };
};

/** Arabic Presentation Forms-A/B → base letters, via NFKC on just those code points. */
const ARABIC_PRESENTATION = /[ﭐ-﷏ﷰ-﷿ﹰ-ﻼ]/gu;
const foldArabicPresentationForms: StepFn = (text) => text.replace(ARABIC_PRESENTATION, (c) => c.normalize("NFKC"));

const shift = (c: string, delta: number): string => String.fromCodePoint((c.codePointAt(0) as number) + delta);
const FULLWIDTH_ALNUM = /[０-９Ａ-Ｚａ-ｚ]/gu;
const ASCII_PUNCT = /[!-/:-@[-`{-~]/gu;
const FULLWIDTH_PUNCT = /[！-／：-＠［-｀｛-～]/gu;
const HALFWIDTH_CJK_PUNCT = /[｡-､]/gu;
const HALFWIDTH_KATAKANA = /[･-ﾟ]+/gu;

const foldWidth = (opts: { ascii?: "half" | "full"; punctuation?: "half" | "full"; katakana?: "half" | "full" }): StepFn => {
  const fns: StepFn[] = [];
  if (opts.ascii === "half") fns.push((t) => t.replace(FULLWIDTH_ALNUM, (c) => shift(c, -0xfee0)).replace(/\u3000/gu, " "));
  if (opts.ascii === "full") fns.push((t) => t.replace(/[0-9A-Za-z]/gu, (c) => shift(c, 0xfee0)));
  if (opts.punctuation === "full") {
    fns.push((t) => t.replace(ASCII_PUNCT, (c) => shift(c, 0xfee0)).replace(HALFWIDTH_CJK_PUNCT, (c) => c.normalize("NFKC")));
  }
  if (opts.punctuation === "half") fns.push((t) => t.replace(FULLWIDTH_PUNCT, (c) => shift(c, -0xfee0)));
  if (opts.katakana === "full") fns.push((t) => t.replace(HALFWIDTH_KATAKANA, (run) => run.normalize("NFKC")));
  if (opts.katakana === "half") throw new Error("fold-width katakana: half is not supported");
  return (text) => fns.reduce((t, f) => f(t), text);
};

/** Maps the digits of every accepted numbering system to the canonical one. */
const digits = (canonical: string, accept: readonly string[], systems: Readonly<Record<string, string>>): StepFn => {
  const target = Array.from(systems[canonical] ?? "");
  if (target.length !== 10) throw new Error(`Unknown numbering system "${canonical}"`);
  const map: Record<string, string> = {};
  for (const id of accept) {
    const source = Array.from(systems[id] ?? "");
    if (source.length !== 10) throw new Error(`Unknown numbering system "${id}"`);
    source.forEach((d, i) => {
      if (id !== canonical) map[d] = target[i] as string;
    });
  }
  return literalMap(map);
};

const PUNCTUATION = /\p{P}/gu;
const WHITESPACE = /\s+/gu;

export const compileStep = (step: NormalizeStep, numberingSystems: Readonly<Record<string, string>>): StepFn => {
  if (step === "nfc") return (t) => t.normalize("NFC");
  if ("fold-compat" in step) return foldArabicPresentationForms;
  if ("fold-width" in step) return foldWidth(step["fold-width"]);
  if ("map" in step) return literalMap(step.map);
  if ("remove" in step) return literalMap(Object.fromEntries(step.remove.map((r) => [r, ""])));
  if ("digits" in step) return digits(step.digits.canonical, step.digits.accept, numberingSystems);
  if ("punctuation" in step) return step.punctuation === "strip" ? (t) => t.replace(PUNCTUATION, "") : (t) => t;
  // whitespace
  if (step.whitespace === "collapse") return (t) => t.replace(WHITESPACE, " ").trim();
  if (step.whitespace === "remove") return (t) => t.replace(WHITESPACE, "");
  return (t) => t;
};

/**
 * Bidi formatting characters (LRM, RLM, ALM, embeddings, overrides, isolates)
 * never carry meaning in an answer; mobile keyboards insert them. ZWNJ and ZWJ
 * do carry meaning and are left to the profile.
 */
const BIDI_CONTROLS = /[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/gu;
export const stripBidiControls: StepFn = (text) => text.replace(BIDI_CONTROLS, "");

/** The whole pipeline: NFC and bidi-control removal first, the profile's steps, NFC last ("NFC at every boundary"). */
export const compileNormalizer = (steps: readonly NormalizeStep[], numberingSystems: Readonly<Record<string, string>>): StepFn => {
  const fns = steps.map((s) => compileStep(s, numberingSystems));
  return (text) => fns.reduce((t, f) => f(t), stripBidiControls(text.normalize("NFC"))).normalize("NFC");
};
