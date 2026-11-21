import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const MAIN = resolve(import.meta.dirname, "../src/main.ts");

describe("core-cli", () => {
  it("answers JSON lines in order", () => {
    const input = ['{"id":1,"op":"ping"}', '{"id":2,"op":"graphemes","text":"e\\u0301\\u06A9"}', "nope", '{"id":3,"op":"x"}'].join("\n");
    const out = execFileSync(process.execPath, [MAIN], { input, encoding: "utf8" })
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l) as unknown);
    expect(out).toEqual([
      { id: 1, ok: true, result: "pong" },
      { id: 2, ok: true, result: ["é", "ک"] },
      { id: null, ok: false, error: "invalid JSON" },
      { id: 3, ok: false, error: "unknown op" },
    ]);
  });

  it("answers a batch with a response for each request, in order", () => {
    const input = '{"id":7,"op":"batch","requests":[{"op":"ping"},{"op":"x"},{"op":"batch","requests":[]}]}';
    const out = JSON.parse(execFileSync(process.execPath, [MAIN], { input, encoding: "utf8" }).trim()) as unknown;
    expect(out).toEqual({
      id: 7,
      ok: true,
      result: [
        { id: null, ok: true, result: "pong" },
        { id: null, ok: false, error: "unknown op" },
        { id: null, ok: false, error: "invalid request" },
      ],
    });
  });
});
