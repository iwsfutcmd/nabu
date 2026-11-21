/**
 * Homographs (ADR 0140): spellings the course reads more than one way in a reading scheme, such as
 * Chaghatay's اوزوم (üzüm "grape" / özüm "myself") or Classical Chinese 說 (shuō "speak" / yuè
 * "pleased"). A reader of the script cannot tell them apart from the spelling: the player marks them,
 * and a tap names the other readings with what they mean.
 */
import type { LexemeId, SchemeId, TaggedText, Token } from "@nabu/schema";
import { readingScheme, readingTag } from "../profile/schemes.ts";
import { allSentences, lexemesById, type CourseView } from "./course.ts";
import { baseIdOf, lexemeIdsOf } from "./lexemes.ts";
import { cardGloss } from "./templates.ts";

/** One reading of a homograph: how it is read, the lexemes read so, and what its word means (its base's gloss). */
export interface HomographReading {
  readonly reading: string;
  readonly lexemes: readonly LexemeId[];
  readonly meaning: TaggedText | undefined;
}

/**
 * Readings apart only in case (a name's capital) or in the mark that binds a word to the next (the
 * Tiberian reading's maqaf hyphen, ADR 0135) are one reading.
 */
const readingKey = (scheme: SchemeId): ((reading: string) => string) => {
  const data = readingScheme(scheme);
  const locale = data?.lang ?? data?.language;
  const bound = data?.bound?.mark;
  return (reading) => {
    const lower = reading.normalize("NFC").toLocaleLowerCase(locale);
    return bound !== undefined && lower.endsWith(bound) ? lower.slice(0, -bound.length) : lower;
  };
};

const cache = new WeakMap<CourseView, Map<string, ReadonlyMap<string, readonly HomographReading[]>>>();

/**
 * The course orthography's spellings read more than one way in `scheme` (NFC), each with its
 * readings in the order the course first reads them. A spelling read one way is not here.
 */
export const homographsOf = (course: CourseView, scheme: SchemeId): ReadonlyMap<string, readonly HomographReading[]> => {
  const byScheme = cache.get(course) ?? new Map<string, ReadonlyMap<string, readonly HomographReading[]>>();
  cache.set(course, byScheme);
  const known = byScheme.get(scheme);
  if (known !== undefined) return known;
  const lexemes = lexemesById(course);
  const keyOf = readingKey(scheme);
  const found = new Map<string, HomographReading[]>();
  for (const s of allSentences(course)) {
    for (const t of s.forms[course.orthography]?.text.tokens ?? []) {
      const reading = t.kind === "word" ? t.readings?.[scheme] : undefined;
      if (reading === undefined) continue;
      const surface = t.surface.normalize("NFC");
      const readings = found.get(surface) ?? [];
      if (readings.some((r) => keyOf(r.reading) === keyOf(reading))) continue;
      const written = lexemeIdsOf(t);
      const base = baseIdOf(t) ?? written[0];
      const gloss = base === undefined ? undefined : lexemes.get(base)?.gloss?.[course.supportKey];
      readings.push({ reading, lexemes: written, meaning: gloss === undefined ? undefined : cardGloss(gloss) });
      found.set(surface, readings);
    }
  }
  const out = new Map([...found].filter(([, readings]) => readings.length > 1));
  byScheme.set(scheme, out);
  return out;
};

/** A reading in a scheme as text of its own: tagged as the scheme's answer (zh-Latn-pinyin, chg-Latn). */
export const readingAsText = (scheme: SchemeId, reading: string, fallback: Pick<TaggedText, "lang" | "orthography">): TaggedText => ({
  ...(readingTag(scheme) ?? fallback),
  tokens: [{ surface: reading, kind: "word" }],
});

/**
 * The other readings of a word's spelling (ADR 0140): every reading the course gives it in
 * `scheme` but the word's own. None where the spelling is read one way.
 */
export const otherReadings = (course: CourseView, scheme: SchemeId, token: Token): readonly HomographReading[] => {
  const readings = homographsOf(course, scheme).get(token.surface.normalize("NFC")) ?? [];
  const own = token.readings?.[scheme];
  const keyOf = readingKey(scheme);
  return own === undefined ? readings : readings.filter((r) => keyOf(r.reading) !== keyOf(own));
};

/**
 * The other readings of the word at `index` of a text of the course's orthography (ADR 0140), as
 * texts in the scheme with what each word means: what a tapped word's gloss lists under "Also read".
 */
export const otherReadingsAt = (course: CourseView, scheme: SchemeId, text: TaggedText, index: number): readonly { readonly reading: TaggedText; readonly meaning: TaggedText | undefined }[] => {
  const token = text.tokens[index];
  if (token === undefined || token.kind !== "word" || text.orthography !== course.orthography) return [];
  return otherReadings(course, scheme, token).map((r) => ({ reading: readingAsText(scheme, r.reading, text), meaning: r.meaning }));
};
