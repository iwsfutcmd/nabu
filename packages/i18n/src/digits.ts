/**
 * Whole numbers typed in any script's decimal digits: what a Persian keyboard gives (U+06F0–U+06F9),
 * Arabic-Indic (U+0660–U+0669), Devanagari, fullwidth, ASCII, and every other Unicode Nd set.
 * Unicode encodes each set of decimal digits as ten consecutive code points from zero (a stability
 * policy), so a digit's value is its distance from the start of its run, modulo ten.
 */
import { graphemes } from "@nabu/core/text";

const DIGIT = /^\p{Nd}$/u;
/** Bidi marks and other format characters a keyboard or a paste can put around a number. */
const FORMAT = /\p{Cf}/gu;
const SPACE = /^\s+|\s+$/gu;

const isDigit = (cp: number): boolean => cp >= 0 && DIGIT.test(String.fromCodePoint(cp));

/** The value of one Nd code point and the zero of its set. */
const digitOf = (cp: number): { readonly value: number; readonly zero: number } => {
  let start = cp;
  while (isDigit(start - 1)) start -= 1;
  const value = (cp - start) % 10;
  return { value, zero: cp - value };
};

/**
 * The whole number `text` writes, in one set of decimal digits; undefined for anything else
 * (signs, separators, fractions, digits from two sets, more than fifteen digits).
 */
export const parseDigits = (text: string): number | undefined => {
  const units = graphemes(text.normalize("NFC").replace(FORMAT, "").replace(SPACE, ""));
  if (units.length === 0 || units.length > 15) return undefined;
  let zero: number | undefined;
  let n = 0;
  for (const g of units) {
    // One code point a digit: a digit with a mark on it (a keycap, say) is not a digit.
    if (!DIGIT.test(g)) return undefined;
    const d = digitOf(g.codePointAt(0) ?? 0);
    if (zero !== undefined && d.zero !== zero) return undefined;
    zero = d.zero;
    n = n * 10 + d.value;
  }
  return n;
};
