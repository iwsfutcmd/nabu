/**
 * "Can't listen now" and "Can't speak now" (§10): those exercises stay out of new sessions for an
 * hour. A per-device convenience, so it lives in localStorage; without storage it lasts the page.
 */
export type Break = "listening" | "speaking";
const BREAK_KEYS: Readonly<Record<Break, string>> = { listening: "nabu.listening-off-until", speaking: "nabu.speaking-off-until" };
export const BREAK_MS = 3_600_000;
const breakFallback: Record<Break, number> = { listening: 0, speaking: 0 };

export const breakUntil = (b: Break): number => {
  try {
    return Number(localStorage.getItem(BREAK_KEYS[b]) ?? 0);
  } catch {
    return breakFallback[b];
  }
};

export const setBreakUntil = (b: Break, until: number): void => {
  breakFallback[b] = until;
  try {
    if (until === 0) localStorage.removeItem(BREAK_KEYS[b]);
    else localStorage.setItem(BREAK_KEYS[b], String(until));
  } catch {
    // Storage unavailable: the in-memory value above still holds for this page.
  }
};

export const onBreak = (b: Break): boolean => breakUntil(b) > Date.now();

/**
 * Whether clips may play by themselves (P6): sound on, and listening not put off. While listening is
 * on a break nothing plays unasked, in any session, though a play button the learner taps still
 * plays (D18).
 */
export const playsUnasked = (soundOn: boolean): boolean => soundOn && !onBreak("listening");
