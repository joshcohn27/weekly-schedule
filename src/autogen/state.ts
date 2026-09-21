import { AREAS, areaOf } from '../config';
import type { WeeksState } from '../types';
import { ORDINAL_EXEMPT_LABELS, type SessionWeeks } from './config';
import { SLOTS, blocksOf, dayOf, ordinalAt, slotAt, type BunkHistory } from './history';
import type { Rng } from './rng';
import type { CalendarPlan } from './calendar';
import type { Roster } from './roster';

const AREA_BIT = new Map<string, number>(AREAS.map((a, i) => [a, 1 << i]));
const EXEMPT = new Set(ORDINAL_EXEMPT_LABELS);
const bitOf = (label: string): number => {
  const area = areaOf(label);
  return area ? (AREA_BIT.get(area) ?? 0) : 0;
};

/** Which program areas each bunk already has on each day, as bit flags: dayMask[bunk][day]. */
export function buildDayMasks(grid: readonly string[][]): number[][] {
  return grid.map((row) => {
    const masks = [0, 0, 0, 0, 0, 0];
    row.forEach((label, s) => {
      if (label) masks[dayOf(s)] |= bitOf(label);
    });
    return masks;
  });
}

/** Everything one generation attempt reads and writes. */
export interface Ctx {
  weeks: WeeksState;
  weekIndex: number;
  sessionWeeks: SessionWeeks;
  roster: Roster;
  hist: BunkHistory[];
  /** Working copy of the week: grid[bunk][slot] is a label, or '' when empty. */
  grid: string[][];
  /** Cells that were already filled before generating (fill-empty mode). They are never changed. */
  locked: boolean[][];
  rng: Rng;
  warnings: string[];
  /** Last week of a 4-week session: its own calendar, and Friday stays empty. */
  lastWeek: boolean;
  /** Day the Tusc mini bike trip falls on this week, if it does. */
  tripDay: number | null;
  /** Planned blocks that could not be placed; each one costs the soft score. */
  unmet: number;
  /** Ropes, Pool, league or triathlon blocks that could not be placed. These must be exact, so they outweigh every soft preference. */
  structural: number;
  /** Program areas each bunk already has on each day (bit flags), kept in step with the grid by put(). */
  dayMask: number[][];
  /** Days that have periods to fill this week. */
  days: number[];
  /** The week's random calendar choices, drawn once per generate so the attempts only vary the flexible parts. */
  calendar: CalendarPlan;
}

export const isFree = (c: Ctx, b: number, s: number): boolean => c.grid[b][s] === '';
export const rangeFree = (c: Ctx, b: number, slots: readonly number[]): boolean => slots.every((s) => isFree(c, b, s));
export const villageFree = (c: Ctx, v: string, slots: readonly number[]): boolean => c.roster.byVillage[v].every((b) => rangeFree(c, b, slots));

export function put(c: Ctx, b: number, slots: readonly number[], label: string): void {
  const bit = bitOf(label);
  for (const s of slots) {
    c.grid[b][s] = label;
    c.dayMask[b][dayOf(s)] |= bit;
  }
}
export function putVillage(c: Ctx, v: string, slots: readonly number[], label: string): void {
  for (const b of c.roster.byVillage[v]) put(c, b, slots, label);
}

const DAY_SLOTS: number[][] = [0, 1, 2, 3, 4, 5].map((d) => [0, 1, 2, 3].map((p) => slotAt(d, p)));
export const daySlots = (day: number): number[] => DAY_SLOTS[day];

/** Is this program area already on the bunk's day? */
export function areaOnDay(c: Ctx, b: number, day: number, area: string): boolean {
  const bit = AREA_BIT.get(area);
  return bit !== undefined && (c.dayMask[b][day] & bit) !== 0;
}
export const villageAreaOnDay = (c: Ctx, v: string, day: number, area: string): boolean =>
  c.roster.byVillage[v].some((b) => areaOnDay(c, b, day, area));

/** Slots the generator may fill: empty cells, except Friday of the last week of a 4-week session. */
export const fillable = (c: Ctx, s: number): boolean => !(c.lastWeek && dayOf(s) === 5);

/** Blocks of this area the bunk already has this week that start before the given slot. */
export function blocksBefore(row: readonly string[], area: string, start: number): number {
  let n = 0;
  for (const k of blocksOf(row)) if (k.area === area && k.start < start) n++;
  return n;
}

/**
 * Equal-ordinal rule (H5): would putting this label on these slots put the bunk on a different
 * "time number" than a related bunk already in the same area at the same slot?
 */
export function h5ok(c: Ctx, b: number, slots: readonly number[], label: string): boolean {
  if (EXEMPT.has(label)) return true;
  const area = areaOf(label);
  if (!area) return true;
  let mine: number | null = null;
  for (const y of c.roster.relatedTo[b]) {
    for (const s of slots) {
      const ly = c.grid[y][s];
      if (!ly || EXEMPT.has(ly) || c.locked[y][s] || areaOf(ly) !== area) continue;
      if (mine === null) mine = (c.hist[b].earlier[area] ?? 0) + blocksBefore(c.grid[b], area, slots[0]) + 1;
      if (ordinalAt(c.grid[y], c.hist[y].earlier, s) !== mine) return false;
    }
  }
  return true;
}

export const POOL_SLOT_LABELS = ['Pool', 'Swim Test', 'Tusc Triathlon Training'];

export function poolLoad(c: Ctx, s: number): { total: number; young: number; count: number } {
  let total = 0;
  let young = 0;
  let count = 0;
  for (let b = 0; b < c.roster.n; b++) {
    const l = c.grid[b][s];
    if (!POOL_SLOT_LABELS.includes(l)) continue;
    total += c.roster.campers[b];
    count++;
    if (l === 'Pool' && (c.roster.village[b] === 'O' || c.roster.village[b] === 'C')) young += c.roster.campers[b];
  }
  return { total, young, count };
}

export const slotHas = (c: Ctx, s: number, label: string): boolean => c.grid.some((row) => row[s] === label);

export function warn(c: Ctx, message: string): void {
  if (!c.warnings.includes(message)) c.warnings.push(message);
}

export const ALL_SLOTS: number[] = Array.from({ length: SLOTS }, (_, i) => i);
