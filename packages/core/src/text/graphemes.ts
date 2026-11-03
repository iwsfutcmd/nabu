/**
 * Grapheme utilities. User-visible text is never indexed, sliced, reversed or
 * counted by UTF-16 code unit or code point (CLAUDE.md); use these instead.
 * Phase 0 keeps this minimal; Phase 1 adds orthography-aware letter
 * segmentation (profile `letters`, longest match first).
 */
const segmenters = new Map<string, Intl.Segmenter>();

const segmenter = (locale: string | undefined): Intl.Segmenter => {
  const key = locale ?? "";
  let s = segmenters.get(key);
  if (s === undefined) {
    s = new Intl.Segmenter(locale, { granularity: "grapheme" });
    segmenters.set(key, s);
  }
  return s;
};

/** Extended grapheme clusters of `text`, in logical order. */
export const graphemes = (text: string, locale?: string): readonly string[] =>
  Array.from(segmenter(locale).segment(text), (s) => s.segment);

/** Number of extended grapheme clusters. */
export const graphemeCount = (text: string, locale?: string): number => {
  let n = 0;
  for (const _ of segmenter(locale).segment(text)) n++;
  return n;
};
