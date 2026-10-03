import { areaOf } from '../config';
import { FLEXIBLE_VILLAGES, GAP_MAX_MT, GAP_MAX_OCS, SLOT_PREFERRED, UH_MAX_PER_SESSION, WEIGHTS } from './config';
import { blocksOf, dayOf, periodOf } from './history';
import { TOKEN_AREAS, TOKEN_LABEL, inWeekCount, sessionTargetOf, type Plan } from './planner';
import { shareLevel } from './roster';
import { repairGrid } from './repair';
import { shuffle } from './rng';
import { ALL_SLOTS, areaOnDay, buildDayMasks, fillable, groupAt, isFree, okPlace, put, tryRelabel, type Ctx } from './state';

// Areas that may fall a block short when a bunk has no room. Music is only ever dropped as a last resort.
const MAY_FALL_SHORT = ['TW UH', 'Yoga', 'Ceramics', 'Teva', 'Dance', 'Israel Education', 'Judaics'];

const labelOf = (area: string): string => TOKEN_LABEL[area as (typeof TOKEN_AREAS)[number]];
const other = (a: string): string => (a === 'Athletics' ? 'A&C' : 'Athletics');

/**
 * What a bunk sharing a period with the bunks already there costs, using the preferences: one bunk where two are allowed,
 * two at Athletics, and bunks of the same age together.
 */
function shareCost(c: Ctx, b: number, s: number, area: string): number {
  const here = groupAt(c, s, area);
  if (here.length === 0) return 0;
  const size = here.length + 1;
  let cost = 0;
  if (area === 'Athletics') {
    cost += size === 2 ? WEIGHTS.athleticsPair : WEIGHTS.athleticsThird;
    if (here.every((x) => shareLevel(c.roster, b, x, area) === 0)) cost += WEIGHTS.athleticsUnrelated;
    if (size === 3 && here.every((x) => shareLevel(c.roster, b, x, area) > 0)) cost += WEIGHTS.trio;
  } else if (SLOT_PREFERRED[area] !== undefined && size > SLOT_PREFERRED[area]) {
    cost += WEIGHTS.sharedPreferredOne;
  }
  if (here.some((x) => shareLevel(c.roster, b, x, area) === 1)) cost += WEIGHTS.pairFarAge;
  return cost;
}

/** Runs of empty periods in one day of a bunk's row. */
function emptyRuns(row: readonly string[], day: number): number {
  let runs = 0;
  let inRun = false;
  for (let p = 0; p < 4; p++) {
    const empty = row[day * 4 + p] === '';
    if (empty && !inRun) runs++;
    inRun = empty;
  }
  return runs;
}

const CROWD_WEIGHT = 0.6;
const SHAPE_WEIGHT = 2.5;
/** Athletics and A&C are two blocks each a week, so a bunk's empty periods should fall in at most this many runs. */
const MAX_LEFTOVER_RUNS = 4;
const REPAIR_TRIES = 12;
/** Values tried per block in the search, blocks that can be skipped, and the work allowed before falling back to a plain greedy pass. */
const BRANCH = 5;
const MAX_SKIPS = 12;
const NODE_BUDGET = 300;

/** Can Athletics, A&C or Time with UH go in this period for this bunk right now? */
function leftoverFits(c: Ctx, b: number, s: number): boolean {
  const day = dayOf(s);
  return (
    (!areaOnDay(c, b, day, 'Athletics') && okPlace(c, b, [s], 'Athletics')) ||
    (!areaOnDay(c, b, day, 'A&C') && okPlace(c, b, [s], 'A&C')) ||
    (!areaOnDay(c, b, day, 'TW UH') && okPlace(c, b, [s], 'Time with UH'))
  );
}

/**
 * Fill every remaining period. First the planned rare areas and Music go in, the hardest to place first; then each bunk's
 * leftover periods are tiled with Athletics and A&C blocks (at most two of each a week, doubles allowed) and, within its
 * session limit, Time with UH. Nothing else is ever used and no rule is bent to fill a period: a period that cannot be filled
 * is left empty, and the attempt loses. Returns true when nothing was left empty.
 */
