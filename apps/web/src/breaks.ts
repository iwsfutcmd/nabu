/**
 * Listening and speaking, off (§10). "Can't listen now" and "Can't speak now" put them off for an
 * hour (a break). Preferences turns them off until the learner turns them back on (S8 in the 2026-11
 * review): for a learner who cannot hear the clips, or has no microphone, and would otherwise press
 * the button every hour. Either way new sessions leave those exercises out (the planner's `exclude`),
 * and with listening off nothing plays by itself.
 *
 * Listening turned off for good is also left out of what words are asked for and of what is due
 * (D41): no session can practise it, so a word is known without being heard, and listening that
 * has faded is never due or slipping. A break changes neither.
 *
 * Per-device conveniences, as sound and the theme are: they live in localStorage, and without
 * storage they last the page.
 */
import { LISTENING, SPEAKING, type Facet, type TemplateId } from "@nabu/core/lesson";

export type Modality = "listening" | "speaking";
const BREAK_KEYS: Readonly<Record<Modality, string>> = { listening: "nabu.listening-off-until", speaking: "nabu.speaking-off-until" };
export const BREAK_MS = 3_600_000;
const breakFallback: Record<Modality, number> = { listening: 0, speaking: 0 };

export const breakUntil = (m: Modality): number => {
  try {
    return Number(localStorage.getItem(BREAK_KEYS[m]) ?? 0);
  } catch {
    return breakFallback[m];
  }
};

export const setBreakUntil = (m: Modality, until: number): void => {
  breakFallback[m] = until;
  try {
    if (until === 0) localStorage.removeItem(BREAK_KEYS[m]);
    else localStorage.setItem(BREAK_KEYS[m], String(until));
  } catch {
    // Storage unavailable: the in-memory value above still holds for this page.
  }
};

export const onBreak = (m: Modality): boolean => breakUntil(m) > Date.now();

const OFF_KEYS: Readonly<Record<Modality, string>> = { listening: "nabu.listening", speaking: "nabu.speaking" };
const offFallback: Record<Modality, boolean> = { listening: false, speaking: false };

/** Whether the learner turned this off in Preferences (on until they do). */
export const turnedOff = (m: Modality): boolean => {
  try {
    return localStorage.getItem(OFF_KEYS[m]) === "off";
  } catch {
    return offFallback[m];
  }
};

export const setTurnedOff = (m: Modality, off: boolean): void => {
  offFallback[m] = off;
  try {
    if (off) localStorage.setItem(OFF_KEYS[m], "off");
    else localStorage.removeItem(OFF_KEYS[m]);
  } catch {
    // Storage unavailable: the in-memory value above still holds for this page.
  }
};

/** Why listening or speaking is off now: turned off in Preferences, a break, or undefined: it is on. */
export const offFor = (m: Modality): "setting" | "break" | undefined => (turnedOff(m) ? "setting" : onBreak(m) ? "break" : undefined);

export const isOff = (m: Modality): boolean => offFor(m) !== undefined;

/** Why each is off (as `offFor` says), or undefined: it is on. */
export type Off = { readonly [M in Modality]?: "setting" | "break" | undefined };

/** Why listening and speaking are off now. */
export const offNow = (): Off => ({ listening: offFor("listening"), speaking: offFor("speaking") });

/** What new sessions leave out while listening or speaking is off, for an hour or for good: their exercises. */
export const exclusionsOf = (off: Off): ReadonlySet<TemplateId> =>
  new Set<TemplateId>([...(off.listening !== undefined ? LISTENING : []), ...(off.speaking !== undefined ? SPEAKING : [])]);

const LISTEN_OFF: ReadonlySet<Facet> = new Set<Facet>(["listen"]);
const NOTHING_OFF: ReadonlySet<Facet> = new Set<Facet>();

/**
 * The facets turned off for good (D41), which known words and what is due leave out (the core's
 * `facetsOff`): listening, while it is turned off in Preferences. A break turns nothing off, and
 * speaking turned off only leaves its exercises out (D41 is about listening). Always one of two
 * sets, so a memo that depends on it sees a change only when there is one.
 */
export const facetsOffOf = (off: Off): ReadonlySet<Facet> => (off.listening === "setting" ? LISTEN_OFF : NOTHING_OFF);

/** On again, at once: the break ends and the setting is on. */
export const turnOn = (m: Modality): void => {
  setBreakUntil(m, 0);
  setTurnedOff(m, false);
};

/**
 * Whether clips may play by themselves (P6): sound on, and listening not off. While listening is off
 * (a break, or turned off in Preferences) nothing plays unasked, in any session, though a play
 * button the learner taps still plays (D18).
 */
export const playsUnasked = (soundOn: boolean): boolean => soundOn && !isOff("listening");
