import { villageOf } from '../autofill';
import type { Bunk } from '../types';
import { AGE_ALLOWED, AGE_PREFERRED, CROSS_VILLAGE_AREAS, DEFAULT_CAMPERS, POOL_AGE_MAX, UH_EARLY_MARGIN } from './config';

export interface Roster {
  n: number;
  names: string[];
  village: string[];
  /** Village letters in the order they first appear. */
  villages: string[];
  byVillage: Record<string, number[]>;
  /** Position inside the village, 0-based, in list order. */
  pos: number[];
  /** Mean of the numbers in Grades ("4th/5th" is 4.5). No number: position in the village, 1-based. */
  age: number[];
  campers: number[];
  young: boolean[];
  old: boolean[];
}

export function parseAge(grades: string, fallback: number): number {
  const nums = (grades.match(/\d+(?:\.\d+)?/g) ?? []).map(Number).filter((n) => Number.isFinite(n));
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : fallback;
}

export function buildRoster(bunks: Bunk[]): Roster {
  const n = bunks.length;
  const village = bunks.map((b) => villageOf(b.name));
  const villages: string[] = [];
  const byVillage: Record<string, number[]> = {};
  const pos: number[] = [];
  village.forEach((v, i) => {
    if (!byVillage[v]) {
      byVillage[v] = [];
      villages.push(v);
    }
    pos[i] = byVillage[v].length;
    byVillage[v].push(i);
  });

  const age = bunks.map((b, i) => parseAge(b.grades, pos[i] + 1));
  const campers = bunks.map((b) => {
    const c = parseInt(b.count, 10);
    return Number.isFinite(c) && c > 0 ? c : DEFAULT_CAMPERS;
  });

  const minAge = Math.min(...age);
  const maxAge = Math.max(...age);
  let young = age.map((a) => a <= minAge + UH_EARLY_MARGIN);
  let old = age.map((a) => a >= maxAge - UH_EARLY_MARGIN);
  if (n > 0 && young.some((y, i) => y && old[i])) {
    // Everyone is about the same age: lower half of each village counts as younger, upper half as older.
    young = bunks.map((_, i) => pos[i] < byVillage[village[i]].length / 2);
    old = young.map((y) => !y);
  }
  return { n, names: bunks.map((b) => b.name.trim()), village, villages, byVillage, pos, age, campers, young, old };
}

const crossVillages = (va: string, vb: string): boolean =>
  (va === 'O' && vb === 'C') || (va === 'C' && vb === 'O') || (va === 'S' && vb === 'M') || (va === 'M' && vb === 'S');

/**
 * May these two bunks share a period and program area (rule H13)? 0 means no, 1 means allowed, 2 means preferred (same age).
 *  - Tusc with Tusc, any two.
 *  - Same village: only bunks next to each other in the village's list, within a grade of each other.
 *  - O with C and S with M in the areas listed in CROSS_VILLAGE_AREAS, within a grade (S with M at the pool: the same age).
 * Anything else never shares.
 */
export function shareLevel(r: Roster, a: number, b: number, area: string): 0 | 1 | 2 {
  if (a === b) return 0;
  const va = r.village[a];
  const vb = r.village[b];
  const diff = Math.abs(r.age[a] - r.age[b]);
  if (va === vb) {
    if (va === 'T') return 2;
    if (Math.abs(r.pos[a] - r.pos[b]) !== 1 || diff > AGE_ALLOWED) return 0;
    return diff <= AGE_PREFERRED ? 2 : 1;
  }
  if (!crossVillages(va, vb) || !CROSS_VILLAGE_AREAS.includes(area)) return 0;
  const atPool = area === 'Pool';
  if (atPool && !(va === 'S' || va === 'M')) return 0;
  if (diff > (atPool ? POOL_AGE_MAX : AGE_ALLOWED)) return 0;
  return diff <= AGE_PREFERRED ? 2 : 1;
}

/** Three bunks of one village in a row in the list, each within a grade of the next. The only group of three that is ever allowed (Ropes and Athletics). */
export function isConsecutiveTrio(r: Roster, group: readonly number[]): boolean {
  if (group.length !== 3) return false;
  const v = r.village[group[0]];
  if (!group.every((b) => r.village[b] === v)) return false;
  const sorted = [...group].sort((x, y) => r.pos[x] - r.pos[y]);
  return (
    r.pos[sorted[1]] === r.pos[sorted[0]] + 1 &&
    r.pos[sorted[2]] === r.pos[sorted[1]] + 1 &&
    Math.abs(r.age[sorted[1]] - r.age[sorted[0]]) <= AGE_ALLOWED &&
    Math.abs(r.age[sorted[2]] - r.age[sorted[1]]) <= AGE_ALLOWED
  );
}

/** A run of bunks that are consecutive in one village's list (in any order). */
export function isRun(r: Roster, group: readonly number[]): boolean {
  if (group.length <= 1) return true;
  const v = r.village[group[0]];
  if (!group.every((b) => r.village[b] === v)) return false;
  const pos = group.map((b) => r.pos[b]).sort((x, y) => x - y);
  return pos.every((p, i) => i === 0 || p === pos[i - 1] + 1);
}
