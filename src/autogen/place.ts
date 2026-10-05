import { areaOf } from '../config';
import { AGE_ALLOWED, EXTRA_POOL_MIN_SPARE, LEAGUE_DAY_PATTERNS, leagueFor, leagueMinFor, triathlonPeriodsAWeek, TRI_AWAY_PERIODS, TRIP_LABELS, POOL_MAX_PER_WEEK, POOL_TARGETS, WATERFRONT_HALF_DAY_OFF, FLEXIBLE_VILLAGES, POOL_LESSONS, POOL_MAX_CAMPERS, WATERFRONT_PER_WEEK, leagueLabelFor } from './config';
import { ropeGroups } from './groups';
import { blocksOf, halfSlots, slotAt } from './history';
import { TOKEN_AREAS, inWeekCount, type Plan } from './planner';
import { shuffle } from './rng';
import { shareLevel } from './roster';
import { beforeSwimTest } from './share';
import {
  ALL_SLOTS,
  areaOnDay,
  backToBack,
  buildDayMasks,
  daySlots,
  fillable,
  isFree,
  okPlace,
  onNextDay,
  poolLoad,
  put,
  putVillage,
  rangeFree,
  slotHas,
  villageAreaOnDay,
  villageFree,
  villageOnNextDay,
  warn,
  type Ctx,
} from './state';

/** A day with this many empty periods or fewer is easy to finish: one Athletics and one A&C. */
const EASY_DAY_FREE = 2;
/** How much more a block is drawn to a day that would otherwise be left with three or four empty periods. */
const CROWDED_DAY_WEIGHT = 4;

/**
 * How much a block of `adding` periods on this day helps its bunks. Athletics and A&C are single periods, one of each a
 * day, so a bunk's empty periods should be spread over as many days as possible: a block goes on the day that has the most
 * room, and above all on a day that would otherwise be left with more empty periods than Athletics and A&C can take.
 */
function leftover(c: Ctx, bunks: number[], day: number, adding: number): number {
  const slots = daySlots(day);
  let worst = 0;
  for (const b of bunks) {
    let free = 0;
    for (const s of slots) if (c.grid[b][s] === '' && fillable(c, s)) free++;
    if (free > worst) worst = free;
  }
  const over = (free: number): number => Math.max(0, free - EASY_DAY_FREE) ** 2;
  return worst - adding + CROWDED_DAY_WEIGHT * (over(worst) - over(worst - adding));
}

const idx = (c: Ctx, v: string): number[] => c.roster.byVillage[v];

/**
 * How many bunks still have these periods empty, on average. Every period can only take so many bunks under the sharing and
 * cap rules, so village-level blocks go where the most bunks are still free, which keeps the load even.
 */
function busyness(c: Ctx, slots: readonly number[]): number {
  let free = 0;
  for (const s of slots) for (let b = 0; b < c.roster.n; b++) if (c.grid[b][s] === '') free++;
  return free / slots.length;
}
export const BUSY_WEIGHT = 0.5;
/** How strongly a block is drawn to the day on which its bunks have the most empty periods. */
export const SPREAD_WEIGHT = 0.6;

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

/** Is the village away on a long trip this week (Tusc's three-day bike trip)? Then it has no triathlon training. */
const awayOnTrip = (c: Ctx, v: string): boolean => c.grid[idx(c, v)[0]].filter((l) => TRIP_LABELS.includes(l)).length >= TRI_AWAY_PERIODS;

