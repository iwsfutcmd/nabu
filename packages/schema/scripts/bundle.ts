/**
 * Merges every schema in /schemas into one JSON Schema whose `$defs` hold all
 * named types, with cross-file `$ref`s rewritten to local ones. Both code
 * generators (json-schema-to-typescript and datamodel-code-generator) consume
 * this bundle, so TypeScript and Python get the same type names.
 *
 * Type names are global: a `$defs` key, or a top-level schema's `title`, may be
 * declared only once across all files. The bundle is derived data and is never
 * checked in.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

export const SCHEMAS_DIR = resolve(import.meta.dirname, "../../../schemas");

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type JsonObject = { [key: string]: Json };

const isObject = (v: Json | undefined): v is JsonObject =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export interface SchemaFile {
  readonly file: string;
  readonly schema: JsonObject;
}

export const readSchemas = (dir: string = SCHEMAS_DIR): readonly SchemaFile[] =>
  readdirSync(dir)
    .filter((f) => f.endsWith(".schema.json"))
    .sort()
    .map((file) => ({
      file,
      schema: JSON.parse(readFileSync(join(dir, file), "utf8")) as JsonObject,
    }));

/** `title` of a top-level schema that describes a type (not a pure $defs container). */
const rootTypeName = (schema: JsonObject): string | undefined =>
  "type" in schema || "oneOf" in schema || "anyOf" in schema
    ? (schema["title"] as string)
    : undefined;

export const bundle = (files: readonly SchemaFile[]): JsonObject => {
  const owner = new Map<string, string>(); // type name → file that declares it
  const rootOf = new Map<string, string>(); // file → root type name
  const declare = (name: string, file: string): void => {
    const prev = owner.get(name);
    if (prev !== undefined) {
      throw new Error(`Type name "${name}" is declared in both ${prev} and ${file}. Type names are global.`);
    }
    owner.set(name, file);
  };
  for (const { file, schema } of files) {
    const root = rootTypeName(schema);
    if (root !== undefined) {
      declare(root, file);
      rootOf.set(file, root);
    }
    const defs = schema["$defs"];
    if (isObject(defs)) for (const name of Object.keys(defs)) declare(name, file);
  }

  const rewrite = (node: Json, file: string): Json => {
    if (Array.isArray(node)) return node.map((n) => rewrite(n, file));
    if (!isObject(node)) return node;
    const out: JsonObject = {};
    for (const [key, value] of Object.entries(node)) {
      if (key === "$ref" && typeof value === "string") {
        out[key] = rewriteRef(value, file);
      } else {
        out[key] = rewrite(value, file);
      }
    }
    return out;
  };

  const rewriteRef = (ref: string, file: string): string => {
    const [target = "", pointer = ""] = ref.split("#");
    const targetFile = target === "" ? file : target;
    if (pointer === "" || pointer === "/") {
      const root = rootOf.get(targetFile);
      if (root === undefined) throw new Error(`${file}: $ref "${ref}" points at a schema with no root type`);
      return `#/$defs/${root}`;
    }
    const match = /^\/\$defs\/([^/]+)$/.exec(pointer);
    if (match === null) throw new Error(`${file}: only refs to whole schemas or to $defs entries are supported, got "${ref}"`);
    const name = match[1] as string;
    if (owner.get(name) !== targetFile) throw new Error(`${file}: $ref "${ref}" does not resolve`);
    return `#/$defs/${name}`;
  };

  const defs: JsonObject = {};
  for (const { file, schema } of files) {
    const { $defs, $schema: _s, $id: _i, $comment: _c, ...rest } = schema;
    const root = rootOf.get(file);
    if (root !== undefined) defs[root] = rewrite(rest, file);
    if (isObject($defs)) {
      for (const [name, def] of Object.entries($defs)) defs[name] = rewrite(def, file);
    }
  }
  const roots = [...rootOf.values()];
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "NabuSchemaBundle",
    description: "Every Nabu document type. Generated from /schemas; do not edit.",
    anyOf: roots.map((name) => ({ $ref: `#/$defs/${name}` })),
    $defs: defs,
  };
};
