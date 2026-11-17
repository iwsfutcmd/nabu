/**
 * The languages a text field asks the device keyboard for (ADR 0143): the hint Android hands the
 * keyboard app (EditorInfo#hintLocales), so that Gboard switches to Persian for a Persian answer,
 * as it does in Google Translate. A keyboard app takes the first language it has a keyboard for,
 * or none; the learner's own choice of keyboard always wins.
 */
import macrolanguages from "./generated/macrolanguages.json" with { type: "json" };
import { cldrLocaleId, formatTag, parseTag, scriptOf } from "./locale.ts";

const MACRO = macrolanguages as Readonly<Record<string, string>>;

/**
 * The languages to ask the keyboard for while typing text tagged `lang`, best first, each as its
 * CLDR locale id (the script only where it is not the language's own: uz-Cyrl, but fa).
 *
 * - With the keyboard its orthography's profile names (`input.keyboard`, cldr-kbd:he for Biblical
 *   Hebrew): that keyboard's language, then the text's own. A person chose that keyboard as the
 *   one the orthography is typed on (Toki Pona, Jyutping and Pinyin on a Latin one), so nothing
 *   further is guessed.
 * - Without one: the text's language, then its macrolanguage in the same script and region
 *   (CLDR: apc-Arab: apc, ar; yue-Hant-HK: yue-HK, zh-Hant-HK; lzh-Hant: lzh, zh-Hant), for a
 *   keyboard app with no keyboard for the language itself.
 *
 * A malformed tag gives nothing.
 */
export const keyboardLanguages = (lang: string, keyboard?: string): readonly string[] => {
  const out: string[] = [];
  const add = (tag: string): void => {
    const id = cldrLocaleId(tag);
    if (id !== "und" && !out.includes(id)) out.push(id);
  };
  try {
    if (keyboard !== undefined) {
      add(keyboard.replace(/^cldr-kbd:/u, ""));
      add(lang);
      return out;
    }
    add(lang);
    const t = parseTag(lang);
    const macro = MACRO[t.language];
    const script = scriptOf(lang);
    if (macro !== undefined) add(formatTag({ language: macro, ...(script !== undefined && { script }), ...(t.region !== undefined && { region: t.region }), variants: [], extensions: [] }));
    return out;
  } catch {
    return [];
  }
};
