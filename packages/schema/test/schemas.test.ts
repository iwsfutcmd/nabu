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
const COURSES_DIR = join(ROOT, "courses");
const LEXICONS_DIR = join(ROOT, "lexicons");

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

describe("reading schemes in /profiles/schemes (ADR 0109)", () => {
  const validate = makeAjv().getSchema(ID("reading-scheme.schema.json"))!;
  const paths = filesIn(join(PROFILES_DIR, "schemes"));
  for (const path of paths) {
    it(`${path.slice(ROOT.length + 1)} is valid and named by its id`, () => {
      const data = load(path);
      const ok = validate(data);
      expect(validate.errors ?? []).toEqual([]);
      expect(ok).toBe(true);
      expect(`${(data as { id: string }).id}.yaml`).toBe(path.split("/").at(-1));
    });
  }
  it("are what @nabu/schema/schemes carries (pnpm codegen)", () => {
    const generated = JSON.parse(readFileSync(resolve(import.meta.dirname, "../src/generated/schemes.json"), "utf8")) as unknown;
    expect(generated).toEqual(paths.map(load));
  });
});

describe("fixture courses in /courses", () => {
  const ajv = makeAjv();
  const course = ajv.getSchema(ID("course-source.schema.json"))!;
  const unit = ajv.getSchema(`${ID("course-source.schema.json")}#/$defs/UnitSource`)!;
  const aliases = ajv.getSchema(ID("aliases.schema.json"))!;
  const courses = readdirSync(COURSES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && readdirSync(join(COURSES_DIR, d.name)).includes("course.yaml"))
    .map((d) => d.name)
    .sort();
  it("exist", () => expect(courses).toEqual(expect.arrayContaining(["apc", "fa", "uz", "yue"])));
  for (const name of courses) {
    const dir = join(COURSES_DIR, name);
    it(`${name}/course.yaml is a valid course source`, () => {
      const ok = course(load(join(dir, "course.yaml")));
      expect(course.errors ?? []).toEqual([]);
      expect(ok).toBe(true);
    });
    for (const path of filesIn(join(dir, "units"))) {
      it(`${name}/units/${path.split("/").at(-1)} is a valid unit`, () => {
        const ok = unit(load(path));
        expect(unit.errors ?? []).toEqual([]);
        expect(ok).toBe(true);
      });
    }
    it(`${name}/aliases.yaml is a valid alias table`, () => {
      const ok = aliases(load(join(dir, "aliases.yaml")));
      expect(aliases.errors ?? []).toEqual([]);
      expect(ok).toBe(true);
    });
  }
});

describe("lexicons in /lexicons", () => {
  const ajv = makeAjv();
  const lexicon = ajv.getSchema(ID("lexicon.schema.json"))!;
  const language = ajv.getSchema(ID("language.schema.json"))!;
  const languages = readdirSync(LEXICONS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  it("exist", () => expect(languages).toEqual(expect.arrayContaining(["apc", "es", "yue"])));
  for (const name of languages) {
    it(`${name}/lexemes.yaml is a valid lexicon, sorted by id`, () => {
      const data = load(join(LEXICONS_DIR, name, "lexemes.yaml")) as { readonly language: string; readonly lexemes: readonly { readonly id: string }[] };
      const ok = lexicon(data);
      expect(lexicon.errors ?? []).toEqual([]);
      expect(ok).toBe(true);
      expect(data.language).toBe(name);
      const ids = data.lexemes.map((l) => l.id);
      expect(ids).toEqual([...ids].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
      expect(new Set(ids).size).toBe(ids.length);
    });
    it(`${name}/language.yaml is a valid declaration`, () => {
      const data = load(join(LEXICONS_DIR, name, "language.yaml")) as { readonly id: string };
      const ok = language(data);
      expect(language.errors ?? []).toEqual([]);
      expect(ok).toBe(true);
      expect(data.id).toBe(name);
    });
  }
});

// Each directory of examples and the schema it is checked against: a file's root, or one of its
// definitions. Those from `language` on are the lexical model's (docs/migration-design.md): the
// sources and events of deliverable 1 (and the events before it, which `upgrade` reads), then the
// bundle of deliverable 3.
const EXAMPLES: readonly (readonly [string, string])[] = [
  ["tagged-text", ID("tagged-text.schema.json")],
  ["orthography-profile", ID("orthography-profile.schema.json")],
  ["reading-scheme", ID("reading-scheme.schema.json")],
  ["message-catalog", ID("message-catalog.schema.json")],
  ["language", ID("language.schema.json")],
  ["lexicon", ID("lexicon.schema.json")],
  ["aliases", ID("aliases.schema.json")],
  ["course", ID("course-source.schema.json")],
  ["unit", `${ID("course-source.schema.json")}#/$defs/UnitSource`],
  ["learner-event", ID("learner-event.schema.json")],
  ["learner-event.v1", ID("learner-event.v1.schema.json")],
  ["bundle", ID("bundle.schema.json")],
  ["bundle-lexicon", `${ID("bundle.schema.json")}#/$defs/BundleLexicon`],
  ["bundle-unit", `${ID("bundle.schema.json")}#/$defs/BundleUnit`],
];

describe("examples", () => {
  const ajv = makeAjv();
  for (const [kind, schema] of EXAMPLES) {
    const validate = ajv.getSchema(schema)!;
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
