/**
 * The age gate (gameplan §14.4, ADR 0069): an instance that may serve minors sets NABU_MIN_AGE,
 * and sign-up then needs the person's age, in years, at least that. The question is neutral (the
 * app never shows the threshold), the server keeps nothing of the answer, and someone it turns
 * away can still learn on their device, where nothing leaves it. Unset: no gate.
 */

/** Ages above this are typing slips, not ages. */
export const MAX_AGE = 150;

export type AgeCheck = { readonly ok: true } | { readonly ok: false; readonly error: "age-required" | "invalid-request" | "age" };

/** Whether a sign-up may go ahead: `age` is what the request carried (anything, or nothing). */
export const ageCheck = (minAge: number | undefined, age: unknown): AgeCheck => {
  if (minAge === undefined) return { ok: true };
  if (age === undefined || age === null) return { ok: false, error: "age-required" };
  if (typeof age !== "number" || !Number.isSafeInteger(age) || age < 0 || age > MAX_AGE) return { ok: false, error: "invalid-request" };
  return age >= minAge ? { ok: true } : { ok: false, error: "age" };
};

/** NABU_MIN_AGE: unset or empty means no gate; anything but a whole number of years from 1 to MAX_AGE is a mistake. */
export const minAgeFromEnv = (value: string | undefined): number | undefined => {
  if (value === undefined || value.trim() === "") return undefined;
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 1 || n > MAX_AGE) throw new Error(`NABU_MIN_AGE must be a whole number of years from 1 to ${MAX_AGE}, not "${value}"`);
  return n;
};
