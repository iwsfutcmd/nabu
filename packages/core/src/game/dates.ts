/**
 * Calendar dates as the learner lives them (gameplan §12.2): ISO dates (YYYY-MM-DD) in the
 * learner's own time zone. Arithmetic is on the proleptic Gregorian calendar in UTC, so it never
 * meets a DST gap; time zones only enter when an instant is turned into a local date.
 */

const formats = new Map<string, Intl.DateTimeFormat>();

const formatFor = (tz: string): Intl.DateTimeFormat => {
  let f = formats.get(tz);
  if (f === undefined) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hourCycle: "h23" });
    formats.set(tz, f);
  }
  return f;
};

/** The local date of an instant in a time zone, or undefined for an unknown zone or a bad instant. */
export const localDateOf = (instant: string, tz: string): string | undefined => {
  const at = Date.parse(instant);
  if (Number.isNaN(at)) return undefined;
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = formatFor(tz).formatToParts(at);
  } catch {
    return undefined;
  }
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year").padStart(4, "0")}-${get("month")}-${get("day")}`;
};

const DAY_MS = 86_400_000;

const toUtc = (date: string): number => Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)));

/** `date` plus `days` (negative to go back). */
export const addDays = (date: string, days: number): string => new Date(toUtc(date) + days * DAY_MS).toISOString().slice(0, 10);

/** Whole days from `a` to `b` (b − a). */
export const daysBetween = (a: string, b: string): number => Math.round((toUtc(b) - toUtc(a)) / DAY_MS);

export const isIsoDate = (s: string): boolean => /^\d{4}-\d{2}-\d{2}$/u.test(s) && addDays(s, 0) === s;

/** Monday of the ISO week a date falls in. */
export const weekStart = (date: string): string => {
  const weekday = (new Date(toUtc(date)).getUTCDay() + 6) % 7; // Monday 0 … Sunday 6
  return addDays(date, -weekday);
};

const wallFormats = new Map<string, Intl.DateTimeFormat>();

/** How far a zone's wall clock is ahead of UTC at an instant, in ms. */
const offsetAt = (at: number, tz: string): number => {
  let f = wallFormats.get(tz);
  if (f === undefined) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" });
    wallFormats.set(tz, f);
  }
  const parts = f.formatToParts(at);
  const n = (t: string): number => Number(parts.find((p) => p.type === t)?.value);
  return Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"), n("second")) - at;
};

/** The instant a local date begins in a zone (a DST gap at midnight resolves forward), or undefined for an unknown zone. */
export const startOfDay = (date: string, tz: string): number | undefined => {
  const wall = toUtc(date);
  try {
    const guess = wall - offsetAt(wall, tz);
    return wall - offsetAt(guess, tz);
  } catch {
    return undefined;
  }
};
