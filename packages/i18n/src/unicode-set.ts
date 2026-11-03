/**
 * A parser for the UnicodeSet subset CLDR uses in exemplar sets (UTS #35 Part 3
 * §Exemplars): literal code points, `a-z` ranges, `{multi-character strings}`
 * and backslash escapes. Property syntax, nesting and set operations are
 * rejected loudly rather than misread.
 *
 * Returns NFC strings in document order, without duplicates.
 */
export const parseExemplarSet = (pattern: string): readonly string[] => {
  const cps = Array.from(pattern);
  if (cps[0] !== "[" || cps.at(-1) !== "]") throw new SyntaxError(`Not a UnicodeSet: ${pattern}`);
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (s: string): void => {
    const nfc = s.normalize("NFC");
    if (!seen.has(nfc)) {
      seen.add(nfc);
      out.push(nfc);
    }
  };
  let i = 1;
  const end = cps.length - 1;

  const hex = (digits: string): string => {
    const cp = Number.parseInt(digits, 16);
    if (!/^[0-9A-Fa-f]+$/.test(digits) || cp > 0x10ffff) throw new SyntaxError(`Bad escape \\${digits} in ${pattern}`);
    return String.fromCodePoint(cp);
  };

  /** Reads one code point (handling escapes) at `i`; returns it and advances. */
  const readCodePoint = (): string => {
    const c = cps[i++] as string;
    if (c !== "\\") {
      if (c === "[" || c === "$" || c === "&" || c === "^") {
        throw new SyntaxError(`Unsupported UnicodeSet syntax "${c}" in ${pattern}`);
      }
      return c;
    }
    const e = cps[i++];
    if (e === undefined) throw new SyntaxError(`Dangling backslash in ${pattern}`);
    if (e === "u" && cps[i] === "{") {
      const close = cps.indexOf("}", i);
      const body = cps.slice(i + 1, close).join("");
      i = close + 1;
      return hex(body);
    }
    if (e === "u") {
      const body = cps.slice(i, i + 4).join("");
      i += 4;
      return hex(body);
    }
    if (e === "U") {
      const body = cps.slice(i, i + 8).join("");
      i += 8;
      return hex(body);
    }
    if (e === "x" && cps[i] === "{") {
      const close = cps.indexOf("}", i);
      const body = cps.slice(i + 1, close).join("");
      i = close + 1;
      return hex(body);
    }
    if (e === "p" || e === "P" || e === "N") throw new SyntaxError(`Unsupported escape \\${e} in ${pattern}`);
    return e;
  };

  while (i < end) {
    const c = cps[i] as string;
    if (/\s/u.test(c)) {
      i++;
      continue;
    }
    if (c === "{") {
      const close = cps.indexOf("}", i);
      if (close < 0 || close > end) throw new SyntaxError(`Unclosed {string} in ${pattern}`);
      let body = "";
      i++;
      while (i < close) body += readCodePoint();
      i = close + 1;
      add(body);
      continue;
    }
    const first = readCodePoint();
    if (cps[i] === "-" && i + 1 < end) {
      i++;
      const last = readCodePoint();
      const from = first.codePointAt(0) as number;
      const to = last.codePointAt(0) as number;
      if (to < from) throw new SyntaxError(`Inverted range ${first}-${last} in ${pattern}`);
      for (let cp = from; cp <= to; cp++) add(String.fromCodePoint(cp));
      continue;
    }
    add(first);
  }
  return out;
};
