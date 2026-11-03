import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { bundle, readSchemas, SCHEMAS_DIR } from "../scripts/bundle.ts";
import { makeReadonly } from "../scripts/readonly.ts";

const ROOT = resolve(import.meta.dirname, "../../..");
const PROFILES_DIR = join(ROOT, "profiles");
const EXAMPLES_DIR = join(SCHEMAS_DIR, "examples");

const makeAjv = (): Ajv2020 => {
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  // Annotation keyword read by json-schema-to-typescript; meaningless to validators.
  ajv.addKeyword({ keyword: "tsType", schemaType: "string" });
  for (const { schema } of readSchemas()) ajv.addSchema(schema);
  return ajv;
};

const ID = (file: string): string => `https://nabu.invalid/schemas/v0/${file}`;

const load = (path: string): unknown =>
  path.endsWith(".json") ? JSON.parse(readFileSync(path, "utf8")) : parse(readFileSync(path, "utf8"));

const filesIn = (dir: string): string[] =>
  readdirSync(dir)
    .filter((f) => /\.(json|ya?ml)$/.test(f))
    .sort()
    .map((f) => join(dir, f));

describe("schemas", () => {
  it("compile under Ajv's strict JSON Schema 2020-12 mode", () => {
    const ajv = makeAjv();
    for (const { file } of readSchemas()) expect(ajv.getSchema(ID(file))).toBeTypeOf("function");
  });

  it("bundle into one namespace", () => {
    const b = bundle(readSchemas()) as { $defs: Record<string, unknown> };
    expect(Object.keys(b.$defs)).toEqual(expect.arrayContaining(["TaggedText", "Token", "RubySegment", "OrthographyProfile", "LangTag"]));
    // The bundle is self-contained: no cross-file refs survive.
    expect(JSON.stringify(b)).not.toMatch(/"\$ref":"[^#]/);
  });

  it("reject a type name declared in two files", () => {
    const dup = [
      { file: "a.schema.json", schema: { $defs: { X: { type: "string" } } } },
      { file: "b.schema.json", schema: { $defs: { X: { type: "number" } } } },
    ];
    expect(() => bundle(dup)).toThrow(/declared in both/);
  });
});

describe("orthography profiles in /profiles", () => {
  const validate = makeAjv().getSchema(ID("orthography-profile.schema.json"))!;
  for (const path of filesIn(PROFILES_DIR)) {
    it(`${path.slice(ROOT.length + 1)} is valid`, () => {
      const ok = validate(load(path));
      expect(validate.errors ?? []).toEqual([]);
      expect(ok).toBe(true);
    });
  }
});

describe("examples", () => {
  const ajv = makeAjv();
  for (const kind of ["tagged-text", "orthography-profile", "message-catalog"]) {
    const validate = ajv.getSchema(ID(`${kind}.schema.json`))!;
    for (const path of filesIn(join(EXAMPLES_DIR, kind, "valid"))) {
      it(`${kind}/valid/${path.split("/").at(-1)} validates`, () => {
        const ok = validate(load(path));
        expect(validate.errors ?? []).toEqual([]);
        expect(ok).toBe(true);
      });
    }
    for (const path of filesIn(join(EXAMPLES_DIR, kind, "invalid"))) {
      it(`${kind}/invalid/${path.split("/").at(-1)} is rejected`, () => {
        expect(validate(load(path))).toBe(false);
      });
    }
  }
});

describe("readonly post-pass", () => {
  it("adds readonly to properties, index signatures, arrays and tuples", () => {
    const src = "export interface A {\n  /** doc */\n  x: string[];\n  y?: { [k: string]: [number, string] };\n  readonly z: readonly number[];\n}\n";
    expect(makeReadonly(src)).toBe(
      "export interface A {\n  /** doc */\n  readonly x: readonly string[];\n  readonly y?: { readonly [k: string]: readonly [number, string] };\n  readonly z: readonly number[];\n}\n",
    );
  });
});
