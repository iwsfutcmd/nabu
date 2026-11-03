import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { directionOf, engineDirectionOf, scriptOf } from "../src/index.ts";

interface Vector {
  readonly tag: string;
  readonly script: string;
  readonly dir: "ltr" | "rtl";
}
const { vectors } = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "../../../conformance/direction.json"), "utf8"),
) as { vectors: Vector[] };

describe("conformance/direction.json", () => {
  it.each(vectors)("$tag → $script, $dir", ({ tag, script, dir }) => {
    expect(scriptOf(tag)).toBe(script);
    expect(directionOf(tag)).toBe(dir);
  });

  // The engine's own data is a cross-check, not the source of truth. Where it
  // has an opinion, it must agree with the generated table.
  it.each(vectors)("engine agrees on $tag where it knows it", ({ tag, dir }) => {
    const engine = engineDirectionOf(tag);
    if (engine !== undefined) expect(engine).toBe(dir);
  });
});
