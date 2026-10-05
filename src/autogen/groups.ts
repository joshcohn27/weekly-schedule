import { ROPES_MAX_CAMPERS } from './config';
import { shareLevel, type Roster } from './roster';

/**
 * Split bunks that need Ropes into the groups that will go together. Ropes goes by people, not by bunks: bunks next to
 * each other in a village's list, on the same time at ropes, go together as long as their campers add up to no more than
 * ROPES_MAX_CAMPERS. A bunk that is bigger than that on its own goes alone. `pick(k)` chooses a number from 0 to k-1
 * (randomness lives with the caller): it decides which end of a line the packing starts from, so the same bunks are not
 * left over every time.
 */
export function ropeGroups(r: Roster, bunks: readonly number[], base: (b: number) => number, pick: (k: number) => number): number[][] {
  const out: number[][] = [];
  const wanted = new Set(bunks);
  for (const v of r.villages) {
    const need = r.byVillage[v].filter((b) => wanted.has(b));
    let run: number[] = [];
    const flush = () => {
      if (run.length > 0) out.push(...packByCampers(r, run, pick(2) === 1));
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

/** Cut a line of neighbours into groups, each with as many bunks as fit under the camper limit, starting from one end or the other. */
function packByCampers(r: Roster, run: number[], fromEnd: boolean): number[][] {
  const line = fromEnd ? [...run].reverse() : run;
  const groups: number[][] = [];
  let group: number[] = [];
  let campers = 0;
  for (const b of line) {
    if (group.length > 0 && campers + r.campers[b] > ROPES_MAX_CAMPERS) {
      groups.push(group);
      group = [];
      campers = 0;
    }
    group.push(b);
    campers += r.campers[b];
  }
  if (group.length > 0) groups.push(group);
  // back in list order, whichever end the packing started from
  return fromEnd ? groups.map((g) => g.reverse()).reverse() : groups;
}
