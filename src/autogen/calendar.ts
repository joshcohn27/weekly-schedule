import { areaOf } from '../config';
import {
  CALENDAR,
  hobbiesInWeek,
  HOBBY_WED_PM_PROBABILITY,
  SHABBAT_PREP_EXTRA_MAX,
  SHABBAT_PREP_STAFF,
  SHABBAT_ROTATION,
  TRIP_LABELS,
  type SessionWeeks,
} from './config';
import { dayOf, halfSlots, slotAt } from './history';
import { chance, shuffle, type Rng } from './rng';
import {
  put,
  putVillage,
  rangeFree,
  villageAreaOnDay,
  villageFree,
  warn,
  type Ctx,
} from './state';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const where = (day: number, half?: number): string =>
  `${DAY_NAMES[day]}${half === undefined ? '' : half === 0 ? ' morning' : ' afternoon'}`;

/** The random choices that define a week's calendar. Drawn once, then every attempt builds on the same ones. */
export interface CalendarPlan {
  /** Half-days that carry hobbies: [day, half] pairs. */
  hobbies: [number, number][];
  /** Order of the four Sunday periods handed out to the swim-test villages (week 1). */
  swimOrder: number[];
}

export function planCalendar(
  input: {
    weekIndex: number;
    sessionWeeks: SessionWeeks;
    lastWeek: boolean;
    /** Is some bunk already busy on this half-day (away on a trip, or filled in by hand)? */
    taken?: (day: number, half: number) => boolean;
  },
  rng: Rng,
): CalendarPlan {
  let hobbies: [number, number][];
  const sessions = hobbiesInWeek(input.weekIndex, input.sessionWeeks); // this week's share of the session's hobby sessions
  if (sessions === 0) hobbies = []; // none this week
  else if (input.lastWeek) hobbies = [[1, 0]]; // Monday morning only
  else if (sessions === 1) hobbies = [[5, 0]]; // Friday morning only
  else {
    hobbies = [[5, 0]]; // Friday morning always
    // Wednesday afternoon, or Tuesday morning. When a village is away for one of them the other is used, so nobody misses hobbies.
    const wedTaken = !!input.taken?.(3, 1);
    const tueTaken = !!input.taken?.(2, 0);
    const drawWed = chance(rng, HOBBY_WED_PM_PROBABILITY);
    hobbies.push((wedTaken !== tueTaken ? tueTaken : drawWed) ? [3, 1] : [2, 0]);
    // a third session is Sunday morning: never in week 1 (the swim tests are then), and not when someone is away for it
    if (sessions >= 3 && input.weekIndex > 1 && !input.taken?.(0, 0)) hobbies.push([0, 0]);
  }

  return { hobbies, swimOrder: shuffle(rng, [0, 1, 2, 3]) };
}

function placeHobbies(c: Ctx): void {
  for (const [day, half] of c.calendar.hobbies) {
    const slots = halfSlots(day, half);
    const label = half === 0 ? 'AM Hobbies' : 'PM Hobbies';
    for (let b = 0; b < c.roster.n; b++) {
      if (rangeFree(c, b, slots)) put(c, b, slots, label);
      else if (slots.every((s) => TRIP_LABELS.includes(c.grid[b][s]))) continue; // away on a trip
      else warn(c, `Hobbies on ${where(day, half)} could not be placed for ${c.roster.names[b]} because that time is already filled in.`);
    }
  }
}

function placeLastWeekExtras(c: Ctx): void {
  if (!c.lastWeek) return;
  for (let b = 0; b < c.roster.n; b++) {
    const isT = c.roster.village[b] === 'T';
    const plan: [number, number, string][] = [
      [4, 0, 'Hobby Culmination'],
      [4, 1, isT ? 'Banquet Prep' : 'Packing Time'],
    ];
    for (const [day, half, label] of plan) {
      const slots = halfSlots(day, half);
      if (rangeFree(c, b, slots)) put(c, b, slots, label);
      else warn(c, `${label} on Thursday could not be placed for ${c.roster.names[b]} because that time is already filled in.`);
    }
  }
}

/** Try candidate slot lists in order; place the label on the whole village at the first one that fits. */
function placeVillageFirstFit(c: Ctx, v: string, options: number[][], label: string, area: string): number[] | null {
  for (const slots of options) {
    if (!villageFree(c, v, slots)) continue;
    if ([...new Set(slots.map(dayOf))].some((d) => villageAreaOnDay(c, v, d, area))) continue;
    putVillage(c, v, slots, label);
    return slots;
  }
  return null;
}

