/**
 * fa's order follows from what each of its affixes merges onto (ADR 0158 §2; docs/rules/fa.md): after the stem its
 * tense (a zero that chooses the stem), then the person; before it mi- or be-, and na- outside them (ne-mi-ravam);
 * a noun's plural before the indefinite. Every fa token that writes a base and two lexemes or more, the lexemes that
 * merge picked in any order, is put back by `mergeOrder` into the order the token writes them; a word of its own
 * written onto its host (the ezafe, a possessive) stays outside them.
 */
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { parse } from "yaml";
import { compileLanguage, mergeOrder, realiseToken, type WrittenLexeme } from "../src/lexicon/index.ts";

const ROOT = resolve(import.meta.dirname, "../../..");
const read = (path: string): unknown => parse(readFileSync(resolve(ROOT, path), "utf8")) as unknown;

/** Every order of a few lexemes, or a few rotations and reversals of many. */
const ordersOf = (ids: readonly string[]): readonly (readonly string[])[] => {
  if (ids.length <= 5) {
    const all = (rest: readonly string[]): string[][] => (rest.length === 0 ? [[]] : rest.flatMap((x, i) => all([...rest.slice(0, i), ...rest.slice(i + 1)]).map((p) => [x, ...p])));
    return all(ids);
  }
  return [ids, [...ids].reverse(), ...ids.map((_, i) => [...ids.slice(i), ...ids.slice(0, i)])];
};

it("puts every fa token's lexemes, picked in any order, back as the token writes them", () => {
  const fa = compileLanguage(read("lexicons/fa/language.yaml") as never, read("lexicons/fa/lexemes.yaml") as never);
  if (!fa.ok) throw new Error(String(fa.error));
  const tokens = new Map<string, readonly WrittenLexeme[]>();
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (node === null || typeof node !== "object") return;
    for (const [key, value] of Object.entries(node)) {
      if (key === "lexemes" && Array.isArray(value)) {
        const written = (value as { lexeme: string; base?: boolean }[]).map((l): WrittenLexeme => ({ lexeme: `lexeme:${l.lexeme}`, ...(l.base === true && { base: true }) }));
        if (written.length > 2 && written.some((l) => l.base === true)) tokens.set(written.map((l) => l.lexeme).join(" "), written);
      } else visit(value);
    }
  };
  for (const unit of readdirSync(resolve(ROOT, "courses/fa/units"))) visit(read(`courses/fa/units/${unit}`));
  expect(tokens.size).toBeGreaterThan(30);
  const wrong: string[] = [];
  for (const [key, written] of tokens) {
    const as = realiseToken(fa.value, written);
    if (!as.ok) {
      wrong.push(`${key}: ✗ ${as.error.kind}`);
      continue;
    }
    const at = written.findIndex((l) => l.base === true);
    const base = written[at] as WrittenLexeme;
    // A word of its own written onto its host (the ezafe, a possessive: no `on`) is no merge: it stays outside, as the
    // rules explorer's `arrange` keeps it.
    const merges = (l: WrittenLexeme): boolean => fa.value.lexemes.get(l.lexeme)?.on !== undefined;
    const outsideBefore = written.slice(0, at).filter((l) => !merges(l)).map((l) => l.lexeme);
    const outsideAfter = written.slice(at + 1).filter((l) => !merges(l)).map((l) => l.lexeme);
    for (const picked of ordersOf(written.filter((l) => l.base !== true && merges(l)).map((l) => l.lexeme))) {
      const order = mergeOrder(fa.value, base.lexeme, {}, picked);
      const before = [...outsideBefore, ...order.before];
      const after = [...order.after, ...outsideAfter];
      const r = realiseToken(fa.value, [...before.map((lexeme) => ({ lexeme })), base, ...after.map((lexeme) => ({ lexeme }))]);
      const form = r.ok ? r.value.form : `✗ ${r.error.kind}`;
      if (form !== as.value.form) wrong.push(`${key} picked ${picked.join(" ")}: ${form}`);
    }
  }
  expect(wrong.slice(0, 20)).toEqual([]);
});
