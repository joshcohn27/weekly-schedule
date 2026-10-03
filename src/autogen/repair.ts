import { DAY_CAP, UH_MAX_PER_SESSION, WEEK_BLOCK_MAX } from './config';
import { SLOTS, blocksOf, dayOf, ordinalAt } from './history';
import { inWeekCount } from './planner';
import { groupSoft } from './score';
import { isFixedMohawkAthletics, sharedArea, slotGroupProblems } from './share';
import { buildDayMasks, groupAt, type Ctx } from './state';

/** A rule break counts this much, so a move that fixes one always beats any change of preference. */
const HARD = 1000;
/** Labels a leftover period may carry. */
const LEFTOVER = ['Athletics', 'A&C', 'Time with UH'];
const MAX_ITER = 500;
/** Chance to take a move that does not help, to get out of a dead end. */
const NOISE = 0.06;

const ordinalIn = (c: Ctx, b: number, s: number): number | null => ordinalAt(c.grid[b], c.hist[b].earlier, s);

/** Rule breaks in one period's group in one area (sharing, cap, equal ordinal). */
function groupHard(c: Ctx, s: number, area: string): number {
  const g = groupAt(c, s, area);
  return g.length < 2 ? 0 : slotGroupProblems(c.roster, area, g, (x) => ordinalIn(c, x, s), c.relax).length;
}

/** How many bunks of one village are over the day cap for an area on a day. */
function dayCapExcess(c: Ctx, village: string, day: number, area: string): number {
  const cap = DAY_CAP[area];
  if (cap === undefined) return 0;
  let here = 0;
  for (const j of c.roster.byVillage[village]) {
    for (let p = 0; p < 4; p++) {
      const s = day * 4 + p;
      const label = c.grid[j][s];
      if (label !== '' && !c.locked[j][s] && sharedArea(label) === area && !isFixedMohawkAthletics(c.weekIndex, village, s, label)) {
        here++;
        break;
      }
    }
  }
  return Math.max(0, here - cap);
}

/** One bunk's own breaks in an area: too many blocks in the week, the area twice in a day, too much Time with UH. */
function bunkExcess(c: Ctx, b: number, area: string): number {
  const row = c.grid[b];
  let excess = 0;
  let blocks = 0;
  const perDay = [0, 0, 0, 0, 0, 0];
  for (const k of blocksOf(row)) {
    if (k.area !== area || c.locked[b][k.start] || isFixedMohawkAthletics(c.weekIndex, c.roster.village[b], k.start, k.label)) continue;
    blocks++;
    perDay[k.day]++;
  }
  const max = WEEK_BLOCK_MAX[area];
  if (max !== undefined) excess += Math.max(0, blocks - max);
  for (const n of perDay) excess += Math.max(0, n - 1);
  if (area === 'TW UH') {
    const total = (c.hist[b].earlier[area] ?? 0) + (c.hist[b].later[area] ?? 0) + inWeekCount(c, b, area);
    excess += Math.max(0, total - UH_MAX_PER_SESSION);
  }
  return excess;
}

/** Everything a change to this bunk's cells in these areas can affect, as one number (rule breaks, then preferences). */
function localCost(c: Ctx, b: number, areas: readonly string[]): number {
  const village = c.roster.village[b];
  let cost = 0;
  const days = new Set<number>();
  const seen = new Set<number>();
  for (let s = 0; s < SLOTS; s++) {
    const area = sharedArea(c.grid[b][s]);
    if (!area || !areas.includes(area) || c.locked[b][s]) continue;
    days.add(dayOf(s));
    for (const a of areas) {
      const key = s * 100 + areas.indexOf(a);
      if (seen.has(key)) continue;
      seen.add(key);
      cost += HARD * groupHard(c, s, a) + groupSoft(c, s, a);
    }
  }
  for (const a of areas) {
    cost += HARD * bunkExcess(c, b, a);
    for (const day of days) cost += HARD * dayCapExcess(c, village, day, a);
  }
  return cost;
}

/** Does anything in this period break a rule? */
function cellBroken(c: Ctx, b: number, s: number): boolean {
  const label = c.grid[b][s];
  const area = sharedArea(label);
  if (!area || c.locked[b][s] || isFixedMohawkAthletics(c.weekIndex, c.roster.village[b], s, label)) return false;
  return groupHard(c, s, area) > 0 || dayCapExcess(c, c.roster.village[b], dayOf(s), area) > 0 || bunkExcess(c, b, area) > 0;
}

/**
 * Fix rule breaks by moving things around inside one bunk's own week: swap two of its periods, or turn a leftover period into
 * one of the other leftover areas. Keeps whichever change lowers the number of rule breaks (then the preferences), with a
 * little noise to escape dead ends. Returns true when nothing breaks a rule any more.
 */
export function repairGrid(c: Ctx, flex: boolean[][]): boolean {
  const n = c.roster.n;
  for (let iter = 0; iter < MAX_ITER; iter++) {
    const bad: [number, number][] = [];
    for (let b = 0; b < n; b++) for (let s = 0; s < SLOTS; s++) if (flex[b][s] && cellBroken(c, b, s)) bad.push([b, s]);
    if (bad.length === 0) {
      c.dayMask = buildDayMasks(c.grid);
      return true;
    }
    const [b, s] = bad[Math.floor(c.rng() * bad.length)];
    const row = c.grid[b];
    let best: { apply: () => void; undo: () => void; delta: number } | null = null;
    const consider = (areas: string[], apply: () => void, undo: () => void) => {
      const before = localCost(c, b, areas);
      apply();
      const after = localCost(c, b, areas);
      undo();
      const delta = after - before + c.rng() * 0.01;
      if (!best || delta < best.delta) best = { apply, undo, delta };
    };
    const here = row[s];
    for (let j = 0; j < SLOTS; j++) {
      if (j === s || !flex[b][j] || row[j] === here) continue;
      const areas = [...new Set([sharedArea(here), sharedArea(row[j])].filter((a): a is string => a !== null))];
      if (areas.length === 0) continue;
      const other = row[j];
      consider(
        areas,
        () => {
          row[s] = other;
          row[j] = here;
        },
        () => {
          row[s] = here;
          row[j] = other;
        },
      );
    }
    if (LEFTOVER.includes(here)) {
      for (const to of LEFTOVER) {
        if (to === here) continue;
        consider(
          [sharedArea(here) as string, sharedArea(to) as string],
          () => {
            row[s] = to;
          },
          () => {
            row[s] = here;
          },
        );
      }
    }
    const chosen = best as { apply: () => void; delta: number } | null;
    if (chosen && (chosen.delta < 0 || c.rng() < NOISE)) chosen.apply();
  }
  c.dayMask = buildDayMasks(c.grid);
  return false;
}
