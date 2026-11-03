/**
 * Phase 0 acceptance: "Introducing a physical CSS property fails CI. Test the
 * rule itself with a fixture." Lints the fixtures with the repo's own
 * stylelint.config.js (the one `pnpm lint` uses), so this fails if the plugin
 * or any rule is ever dropped from the real config.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import stylelint from "stylelint";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "../../..");
const lint = async (fixture: string) => {
  const codeFilename = resolve(ROOT, "packages/ui/src/__fixture__.module.css");
  const { results } = await stylelint.lint({
    code: readFileSync(resolve(import.meta.dirname, "../fixtures/stylelint", fixture), "utf8"),
    codeFilename,
    configFile: resolve(ROOT, "stylelint.config.js"),
    configBasedir: ROOT,
  });
  return results[0]!.warnings;
};

describe("stylelint (repo config)", () => {
  it("rejects every physical property in the fixture, one or more per rule", async () => {
    const warnings = await lint("physical.module.css");
    const lines = new Set(warnings.filter((w) => w.severity === "error").map((w) => w.line));
    const source = readFileSync(resolve(import.meta.dirname, "../fixtures/stylelint/physical.module.css"), "utf8").split("\n");
    const declarationLines = source.flatMap((l, i) => (l.startsWith(".") ? [i + 1] : []));
    expect([...lines].sort((a, b) => a - b)).toEqual(declarationLines);
    expect(new Set(warnings.map((w) => w.rule))).toEqual(
      new Set([
        "csstools/use-logical",
        "property-disallowed-list",
        "declaration-property-value-disallowed-list",
        "selector-disallowed-list",
      ]),
    );
  });

  it("accepts the logical equivalents", async () => {
    expect(await lint("logical.module.css")).toEqual([]);
  });
});
