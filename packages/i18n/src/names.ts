/**
 * Names that are data, not app messages (ADR 0109): a course's and its orthographies' (course.yaml
 * `names`, in the manifest and the bundles' index), a reading scheme's and its tones'
 * (profiles/schemes). Each is given by the language it is written in. The name shown is, in order:
 *
 * 1. the data's, in the UI language or a CLDR parent of it (en-GB, en-001, en);
 * 2. a UI catalog's (`course.name.<id>`, `orthography.<id>`, `reading.scheme.<id>`): the draft
 *    catalogs translated these names before the data carried them, and the translations keep
 *    working until the data carries them too (the English catalog's copies are pinned to the
 *    data's by tests);
 * 3. the data's in the first language it gives;
 * 4. for a course or an orthography, what CLDR calls its language or script (Intl.DisplayNames);
 * 5. the id.
 */
import type { CourseNames, Names } from "@nabu/schema";
import type { Translator } from "./catalog.ts";
import { cldrLocaleId, parentChain, parseTag, scriptOf } from "./locale.ts";

/** A course as its names are looked up: its id, target language and the names it carries. */
export interface Named {
  readonly id: string;
  /** The course's target language (BCP 47): what CLDR names when the course gives no name. */
  readonly target?: string | undefined;
  readonly names?: CourseNames | undefined;
}

/** What is given in the UI language, or the nearest CLDR parent of it that it is given in. */
const inUiLanguage = <T>(t: Translator, byLanguage: Readonly<Record<string, T>> | undefined): T | undefined => {
  const chain = parentChain(t.locale);
  let best: T | undefined;
  let rank = chain.length;
  for (const [tag, value] of Object.entries(byLanguage ?? {})) {
    const at = chain.indexOf(cldrLocaleId(tag));
    if (at >= 0 && at < rank) {
      best = value;
      rank = at;
    }
  }
  return best;
};

const first = <T>(byLanguage: Readonly<Record<string, T>> | undefined): T | undefined => Object.values(byLanguage ?? {})[0];

/** A name given by language, in the UI language or a CLDR parent of it only (step 1). */
export const nameInUiLanguage = (t: Translator, names: Names | undefined): string | undefined => inUiLanguage(t, names);

/** A name given by language, as the app shows it (steps 1–3), or undefined; `key` is the catalog's message for it, if any. */
export const localName = (t: Translator, names: Names | undefined, key?: string): string | undefined => {
  const own = inUiLanguage(t, names);
  if (own !== undefined) return own;
  if (key !== undefined && t.has(key)) return t.format(key);
  return first(names);
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
  const own = inUiLanguage(t, named.names)?.course;
  if (own !== undefined) return own;
  const key = `course.name.${named.id}`;
  if (t.has(key)) return t.format(key);
  const language = languageOf(named.target);
  return first(named.names)?.course ?? (language === undefined ? undefined : displayName(t, "language", language)) ?? named.id;
};

/** One line on what the course teaches, as the course gives it (steps 1 and 3), if it gives one. */
export const courseBlurb = (t: Translator, named: Named): string | undefined => inUiLanguage(t, named.names)?.blurb ?? first(named.names)?.blurb;

/** What choosing one of the course's orthographies means, as the course gives it (steps 1 and 3), if it does. */
export const orthographyHint = (t: Translator, named: Named, orthography: string): string | undefined =>
  inUiLanguage(t, named.names)?.hints?.[orthography] ?? Object.values(named.names ?? {}).find((n) => n.hints?.[orthography] !== undefined)?.hints?.[orthography];

/** What the app calls one of the course's orthographies: Arabizi (Latin letters and numbers), Cyrillic. */
export const orthographyName = (t: Translator, named: Named, orthography: string): string => {
  const own = inUiLanguage(t, named.names)?.orthographies?.[orthography];
  if (own !== undefined) return own;
  const key = `orthography.${orthography.replace("/", ".")}`;
  if (t.has(key)) return t.format(key);
  const given = Object.values(named.names ?? {}).find((n) => n.orthographies?.[orthography] !== undefined)?.orthographies?.[orthography];
  if (given !== undefined) return given;
  const script = scriptOfOrthography(orthography);
  return (script === undefined ? undefined : displayName(t, "script", script)) ?? orthography;
};