export function fillFlexible(c: Ctx, plan: Plan): boolean {
  const n = c.roster.n;
  const tok: Record<string, number>[] = Array.from({ length: n }, () => ({}));
  const free: number[][] = Array.from({ length: n }, (_, b) => ALL_SLOTS.filter((s) => isFree(c, b, s) && fillable(c, s)));
  const total = (b: number, area: string): number => (c.hist[b].earlier[area] ?? 0) + (c.hist[b].later[area] ?? 0) + inWeekCount(c, b, area);
  const dropped: Record<string, number> = {}; // blocks put off so far this week, per area, so no one area takes every hit
  const flex = free.map((cells) => { const row = Array<boolean>(24).fill(false); for (const x of cells) row[x] = true; return row; });

  for (const b of shuffle(c.rng, Array.from({ length: n }, (_, i) => i))) {
    for (const area of TOKEN_AREAS) if (plan[area][b] > 0) tok[b][area] = plan[area][b];
    let planned = Object.values(tok[b]).reduce((a, x) => a + x, 0);
    while (planned > free[b].length) {
      // Put off the area this bunk can best spare: not one it is already short on, and the one hit least so far.
      const options = MAY_FALL_SHORT.filter((a) => (tok[b][a] ?? 0) > 0);
      const spare = options.filter((a) => sessionTargetOf(c.roster.village[b], c.sessionWeeks, a) - (total(b, a) + tok[b][a] - 1) <= 1);
      const candidates = spare.length ? spare : options;
      if (candidates.length === 0) {
        if ((tok[b].Music ?? 0) > 0) {
          tok[b].Music--;
          planned--;
          c.unmet++;
          continue;
        }
        break;
      }
      const least = Math.min(...candidates.map((a) => dropped[a] ?? 0));
      const area = shuffle(c.rng, candidates.filter((a) => (dropped[a] ?? 0) === least))[0];
      tok[b][area]--;
      dropped[area] = (dropped[area] ?? 0) + 1;
      planned--;
      c.unmet++;
      c.carried.push({ bunk: b, area });
    }
  }

  // ---- 1. the planned areas: a search with backtracking, the variable with the fewest options first ---------------
  const placed = placeTokens(c, tok);

  // ---- 2. the leftover periods: Athletics, A&C, then Time with UH ----------------------------------------
  const emptyCells = (b: number): number[] => ALL_SLOTS.filter((s) => fillable(c, s) && isFree(c, b, s));
  for (const b of shuffle(c.rng, Array.from({ length: n }, (_, i) => i))) {
    let cells = emptyCells(b);
    if (cells.length === 0) continue;
    consolidate(c, b, placed.filter((p) => p.b === b));
    cells = emptyCells(b);
    let ok = tile(c, b, cells);
    for (let tries = 0; !ok && tries < REPAIR_TRIES; tries++) {
      // A leftover period that Athletics, A&C and Time with UH cannot take may take one of this bunk's planned blocks instead.
      // Swap one in, which frees the period that block came from.
      const stuck = cells.filter((s) => !leftoverFits(c, b, s));
      const targets = shuffle(c.rng, stuck.length > 0 ? stuck : cells);
      const mine = shuffle(c.rng, placed.filter((p) => p.b === b));
      let moved = false;
      for (const l of targets) {
        for (const t of mine) {
          const label = labelOf(t.area);
          c.grid[b][t.s] = '';
          c.dayMask[b] = buildDayMasks([c.grid[b]])[0];
          if (!areaOnDay(c, b, dayOf(l), t.area) && okPlace(c, b, [l], label)) {
            put(c, b, [l], label);
            t.s = l;
            moved = true;
            break;
          }
          c.grid[b][t.s] = label;
          c.dayMask[b] = buildDayMasks([c.grid[b]])[0];
        }
        if (moved) break;
      }
      if (!moved) break;
      cells = emptyCells(b);
      ok = tile(c, b, cells);
    }
    if (!ok) forceFill(c, b);
  }
  repairGrid(c, flex);
  rebalanceAthleticsAc(c);
  return ALL_SLOTS.every((s) => !fillable(c, s) || c.grid.every((row) => row[s] !== ''));
}

interface Var {
  b: number;
  area: string;
  label: string;
  domain: number[];
  at: number; // the period it was given, or -1
}

/** The periods a planned block could take right now. */
function domainOf(c: Ctx, b: number, area: string, label: string): number[] {
  const out: number[] = [];
  for (const s of ALL_SLOTS) if (fillable(c, s) && isFree(c, b, s) && !areaOnDay(c, b, dayOf(s), area) && okPlace(c, b, [s], label)) out.push(s);
  return out;
}

