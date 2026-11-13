/**
 * What the app calls a course and its orthographies (ADR 0109). Names are course data: course.yaml
 * `names`, by the language they are written in, shipped in the manifest and the bundles' index. A
 * new course needs no app message. The name shown is, in order:
 *
 * 1. the course's own, in the UI language or a CLDR parent of it (en-GB, en-001, en);
 * 2. a UI catalog's (`course.name.<id>`, `orthography.<id>`): the draft catalogs translated the
 *    names before courses carried them, and those translations keep working until the courses
 *    carry them too (the English catalog's copies are pinned to the courses' own by a test);
 * 3. the course's own in the first language it gives (its support language);
 * 4. what CLDR calls the language or the script in the UI language (Intl.DisplayNames);
 * 5. the id.
 */
import type { CourseNames } from "@nabu/schema";
import type { Translator } from "./catalog.ts";
import { cldrLocaleId, parentChain, parseTag, scriptOf } from "./locale.ts";

/** A course as its names are looked up: its id, target language and the names it carries. */
export interface Named {
  readonly id: string;
  /** The course's target language (BCP 47): what CLDR names when the course gives no name. */
  readonly target?: string | undefined;
  readonly names?: CourseNames | undefined;
}

type Names = NonNullable<CourseNames[string]>;

/** The course's names in the UI language or the nearest CLDR parent of it that it gives. */
const inUiLanguage = (t: Translator, named: Named): Names | undefined => {
  const chain = parentChain(t.locale);
  let best: Names | undefined;
  let rank = chain.length;
  for (const [tag, names] of Object.entries(named.names ?? {})) {
    const at = chain.indexOf(cldrLocaleId(tag));
    if (at >= 0 && at < rank) {
      best = names;
      rank = at;
    }
  }
  return best;
};

const first = (named: Named): Names | undefined => Object.values(named.names ?? {})[0];

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

/** What the app calls the course: Cantonese, Lebanese Arabic. */
export const courseName = (t: Translator, named: Named): string => {
  const own = inUiLanguage(t, named)?.course;
  if (own !== undefined) return own;
  const key = `course.name.${named.id}`;
  if (t.has(key)) return t.format(key);
  const language = languageOf(named.target);
  return first(named)?.course ?? (language === undefined ? undefined : displayName(t, "language", language)) ?? named.id;
};

/** What the app calls one of the course's orthographies: Arabizi (Latin letters and numbers), Cyrillic. */
export const orthographyName = (t: Translator, named: Named, orthography: string): string => {
  const own = inUiLanguage(t, named)?.orthographies?.[orthography];
  if (own !== undefined) return own;
  const key = `orthography.${orthography.replace("/", ".")}`;
  if (t.has(key)) return t.format(key);
  const given = Object.values(named.names ?? {}).find((n) => n.orthographies?.[orthography] !== undefined)?.orthographies?.[orthography];
  if (given !== undefined) return given;
  const script = (() => {
    try {
      return scriptOf(orthography.split("/")[0] ?? "");
    } catch {
      return undefined;
    }
  })();
  return (script === undefined ? undefined : displayName(t, "script", script)) ?? orthography;
};
