/**
 * Loads /profiles from disk: YAML → JSON Schema validation (the same schemas
 * the Python pipeline validates with) → data tables and keyboard layouts →
 * compileProfile. Node only; the client will receive profiles in bundles.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { compileProfile, type CompiledProfile, type ProfileData } from "@nabu/core";
import numberingSystems from "@nabu/i18n/generated/numbering-systems.json" with { type: "json" };
import type { DataTable, KeyboardLayout, OrthographyProfile } from "@nabu/schema";
import { Ajv2020, type ValidateFunction } from "ajv/dist/2020.js";
import { parse } from "yaml";

export const REPO = resolve(import.meta.dirname, "../../..");
const SCHEMAS = join(REPO, "schemas");
const PROFILES = join(REPO, "profiles");

const ajv = new Ajv2020({ strict: true, allErrors: true });
ajv.addKeyword({ keyword: "tsType", schemaType: "string" });
for (const f of readdirSync(SCHEMAS).filter((f) => f.endsWith(".schema.json"))) {
  ajv.addSchema(JSON.parse(readFileSync(join(SCHEMAS, f), "utf8")) as object);
}
const validator = (name: string): ValidateFunction => ajv.getSchema(`https://nabu.invalid/schemas/v0/${name}.schema.json`)!;

const load = <T>(path: string, schema: string): T => {
  const text = readFileSync(path, "utf8");
  const data = (path.endsWith(".json") ? JSON.parse(text) : parse(text)) as unknown;
  const validate = validator(schema);
  if (!validate(data)) throw new Error(`${path}: ${ajv.errorsText(validate.errors)}`);
  return data as T;
};

const files = (dir: string, ext: RegExp): string[] =>
  readdirSync(dir)
    .filter((f) => ext.test(f))
    .sort()
    .map((f) => join(dir, f));

export const loadProfileData = (): ProfileData => ({
  numberingSystems,
  tables: Object.fromEntries(files(join(PROFILES, "tables"), /\.json$/u).map((p) => load<DataTable>(p, "data-table")).map((t) => [t.id, t])),
  keyboards: Object.fromEntries(files(join(PROFILES, "keyboards"), /\.ya?ml$/u).map((p) => load<KeyboardLayout>(p, "keyboard-layout")).map((k) => [k.id, k])),
});

/** Every profile in /profiles, validated but not compiled (for shipping to a browser). */
export const loadRawProfiles = (): OrthographyProfile[] =>
  files(PROFILES, /\.ya?ml$/u).map((path) => load<OrthographyProfile>(path, "orthography-profile"));

/** Every profile in /profiles, compiled, by id. Throws with the profile's errors if any fails. */
export const loadProfiles = (data: ProfileData = loadProfileData()): ReadonlyMap<string, CompiledProfile> => {
  const out = new Map<string, CompiledProfile>();
  for (const profile of loadRawProfiles()) {
    const compiled = compileProfile(profile, data);
    if (!compiled.ok) throw new Error(`${profile.id}: ${JSON.stringify(compiled.error)}`);
    out.set(profile.id, compiled.value);
  }
  return out;
};
