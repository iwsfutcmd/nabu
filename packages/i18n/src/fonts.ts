/**
 * Font stacks and line-height tokens per script (gameplan §6.8). An
 * orthography profile's `fonts` wins; otherwise the script default applies.
 */
import type { Fonts } from "@nabu/schema";
import stacks from "../data/font-stacks.json" with { type: "json" };
import { scriptOf } from "./locale.ts";

export interface FontStack {
  /** A CSS font-family value, quoted, ending with the generic family. */
  readonly family: string;
  readonly lineHeight: number;
}

interface StackData {
  readonly stack: readonly string[];
  readonly lineHeight: number;
}

const SCRIPTS = stacks.scripts as Readonly<Record<string, StackData>>;
const UI = stacks.ui as Readonly<Record<string, StackData>> & { default: StackData };

const css = (families: readonly string[]): string =>
  [...families.map((f) => `"${f.replaceAll('"', "")}"`), stacks.generic].join(", ");

/** The stack for language data in `tag`, honouring the orthography profile's fonts if given. */
export const fontStackFor = (tag: string, profileFonts?: Fonts): FontStack => {
  const script = scriptOf(tag);
  const byScript = script === undefined ? undefined : SCRIPTS[script];
  const stack = profileFonts?.stack ?? byScript?.stack ?? UI.default.stack;
  const lineHeight = profileFonts?.lineHeight ?? byScript?.lineHeight ?? UI.default.lineHeight;
  return { family: css(stack), lineHeight };
};

/** The stack for UI chrome in a UI locale. */
export const uiFontStack = (uiLocale: string): FontStack => {
  const script = scriptOf(uiLocale);
  const data = (script !== undefined ? UI[script] : undefined) ?? UI.default;
  return { family: css(data.stack), lineHeight: data.lineHeight };
};
