import {
  FLEXIBLE_VILLAGES,
  LEAGUE_PER_WEEK,
  PAIR_PROBABILITY,
  POOL_MAX_CAMPERS,
  POOL_YOUNG_MAX_CAMPERS,
  WATERFRONT_PER_WEEK,
  leagueLabelFor,
} from './config';
import { blocksOf, halfSlots, slotAt } from './history';
import { TOKEN_AREAS, inWeekCount, type Plan } from './planner';
import { chance, shuffle } from './rng';
import { pairable } from './roster';
import {
  ALL_SLOTS,
  areaOnDay,
  daySlots,
  fillable,
  h5ok,
  isFree,
  poolLoad,
  put,
  putVillage,
  rangeFree,
  slotHas,
  villageAreaOnDay,
  villageFree,
  warn,
  type Ctx,
} from './state';

/** Free, fillable cells left on a day for a bunk once `adding` more are used. Days that end up nearly full are easier to finish. */
function leftover(c: Ctx, bunks: number[], day: number, adding: number): number {
  const slots = daySlots(day);
  let worst = 0;
  for (const b of bunks) {
    let free = -adding;
    for (const s of slots) if (c.grid[b][s] === '' && fillable(c, s)) free++;
    if (free > worst) worst = free;
  }
  return worst;
}

const idx = (c: Ctx, v: string): number[] => c.roster.byVillage[v];

// ---- Waterfront ---------------------------------------------------------------------------------

/**
 * Periods a bunk must keep for things that outrank a Waterfront block only when there is no way
 * around it: Pool, Ropes and the weekly Music. The rarer areas give way to Waterfront when a
 * week is over-subscribed.
 */
function reservedCells(c: Ctx, plan: Plan, b: number): number {
  let n = plan.Pool[b] + 2 * plan.Ropes[b] + plan.Music[b];
  // O, C and S must hit every target, so for them the rarer areas are reserved too; Mohawk and Tusc give way.
  if (!FLEXIBLE_VILLAGES.includes(c.roster.village[b])) for (const a of TOKEN_AREAS) if (a !== 'Music') n += plan[a][b];
  return n;
}

/** League or triathlon periods a village still has to place this week. */
function pendingLeagueBlocks(c: Ctx, v: string): number {
  if (v === 'T') return 0; // Tusc's triathlon is placed later and has its own room check
  const have = Math.max(...idx(c, v).map((b) => inWeekCount(c, b, 'League')));
  return Math.max(0, LEAGUE_PER_WEEK - have);
}
const leagueCells = (c: Ctx, v: string): number =>
  v === 'T' ? (c.lastWeek ? 0 : LEAGUE_PER_WEEK + 1) : pendingLeagueBlocks(c, v) * (v === 'M' ? 2 : 1);

/** On how many different days could the village still place a league block if these slots were taken? */
function leagueDaysLeft(c: Ctx, v: string, taken: readonly number[]): number {
  let n = 0;
  for (const day of c.days) {
    if (villageAreaOnDay(c, v, day, 'League')) continue;
    const options = v === 'M' ? [[...halfSlots(day, 0)], [...halfSlots(day, 1)]] : [0, 1, 2, 3].map((p) => [slotAt(day, p)]);
    if (options.some((slots) => villageFree(c, v, slots) && !slots.some((s) => taken.includes(s)))) n++;
  }
  return n;
}

