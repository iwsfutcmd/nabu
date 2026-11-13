/**
 * The reading layer the learner last chose for an orthography (ADR 0071): Pinyin, Jyutping, Middle
 * Chinese or none for Classical Chinese. A per-device preference in localStorage; without storage
 * every view starts from the profile's default each time. Every view that shows ruby (the player,
 * stories, the word list, the sentence list, the audio check) shows this choice through
 * defaultRuby (@nabu/ui/player).
 */
import type { SchemeId } from "@nabu/schema";

const READING_KEY = "nabu.reading.";

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
  } catch {
    // Storage unavailable: the choice lasts this session.
  }
};