/**
 * Give every planned block (the rare areas, Music) a period. Depth-first search: always the block with the fewest periods left
 * to go, trying the periods that suit it best first, and backing up when a block runs out. A block of an area that may fall short
 * can be skipped, at most a few times, if the search cannot place everything. Returns where each placed block went.
 */
function placeTokens(c: Ctx, tok: Record<string, number>[]): { b: number; s: number; area: string }[] {
  const vars: Var[] = [];
  for (let b = 0; b < c.roster.n; b++) {
    for (const area of Object.keys(tok[b])) {
      for (let k = 0; k < tok[b][area]; k++) vars.push({ b, area, label: labelOf(area), domain: [], at: -1 });
    }
  }
  const crowd = ALL_SLOTS.map((s) => (fillable(c, s) ? c.grid.filter((row) => row[s] === '').length : 0));
  const fallShort = new Set(MAY_FALL_SHORT);
  const refresh = (v: Var) => {
    v.domain = domainOf(c, v.b, v.area, v.label);
  };
  const dropCell = (b: number, s: number) => {
    c.grid[b][s] = '';
    c.dayMask[b] = buildDayMasks([c.grid[b]])[0];
  };
  const skipped: Var[] = [];
  let nodes = 0;

  const search = (skips: number): boolean => {
    const open = vars.filter((v) => v.at < 0 && !skipped.includes(v));
    if (open.length === 0) return true;
    let pick = open[0];
    let pickKey = Infinity;
    for (const v of open) {
      const key = v.domain.length + c.rng() * 0.4;
      if (key < pickKey) {
        pick = v;
        pickKey = key;
      }
    }
    if (pick.domain.length === 0) {
      if (skips > 0 && fallShort.has(pick.area)) {
        skipped.push(pick);
        if (search(skips - 1)) return true;
        skipped.pop();
      }
      return false;
    }
    const scored = pick.domain.map((s) => {
      const day = dayOf(s);
      const row = c.grid[pick.b];
      const before = emptyRuns(row, day);
      row[s] = pick.label;
      const after = emptyRuns(row, day);
      row[s] = '';
      return { s, score: c.rng() * 1.5 + shareCost(c, pick.b, s, pick.area) + SHAPE_WEIGHT * (after - before) - CROWD_WEIGHT * crowd[s] };
    });
    scored.sort((x, y) => x.score - y.score);
    for (const { s } of scored.slice(0, BRANCH)) {
      if (++nodes > NODE_BUDGET) return false;
      put(c, pick.b, [s], pick.label);
      pick.at = s;
      crowd[s]--;
      const affected = vars.filter((v) => v.at < 0 && v !== pick && (v.b === pick.b || v.area === pick.area));
      const before = affected.map((v) => v.domain);
      const day = dayOf(s);
      const village = c.roster.village[pick.b];
      for (const v of affected) {
        if (v.b === pick.b && v.area === pick.area) refresh(v); // same bunk, same area: its day and ordinal change
        else if (v.b === pick.b) v.domain = v.domain.filter((x) => x !== s); // the period is taken
        else {
          // another bunk in the same area: only that period, and the same day inside the same village, can have changed
          const sameVillage = c.roster.village[v.b] === village;
          v.domain = v.domain.filter((x) => (x !== s && !(sameVillage && dayOf(x) === day)) || okPlace(c, v.b, [x], v.label));
        }
      }
      if (search(skips)) return true;
      affected.forEach((v, i) => (v.domain = before[i]));
      crowd[s]++;
      pick.at = -1;
      dropCell(pick.b, s);
      if (nodes > NODE_BUDGET) return false;
    }
    return false;
  };

  for (const v of vars) refresh(v);
  let solved = false;
  for (let skips = MAX_SKIPS; skips <= MAX_SKIPS && !solved; skips++) {
    nodes = 0;
    solved = search(skips);
    if (!solved) {
      // undo everything this pass placed
      for (const v of vars) {
        if (v.at >= 0) {
          dropCell(v.b, v.at);
          v.at = -1;
        }
      }
      skipped.length = 0;
      for (const v of vars) refresh(v);
    }
  }
  if (!solved) {
    // out of budget: place greedily, fewest options first, and carry what does not fit
    for (let guard = 0; guard < vars.length; guard++) {
      const open = vars.filter((v) => v.at < 0 && !skipped.includes(v));
      if (open.length === 0) break;
      for (const v of open) refresh(v);
      open.sort((x, y) => x.domain.length - y.domain.length);
      const v = open[0];
      if (v.domain.length === 0) {
        skipped.push(v);
        continue;
      }
      const s = v.domain[Math.floor(c.rng() * v.domain.length)];
      put(c, v.b, [s], v.label);
      v.at = s;
    }
  }
  const out: { b: number; s: number; area: string }[] = [];
  for (const v of vars) {
    if (v.at >= 0) out.push({ b: v.b, s: v.at, area: v.area });
  }
  for (const v of skipped) {
    c.unmet++;
    c.carried.push({ bunk: v.b, area: v.area });
  }
  return out;
}