/** League or triathlon periods a village still has to place this week. */
function pendingLeagueBlocks(c: Ctx, v: string): number {
  if (v === 'T') return 0; // Tusc's triathlon is placed later and has its own room check
  const have = Math.max(...idx(c, v).map((b) => inWeekCount(c, b, 'League')));
  return Math.max(0, leagueFor(v) - have);
}
const leagueCells = (c: Ctx, v: string): number =>
  v === 'T' ? (awayOnTrip(c, v) ? 0 : triathlonPeriodsAWeek()) : pendingLeagueBlocks(c, v) * (v === 'M' ? 2 : 1);

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

  // Waterfront likes one half-day off a week. When the villages would use every half-day there is, the village that is
  // furthest ahead takes one block fewer (never its last), so over the session the short week rotates.
  if (WATERFRONT_HALF_DAY_OFF) {
    let halfDays = 0;
    for (const day of c.days) for (const half of [0, 1]) if (villages.some((v) => villageFree(c, v, halfSlots(day, half)))) halfDays++;
    const asked = (): number => villages.reduce((sum, v) => sum + Math.max(0, want[v] - thisWeek[v]), 0);
    while (asked() > halfDays - 1) {
      const able = villages.filter((v) => want[v] - thisWeek[v] > 0 && want[v] > 1);
      if (able.length === 0) break;
      const most = Math.max(...able.map((v) => total[v] + want[v] - thisWeek[v]));
      const pick = shuffle(c.rng, able.filter((v) => total[v] + want[v] - thisWeek[v] === most))[0];
      want[pick]--;
    }
  }

  /** Could this village take Waterfront on this half-day right now, and still have room for its league periods? */
  const usable = (v: string, day: number, half: number): boolean => {
    const slots = halfSlots(day, half);
    if (villageAreaOnDay(c, v, day, 'Waterfront') || !villageFree(c, v, slots)) return false;
    if (slots.some((s) => slotHas(c, s, 'Waterfront'))) return false; // one village at Waterfront per half-day
    if (idx(c, v).some((b) => backToBack(c, b, slots, 'Waterfront')) || villageOnNextDay(c, v, day, 'Waterfront')) return false;
    if (beforeSwimTest(c.weekIndex, c.grid[idx(c, v)[0]], slots[0], v)) return false; // no Waterfront until the swim test is done
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
      for (const half of [0, 1]) {
        if (!usable(v, day, half)) continue;
        // leave half-days for villages that have few others to choose from
        const wanted = rivals.filter((r) => usable(r.x, day, half)).reduce((sum, r) => sum + 1 / r.options, 0);
        const score = c.rng() + 8 * wanted - SPREAD_WEIGHT * leftover(c, members, day, 2) - BUSY_WEIGHT * busyness(c, halfSlots(day, half));
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
    if (thisWeek[v] < Math.min(want[v], WATERFRONT_PER_WEEK)) warn(c, `Village ${v} got ${thisWeek[v]} of ${WATERFRONT_PER_WEEK} Waterfront periods this week (there was not enough room).`);
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
    const optionsOn = (day: number): number[][] => (doubles ? [[...halfSlots(day, 0)], [...halfSlots(day, 1)]] : [0, 1, 2, 3].map((p) => [slotAt(day, p)]));
    const playing = (day: number): boolean => villageAreaOnDay(c, v, day, 'League');
    const open = (day: number): boolean =>
      playing(day) || optionsOn(day).some((slots) => villageFree(c, v, slots) && !members.some((b) => backToBack(c, b, slots, 'League')));
    // League days are never next to each other. Aim for a set of three such days that are all still possible; a week with
    // no such set (the short last week, a week around a trip) gets as many as fit, which is at least LEAGUE_MIN_PER_WEEK.
    const pattern = shuffle(c.rng, LEAGUE_DAY_PATTERNS).find((days) => c.days.filter(playing).every((d) => days.includes(d)) && days.every((d) => c.days.includes(d) && open(d)));
    for (let i = have; i < leagueFor(v); i++) {
      let best: { slots: number[]; score: number } | null = null;
      for (const day of c.days) {
        if (playing(day) || villageOnNextDay(c, v, day, 'League') || (pattern && !pattern.includes(day))) continue;
        for (const slots of optionsOn(day)) {
          if (!villageFree(c, v, slots) || members.some((b) => backToBack(c, b, slots, 'League'))) continue;
          const score = c.rng() - SPREAD_WEIGHT * leftover(c, members, day, slots.length) - BUSY_WEIGHT * busyness(c, slots);
          if (!best || score < best.score) best = { slots, score };
        }
      }
      if (!best) {
        if (i < leagueMinFor(v)) {
          c.missing.push(`Village ${v} got ${i} of ${leagueFor(v)} league periods.`);
          warn(c, `Village ${v} got ${i} of ${leagueFor(v)} league periods this week (there was not enough room).`);
        }
        break;
      }
      putVillage(c, v, best.slots, label);
    }
  }
}