export function placeWaterfront(c: Ctx, plan: Plan): void {
  const villages = c.roster.villages;
  /** Room left in the village's tightest bunk after league, Pool, Ropes and Music. */
  const slack = (v: string): number =>
    Math.min(
      ...idx(c, v).map((b) => {
        let free = 0;
        for (const s of ALL_SLOTS) if (c.grid[b][s] === '' && fillable(c, s)) free++;
        return free - reservedCells(c, plan, b);
      }),
    ) - leagueCells(c, v);
  const thisWeek: Record<string, number> = {};
  const total: Record<string, number> = {};
  const want: Record<string, number> = {};
  for (const v of villages) {
    const members = idx(c, v);
    const earlier = Math.max(...members.map((b) => c.hist[b].earlier.Waterfront ?? 0));
    const later = Math.max(...members.map((b) => c.hist[b].later.Waterfront ?? 0));
    const here = Math.max(...members.map((b) => inWeekCount(c, b, 'Waterfront')));
    thisWeek[v] = here;
    total[v] = earlier + later + here;
    // catch up if earlier weeks came up short
    want[v] = WATERFRONT_PER_WEEK + Math.max(0, WATERFRONT_PER_WEEK * (c.weekIndex - 1) - earlier);
  }

  /** Could this village take Waterfront on this half-day right now, and still have room for its league periods? */
  const usable = (v: string, day: number, half: number): boolean => {
    const slots = halfSlots(day, half);
    if (villageAreaOnDay(c, v, day, 'Waterfront') || !villageFree(c, v, slots)) return false;
    if (slots.some((s) => slotHas(c, s, 'Waterfront'))) return false; // one village at Waterfront per half-day
    return leagueDaysLeft(c, v, slots) >= pendingLeagueBlocks(c, v);
  };

  let active = [...villages];
  /** Half-days still open to a village, ignoring the league-room check (cheap, used only to rank villages). */
  const optionCount = (v: string): number => {
    let n = 0;
    for (const day of c.days) {
      if (villageAreaOnDay(c, v, day, 'Waterfront')) continue;
      for (const half of [0, 1]) {
        const slots = halfSlots(day, half);
        if (villageFree(c, v, slots) && !slots.some((s) => slotHas(c, s, 'Waterfront'))) n++;
      }
    }
    return n;
  };
  const bestHalfDay = (v: string): { day: number; half: number } | null => {
    let best: { day: number; half: number; score: number } | null = null;
    const members = idx(c, v);
    const rivals = active.filter((x) => x !== v && thisWeek[x] < want[x]).map((x) => ({ x, options: Math.max(1, optionCount(x)) }));
    for (const day of c.days) {
      const near = c.days.filter((d) => Math.abs(d - day) <= 1 && villageAreaOnDay(c, v, d, 'Waterfront')).length;
      for (const half of [0, 1]) {
        if (!usable(v, day, half)) continue;
        // leave half-days for villages that have few others to choose from
        const wanted = rivals.filter((r) => usable(r.x, day, half)).reduce((sum, r) => sum + 1 / r.options, 0);
        const score = c.rng() + 3 * near + 8 * wanted + 0.4 * leftover(c, members, day, 2);
        if (!best || score < best.score) best = { day, half, score };
      }
    }
    return best;
  };

  // Villages that have run out of room stay where they are; nobody else may get more than one block ahead of them.
  const frozen: Record<string, number> = {};
  const drop = (v: string) => {
    frozen[v] = total[v];
    active = active.filter((x) => x !== v);
  };
  while (active.length > 0) {
    // a village only takes another Waterfront if it still has room for league and everything planned
    for (const v of active.filter((x) => slack(x) < 2)) drop(v);
    const frozenMin = Math.min(Infinity, ...Object.values(frozen));
    const eligible = active.filter((v) => thisWeek[v] < want[v] && total[v] <= frozenMin);
    if (eligible.length === 0) break;
    // whoever is furthest behind goes first; among equals, the village with the fewest half-days to choose from
    const v = eligible
      .map((x) => ({ x, behind: total[x], options: optionCount(x), tie: c.rng() }))
      .sort((a, b) => a.behind - b.behind || a.options - b.options || a.tie - b.tie)[0].x;
    const spot = bestHalfDay(v);
    if (!spot) {
      drop(v);
      continue;
    }
    putVillage(c, v, halfSlots(spot.day, spot.half), 'Waterfront');
    thisWeek[v]++;
    total[v]++;
  }
  for (const v of villages) {
    if (thisWeek[v] < WATERFRONT_PER_WEEK) warn(c, `Village ${v} got ${thisWeek[v]} of ${WATERFRONT_PER_WEEK} Waterfront periods this week (there was not enough room).`);
  }
}

// ---- League -------------------------------------------------------------------------------------

export function placeLeague(c: Ctx): void {
  for (const v of shuffle(c.rng, c.roster.villages)) {
    if (v === 'T') continue; // Tusc plays the triathlon instead
    const members = idx(c, v);
    const label = leagueLabelFor(v, c.sessionWeeks);
    const doubles = v === 'M';
    const have = Math.max(...members.map((b) => inWeekCount(c, b, 'League')));
    for (let i = have; i < LEAGUE_PER_WEEK; i++) {
      let best: { slots: number[]; score: number } | null = null;
      for (const day of c.days) {
        if (villageAreaOnDay(c, v, day, 'League')) continue;
        const options = doubles ? [[...halfSlots(day, 0)], [...halfSlots(day, 1)]] : [0, 1, 2, 3].map((p) => [slotAt(day, p)]);
        for (const slots of options) {
          if (!villageFree(c, v, slots)) continue;
          const score = c.rng() + 0.4 * leftover(c, members, day, slots.length);
          if (!best || score < best.score) best = { slots, score };
        }
      }
      if (!best) {
        c.structural++;
        warn(c, `Village ${v} got ${i} of ${LEAGUE_PER_WEEK} league periods this week (there was not enough room).`);
        break;
      }
      putVillage(c, v, best.slots, label);
    }
  }
}

