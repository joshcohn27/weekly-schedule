import { AREAS, areaOf } from '../config';
import type { WeeksState } from '../types';
import { DAY_CAP, WEEK_BLOCK_MAX, type SessionWeeks } from './config';
import { SLOTS, blocksOf, dayOf, ordinalAt, slotAt, type BunkHistory } from './history';
import type { Rng } from './rng';
import type { CalendarPlan } from './calendar';
import type { Roster } from './roster';
import { isFixedMohawkAthletics, sharedArea, slotGroupProblems, type Relax } from './share';

const AREA_BIT = new Map<string, number>(AREAS.map((a, i) => [a, 1 << i]));
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
  /** Ropes, Pool, league or triathlon blocks that could not be placed. These must be there, so the week is judged not good enough. */
  missing: string[];
  /** Rare-area blocks planned but not placed this week. They carry over to later weeks. */
  carried: { bunk: number; area: string }[];
  /** Bunks whose weekly Music could not fit under their village's day cap. They are not held against the week. */
  excused: number[];
  /** How much looser the limits are for this week: 0, or BUILD_AROUND_STRETCH when it is built around periods filled in by hand. */
  stretch: number;
  /** Which last-resort groupings this attempt may use. */
  relax: Relax;
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

/** The bunks in one program area in one period, leaving out cells filled by hand and Mohawk's fixed Sunday Athletics. */
export function groupAt(c: Ctx, s: number, area: string): number[] {
  const out: number[] = [];
  for (let b = 0; b < c.roster.n; b++) {
    const label = c.grid[b][s];
    if (!label || c.locked[b][s] || sharedArea(label) !== area) continue;
    if (isFixedMohawkAthletics(c.weekIndex, c.roster.village[b], s, label)) continue;
    out.push(b);
  }
  return out;
}

const ordinalIn = (c: Ctx, b: number, s: number): number | null => ordinalAt(c.grid[b], c.hist[b].earlier, s);

/** Does this bunk (as the grid stands now) break the sharing rules, a day cap or a weekly cap in this area? */
function areaProblemFor(c: Ctx, b: number, area: string): boolean {
  const row = c.grid[b];
  const village = c.roster.village[b];
  const mine = c.locked[b];
  let firstDay = -1;
  let manyDays = false;
  let blocks = 0;
  let prev = '';
  for (let s = 0; s < SLOTS; s++) {
    const label = row[s];
    if (label === '' || mine[s] || sharedArea(label) !== area || isFixedMohawkAthletics(c.weekIndex, village, s, label)) {
      prev = '';
      continue;
    }
    if (label !== prev || s % 4 === 0) blocks++;
    prev = label;
    const day = dayOf(s);
    if (firstDay < 0) firstDay = day;
    else if (day !== firstDay) manyDays = true;
    const group = groupAt(c, s, area);
    if (group.length > 1 && slotGroupProblems(c.roster, area, group, (x) => ordinalIn(c, x, s), c.relax).length > 0) return true;
  }
  const max = WEEK_BLOCK_MAX[area];
  if (max !== undefined && blocks > max) return true;
  const cap = DAY_CAP[area];
  if (cap !== undefined && firstDay >= 0) {
    const members = c.roster.byVillage[village];
    for (let day = manyDays ? 0 : firstDay; day < (manyDays ? 6 : firstDay + 1); day++) {
      if (manyDays && !row.slice(day * 4, day * 4 + 4).some((l) => l !== '' && sharedArea(l) === area)) continue;
      let here = 0;
      for (const j of members) {
        for (let p = 0; p < 4; p++) {
          const s = day * 4 + p;
          const label = c.grid[j][s];
          if (label !== '' && !c.locked[j][s] && sharedArea(label) === area && !isFixedMohawkAthletics(c.weekIndex, village, s, label)) {
            here++;
            break;
          }
        }
      }
      if (here > cap) return true;
    }
  }
  return false;
}

/**
 * Would this bunk having the label on these slots keep every sharing rule (H13), slot cap (H14),
 * day and weekly cap (H15) and the equal ordinal (H5)? It also checks the bunk's other blocks in the
 * area, because adding a block earlier in the week moves the ordinal of the ones after it.
 */
export function okPlace(c: Ctx, b: number, slots: readonly number[], label: string): boolean {
  const area = sharedArea(label);
  if (!area) return true;
  const saved = slots.map((s) => c.grid[b][s]);
  for (const s of slots) c.grid[b][s] = label;
  const ok = !areaProblemFor(c, b, area);
  slots.forEach((s, i) => {
    c.grid[b][s] = saved[i];
  });
  return ok;
}

/** Same check after relabelling cells that are already in the grid (they are changed and then put back if it fails). */
export function tryRelabel(c: Ctx, b: number, slots: readonly number[], to: string): boolean {
  const from = c.grid[b][slots[0]];
  const areaFrom = sharedArea(from);
  const areaTo = sharedArea(to);
  for (const s of slots) c.grid[b][s] = to;
  const bad = (areaTo !== null && areaProblemFor(c, b, areaTo)) || (areaFrom !== null && areaProblemFor(c, b, areaFrom));
  if (bad) for (const s of slots) c.grid[b][s] = from;
  return !bad;
}

export const POOL_SLOT_LABELS = ['Pool', 'Swim Test', 'Tusc Triathlon Training'];

/** How many bunks are at the pool (or Tusc training in the water) in a period. */
export function poolLoad(c: Ctx, s: number): { count: number } {
  let count = 0;
  for (let b = 0; b < c.roster.n; b++) if (POOL_SLOT_LABELS.includes(c.grid[b][s])) count++;
  return { count };
}

export const slotHas = (c: Ctx, s: number, label: string): boolean => c.grid.some((row) => row[s] === label);

export function warn(c: Ctx, message: string): void {
  if (!c.warnings.includes(message)) c.warnings.push(message);
}

export const ALL_SLOTS: number[] = Array.from({ length: SLOTS }, (_, i) => i);
