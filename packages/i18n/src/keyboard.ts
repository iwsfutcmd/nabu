/**
 * The languages a text field asks the device keyboard for (ADR 0143): the hint Android hands the
 * keyboard app (EditorInfo#hintLocales), so that Gboard switches to Persian for a Persian answer,
 * as it does in Google Translate. The list is in order of preference; the Android app puts first
 * the first one the learner's keyboard has, since Gboard acts on the first alone. The learner's
 * own choice of keyboard always wins.
 */
import macrolanguages from "./generated/macrolanguages.json" with { type: "json" };
import { cldrLocaleId, formatTag, parseTag, scriptOf } from "./locale.ts";

const MACRO = macrolanguages as Readonly<Record<string, string>>;

/**
 * The languages to ask the keyboard for while typing text tagged `lang`, best first, each as its
 * CLDR locale id (the script only where it is not the language's own: uz-Cyrl, but fa):
 *
 * 1. The text's own language: a keyboard of the language itself, where there is one.
 * 2. With the keyboard its orthography's profile names (`input.keyboard`, cldr-kbd:he for
 *    Biblical Hebrew, cldr-kbd:fa for Chaghatay): that keyboard's language. Where it is another
 *    language's and the text is Latin (Toki Pona, Jyutping, Pinyin, Schluessel's transliteration),
 *    a Latin keyboard of no language comes first (und-Latn: Gboard's Alphabet), since the
 *    orthography only borrows that language's letters. Nothing further is guessed: a romanization
 *    is never sent to a Chinese keyboard.
 * 3. Without one: its macrolanguage in the same script and region, from CLDR's data (apc-Arab: ar;
 *    yue-Hant-HK: zh-Hant-HK; lzh-Hant: zh-Hant).
 * 4. Any keyboard of its script (und-Arab, und-Latn, und-Hant).
 *
 * A malformed tag gives nothing.
 */
export const keyboardLanguages = (lang: string, keyboard?: string): readonly string[] => {
  const out: string[] = [];
  const add = (tag: string): void => {
    const id = cldrLocaleId(tag);
    if (!out.includes(id)) out.push(id);
  };
  try {
    const t = parseTag(lang);
    if (t.language === "und") return [];
    const script = scriptOf(lang);
    add(lang);
    if (keyboard !== undefined) {
      const named = keyboard.replace(/^cldr-kbd:/u, "");
      if (script === "Latn" && parseTag(named).language !== t.language) add("und-Latn");
      add(named);
    } else {
      const macro = MACRO[t.language];
      if (macro !== undefined) add(formatTag({ language: macro, ...(script !== undefined && { script }), ...(t.region !== undefined && { region: t.region }), variants: [], extensions: [] }));
    }
    if (script !== undefined) add(`und-${script}`);
    return out;
  } catch {
    return [];
  }
};
