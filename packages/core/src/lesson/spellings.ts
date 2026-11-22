/**
 * The other spellings a spelling card may offer for a word (ADR 0142, 0148): one implementation,
 * read by the card (`makeSpellingChoice`) and, through core-cli `spelling-others`, by the compiler,
 * which writes a lexeme's spelling leftover where its first spelling has one.
 */
import type { SchemeId, Token } from "@nabu/schema";
import type { CompiledProfile } from "../profile/compile.ts";
import { graphemes } from "../text/graphemes.ts";
import { allSentences, profileOf, type CourseView } from "./course.ts";
import { profileTraditions } from "./traditions.ts";

/** Each character a reading layer reads, by its reading (Jyutping): a character's homophones. */
export type Homophones = ReadonlyMap<string, readonly string[]>;

/**
 * The scheme whose readings tell homophone characters: where the profile knows homophones
 * (`match.homophones`), its first reading tradition (the course's first reading layer).
 */
export const homophoneScheme = (profile: CompiledProfile): SchemeId | undefined => (profile.homophones === undefined ? undefined : profileTraditions(profile)[0]);

/**
 * The characters a course attests for each reading, from its tokens' ruby in the scheme, in the
 * order given: each segment over one character, by its reading.
 */
export const homophoneTable = (tokens: Iterable<Pick<Token, "ruby">>, scheme: SchemeId): Homophones => {
  const out = new Map<string, string[]>();
  for (const t of tokens) {
    for (const seg of t.ruby?.[scheme] ?? []) {
      const base = seg.base.normalize("NFC");
      if (graphemes(base).length !== 1) continue;
      const chars = out.get(seg.text) ?? [];
      if (!chars.includes(base)) out.set(seg.text, [...chars, base]);
    }
  }
  return out;
};

const courseTables = new WeakMap<CourseView, Homophones>();

/** The homophone characters of a course's sentences in its orthography (built once per course); none where its profile knows none. */
export const courseHomophones = (course: CourseView): Homophones | undefined => {
  const scheme = homophoneScheme(profileOf(course, course.orthography));
  if (scheme === undefined) return undefined;
  let found = courseTables.get(course);
  if (found === undefined) {
    found = homophoneTable(
      allSentences(course).flatMap((s) => s.forms[course.orthography]?.text.tokens ?? []),
      scheme,
    );
    courseTables.set(course, found);
  }
  return found;
};

/**
 * A word's spelling with one place traded for another way of writing its sound (ADR 0142, 0148), in
 * a stable order: what the profile's statement gives (`projection.spellings`: a fixed
 * correspondence's other letter, Persian صد as سد, ثد, Spanish vaca as baca; a silent letter left out,
 * hola as ola), its marks and capital kept, never a free variant; or, where the profile knows
 * homophone characters (`homophones`, the course's: `courseHomophones`), a character for another the
 * course reads alike in its first reading layer (Cantonese 衫 saam1 as 三). Never the word itself or
 * one of its variants; none where nothing in it could be written otherwise. One such spelling is
 * enough for a spelling card, and for a spelling leftover.
 */
export const otherSpellings = (profile: CompiledProfile, token: Pick<Token, "surface" | "variants" | "ruby">, homophones: Homophones | undefined): readonly string[] => {
  const surface = token.surface.normalize("NFC");
  const out: string[] = [];
  const own = new Set([surface, ...(token.variants ?? []).map((v) => v.normalize("NFC"))]);
  const add = (spelling: string): void => {
    const s = spelling.normalize("NFC");
    if (!own.has(s) && !out.includes(s)) out.push(s);
  };
  const projection = profile.projection;
  if (projection?.from === "spelling") for (const s of projection.spellings(surface)) add(s);
  const scheme = homophoneScheme(profile);
  const segments = scheme === undefined ? undefined : token.ruby?.[scheme];
  if (homophones !== undefined && segments !== undefined) {
    segments.forEach((seg, i) => {
      for (const other of homophones.get(seg.text) ?? []) {
        if (other !== seg.base) add(segments.map((x, k) => (k === i ? other : x.base)).join(""));
      }
    });
  }
  return out;
};
