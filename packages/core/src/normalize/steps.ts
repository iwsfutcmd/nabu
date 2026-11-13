/**
 * Normalization steps (gameplan §6.3–6.4). Each is a pure string → string
 * function compiled from one profile step. The same pipeline runs over accept
 * sets at compile time (through core-cli) and over learner answers at runtime.
 */
import type { NormalizeStep } from "@nabu/schema";
import { graphemes } from "../text/graphemes.ts";

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

/**
 * A prefix written onto the next word is split off from it: Arabizi elshay → el shay. Prefixes
 * match whole graphemes, ignoring case (Elshay → El shay); a word needs minRest more graphemes,
 * so the prefix alone (el) or a short word (ela) is left as it is.
 */
const detach = (prefixes: readonly string[], minRest: number): StepFn => {
  const same = new Intl.Collator("und", { sensitivity: "accent", usage: "search" });
  const wanted = prefixes.map((p) => graphemes(p.normalize("NFC"))).sort((a, b) => b.length - a.length);
  // Repeats on what is left (elelshay → el el shay), so one pass is already a fixpoint.
  const split = (word: string): string => {
    const gs = graphemes(word);
    const prefix = wanted.find((p) => gs.length >= p.length + minRest && same.compare(gs.slice(0, p.length).join(""), p.join("")) === 0);
    return prefix === undefined ? word : `${gs.slice(0, prefix.length).join("")} ${split(gs.slice(prefix.length).join(""))}`;
  };
  return (text) => text.replace(/[^\s]+/gu, split);
};

/**
 * A space after any of `after` when a letter follows it (ADR 0095): Jyutping's tone numbers end
 * its syllables, so a learner may write them joined (hok6saang1) or spaced (hok6 saang1).
 */
const split = (after: string): StepFn => {
  const ends = new Set(Array.from(after));
  return (text) => {
    const cps = Array.from(text);
    return cps.map((c, i) => (ends.has(c) && i + 1 < cps.length && /\p{L}/u.test(cps[i + 1] ?? "") ? `${c} ` : c)).join("");
  };
};

/** A word as a run of letters and marks: what a learner types between spaces and punctuation. */
const WORD = /[\p{L}\p{M}]+/gu;

/**
 * Words typed in the script that spells them, written as logographs (ADR 0086): sitelen Lasina
 * typed into a sitelen pona answer (toki → U+F196C). A whole word that is a key, ignoring case
 * as the collator does, becomes its logograph; anything else is left as it is. Inside a
 * cartouche (its marks a grapheme each) every logograph reads as its word's first letter and the
 * marks go, so a name written in one and the name typed in Latin letters compare alike. Names are
 * read first, so a name that spells a word becomes that word's logograph on both sides.
 */
const logographs = (words: Readonly<Record<string, string>>, cartouche: { readonly open: string; readonly close: string } | undefined): StepFn => {
  const same = new Intl.Collator("und", { sensitivity: "accent", usage: "search" });
  const entries = Object.entries(words).map(([k, v]) => [k.normalize("NFC"), v.normalize("NFC")] as const);
  const exact = new Map(entries);
  const glyphOf = (word: string): string | undefined => exact.get(word) ?? entries.find(([k]) => same.compare(k, word) === 0)?.[1];
  const letterOf = new Map(entries.map(([k, v]) => [v, graphemes(k)[0] ?? ""]));
  const open = cartouche?.open.normalize("NFC");
  const close = cartouche?.close.normalize("NFC");
  const readNames = (text: string): string => {
    let out = "";
    let name: string[] | undefined;
    for (const g of graphemes(text)) {
      if (name === undefined) {
        if (g === open) name = [];
        else out += g;
      } else if (g === close) {
        out += name.map((n) => letterOf.get(n) ?? n).join("");
        name = undefined;
      } else name.push(g);
    }
    // A cartouche left open is left as it was.
    return name === undefined ? out : `${out}${open ?? ""}${name.join("")}`;
  };
  return (text) => (open === undefined ? text : readNames(text)).replace(WORD, (word) => glyphOf(word) ?? word);
};

export const compileStep = (step: NormalizeStep, numberingSystems: Readonly<Record<string, string>>): StepFn => {
  if (step === "nfc") return (t) => t.normalize("NFC");
  if ("fold-compat" in step) return foldArabicPresentationForms;
  if ("fold-width" in step) return foldWidth(step["fold-width"]);
  if ("map" in step) return literalMap(step.map);
  if ("remove" in step) return literalMap(Object.fromEntries(step.remove.map((r) => [r, ""])));
  if ("digits" in step) return digits(step.digits.canonical, step.digits.accept, numberingSystems);
  if ("punctuation" in step) return step.punctuation === "strip" ? (t) => t.replace(PUNCTUATION, "") : (t) => t;
  if ("detach" in step) return detach(step.detach.prefixes, step.detach.minRest ?? 2);
  if ("split" in step) return split(step.split.after);
  if ("logographs" in step) return logographs(step.logographs.words, step.logographs.cartouche);
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

const MAX_PASSES = 4;

/**
 * The whole pipeline: NFC and bidi-control removal first, the profile's steps,
 * NFC last ("NFC at every boundary"), repeated until the text stops changing.
 * Step order can create new matches: in uz-Latn, stripping "。" from "G。`"
 * leaves "G`", which the apostrophe map (already run) would turn into "Gʻ".
 * Running to a fixpoint makes normalization idempotent for every profile.
 */
export const compileNormalizer = (steps: readonly NormalizeStep[], numberingSystems: Readonly<Record<string, string>>): StepFn => {
  const fns = steps.map((s) => compileStep(s, numberingSystems));
  const pass: StepFn = (text) => fns.reduce((t, f) => f(t), stripBidiControls(text.normalize("NFC"))).normalize("NFC");
  return (text) => {
    let current = pass(text);
    for (let i = 1; i < MAX_PASSES; i++) {
      const next = pass(current);
      if (next === current) return current;
      current = next;
    }
    return current;
  };
};