function placeSundayOfWeekOne(c: Ctx): void {
  if (c.weekIndex !== 1) return;
  // Swim tests: each non-Mohawk village gets one period of Sunday, in random order.
  const swimmers = c.roster.villages.filter((v) => v !== 'M');
  const periods = c.calendar.swimOrder;
  swimmers.forEach((v, i) => {
    const order = [0, 1, 2, 3].map((k) => periods[(i + k) % 4]);
    const placed = placeVillageFirstFit(c, v, order.map((p) => [slotAt(0, p)]), 'Swim Test', 'Pool');
    if (!placed) warn(c, `The Sunday swim test for village ${v} could not be placed because Sunday is already filled in.`);
  });
  // Mohawk plays Athletics in period 4 and has normal periods 1 to 3.
  if (c.roster.byVillage.M) {
    const placed = placeVillageFirstFit(c, 'M', [[slotAt(0, 3)]], 'Athletics', 'Athletics');
    if (!placed) warn(c, 'Sunday period 4 Athletics for village M could not be placed because it is already filled in.');
  }
}

/** A short Tusc bike trip that was entered by hand (a half-day, not the three-day trip): triathlon training goes before it. */
function findMiniBikeTrip(c: Ctx): void {
  const members = c.roster.byVillage.T;
  if (!members) return;
  const cells = c.grid[members[0]].map((l, s) => (l === 'Bike Trip' ? s : -1)).filter((s) => s >= 0);
  if (cells.length > 0 && cells.length <= 2) c.tripDay = dayOf(cells[0]);
}

/** The villages that have Shabbat this week and are in the roster. */
const shabbatVillages = (c: Ctx): string[] =>
  (CALENDAR.shabbatPrep ? (SHABBAT_ROTATION[c.sessionWeeks][c.weekIndex] ?? []) : []).filter((v) => c.roster.byVillage[v]);

function placeShabbatPrep(c: Ctx): void {
  for (const v of shabbatVillages(c)) {
    const friday = [...halfSlots(5, 1)];
    if (villageFree(c, v, friday)) putVillage(c, v, friday, 'Shabbat Prep');
    else warn(c, `Shabbat Prep on Friday afternoon could not be placed for village ${v} because that time is already filled in.`);
  }
}

/**
 * The single periods of Shabbat Prep earlier in the week, on top of the Friday afternoon double. One is Monday to
 * Wednesday; two are on days that are not next to each other (Thursday is out: it is the day before the Friday block, and
 * the first Sunday has the swim tests). Period 1 or 2 when one is open, else period 3 or 4.
 *
 * The Music and Judaics specialists run it, so nobody has Music or Judaics in that period, and every bunk that is not
 * busy then needs one of the other areas, which do not hold the whole camp. So this is placed after Waterfront and the
 * league, in the period where the fewest other bunks are still free, and the villages of one week have it together when
 * they can.
 */
export function placeShabbatExtras(c: Ctx): void {
  const villages = shabbatVillages(c);
  const extra = Math.min(CALENDAR.shabbatPrepExtra, SHABBAT_PREP_EXTRA_MAX);
  if (extra <= 0 || villages.length === 0) return;
  const staffBusy = (s: number): boolean => c.grid.some((row) => SHABBAT_PREP_STAFF.includes(areaOf(row[s]) ?? ''));
  const fits = (v: string, s: number): boolean => !staffBusy(s) && villageFree(c, v, [s]) && !villageAreaOnDay(c, v, dayOf(s), 'Shabbat Prep');
  /** Bunks of the other villages with nothing yet in this period: fewer is better. */
  const othersFree = (s: number): number => c.grid.filter((row, b) => row[s] === '' && !villages.includes(c.roster.village[b])).length;
  /** The best period of a day for these villages, mornings first, or -1. */
  const best = (day: number, who: string[]): number => {
    for (const periods of [[0, 1], [2, 3]]) {
      const open = shuffle(c.rng, periods).map((p) => slotAt(day, p)).filter((s) => who.every((v) => fits(v, s)));
      if (open.length) return open.sort((x, y) => othersFree(x) - othersFree(y))[0];
    }
    return -1;
  };
  const daySets = extra === 1 ? [[1], [2], [3]] : [[1, 3], [0, 2], [0, 3]].filter((set) => c.weekIndex > 1 || !set.includes(0));
  /** How good a set of days is: the bunks left free in its periods, and a day with no period for everyone together counts as the whole camp. */
  const cost = (set: number[]): number => set.reduce((sum, day) => sum + (best(day, villages) < 0 ? c.roster.n : othersFree(best(day, villages))), 0);
  const days = shuffle(c.rng, daySets).map((set) => ({ set, cost: cost(set) })).sort((x, y) => x.cost - y.cost)[0].set;
  for (const day of days) {
    const together = best(day, villages);
    for (const v of villages) {
      const s = together >= 0 ? together : best(day, [v]);
      if (s >= 0) putVillage(c, v, [s], 'Shabbat Prep');
      else warn(c, `An extra Shabbat Prep period for village ${v} could not be placed earlier in the week.`);
    }
  }
}

/** Fixed events first: they never move, and everything flexible is built around them. Trips are entered by hand beforehand. */
export function placeCalendar(c: Ctx): void {
  placeHobbies(c);
  placeLastWeekExtras(c);
  placeSundayOfWeekOne(c);
  findMiniBikeTrip(c);
  placeShabbatPrep(c);
}
