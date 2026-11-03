/**
 * Units as tap-to-gloss and hint lookup match them (gameplan §7.5 stage 7): the
 * runtime units of normalized text, case-folded, with the marks the profile
 * ignores in matching stripped. The compiler's glossary simulation uses the
 * same function through core-cli, so كتابِ finds the entry كتاب in both places.
 */
import type { CompiledProfile } from "../profile/compile.ts";

export const glossUnits = (profile: CompiledProfile, text: string): readonly string[] => {
  const strip = profile.marks?.policy === "ignore" ? profile.marks.strip : undefined;
  return profile.units(profile.normalize(text)).map((unit) => {
    const folded = profile.fold(unit);
    return strip === undefined ? folded : strip(folded);
  });
};