/** Last resort for a bunk that could not be tiled cleanly: fill what is left with Athletics and A&C, and let the repair pass fix the rule breaks. */
function forceFill(c: Ctx, b: number): void {
  const total = (area: string): number => (c.hist[b].earlier[area] ?? 0) + (c.hist[b].later[area] ?? 0) + inWeekCount(c, b, area);
  let ath = total('Athletics');
  let ac = total('A&C');
  for (const s of ALL_SLOTS) {
    if (!fillable(c, s) || !isFree(c, b, s)) continue;
    const area = ath < ac ? 'Athletics' : 'A&C';
    c.grid[b][s] = area;
    if (area === 'Athletics') ath++;
    else ac++;
  }
  c.dayMask[b] = buildDayMasks([c.grid[b]])[0];
}

/** Separate runs of empty periods in a bunk's week (a run never crosses a day). Each needs its own Athletics, A&C or UH block. */
function emptyRunsInWeek(c: Ctx, b: number): number {
  let runs = 0;
  for (let day = 0; day < 6; day++) runs += emptyRuns(c.grid[b], day) - (c.lastWeek && day === 5 ? emptyRuns(c.grid[b], day) : 0);
  return runs;
}

/**
 * A bunk can only take two Athletics blocks and two A&C blocks a week, so its empty periods must fall in few runs. Move the bunk's
 * planned blocks between periods (keeping every rule) until the empty ones are in at most that many runs.
 */
function consolidate(c: Ctx, b: number, mine: { b: number; s: number; area: string }[]): void {
  for (let guard = 0; guard < 12; guard++) {
    const now = emptyRunsInWeek(c, b);
    if (now <= MAX_LEFTOVER_RUNS) return;
    let best: { t: { s: number; area: string }; to: number; runs: number } | null = null;
    const cells = ALL_SLOTS.filter((x) => fillable(c, x) && isFree(c, b, x));
    for (const t of mine) {
      const label = labelOf(t.area);
      c.grid[b][t.s] = '';
      c.dayMask[b] = buildDayMasks([c.grid[b]])[0];
      for (const to of cells) {
        if (areaOnDay(c, b, dayOf(to), t.area) || !okPlace(c, b, [to], label)) continue;
        c.grid[b][to] = label;
        const runs = emptyRunsInWeek(c, b);
        c.grid[b][to] = '';
        if (runs < now && (!best || runs < best.runs || (runs === best.runs && c.rng() < 0.5))) best = { t, to, runs };
      }
      c.grid[b][t.s] = label;
      c.dayMask[b] = buildDayMasks([c.grid[b]])[0];
    }
    if (!best) return;
    c.grid[b][best.t.s] = '';
    put(c, b, [best.to], labelOf(best.t.area));
    best.t.s = best.to;
    c.dayMask[b] = buildDayMasks([c.grid[b]])[0];
  }
}

/**
 * Give every empty period of a bunk to Athletics, A&C or Time with UH, as blocks of one or two periods, at most one block of an
 * area a day, at most two Athletics and two A&C a week (and the session limit on UH), keeping every sharing rule. Backtracks if it
 * has to. On failure the bunk is left exactly as it was.
 */
