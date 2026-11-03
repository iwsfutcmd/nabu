import { graphemes } from "./graphemes.ts";

/**
 * Segments text into the orthography's letters, longest match first, falling
 * back to grapheme clusters (gameplan §6.3: Uzbek oʻ, gʻ, sh, ch and ng are
 * single letters, although oʻ is two grapheme clusters). Matching is on the
 * already case-folded text; `letters` should be given in lowercase.
 */
export const letterSegmenter = (letters: readonly string[] | undefined): ((text: string) => readonly string[]) => {
  if (letters === undefined || letters.length === 0) return (text) => graphemes(text);
  const byFirst = new Map<string, string[]>();
  for (const letter of letters) {
    const first = String.fromCodePoint(letter.codePointAt(0) as number);
    const list = byFirst.get(first) ?? [];
    list.push(letter.normalize("NFC"));
    byFirst.set(first, list);
  }
  for (const list of byFirst.values()) list.sort((a, b) => b.length - a.length);
  return (text) => {
    const out: string[] = [];
    const clusters = graphemes(text);
    let i = 0;
    while (i < clusters.length) {
      const cluster = clusters[i] as string;
      const candidates = byFirst.get(String.fromCodePoint(cluster.codePointAt(0) as number)) ?? [];
      let matched: string | undefined;
      let consumed = 1;
      for (const letter of candidates) {
        // A letter must cover whole clusters: extend cluster by cluster until it matches or overshoots.
        let joined = "";
        for (let j = i; j < clusters.length && joined.length < letter.length; j++) {
          joined += clusters[j] as string;
          if (joined === letter) {
            matched = letter;
            consumed = j - i + 1;
            break;
          }
        }
        if (matched !== undefined) break;
      }
      out.push(matched ?? cluster);
      i += consumed;
    }
    return out;
  };
};