// ---- Tusc triathlon training --------------------------------------------------------------------

export function placeTri(c: Ctx): void {
  const v = 'T';
  // The last week has only Wednesday left for Tusc, and Pool, Music and Waterfront need it more, so no training then.
  if (!c.roster.byVillage[v] || c.lastWeek) return;
  const members = idx(c, v);
  const label = 'Tusc Triathlon Training';
  let allowed = c.days;
  if (c.weekIndex === 1) allowed = allowed.filter((d) => d !== 0); // starts on Monday
  if (c.tripDay !== null) allowed = allowed.filter((d) => d < (c.tripDay as number)); // training comes before the mini trip
  // one double and two singles on different days
  const blocks: ('double' | 'single')[] = ['double', 'single', 'single'];
  const usedDays = new Set<number>();
  for (const kind of blocks) {
    let best: { slots: number[]; score: number } | null = null;
    for (const day of allowed) {
      if (usedDays.has(day) || villageAreaOnDay(c, v, day, 'League')) continue;
      const options = kind === 'double' ? [[...halfSlots(day, 0)], [...halfSlots(day, 1)]] : [0, 1, 2, 3].map((p) => [slotAt(day, p)]);
      for (const slots of options) {
        if (!villageFree(c, v, slots)) continue;
        if (slots.some((s) => poolLoad(c, s).count > 0 && !members.some((b) => c.grid[b][s] === label))) continue;
        const score = c.rng() + 0.4 * leftover(c, members, day, slots.length);
        if (!best || score < best.score) best = { slots, score };
      }
    }
    if (!best) {
      c.structural++;
      warn(c, `Tusc got fewer triathlon training periods than planned this week (there was not enough pool-free time).`);
      continue;
    }
    putVillage(c, v, best.slots, label);
    usedDays.add(Math.floor(best.slots[0] / 4));
  }
}

// ---- grouping helpers for ropes and pool -----------------------------------------------------------

function group(c: Ctx, bunks: number[], area: string, sameVillageOnly: boolean, maxCampers: number | null): number[][] {
  const order = [...bunks].sort((a, b) => {
    const va = c.roster.villages.indexOf(c.roster.village[a]);
    const vb = c.roster.villages.indexOf(c.roster.village[b]);
    return va - vb || c.roster.age[a] - c.roster.age[b];
  });
  const used = new Set<number>();
  const out: number[][] = [];
  const base = new Map<number, number>();
  const baseOf = (x: number): number => {
    let v = base.get(x);
    if (v === undefined) {
      v = (c.hist[x].earlier[area] ?? 0) + inWeekCount(c, x, area);
      base.set(x, v);
    }
    return v;
  };
  for (const b of order) {
    if (used.has(b)) continue;
    used.add(b);
    const unit = [b];
    if (chance(c.rng, PAIR_PROBABILITY)) {
      const partner = order.find(
        (x) =>
          !used.has(x) &&
          pairable(c.roster, b, x) &&
          (!sameVillageOnly || c.roster.village[x] === c.roster.village[b]) &&
          baseOf(x) === baseOf(b) &&
          (maxCampers === null || c.roster.campers[x] + c.roster.campers[b] <= maxCampers),
      );
      if (partner !== undefined) {
        used.add(partner);
        unit.push(partner);
      }
    }
    out.push(unit);
  }
  return shuffle(c.rng, out);
}

/**
 * Place units one at a time, always the one with the fewest places left to go, so a bunk with
 * little room is not left stranded by units that could have gone anywhere.
 */
function placeMostConstrainedFirst<T>(
  c: Ctx,
  units: number[][],
  options: (unit: number[]) => { value: T; score: number }[],
  apply: (unit: number[], value: T) => void,
  couldNot: (unit: number[]) => string,
): void {
  const remaining = [...units];
  while (remaining.length > 0) {
    let pick = 0;
    let pickOptions = options(remaining[0]);
    let pickKey = pickOptions.length + c.rng() * 0.5;
    for (let i = 1; i < remaining.length; i++) {
      const o = options(remaining[i]);
      const key = o.length + c.rng() * 0.5;
      if (key < pickKey) {
        pick = i;
        pickOptions = o;
        pickKey = key;
      }
    }
    const unit = remaining.splice(pick, 1)[0];
    if (pickOptions.length === 0) {
      c.unmet += unit.length;
      c.structural += unit.length;
      warn(c, couldNot(unit));
      continue;
    }
    apply(unit, pickOptions.reduce((a, b) => (b.score < a.score ? b : a)).value);
  }
}

