/**
 * The order a token's lexemes are written in follows from what each merges onto (ADR 0158 §2): merged outward
 * from the base, each onto the word as it stands. Every arb token pinned in conformance/realise-arb.json, its
 * lexemes given in any order, is put back by `mergeOrder` into an order that realises the same form; written
 * in an order no merge allows, it is refused.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { compileLanguage, mergeOrder, realiseToken, type WrittenLexeme } from "../src/lexicon/index.ts";

const ROOT = resolve(import.meta.dirname, "../../..");
const read = (path: string): unknown => parse(readFileSync(resolve(ROOT, path), "utf8")) as unknown;
const compiled = compileLanguage(read("lexicons/arb/language.yaml") as never, read("lexicons/arb/lexemes.yaml") as never);
if (!compiled.ok) throw new Error(String(compiled.error));
const lang = compiled.value;

interface Vector {
  readonly id: string;
  readonly args: { readonly lexemes: readonly WrittenLexeme[] };
  readonly expected: { readonly ok: boolean; readonly value?: { readonly form: string } };
}
const vectors = (JSON.parse(readFileSync(resolve(ROOT, "conformance/realise-arb.json"), "utf8")) as { vectors: readonly Vector[] }).vectors.filter(
  (v) => v.expected.ok && v.args.lexemes.length > 2,
);

/** Every order of a few lexemes, or a few rotations and reversals of many. */
const ordersOf = (ids: readonly string[]): readonly (readonly string[])[] => {
  if (ids.length <= 5) {
    const all = (rest: readonly string[]): string[][] => (rest.length === 0 ? [[]] : rest.flatMap((x, i) => all([...rest.slice(0, i), ...rest.slice(i + 1)]).map((p) => [x, ...p])));
    return all(ids);
  }
  return [ids, [...ids].reverse(), ...ids.map((_, i) => [...ids.slice(i), ...ids.slice(0, i)])];
};

describe("mergeOrder", () => {
  it("puts every pinned arb token's lexemes, picked in any order, back where they realise the same form", () => {
    expect(vectors.length).toBeGreaterThan(100);
    const wrong: string[] = [];
    for (const v of vectors) {
      const base = v.args.lexemes.find((l) => l.base === true) as WrittenLexeme;
      const others = v.args.lexemes.filter((l) => l.base !== true).map((l) => l.lexeme);
      for (const picked of ordersOf(others)) {
        const { before, after } = mergeOrder(lang, base.lexeme, base.feats ?? {}, picked);
        const r = realiseToken(lang, [...before.map((lexeme) => ({ lexeme })), base, ...after.map((lexeme) => ({ lexeme }))]);
        const form = r.ok ? r.value.form : `✗ ${r.error.kind}`;
        if (form !== v.expected.value?.form) wrong.push(`${v.id} picked ${picked.join(" ")}: ${form}`);
      }
    }
    expect(wrong.slice(0, 20)).toEqual([]);
  });

  it("refuses a word written in an order no merge allows: a suffix before the mood, the mood before the number", () => {
    const token = (...after: string[]): readonly WrittenLexeme[] => [{ lexeme: "lexeme:impf-3" }, { lexeme: "lexeme:kataba", base: true }, ...after.map((a) => ({ lexeme: `lexeme:${a}` }))];
    expect(realiseToken(lang, token("mpl", "ind", "obj-3ms")).ok).toBe(true);
    expect(realiseToken(lang, token("mpl", "obj-3ms", "ind"))).toMatchObject({ ok: false, error: { kind: "attach", lexeme: "lexeme:obj-3ms", complete: true } });
    expect(realiseToken(lang, token("ind", "mpl"))).toMatchObject({ ok: false, error: { kind: "attach", lexeme: "lexeme:ind", needs: ["Number"] } });
  });

  it("writes two that both merge onto the word as they were picked, read from the start of the word", () => {
    const order = (...picked: string[]) => mergeOrder(lang, "lexeme:kataba", {}, picked.map((p) => `lexeme:${p}`));
    expect(order("wa", "sa", "impf-3", "ms", "ind")).toEqual({ before: ["lexeme:wa", "lexeme:sa", "lexeme:impf-3"], after: ["lexeme:ms", "lexeme:ind"] });
    expect(order("ind", "obj-3ms", "ms", "impf-3").after).toEqual(["lexeme:ms", "lexeme:ind", "lexeme:obj-3ms"]);
  });
});
