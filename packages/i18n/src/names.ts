/**
 * Names that are data, not app messages (ADR 0109): a course's and its orthographies' (course.yaml
 * `names`, in the manifest and the bundles' index), a reading scheme's and its tones'
 * (profiles/schemes). Each is given by the language it is written in; no UI catalog carries one.
 * The name shown is, in order:
 *
 * 1. the data's, in the UI language or a CLDR parent of it (en-GB, en-001, en);
 * 2. the data's in English, as the app's messages fall back to English;
 * 3. the data's in the first language it gives;
 * 4. for a course or an orthography, what CLDR calls its language or script (Intl.DisplayNames);
 * 5. the id.
 *
 * A pseudo-locale (en-XA, ar-XB) is English made strange: it shows the English names, pseudo-localized
 * as its messages are, so the visual matrix still sees names grow and mirror. It never shows the
 * names of the language its tag starts with (ar-XB is not Arabic).
 */
import type { CourseNames, SchemeNames } from "@nabu/schema";
import { DEFAULT_UI_LOCALE, isPseudoLocale, PSEUDO_SOURCE, type Translator } from "./catalog.ts";
import { cldrLocaleId, parentChain, parseTag, scriptOf } from "./locale.ts";
import { pseudoLocalizeText } from "./pseudo.ts";

/** A course as its names are looked up: its id, target language and the names it carries. */
export interface Named {
  readonly id: string;
  /** The course's target language (BCP 47): what CLDR names when the course gives no name. */
  readonly target?: string | undefined;
  readonly names?: CourseNames | undefined;
}

/** A reading scheme's names, by language (profiles/schemes `names`). */
export type SchemeNamesByLanguage = Readonly<Record<string, SchemeNames>>;

/** The languages a name is looked for in, best first: the UI language's CLDR chain, then English's. */
const languagesOf = (t: Translator): readonly string[] => {
  const own = parentChain(isPseudoLocale(t.locale) ? PSEUDO_SOURCE : t.locale);
  return [...own, ...parentChain(DEFAULT_UI_LOCALE).filter((tag) => !own.includes(tag))];
};

/** What `get` finds in names given by language, as the app shows it (steps 1–3), or undefined. */
const pick = <N>(t: Translator, byLanguage: Readonly<Record<string, N>> | undefined, get: (names: N) => string | undefined): string | undefined => {
  const languages = languagesOf(t);
  let best: string | undefined;
  let rank = languages.length;
  let first: string | undefined;
  for (const [tag, names] of Object.entries(byLanguage ?? {})) {
    const value = get(names);
    if (value === undefined) continue;
    first ??= value;
    const at = languages.indexOf(cldrLocaleId(tag));
    if (at >= 0 && at < rank) {
      best = value;
      rank = at;
    }
  }
  const found = best ?? first;
  return found === undefined || !isPseudoLocale(t.locale) ? found : pseudoLocalizeText(found, t.locale);
};

/** CLDR's name of a language or a script in the UI language, if it has one. */
const displayName = (t: Translator, type: "language" | "script", code: string): string | undefined => {
  try {
    return new Intl.DisplayNames([t.formattingLocale], { type, fallback: "none" }).of(code);
  } catch {
    return undefined;
  }
};

const languageOf = (tag: string | undefined): string | undefined => {
  try {
    return tag === undefined ? undefined : parseTag(tag).language;
  } catch {
    return undefined;
  }
};

const scriptOfOrthography = (orthography: string): string | undefined => {
  try {
    return scriptOf(orthography.split("/")[0] ?? "");
  } catch {
    return undefined;
  }
};

/** What the app calls the course: Cantonese, Lebanese Arabic. */
export const courseName = (t: Translator, named: Named): string => {
  const own = pick(t, named.names, (n) => n.course);
  if (own !== undefined) return own;
  const language = languageOf(named.target);
  return (language === undefined ? undefined : displayName(t, "language", language)) ?? named.id;
};

/** One line on what the course teaches, as the course gives it, if it gives one. */
export const courseBlurb = (t: Translator, named: Named): string | undefined => pick(t, named.names, (n) => n.blurb);

/** What choosing one of the course's orthographies means, as the course gives it, if it does. */
export const orthographyHint = (t: Translator, named: Named, orthography: string): string | undefined => pick(t, named.names, (n) => n.hints?.[orthography]);

/** What the app calls one of the course's orthographies: Arabizi (Latin letters and numbers), Cyrillic. */
export const orthographyName = (t: Translator, named: Named, orthography: string): string => {
  const own = pick(t, named.names, (n) => n.orthographies?.[orthography]);
  if (own !== undefined) return own;
  const script = scriptOfOrthography(orthography);
  return (script === undefined ? undefined : displayName(t, "script", script)) ?? orthography;
};

/** What the app calls a reading scheme, from its data: Pinyin, Middle Chinese (Baxter). */
export const schemeName = (t: Translator, names: SchemeNamesByLanguage | undefined): string | undefined => pick(t, names, (n) => n.scheme);

/** What the app calls a tone's pitch, from its scheme's data: high level, low rising. */
export const toneName = (t: Translator, names: SchemeNamesByLanguage | undefined, tone: string): string | undefined => pick(t, names, (n) => n.tones?.[tone]);
