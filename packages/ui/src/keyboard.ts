/**
 * The device keyboard a text field asks for (ADR 0143): its languages, best first, in its
 * `data-keyboard` attribute, which the Android app hands the keyboard app when the field takes
 * focus (Gboard then switches to that language, if the learner has it). A browser has no way to
 * ask, and the attribute does nothing there.
 */
import { keyboardLanguages } from "@nabu/i18n";
import type { OrthographyProfile } from "@nabu/schema";

/** The attribute for a field of text tagged `lang`, in an orthography with this profile (its `input.keyboard`). */
export const keyboardHint = (lang: string, profile?: Pick<OrthographyProfile, "input">): { readonly "data-keyboard"?: string } => {
  const hint = keyboardLanguages(lang, profile?.input?.keyboard).join(" ");
  return hint === "" ? {} : { "data-keyboard": hint };
};
