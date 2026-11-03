/**
 * Script metadata and text direction. Direction comes from the script, never
 * from a language name (gameplan §6.2): scriptOf(tag) → CLDR scriptMetadata.
 */
import scriptMetadata from "./generated/script-metadata.json" with { type: "json" };
import overlay from "../data/script-overlay.json" with { type: "json" };
import { scriptOf } from "./locale.ts";

export type Direction = "ltr" | "rtl";
export type VerticalMode = "vertical-rl" | "vertical-lr";

export interface ScriptInfo {
  readonly code: string;
  readonly rank: number;
  readonly sample: string;
  /** null when CLDR says UNKNOWN (Zyyy, Zinh, Brai…) */
  readonly rtl: boolean | null;
  /** Line breaks may occur between letters (no spaces between words). */
  readonly lbLetters: boolean | null;
  readonly hasCase: boolean | null;
  readonly shaping: "required" | "minimal" | "none" | null;
  /** An IME is required to type the script. */
  readonly ime: boolean | null;
  readonly density: number | null;
  readonly originCountry: string;
  readonly likelyLanguage: string;
  /** From the hand-maintained overlay, not CLDR: which vertical mode the script supports. */
  readonly vertical?: { readonly mode: VerticalMode; readonly policy: "toggle" | "always" };
}

const SCRIPTS = scriptMetadata as Readonly<Record<string, Omit<ScriptInfo, "code" | "vertical">>>;
const VERTICAL = overlay.vertical as Readonly<Record<string, { mode: VerticalMode; policy: "toggle" | "always" }>>;

export const scriptInfo = (code: string): ScriptInfo | undefined => {
  const s = SCRIPTS[code];
  if (s === undefined) return undefined;
  const vertical = VERTICAL[code];
  return { code, ...s, ...(vertical && { vertical }) };
};

/** Base direction of text in a language tag, from its (explicit or likely) script. */
export const directionOf = (tag: string): Direction => {
  const script = scriptOf(tag);
  return script !== undefined && scriptInfo(script)?.rtl === true ? "rtl" : "ltr";
};

/**
 * What the engine thinks, via Intl.Locale#getTextInfo (Baseline 2026) or the
 * older `textInfo` getter. Used only to cross-check the generated table.
 */
export const engineDirectionOf = (tag: string): Direction | undefined => {
  type WithTextInfo = Intl.Locale & { getTextInfo?: () => { direction?: string }; textInfo?: { direction?: string } };
  try {
    const locale = new Intl.Locale(tag) as WithTextInfo;
    const info = typeof locale.getTextInfo === "function" ? locale.getTextInfo() : locale.textInfo;
    const dir = info?.direction;
    return dir === "rtl" || dir === "ltr" ? dir : undefined;
  } catch {
    return undefined;
  }
};
