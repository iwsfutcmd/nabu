/**
 * Search over a course's text (the word list, the Data page): what was typed is looked for in text of
 * the language being learned as its orthography compares letters, in the readings its tokens pin, in
 * text of the support language, and in ids. One matcher, so every list finds a word the same way.
 */
import type { TaggedText } from "@nabu/schema";
import type { CompiledProfile } from "../profile/compile.ts";
import { surfaceOf } from "../text/index.ts";
import type { CourseView } from "./course.ts";

/** What a row of a list is searched by. */
export interface Searched {
  /** Text in the orthography being learned: compared by its letters, and by its tokens' readings. */
  readonly target?: readonly TaggedText[];
  /** Text in the support language (a gloss, a translation): compared case-folded in its own language. */
  readonly support?: readonly TaggedText[];
  /** Ids (a KC's, a sentence's): compared as written, whatever the case. */
  readonly ids?: readonly string[];
}

/** A reading as search compares it: lowercase, without marks, spaces or (unless typed) tone digits. */
const readingKey = (reading: string, digits: boolean): string => {
  const bare = reading.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("und").replace(/[\s'’-]/gu, "");
  return (digits ? bare : bare.replace(/\p{Nd}/gu, "")).normalize("NFC");
};

/** The readings a text's tokens pin (Jyutping, pinyin, SBL, sitelen Lasina), one after another. */
const readingsOf = (text: TaggedText): string => text.tokens.flatMap((t) => Object.values(t.readings ?? {})).join("");

/** Letters as an orthography compares them: normalized, vowel marks stripped, variants keyed, case folded. */
const lettersOf = (profile: CompiledProfile | undefined, text: string): string => {
  if (profile === undefined) return text.normalize("NFC");
  const normalized = profile.normalize(text);
  const bare = profile.marks?.strip(normalized) ?? normalized;
  return profile.fold(profile.variants?.key(bare) ?? bare);
};

/** Texts' letters, per profile: a list is searched again at every keystroke. */
const letters = new WeakMap<CompiledProfile, WeakMap<TaggedText, string>>();

const cachedLetters = (profile: CompiledProfile | undefined, text: TaggedText): string => {
  if (profile === undefined) return lettersOf(profile, surfaceOf(text));
  const byText = letters.get(profile) ?? new WeakMap<TaggedText, string>();
  letters.set(profile, byText);
  let key = byText.get(text);
  if (key === undefined) {
    key = lettersOf(profile, surfaceOf(text));
    byText.set(text, key);
  }
  return key;
};

/**
 * Whether a row matches what was typed: in its target text as the orthography compares letters
 * (سلام finds سَلام); in its readings, with or without tone digits and marks (zousan and zou2 find 早晨
 * zou2 san4); in its support text, case-folded in that text's own language; or in an id. An empty
 * query matches every row.
 */
export const textMatcher = (course: CourseView, query: string): ((row: Searched) => boolean) => {
  const q = query.normalize("NFC").trim();
  if (q === "") return () => true;
  const profile = course.profiles.get(course.orthography);
  const target = lettersOf(profile, q);
  const digits = /\p{Nd}/u.test(q);
  const reading = readingKey(q, digits);
  const id = q.toLocaleLowerCase("und");
  return (row) => {
    for (const text of row.target ?? []) {
      if (cachedLetters(profile, text).includes(target)) return true;
      if (reading !== "" && readingKey(readingsOf(text), digits).includes(reading)) return true;
    }
    for (const text of row.support ?? []) {
      if (surfaceOf(text).normalize("NFC").toLocaleLowerCase(text.lang).includes(q.toLocaleLowerCase(text.lang))) return true;
    }
    return (row.ids ?? []).some((i) => i.normalize("NFC").toLocaleLowerCase("und").includes(id));
  };
};
