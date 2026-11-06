/**
 * Abuse limits (gameplan §14.5): sign-up and sign-in by client address (sign-in also by account),
 * and event uploads by user. A fixed window per key, kept in memory: one API process serves an
 * instance (deploy/), so there is nothing to share.
 */

export interface Limit {
  /** Requests allowed per window. */
  readonly max: number;
  readonly windowMs: number;
}

export interface Limits {
  readonly signUp?: Limit | undefined;
  readonly signIn?: Limit | undefined;
  readonly events?: Limit | undefined;
}

/**
 * What an instance runs with unless its environment says otherwise (main.ts). Generous for a
 * learner (a device syncs a few times a minute at most), tight for a script.
 */
export const DEFAULT_LIMITS: Limits = {
  signUp: { max: 5, windowMs: 60 * 60_000 },
  signIn: { max: 10, windowMs: 15 * 60_000 },
  events: { max: 120, windowMs: 60_000 },
};

export type Verdict = { readonly ok: true } | { readonly ok: false; readonly retryAfterSeconds: number };

/** Keys that have not been seen for a whole window are swept once the map grows past this. */
const SWEEP_AT = 10_000;

export const createLimiter = (limit: Limit, now: () => number = Date.now): ((key: string) => Verdict) => {
  const windows = new Map<string, { start: number; count: number }>();
  return (key) => {
    const t = now();
    if (windows.size > SWEEP_AT) {
      for (const [k, w] of windows) if (t - w.start >= limit.windowMs) windows.delete(k);
    }
    const w = windows.get(key);
    if (w === undefined || t - w.start >= limit.windowMs) {
      windows.set(key, { start: t, count: 1 });
      return { ok: true };
    }
    if (w.count >= limit.max) return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((w.start + limit.windowMs - t) / 1000)) };
    w.count++;
    return { ok: true };
  };
};

/** Limits from the environment: NABU_RATE_LIMITS=off turns them off; NABU_RATE_LIMIT_<NAME>=<max>/<seconds> sets one. */
export const limitsFromEnv = (env: Readonly<Record<string, string | undefined>>): Limits => {
  if (env["NABU_RATE_LIMITS"] === "off") return {};
  const one = (name: string, fallback: Limit | undefined): Limit | undefined => {
    const raw = env[`NABU_RATE_LIMIT_${name}`];
    if (raw === undefined) return fallback;
    const m = /^(\d+)\/(\d+)$/u.exec(raw.trim());
    if (m === null) throw new Error(`NABU_RATE_LIMIT_${name} is <max>/<seconds>, not ${JSON.stringify(raw)}`);
    return { max: Number(m[1]), windowMs: Number(m[2]) * 1000 };
  };
  return { signUp: one("SIGN_UP", DEFAULT_LIMITS.signUp), signIn: one("SIGN_IN", DEFAULT_LIMITS.signIn), events: one("EVENTS", DEFAULT_LIMITS.events) };
};
