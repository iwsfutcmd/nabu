/**
 * uz's order follows from what each of its affixes merges onto (ADR 0158 §2; docs/rules/uz.md): stem + plural +
 * possessive + case, then a predicate's person; a verb's negative, one tense or mood, then its person. Every uz token
 * that writes a base and two lexemes or more, its lexemes picked in any order, is put back by `mergeOrder` into the
 * order the token writes them. -mi stands before or after a person (yaxshimisiz, borasizmi), so a token with it has
 * two right orders and is left out.
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

it("puts every uz token's lexemes, picked in any order, back as the token writes them", () => {
  const uz = compileLanguage(read("lexicons/uz/language.yaml") as never, read("lexicons/uz/lexemes.yaml") as never);
  if (!uz.ok) throw new Error(String(uz.error));
  const tokens = new Map<string, readonly WrittenLexeme[]>();
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (node === null || typeof node !== "object") return;
    for (const [key, value] of Object.entries(node)) {
      if (key === "lexemes" && Array.isArray(value)) {
        const written = (value as { lexeme: string; base?: boolean }[]).map((l): WrittenLexeme => ({ lexeme: `lexeme:${l.lexeme}`, ...(l.base === true && { base: true }) }));
        if (written.length > 2 && written.some((l) => l.base === true) && !written.some((l) => l.lexeme === "lexeme:q")) tokens.set(written.map((l) => l.lexeme).join(" "), written);
      } else visit(value);
    }
  };
  for (const unit of readdirSync(resolve(ROOT, "courses/uz/units"))) visit(read(`courses/uz/units/${unit}`));
  expect(tokens.size).toBeGreaterThan(40);
  const wrong: string[] = [];
  for (const [key, written] of tokens) {
    const as = realiseToken(uz.value, written);
    if (!as.ok) {
      wrong.push(`${key}: ✗ ${as.error.kind}`);
      continue;
    }
    const base = written.find((l) => l.base === true) as WrittenLexeme;
    for (const picked of ordersOf(written.filter((l) => l.base !== true).map((l) => l.lexeme))) {
      const { before, after } = mergeOrder(uz.value, base.lexeme, {}, picked);
      const r = realiseToken(uz.value, [...before.map((lexeme) => ({ lexeme })), base, ...after.map((lexeme) => ({ lexeme }))]);
      const form = r.ok ? r.value.form : `✗ ${r.error.kind}`;
      if (form !== as.value.form) wrong.push(`${key} picked ${picked.join(" ")}: ${form}`);
    }
  }
  expect(wrong.slice(0, 20)).toEqual([]);
});
