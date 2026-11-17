/**
 * The reading layer the learner last chose for an orthography (ADR 0071): Pinyin, Jyutping, Middle
 * Chinese or none for Classical Chinese. A per-device preference in localStorage; without storage
 * every view starts from the profile's default each time. Every view that shows ruby (the player,
 * stories, the word list, the sentence list, the audio check) shows this choice through
 * defaultRuby (@nabu/ui/player).
 */
import type { SchemeId } from "@nabu/schema";

const READING_KEY = "nabu.reading.";
const TRADITION_KEY = "nabu.tradition.";

export const storedReading = (orthography: string): SchemeId | false | undefined => {
  try {
    const value = localStorage.getItem(READING_KEY + orthography);
    return value === null ? undefined : value === "" ? false : (value as SchemeId);
  } catch {
    return undefined;
  }
};

export const storeReading = (orthography: string, scheme: SchemeId | false): void => {
  try {
    localStorage.setItem(READING_KEY + orthography, scheme === false ? "" : scheme);
    // The layer shown is the tradition read in (ADR 0138); turning readings off keeps it.
    if (scheme !== false) localStorage.setItem(TRADITION_KEY + orthography, scheme);
  } catch {
    // Storage unavailable: the choice lasts this session.
  }
};

/**
 * The reading tradition the learner reads in (ADR 0138): the layer they last chose to show, kept
 * when they turn readings off. Reading cards ask it, and each tradition keeps its own progress
 * (core `plan`'s and `readingsShown`'s `reading`). Undefined before any choice: the first layer.
 */
export const storedTradition = (orthography: string): SchemeId | undefined => {
  try {
    const value = localStorage.getItem(TRADITION_KEY + orthography);
    if (value !== null && value !== "") return value as SchemeId;
  } catch {
    return undefined;
  }
  const shown = storedReading(orthography);
  return shown === false ? undefined : shown;
};