// ---- Tusc triathlon training --------------------------------------------------------------------

export function placeTri(c: Ctx): void {
  const v = 'T';
  // In the week of the three-day bike trip Tusc has a day or so left, and Pool, Music and Waterfront need it more: no training then.
  if (!c.roster.byVillage[v] || awayOnTrip(c, v)) return;
  const members = idx(c, v);
  const label = 'Tusc Triathlon Training';
  let allowed = c.days;
  if (c.weekIndex === 1) allowed = allowed.filter((d) => d !== 0); // starts on Monday
  // training comes before the mini trip: on the days before it, or earlier on the day itself
  const tripStart = c.tripDay === null ? Infinity : c.grid[members[0]].findIndex((l, s) => l === 'Bike Trip' && Math.floor(s / 4) === c.tripDay);
  if (c.tripDay !== null) allowed = allowed.filter((d) => d <= (c.tripDay as number));
  const fits = (slots: number[]): boolean =>
    slots.every((s) => s < tripStart) &&
    villageFree(c, v, slots) &&
    !members.some((b) => backToBack(c, b, slots, 'League')) &&
    !slots.some((s) => poolLoad(c, s).count > 0 && !members.some((b) => c.grid[b][s] === label));
  const singles = (day: number): number[][] => [0, 1, 2, 3].map((p) => [slotAt(day, p)]);
  // One double and two singles, on days that are not next to each other. Aim for a set of three such days; a week with
  // no such set gets as many sessions as fit.
  const pattern = shuffle(c.rng, LEAGUE_DAY_PATTERNS).find((days) => days.every((d) => allowed.includes(d) && !villageAreaOnDay(c, v, d, 'League') && singles(d).some(fits)));
  const blocks: ('double' | 'single')[] = Array.from({ length: leagueFor(v) }, (_, i) => (i === 0 ? 'double' : 'single'));
  let placed = 0;
  for (const kind of blocks) {
    let best: { slots: number[]; score: number } | null = null;
    for (const day of allowed) {
      if (villageAreaOnDay(c, v, day, 'League') || villageOnNextDay(c, v, day, 'League') || (pattern && !pattern.includes(day))) continue;
      const options = kind === 'double' ? [[...halfSlots(day, 0)], [...halfSlots(day, 1)]] : singles(day);
      for (const slots of options) {
        if (!fits(slots)) continue;
        const score = c.rng() - SPREAD_WEIGHT * leftover(c, members, day, slots.length) - BUSY_WEIGHT * busyness(c, slots);
        if (!best || score < best.score) best = { slots, score };
      }
    }
    if (!best) continue;
    putVillage(c, v, best.slots, label);
    placed++;
  }
  if (placed < leagueMinFor(v)) {
    c.missing.push('Tusc got fewer triathlon training periods than planned.');
    warn(c, `Tusc got fewer triathlon training periods than planned this week (there was not enough pool-free time).`);
  }
}

