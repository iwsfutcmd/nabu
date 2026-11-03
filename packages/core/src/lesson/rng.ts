/**
 * A seeded random number generator (mulberry32). Core never touches
 * Math.random: lessons are reproducible from their seed (gameplan §8.1).
 */
export interface Rng {
  /** Uniform in [0, 1). */
  readonly next: () => number;
  /** Uniform integer in [0, n). */
  readonly int: (n: number) => number;
  /** A shuffled copy (Fisher–Yates). */
  readonly shuffle: <T>(items: readonly T[]) => readonly T[];
}

export const seededRng = (seed: number): Rng => {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (n: number): number => Math.floor(next() * n);
  const shuffle = <T>(items: readonly T[]): readonly T[] => {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
      const j = int(i + 1);
      [out[i], out[j]] = [out[j] as T, out[i] as T];
    }
    return out;
  };
  return { next, int, shuffle };
};
