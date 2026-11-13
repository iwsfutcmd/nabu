/**
 * The shell's clock and ids for learner events (gameplan §9.6, §12.2). Core
 * never reads the clock; the app stamps each event here: a UUIDv7 id, the
 * device time with its UTC offset, the local date and the IANA time zone.
 */

const hex = (n: number, width: number): string => n.toString(16).padStart(width, "0");
const pad = (n: number, width = 2): string => String(n).padStart(width, "0");

let lastMs = -1;
let counter = 0;

/**
 * A UUIDv7 (RFC 9562): 48 bits of Unix milliseconds, then a 12-bit counter
 * (method 1 of §6.2), so ids from this page sort in the order they were made,
 * even within one millisecond or when the clock steps back.
 */
export const uuidv7 = (now: number = Date.now()): string => {
  if (now > lastMs) {
    lastMs = now;
    counter = 0;
  } else if (++counter > 0xfff) {
    lastMs++;
    counter = 0;
  }
  const random = crypto.getRandomValues(new Uint8Array(8));
  random[0] = ((random[0] ?? 0) & 0x3f) | 0x80; // variant 10
  const tail = Array.from(random, (b) => hex(b, 2)).join("");
  const ms = hex(lastMs, 12);
  return `${ms.slice(0, 8)}-${ms.slice(8)}-7${hex(counter, 3)}-${tail.slice(0, 4)}-${tail.slice(4)}`;
};

/** ISO 8601 in the device's local time with its offset: 2026-11-03T09:15:02.123+01:00. */
export const localIso = (d: Date): string => {
  const offset = -d.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  const abs = Math.abs(offset);
  const date = `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
  return `${date}T${time}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
};

/** The learner's local calendar date (§12.2): daily XP and streaks count it. */
export const localDate = (d: Date): string => localIso(d).slice(0, 10);

/**
 * How long from `d` until the local date changes: until the next local midnight (a DST day is
 * 23 or 25 hours long), and a second more, so that a timer set for it finds the new date.
 */
export const msUntilNextLocalDate = (d: Date): number =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime() - d.getTime() + 1000;

export const timeZone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone;
