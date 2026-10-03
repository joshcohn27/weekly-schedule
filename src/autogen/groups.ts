import { isConsecutiveTrio, shareLevel, type Roster } from './roster';

/**
 * Split bunks that need Ropes into the groups that will go together: bunks next to each other in a village's list,
 * on the same time at ropes, in twos. A village with an odd number in a row leaves one alone, or, as a last resort,
 * makes one group of three from the smaller bunks. `pick(k)` chooses a number from 0 to k-1 (randomness lives with the caller).
 */
export function ropeGroups(
  r: Roster,
  bunks: readonly number[],
  base: (b: number) => number,
  pick: (k: number) => number,
  allowTrio: boolean,
): number[][] {
  const out: number[][] = [];
  const wanted = new Set(bunks);
  for (const v of r.villages) {
    const need = r.byVillage[v].filter((b) => wanted.has(b));
    let run: number[] = [];
    const flush = () => {
      if (run.length > 0) out.push(...splitRun(r, run, pick, allowTrio));
      run = [];
    };
    for (const b of need) {
      const prev = run[run.length - 1];
      if (prev !== undefined && shareLevel(r, prev, b, 'Ropes') > 0 && base(prev) === base(b)) run.push(b);
      else {
        flush();
        run = [b];
      }
    }
    flush();
  }
  return out;
}

function splitRun(r: Roster, run: number[], pick: (k: number) => number, allowTrio: boolean): number[][] {
  const L = run.length;
  const pairs = (from: number, to: number): number[][] => {
    const out: number[][] = [];
    for (let i = from; i + 1 < to; i += 2) out.push([run[i], run[i + 1]]);
    return out;
  };
  if (L === 1) return [run];
  if (L % 2 === 0) return pairs(0, L);
  if (allowTrio) {
    // the trio takes the bunks with the fewest campers
    const starts: number[] = [];
    for (let i = 0; i + 2 < L; i += 2) if (isConsecutiveTrio(r, run.slice(i, i + 3))) starts.push(i);
    if (starts.length > 0) {
      const campers = (i: number): number => r.campers[run[i]] + r.campers[run[i + 1]] + r.campers[run[i + 2]];
      const best = starts.reduce((a, b) => (campers(b) < campers(a) ? b : a));
      return [...pairs(0, best), run.slice(best, best + 3), ...pairs(best + 3, L)];
    }
  }
  const single = 2 * pick(Math.ceil(L / 2));
  return [...pairs(0, single), [run[single]], ...pairs(single + 1, L)];
}
