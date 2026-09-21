import { villageOf } from '../autofill';
import type { Bunk } from '../types';
import { DEFAULT_CAMPERS, UH_EARLY_MARGIN } from './config';

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

/** Bunks that may share a slot in the same area without breaking the equal-ordinal rule: same village, or S with M. */
export function related(r: Roster, a: number, b: number): boolean {
  if (a === b) return false;
  const va = r.village[a];
  const vb = r.village[b];
  return va === vb || (va === 'S' && vb === 'M') || (va === 'M' && vb === 'S');
}

/** Two bunks that may be scheduled together as a pair: related and within a year of each other. */
export function pairable(r: Roster, a: number, b: number): boolean {
  return related(r, a, b) && Math.abs(r.age[a] - r.age[b]) <= 1;
}