// ---- placing groups ---------------------------------------------------------------------------------

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
  /** A rare area that does not fit is carried over; anything else that does not fit makes the week not good enough. */
  carryArea?: (unit: number[]) => string | undefined,
  /** A last try for a unit with nowhere to go. Returns true when it found a place itself. */
  rescue?: (unit: number[]) => boolean,
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
      if (rescue?.(unit)) continue;
      c.unmet += unit.length;
      const area = carryArea?.(unit);
      if (area) for (const b of unit) c.carried.push({ bunk: b, area });
      else c.missing.push(couldNot(unit));
      warn(c, couldNot(unit));
      continue;
    }
    apply(unit, pickOptions.reduce((a, b) => (b.score < a.score ? b : a)).value);
  }
}

/** Would every bunk of the group keep the sharing rules with this label on these slots? Tries them one after another, then undoes it. */
function okPlaceGroup(c: Ctx, unit: readonly number[], slots: readonly number[], label: string): boolean {
  const saved = unit.map((b) => slots.map((s) => c.grid[b][s]));
  let ok = true;
  let done = 0;
  for (const b of unit) {
    if (!okPlace(c, b, slots, label)) {
      ok = false;
      break;
    }
    for (const s of slots) c.grid[b][s] = label;
    done++;
  }
  for (let i = 0; i < done; i++) slots.forEach((s, k) => (c.grid[unit[i]][s] = saved[i][k]));
  return ok;
}

// ---- Ropes --------------------------------------------------------------------------------------

/** One group at ropes per half-day in the whole camp. */
const ropesInHalf = (c: Ctx, slots: readonly number[]): boolean => c.grid.some((row) => slots.some((s) => areaOf(row[s]) === 'Ropes'));