// ---- Ropes --------------------------------------------------------------------------------------

export function placeRopes(c: Ctx, plan: Plan): void {
  const ropers = plan.Ropes.map((k, b) => (k > 0 ? b : -1)).filter((b) => b >= 0);
  const names = (unit: number[]): string => unit.map((b) => c.roster.names[b]).join(' and ');
  placeMostConstrainedFirst<{ day: number; half: number }>(
    c,
    group(c, ropers, 'Ropes', true, null),
    (unit) => {
      const out: { value: { day: number; half: number }; score: number }[] = [];
      for (const day of c.days) {
        for (const half of [0, 1]) {
          const slots = halfSlots(day, half);
          if (!unit.every((b) => rangeFree(c, b, slots) && !areaOnDay(c, b, day, 'Ropes') && h5ok(c, b, slots, 'Low Ropes'))) continue;
          const others = c.grid.filter((row) => slots.some((s) => row[s] === 'Low Ropes' || row[s] === 'High Ropes')).length;
          out.push({ value: { day, half }, score: c.rng() + 3 * Math.min(others, 3) + 0.4 * leftover(c, unit, day, 2) });
        }
      }
      return out;
    },
    (unit, spot) => {
      for (const b of unit) put(c, b, halfSlots(spot.day, spot.half), 'Low Ropes'); // relabelled Low or High at the end
    },
    (unit) => `Ropes for ${names(unit)} could not be placed this week.`,
  );
}

/** First time at ropes is Low, every later time High, by counting the bunk's ropes blocks in order. */
export function relabelRopes(c: Ctx): void {
  for (let b = 0; b < c.roster.n; b++) {
    let ord = (c.hist[b].earlier.Ropes ?? 0) + 1;
    for (const k of blocksOf(c.grid[b])) {
      if (k.area !== 'Ropes') continue;
      const label = ord === 1 ? 'Low Ropes' : 'High Ropes';
      if (!c.locked[b][k.start]) for (let i = 0; i < k.len; i++) c.grid[b][k.start + i] = label;
      ord++;
    }
  }
}

// ---- Pool ---------------------------------------------------------------------------------------

export function placePool(c: Ctx, plan: Plan): void {
  const swimmers = plan.Pool.map((k, b) => (k > 0 ? b : -1)).filter((b) => b >= 0);
  const names = (unit: number[]): string => unit.map((b) => c.roster.names[b]).join(' and ');
  placeMostConstrainedFirst<number>(
    c,
    group(c, swimmers, 'Pool', false, POOL_YOUNG_MAX_CAMPERS),
    (unit) => {
      const out: { value: number; score: number }[] = [];
      const campers = unit.reduce((sum, b) => sum + c.roster.campers[b], 0);
      const youngCampers = unit
        .filter((b) => c.roster.village[b] === 'O' || c.roster.village[b] === 'C')
        .reduce((sum, b) => sum + c.roster.campers[b], 0);
      for (const day of c.days) {
        if (unit.some((b) => areaOnDay(c, b, day, 'Pool'))) continue;
        const poolToday = daySlots(day).reduce((sum, s) => sum + c.grid.filter((row) => row[s] === 'Pool').length, 0);
        for (let p = 0; p < 4; p++) {
          const s = slotAt(day, p);
          if (!unit.every((b) => isFree(c, b, s))) continue;
          if (slotHas(c, s, 'Tusc Triathlon Training') || slotHas(c, s, 'Swim Test')) continue; // pool is closed here
          const load = poolLoad(c, s);
          if (load.total + campers > POOL_MAX_CAMPERS && !(load.count === 0 && unit.length === 1)) continue;
          if (load.young + youngCampers > POOL_YOUNG_MAX_CAMPERS && !(load.young === 0 && unit.length === 1)) continue;
          if (!unit.every((b) => h5ok(c, b, [s], 'Pool'))) continue;
          out.push({ value: s, score: c.rng() + 0.02 * load.total + 0.25 * poolToday + 0.4 * leftover(c, unit, day, 1) });
        }
      }
      return out;
    },
    (unit, slot) => {
      for (const b of unit) put(c, b, [slot], 'Pool');
    },
    (unit) => `Pool for ${names(unit)} could not be placed this week.`,
  );
}
