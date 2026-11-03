/**
 * Comparing projections (§14.2): the device checks that the server's projections equal its own.
 * No imports, so tests can use it from Node.
 */

/**
 * Where two projections differ, or undefined when they agree. Numbers agree within a relative
 * 1e-9: Math.exp and Math.pow (FSRS, the performance model) are not specified to be correctly
 * rounded, so a browser's engine and the server's may differ in the last bit; the server's
 * projection stays authoritative.
 */
export const difference = (a: unknown, b: unknown, path = "$"): string | undefined => {
  if (typeof a === "number" && typeof b === "number") {
    return a === b || Math.abs(a - b) <= 1e-9 * Math.max(Math.abs(a), Math.abs(b)) ? undefined : `${path}: ${a} ≠ ${b}`;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return `${path}: ${a.length} items ≠ ${b.length}`;
    for (const [i, x] of a.entries()) {
      const d = difference(x, b[i], `${path}[${i}]`);
      if (d !== undefined) return d;
    }
    return undefined;
  }
  if (a !== null && b !== null && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) {
    const ra = a as Record<string, unknown>;
    const rb = b as Record<string, unknown>;
    const keys = [...new Set([...Object.keys(ra), ...Object.keys(rb)])].sort();
    for (const k of keys) {
      const d = difference(ra[k], rb[k], `${path}.${k}`);
      if (d !== undefined) return d;
    }
    return undefined;
  }
  return Object.is(a, b) ? undefined : `${path}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`;
};

/** JSON with object keys sorted: two projections are equal when these strings are. */
export const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, v: unknown) =>
    v !== null && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : v,
  );
