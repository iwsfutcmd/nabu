/**
 * The Phase 0 acceptance matrix: UI {en, en-XA, ar-XB} × target {fa,
 * yue-Hant-HK, uz-Latn, apc-Arab} × {horizontal, vertical where the profile
 * allows it}. "Allowed" is read from the real orthography profiles, so adding
 * vertical support to a profile adds its cells automatically.
 *
 * Expected directions are written out literally rather than computed with the
 * code under test.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";
import { DEMO_EXERCISES, DEMO_TARGETS, type DemoTarget } from "../../src/demo/fixtures.ts";

export type Dir = "ltr" | "rtl";
export type WritingMode = "horizontal-tb" | "vertical-rl" | "vertical-lr";

export const UI_LOCALES: Readonly<Record<string, Dir>> = { en: "ltr", "en-XA": "ltr", "ar-XB": "rtl" };
export const TARGET_DIRS: Readonly<Record<DemoTarget, Dir>> = { fa: "rtl", "yue-Hant-HK": "ltr", "uz-Latn": "ltr", "apc-Arab": "rtl" };

const PROFILES = resolve(import.meta.dirname, "../../../../profiles");

/** profiles/<lang>.<slug>.yaml holds the profile with id <lang>/<slug>. */
export const loadProfile = (orthography: string): { layout?: { vertical: string } } =>
  parse(readFileSync(resolve(PROFILES, `${orthography.replace("/", ".")}.yaml`), "utf8")) as { layout?: { vertical: string } };

export interface Cell {
  readonly ui: string;
  readonly uiDir: Dir;
  readonly target: DemoTarget;
  readonly targetLang: string;
  readonly targetDir: Dir;
  readonly writingMode: WritingMode;
  readonly name: string;
}

export const cells = (): readonly Cell[] =>
  Object.entries(UI_LOCALES).flatMap(([ui, uiDir]) =>
    (Object.keys(DEMO_TARGETS) as DemoTarget[]).flatMap((target) => {
      const exercise = DEMO_EXERCISES[DEMO_TARGETS[target]];
      if (exercise === undefined) throw new Error(`no fixture for ${target}`);
      const vertical = loadProfile(exercise.answer.orthography).layout?.vertical ?? "none";
      const modes: WritingMode[] = vertical === "none" ? ["horizontal-tb"] : ["horizontal-tb", vertical as WritingMode];
      return modes.map((writingMode) => ({
        ui,
        uiDir,
        target,
        targetLang: exercise.answer.lang,
        targetDir: TARGET_DIRS[target],
        writingMode,
        name: `${ui}__${target}__${writingMode}`,
      }));
    }),
  );

export const storyUrl = (storyId: string, globals: Readonly<Record<string, string>>): string => {
  const g = Object.entries(globals)
    .map(([k, v]) => `${k}:${v}`)
    .join(";");
  return `/iframe.html?id=${storyId}&viewMode=story&globals=${g}`;
};

export const cellGlobals = (cell: Cell): Readonly<Record<string, string>> => ({
  uiLocale: "en",
  pseudoLocale: cell.ui === "en" ? "off" : cell.ui,
  target: cell.target,
  dir: "auto",
  writingMode: cell.writingMode,
});
