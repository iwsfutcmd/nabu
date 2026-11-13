/**
 * Reading schemes (ADR 0109): how a token's pinned reading is written, such as Jyutping, Pinyin,
 * Baxter's Middle Chinese or sitelen Lasina. They are data (profiles/schemes, generated into
 * @nabu/schema/schemes by `pnpm codegen`), never tables in code: what a scheme can be used for
 * follows from what it gives. Asked for or offered as options where it has an `answer`
 * orthography, typed where it gives a syllable's shape (`typed`), heard as tones where it gives
 * `tones`. The pipeline reads the same files (nabu.schemes).
 */
import type { ReadingScheme, TaggedText } from "@nabu/schema";
import data from "@nabu/schema/schemes" with { type: "json" };

const SCHEMES: ReadonlyMap<string, ReadingScheme> = new Map((data as unknown as readonly ReadingScheme[]).map((s) => [s.id, s]));

/** A reading scheme by its id (a profile's reading layer, a token's `readings` key), if there is one. */
export const readingScheme = (id: string): ReadingScheme | undefined => SCHEMES.get(id);

/** Every reading scheme, by id. */
export const readingSchemes = (): readonly ReadingScheme[] => [...SCHEMES.values()];

/**
 * How a reading in the scheme stands as text on its own, where a card may offer it or ask for it
 * (its `lang` and `answer` orthography); undefined for a scheme that is only shown (Pinyin and
 * Baxter in Classical Chinese).
 */
export const readingTag = (id: string): Pick<TaggedText, "lang" | "orthography"> | undefined => {
  const scheme = SCHEMES.get(id);
  return scheme?.answer === undefined || scheme.lang === undefined ? undefined : { lang: scheme.lang, orthography: scheme.answer };
};
