export type Rng = () => number;

/** Small seeded generator (mulberry32). Same seed, same sequence. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const randInt = (r: Rng, n: number): number => Math.floor(r() * n);
export const chance = (r: Rng, p: number): boolean => r() < p;
export const pick = <T>(r: Rng, items: readonly T[]): T => items[randInt(r, items.length)];

export function shuffle<T>(r: Rng, items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randInt(r, i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Pick k distinct items, each draw weighted. Items with weight 0 are only used if nothing else is left. */
export function weightedSample<T>(r: Rng, items: readonly { item: T; weight: number }[], k: number): T[] {
  const pool = [...items];
  const out: T[] = [];
  while (out.length < k && pool.length > 0) {
    const total = pool.reduce((sum, p) => sum + Math.max(0, p.weight), 0);
    let idx = 0;
    if (total > 0) {
      let x = r() * total;
      for (idx = 0; idx < pool.length - 1; idx++) {
        x -= Math.max(0, pool[idx].weight);
        if (x < 0) break;
      }
    } else {
      idx = randInt(r, pool.length);
    }
    out.push(pool[idx].item);
    pool.splice(idx, 1);
  }
  return out;
}
