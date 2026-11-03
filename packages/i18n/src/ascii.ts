/**
 * ASCII-only case mapping for identifiers such as BCP 47 subtags, which RFC 5646
 * defines as case-insensitive over ASCII only. Never use these on language data:
 * that goes through the orthography profile's locale-aware case folding.
 */
const map = (s: string, from: number, to: number, delta: number): string => {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    out += c >= from && c <= to ? String.fromCharCode(c + delta) : s[i];
  }
  return out;
};

export const asciiLowercase = (s: string): string => map(s, 0x41, 0x5a, 0x20);
export const asciiUppercase = (s: string): string => map(s, 0x61, 0x7a, -0x20);
export const asciiTitlecase = (s: string): string =>
  s === "" ? s : asciiUppercase(s.slice(0, 1)) + asciiLowercase(s.slice(1));