export function placeRopes(c: Ctx, plan: Plan): void {
  const ropers = plan.Ropes.map((k, b) => (k > 0 ? b : -1)).filter((b) => b >= 0);
  const base = (b: number): number => (c.hist[b].earlier.Ropes ?? 0) + inWeekCount(c, b, 'Ropes');
  const units = ropeGroups(c.roster, ropers, base, (k) => Math.floor(c.rng() * k), c.relax.trio);
  const names = (unit: number[]): string => unit.map((b) => c.roster.names[b]).join(' and ');
  placeMostConstrainedFirst<{ day: number; half: number }>(
    c,
    shuffle(c.rng, units),
    (unit) => {
      const out: { value: { day: number; half: number }; score: number }[] = [];
      for (const day of c.days) {
        for (const half of [0, 1]) {
          const slots = halfSlots(day, half);
          if (!unit.every((b) => rangeFree(c, b, slots) && !areaOnDay(c, b, day, 'Ropes') && !onNextDay(c, b, day, 'Ropes') && !backToBack(c, b, slots, 'Ropes'))) continue;
          if (ropesInHalf(c, slots) || !okPlaceGroup(c, unit, slots, 'Low Ropes')) continue;
          out.push({ value: { day, half }, score: c.rng() - SPREAD_WEIGHT * leftover(c, unit, day, 2) - BUSY_WEIGHT * busyness(c, slots) });
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

const poolOrdinal = (c: Ctx, b: number): number => (c.hist[b].earlier.Pool ?? 0) + inWeekCount(c, b, 'Pool') + 1;

/** Lessons (regular Pool blocks, not the Swim Test) a bunk has had before this slot: in earlier weeks, and earlier this week. */
const lessonsBefore = (c: Ctx, b: number, slot: number): number =>
  (c.hist[b].earlierLabels.Pool ?? 0) + blocksOf(c.grid[b]).filter((k) => k.label === 'Pool' && k.start < slot).length;

/** Split a run of bunks that would put too many campers in the water, unless it is the whole village. */
function withinPoolLimit(c: Ctx, run: number[]): number[][] {
  const r = c.roster;
  const total = run.reduce((sum, b) => sum + r.campers[b], 0);
  const whole = run.length === r.byVillage[r.village[run[0]]].length;
  if (total <= POOL_MAX_CAMPERS || whole || run.length < 2) return [run];
  const cut = Math.ceil(run.length / 2);
  return [...withinPoolLimit(c, run.slice(0, cut)), ...withinPoolLimit(c, run.slice(cut))];
}

/** Groups of S and M bunks for the pool: a run within S and a run within M, only mixed at the same age, aiming for 2 to 5 bunks. */
function seniorPoolGroups(c: Ctx, wanted: Set<number>): number[][] {
  const r = c.roster;
  const left = new Set([...(r.byVillage.S ?? []), ...(r.byVillage.M ?? [])].filter((b) => wanted.has(b)));
  const out: number[][] = [];
  while (left.size > 0) {
    const list = [...left];
    const seed = list[Math.floor(c.rng() * list.length)];
    left.delete(seed);
    const group = [seed];
    const want = 2 + Math.floor(c.rng() * 4);
    const campers = (): number => group.reduce((sum, b) => sum + r.campers[b], 0);
    while (group.length < want) {
      let best: { bunk: number; score: number } | null = null;
      for (const cand of left) {
        if (poolOrdinal(c, cand) !== poolOrdinal(c, seed) || campers() + r.campers[cand] > POOL_MAX_CAMPERS) continue;
        const same = group.filter((x) => r.village[x] === r.village[cand]);
        if (same.length > 0) {
          const end = same.find((x) => r.pos[x] === r.pos[cand] - 1 || r.pos[x] === r.pos[cand] + 1);
          const lo = Math.min(...same.map((x) => r.pos[x]));
          const hi = Math.max(...same.map((x) => r.pos[x]));
          if (end === undefined || (r.pos[cand] !== lo - 1 && r.pos[cand] !== hi + 1) || Math.abs(r.age[cand] - r.age[end]) > AGE_ALLOWED) continue;
        }
        const others = group.filter((x) => r.village[x] !== r.village[cand]);
        if (others.some((x) => shareLevel(r, x, cand, 'Pool') === 0)) continue;
        const score = group.reduce((sum, x) => sum + Math.abs(r.age[x] - r.age[cand]), 0) / group.length + c.rng() * 0.5;
        if (!best || score < best.score) best = { bunk: cand, score };
      }
      if (!best) break;
      group.push(best.bunk);
      left.delete(best.bunk);
    }
    out.push(group);
  }
  return out;
}

/**
 * Who goes to the pool together this week. O and C bunks on their first two regular Pool blocks are lessons, one bunk alone;
 * after that a run of one village's bunks on the same time, up to the whole village (O and C never mix). Tusc always goes as one.
 */
function poolUnits(c: Ctx, wanted: Set<number>): number[][] {
  const r = c.roster;
  const units: number[][] = [];
  for (const v of r.villages) {
    const members = r.byVillage[v].filter((b) => wanted.has(b));
    if (members.length === 0 || v === 'S' || v === 'M') continue;
    if (v === 'T') {
      units.push(members);
      continue;
    }
    // a bunk still on its lessons (counting the ones already placed this week) swims alone
    const lessons = v === 'O' || v === 'C' ? members.filter((b) => lessonsBefore(c, b, Infinity) < POOL_LESSONS) : [];
    for (const b of lessons) units.push([b]);
    let run: number[] = [];
    const flush = () => {
      if (run.length > 0) units.push(...withinPoolLimit(c, run));
      run = [];
    };
    for (const b of members.filter((x) => !lessons.includes(x))) {
      const prev = run[run.length - 1];
      if (prev !== undefined && r.pos[b] === r.pos[prev] + 1 && poolOrdinal(c, b) === poolOrdinal(c, prev) && Math.abs(r.age[b] - r.age[prev]) <= AGE_ALLOWED) run.push(b);
      else {
        flush();
        run = [b];
      }
    }
    flush();
  }
  units.push(...seniorPoolGroups(c, wanted));
  return units;
}

/** A pool group that no period can hold (some bunk is busy at every free moment) is split and tried again as smaller groups. */
function poolSlotsFor(c: Ctx, unit: number[]): number[] {
  const out: number[] = [];
  for (const day of c.days) {
    if (unit.some((b) => areaOnDay(c, b, day, 'Pool'))) continue;
    for (let p = 0; p < 4; p++) {
      const s = slotAt(day, p);
      if (unit.every((b) => isFree(c, b, s)) && poolLoad(c, s).count === 0) out.push(s);
    }
  }
  return out;
}

function splitPoolUnits(c: Ctx, units: number[][]): number[][] {
  const r = c.roster;
  const out: number[][] = [];
  const queue = [...units];
  while (queue.length > 0) {
    const unit = queue.shift() as number[];
    const isTusc = r.village[unit[0]] === 'T';
    if (unit.length < 2 || isTusc || poolSlotsFor(c, unit).length > 0) {
      out.push(unit);
      continue;
    }
    const cut = Math.ceil(unit.length / 2);
    const sorted = [...unit].sort((x, y) => r.village[x].localeCompare(r.village[y]) || r.pos[x] - r.pos[y]);
    // a mixed S and M group splits by village first, so each half stays a run
    const byVillage = [...new Set(sorted.map((b) => r.village[b]))];
    if (byVillage.length === 2) queue.push(sorted.filter((b) => r.village[b] === byVillage[0]), sorted.filter((b) => r.village[b] === byVillage[1]));
    else queue.push(sorted.slice(0, cut), sorted.slice(cut));
  }
  return out;
}

/** Give each pool group a period: one group at the pool at a time, and never while the Swim Test or Tusc training is on. */
function placePoolUnits(c: Ctx, units: number[][], extra: boolean): void {
  const names = (unit: number[]): string => unit.map((b) => c.roster.names[b]).join(' and ');
  placeMostConstrainedFirst<number>(
    c,
    shuffle(c.rng, units),
    (unit) => {
      const out: { value: number; score: number }[] = [];
      for (const day of c.days) {
        if (unit.some((b) => areaOnDay(c, b, day, 'Pool') || onNextDay(c, b, day, 'Pool'))) continue;
        const poolToday = daySlots(day).filter((s) => poolLoad(c, s).count > 0).length;
        for (let p = 0; p < 4; p++) {
          const s = slotAt(day, p);
          if (!unit.every((b) => isFree(c, b, s) && !backToBack(c, b, [s], 'Pool'))) continue;
          // O and C swim together only once each of them has both lessons behind it by then
          if (unit.length > 1 && unit.some((b) => 'OC'.includes(c.roster.village[b]) && lessonsBefore(c, b, s) < POOL_LESSONS)) continue;
          if (poolLoad(c, s).count > 0) continue;
          out.push({ value: s, score: c.rng() + 0.25 * poolToday - SPREAD_WEIGHT * leftover(c, unit, day, 1) - BUSY_WEIGHT * busyness(c, [s]) });
        }
      }
      return out;
    },
    (unit, slot) => {
      for (const b of unit) put(c, b, [slot], 'Pool');
    },
    (unit) => `${extra ? 'A second Pool' : 'Pool'} for ${names(unit)} could not be placed this week.`,
    // a second swim that does not fit is simply not given, and a swim counted over the session may be made up in another week
    (unit) => (extra || unit.every((b) => POOL_TARGETS[c.roster.village[b]]?.perWeek === undefined) ? 'Pool' : undefined),
    extra ? undefined : (unit) => swimInsteadOfLeague(c, unit),
  );
}

/**
 * A pool group with no free period left: move one of its village's league periods somewhere else and swim in the period that
 * frees. Only for groups of one village whose league is a single period (not Mohawk's doubles, not Tusc's triathlon).
 */
function swimInsteadOfLeague(c: Ctx, unit: number[]): boolean {
  const v = c.roster.village[unit[0]];
  if (v === 'M' || v === 'T' || unit.some((b) => c.roster.village[b] !== v)) return false;
  const members = idx(c, v);
  const label = leagueLabelFor(v, c.sessionWeeks);
  for (const s of shuffle(c.rng, ALL_SLOTS)) {
    const day = Math.floor(s / 4);
    if (!fillable(c, s) || poolLoad(c, s).count > 0 || unit.some((b) => areaOnDay(c, b, day, 'Pool') || onNextDay(c, b, day, 'Pool') || backToBack(c, b, [s], 'Pool'))) continue;
    if (!members.every((b) => c.grid[b][s] === label && !c.locked[b][s])) continue;
    for (const t of shuffle(c.rng, ALL_SLOTS)) {
      const other = Math.floor(t / 4);
      if (t === s || !fillable(c, t) || !villageFree(c, v, [t])) continue;
      if (other !== day && villageAreaOnDay(c, v, other, 'League')) continue;
      // the league period moves off `day`: its new day must not be next to another league day
      if ([other - 1, other + 1].some((d) => d !== day && d >= 0 && d < 6 && villageAreaOnDay(c, v, d, 'League'))) continue;
      if (members.some((b) => backToBack(c, b, [t], 'League'))) continue;
      for (const b of members) c.grid[b][s] = '';
      for (const b of members) c.dayMask[b] = buildDayMasks([c.grid[b]])[0];
      putVillage(c, v, [t], label);
      for (const b of unit) put(c, b, [s], 'Pool');
      return true;
    }
  }
  return false;
}

export function placePool(c: Ctx, plan: Plan): void {
  const wanted = new Set(plan.Pool.map((k, b) => (k > 0 ? b : -1)).filter((b) => b >= 0));
  placePoolUnits(c, splitPoolUnits(c, poolUnits(c, wanted)), false);
}

/**
 * A second swim in the week, a village at a time, whenever it fits. Only a village that has swum the least so far may take
 * one, so over the session the villages stay within one swim of each other. It is the whole village or nobody (every bunk
 * of a village keeps the same number of swims), together where it can; an O or C bunk still on its lessons swims alone.
 */
export function placeExtraPool(c: Ctx, plan: Plan): void {
  const tokens = (b: number): number => TOKEN_AREAS.reduce((sum, a) => sum + plan[a][b], 0);
  const spare = (b: number): number => ALL_SLOTS.filter((s) => fillable(c, s) && isFree(c, b, s)).length - tokens(b);
  const swims = (v: string): number => Math.max(...idx(c, v).map((b) => (c.hist[b].earlier.Pool ?? 0) + (c.hist[b].later.Pool ?? 0) + inWeekCount(c, b, 'Pool')));
  const tried = new Set<string>();
  for (;;) {
    const least = Math.min(...c.roster.villages.map(swims));
    const able = c.roster.villages.filter(
      (v) => !tried.has(v) && swims(v) <= least && idx(c, v).every((b) => inWeekCount(c, b, 'Pool') === 1 && spare(b) >= EXTRA_POOL_MIN_SPARE),
    );
    if (able.length === 0) return;
    const v = shuffle(c.rng, able)[0];
    tried.add(v);
    const members = idx(c, v);
    const saved = members.map((b) => [...c.grid[b]]);
    const before = { unmet: c.unmet, carried: c.carried.length, warnings: c.warnings.length };
    placePoolUnits(c, splitPoolUnits(c, poolUnits(c, new Set(members))), true);
    if (members.every((b) => inWeekCount(c, b, 'Pool') === POOL_MAX_PER_WEEK)) continue;
    // it did not fit for everyone: nobody in the village gets it
    members.forEach((b, i) => {
      saved[i].forEach((label, s) => (c.grid[b][s] = label));
      c.dayMask[b] = buildDayMasks([saved[i]])[0];
    });
    c.unmet = before.unmet;
    c.carried.length = before.carried;
    c.warnings.length = before.warnings;
  }
}