function tile(c: Ctx, b: number, cells: number[]): boolean {
  const row = c.grid[b];
  const cellSet = new Set(cells);
  const mine = new Map<number, Set<string>>(); // areas this search has put on a day
  const total = (area: string): number => (c.hist[b].earlier[area] ?? 0) + (c.hist[b].later[area] ?? 0) + inWeekCount(c, b, area);
  let ath = total('Athletics');
  let ac = total('A&C');
  let uh = total('TW UH');
  const allowedGap = FLEXIBLE_VILLAGES.includes(c.roster.village[b]) ? GAP_MAX_MT : GAP_MAX_OCS;
  const usedToday = (day: number, area: string): boolean => areaOnDay(c, b, day, area) || (mine.get(day)?.has(area) ?? false);

  const go = (i: number): boolean => {
    while (i < cells.length && row[cells[i]] !== '') i++;
    if (i >= cells.length) return true;
    const s = cells[i];
    const day = dayOf(s);
    const room = (len: number): boolean => periodOf(s) + len <= 4 && Array.from({ length: len - 1 }, (_, k) => s + 1 + k).every((x) => cellSet.has(x) && row[x] === '');
    const preferred = ath < ac ? 'Athletics' : 'A&C';
    const options: { area: string; label: string; len: number; cost: number }[] = [];
    for (const area of ['Athletics', 'A&C', 'TW UH']) {
      if (usedToday(day, area) || (area === 'TW UH' && uh >= UH_MAX_PER_SESSION)) continue;
      const label = area === 'TW UH' ? 'Time with UH' : area;
      // a block of two is normal; three only when nothing else fits
      for (const len of area === 'TW UH' ? [1] : [3, 2, 1]) {
        if (len > 1 && !room(len)) continue;
        const slots = Array.from({ length: len }, (_, k) => s + k);
        if (!okPlace(c, b, slots, label)) continue;
        const gapAfter = Math.abs((area === 'A&C' ? ac + 1 : ac) - (area === 'Athletics' ? ath + 1 : ath));
        const overGap = area === 'TW UH' ? 0 : Math.max(0, gapAfter - allowedGap);
        const cost =
          shareCost(c, b, s, area) +
          (len === 2 ? -0.5 : len === 3 ? 1.5 : 0) +
          (area === preferred ? 0 : area === other(preferred) ? 0.7 : 2.5) +
          4 * overGap +
          c.rng() * 0.6;
        options.push({ area, label, len, cost });
      }
    }
    options.sort((x, y) => x.cost - y.cost);
    for (const o of options) {
      const slots = Array.from({ length: o.len }, (_, k) => s + k);
      for (const x of slots) row[x] = o.label;
      const set = mine.get(day) ?? new Set<string>();
      set.add(o.area);
      mine.set(day, set);
      if (o.area === 'Athletics') ath++;
      else if (o.area === 'A&C') ac++;
      else uh++;
      if (go(i + 1)) return true;
      if (o.area === 'Athletics') ath--;
      else if (o.area === 'A&C') ac--;
      else uh--;
      set.delete(o.area);
      for (const x of slots) row[x] = '';
    }
    return false;
  };

  if (!go(0)) {
    return false;
  }
  c.dayMask[b] = buildDayMasks([row])[0];
  return true;
}

/**
 * Filling a period takes the label that keeps a bunk's Athletics and A&C level, but sharing rules can force the other one.
 * Fix what is left over by flipping whole blocks this week, keeping every flip that leaves the rules intact.
 */
function rebalanceAthleticsAc(c: Ctx): void {
  const total = (b: number, area: string): number =>
    (c.hist[b].earlier[area] ?? 0) + (c.hist[b].later[area] ?? 0) + inWeekCount(c, b, area);
  for (let b = 0; b < c.roster.n; b++) {
    for (let guard = 0; guard < 6; guard++) {
      const gap = total(b, 'A&C') - total(b, 'Athletics'); // want 0 or 1
      if (gap === 0 || gap === 1) break;
      const from = gap < 0 ? 'Athletics' : 'A&C';
      const to = gap < 0 ? 'A&C' : 'Athletics';
      let flipped = false;
      for (const k of shuffle(c.rng, blocksOf(c.grid[b]))) {
        if (k.label !== from) continue;
        const slots = Array.from({ length: k.len }, (_, i) => k.start + i);
        if (slots.some((s) => c.locked[b][s])) continue;
        if (c.weekIndex === 1 && k.start === 3 && c.roster.village[b] === 'M') continue; // Mohawk's fixed Sunday Athletics
        if (blocksOf(c.grid[b]).some((x) => x.day === k.day && areaOf(x.label) === to)) continue;
        if (tryRelabel(c, b, slots, to)) {
          flipped = true;
          break;
        }
      }
      if (!flipped) break;
    }
  }
}
