/**
 * Font stylesheets loaded with the first text set in their families (ADR 0119, R7 in the 2026-11
 * review). The Han families' unicode-range faces were nine tenths of the stylesheet that blocks
 * the first paint, for every learner of every course; they are in fonts-han.css, which comes when
 * <T> or the chrome first names one of them in its font stack. Their font files still download
 * only for the characters on screen (gameplan §6.8).
 */
import { useEffect } from "react";

interface Stylesheet {
  /** The families it declares, as font stacks name them. */
  readonly families: readonly string[];
  readonly load: () => Promise<unknown>;
}

const STYLESHEETS: readonly Stylesheet[] = [{ families: ["Noto Sans HK", "Noto Serif TC"], load: () => import("./fonts-han.css") }];

const loads = new Map<Stylesheet, Promise<void>>();

const unquoted = (family: string): string => family.replace(/^["']|["']$/gu, "");

/** Whether the page declares the family already: Storybook and the landing page link every font. */
const declared = (family: string): boolean => typeof document !== "undefined" && "fonts" in document && [...document.fonts].some((f) => unquoted(f.family) === family);

/**
 * Loads the stylesheets of the families a CSS font-family list (fontStackFor's `family`) names, if
 * they load with their text. Resolves once they are in, or could not be loaded (offline before
 * they were kept): the text then shows in the next family of its stack, and a later call tries again.
 */
export const loadFonts = (fontFamily: string): Promise<void> =>
  Promise.all(
    STYLESHEETS.filter((s) => s.families.some((f) => fontFamily.includes(`"${f}"`))).map((s) => {
      const known = loads.get(s);
      if (known !== undefined) return known;
      const loading = s.families.some(declared)
        ? Promise.resolve()
        : s.load().then(
            () => undefined,
            () => {
              loads.delete(s);
            },
          );
      loads.set(s, loading);
      return loading;
    }),
  ).then(() => undefined);

/** Loads the stylesheets of the families a font-family list names, once it is on screen. */
export const useFonts = (fontFamily: string): void => {
  useEffect(() => {
    void loadFonts(fontFamily);
  }, [fontFamily]);
};
