/**
 * The orthography profiles the demo needs, read from /profiles at build time.
 * Phase 2's compiler will ship profiles inside bundles; until then Vite inlines
 * the YAML. The schema tests validate these same files.
 */
import type { OrthographyProfile } from "@nabu/schema";
import { parse } from "yaml";
import apc from "../../../../profiles/apc-Arab.standard.yaml?raw";
import fa from "../../../../profiles/fa-Arab.standard.yaml?raw";
import hbo from "../../../../profiles/hbo-Hebr.tiberian.yaml?raw";
import lzh from "../../../../profiles/lzh-Hant.standard.yaml?raw";
import uz from "../../../../profiles/uz-Latn.standard.yaml?raw";
import yue from "../../../../profiles/yue-Hant-HK.standard.yaml?raw";

const profiles = [fa, yue, uz, apc, lzh, hbo].map((source) => parse(source) as OrthographyProfile);

export const DEMO_ORTHOGRAPHIES: ReadonlyMap<string, OrthographyProfile> = new Map(profiles.map((p) => [p.id, p]));
