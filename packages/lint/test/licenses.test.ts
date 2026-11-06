import { describe, expect, it } from "vitest";
import { mayShip, parseSpdx, refused } from "../src/licenses.ts";

describe("the license check", () => {
  it("lets permissive licenses ship", () => {
    for (const l of ["MIT", "Apache-2.0", "BSD-3-Clause", "ISC", "0BSD", "CC0-1.0"]) expect(mayShip(l), l).toBe(true);
  });

  it("refuses copyleft, unknown and missing licenses (the fixture that proves it fires)", () => {
    for (const l of ["GPL-3.0", "GPL-2.0+", "AGPL-3.0-only", "LGPL-2.1", "MPL-2.0", "SSPL-1.0", "CC-BY-SA-4.0", "Unknown", "UNLICENSED", "", undefined]) {
      expect(mayShip(l), String(l)).toBe(false);
    }
  });

  it("reads SPDX expressions: one side of an OR, both sides of an AND", () => {
    expect(mayShip("MIT OR GPL-3.0")).toBe(true);
    expect(mayShip("(MIT OR Apache-2.0)")).toBe(true);
    expect(mayShip("MIT AND GPL-3.0")).toBe(false);
    expect(mayShip("(MIT AND BSD-3-Clause) OR GPL-2.0")).toBe(true);
    expect(mayShip("GPL-2.0 WITH Classpath-exception-2.0")).toBe(false);
    expect(mayShip("MIT OR")).toBe(false);
    expect(parseSpdx("MIT OR (Apache-2.0 AND ISC)")).toEqual({
      op: "or",
      left: { op: "license", id: "MIT" },
      right: { op: "and", left: { op: "license", id: "Apache-2.0" }, right: { op: "license", id: "ISC" } },
    });
  });

  it("lists what may not ship from pnpm's listing", () => {
    const listing = {
      MIT: [{ name: "fine", versions: ["1.0.0"] }],
      "GPL-3.0": [{ name: "copyleft", versions: ["2.1.0"] }],
      Unknown: [{ name: "mystery", versions: ["0.1.0"] }],
    };
    expect(refused(listing)).toEqual([
      { name: "copyleft", version: "2.1.0", license: "GPL-3.0" },
      { name: "mystery", version: "0.1.0", license: "Unknown" },
    ]);
  });
});
