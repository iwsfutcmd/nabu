/**
 * Each custom rule from gameplan §11.9 has a fixture that proves it fires
 * through the repo's real eslint.config.js: every line marked
 * `expect: nabu/<rule>` must be reported by that rule (as many times as
 * listed), and no unmarked line may be reported by any nabu rule.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";
import { rules } from "../src/eslint/index.ts";

const ROOT = resolve(import.meta.dirname, "../../..");
const FIXTURES = resolve(import.meta.dirname, "../fixtures/eslint");

const expected = (file: string): string[] =>
  readFileSync(file, "utf8")
    .split("\n")
    .flatMap((line, i) => {
      const match = /expect: ([\w/,\s-]+?)\s*(?:\*\/\}|$)/.exec(line);
      return match ? match[1]!.split(",").map((rule) => `${i + 1} ${rule.trim()}`) : [];
    })
    .sort();

describe("ESLint rule fixtures (repo config)", async () => {
  const eslint = new ESLint({ cwd: ROOT, ignore: false });
  const results = await eslint.lintFiles([`${FIXTURES}/*.ts`, `${FIXTURES}/*.tsx`]);

  it("covers every rule with its own fixture", () => {
    const files = results.map((r) => r.filePath.split("/").at(-1)!.replace(/\.tsx?$/, ""));
    expect(files.sort()).toEqual(Object.keys(rules).sort());
  });

  for (const result of results) {
    const name = result.filePath.split("/").at(-1)!;
    it(`${name}: reports exactly the marked lines`, () => {
      expect(result.messages.filter((m) => m.fatal)).toEqual([]);
      const actual = result.messages
        .filter((m) => m.ruleId?.startsWith("nabu/"))
        .map((m) => `${m.line} ${m.ruleId}`)
        .sort();
      expect(actual).toEqual(expected(result.filePath));
      const rule = `nabu/${name.replace(/\.tsx?$/, "")}`;
      expect(actual.some((a) => a.endsWith(rule))).toBe(true);
    });
  }
});
