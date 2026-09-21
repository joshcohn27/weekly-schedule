import type { WeeksState } from '../types';
import {
  HOBBY_SUNDAY_PROBABILITY,
  HOBBY_WED_PM_PROBABILITY,
  SHABBAT_ROTATION,
  TIYUL_WEEKS,
  type SessionWeeks,
} from './config';
import { dayOf, halfSlots, slotAt, villageWeeksWithLabel } from './history';
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
  /** Villages whose Tiyul falls in this week. */
  tiyul: string[];
  /** Order of the four Sunday periods handed out to the swim-test villages (week 1). */
  swimOrder: number[];
}

export function planCalendar(
  input: { weeks: WeeksState; weekIndex: number; sessionWeeks: SessionWeeks; lastWeek: boolean; villages: string[] },
  rng: Rng,
): CalendarPlan {
  let hobbies: [number, number][];
  if (input.lastWeek) hobbies = [[1, 0]]; // Monday morning only
  else {
    hobbies = [[5, 0]]; // Friday morning always
    hobbies.push(chance(rng, HOBBY_WED_PM_PROBABILITY) ? [3, 1] : [1, 0]);
    if (input.weekIndex > 1 && chance(rng, HOBBY_SUNDAY_PROBABILITY)) hobbies.push([0, 0]);
  }

  // Each village with a Tiyul on its calendar for this week goes with probability 1 / (eligible weeks left).
  const calendar = TIYUL_WEEKS[input.sessionWeeks];
  const done = villageWeeksWithLabel(input.weeks, input.weekIndex, 'Tiyul');
  const tiyul: string[] = [];
  for (const v of input.villages) {
    const list = calendar[v];
    if (!list || (done[v] ?? 0) > 0) continue;
    const remaining = list.filter((w) => w >= input.weekIndex);
    if (remaining.includes(input.weekIndex) && chance(rng, 1 / remaining.length)) tiyul.push(v);
  }
  return { hobbies, tiyul, swimOrder: shuffle(rng, [0, 1, 2, 3]) };
}

function placeHobbies(c: Ctx): void {
  for (const [day, half] of c.calendar.hobbies) {
    const slots = halfSlots(day, half);
    const label = half === 0 ? 'AM Hobbies' : 'PM Hobbies';
    for (let b = 0; b < c.roster.n; b++) {
      if (c.lastWeek && c.roster.village[b] === 'T') continue; // Tusc is on the bike trip
      if (rangeFree(c, b, slots)) put(c, b, slots, label);
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
  // Tusc bike trip: all four periods on Sunday, Monday and Tuesday
  if (c.roster.byVillage.T) {
    for (const day of [0, 1, 2]) {
      const slots = [0, 1, 2, 3].map((p) => slotAt(day, p));
      if (villageFree(c, 'T', slots)) putVillage(c, 'T', slots, 'Bike Trip');
      else warn(c, `The Tusc bike trip on ${DAY_NAMES[day]} could not be placed because part of that day is already filled in.`);
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

function placeMiniBikeTrip(c: Ctx): void {
  if (c.weekIndex !== 2 || !c.roster.byVillage.T) return;
  const options = shuffle(c.rng, [halfSlots(4, 0), halfSlots(4, 1), halfSlots(5, 1)].map((s) => [...s]));
  const placed = placeVillageFirstFit(c, 'T', options, 'Bike Trip', 'Trips');
  if (placed) c.tripDay = dayOf(placed[0]);
  else warn(c, 'The Tusc mini bike trip could not be placed near the end of the week.');
}

function placeShabbatPrep(c: Ctx): void {
  const villages = SHABBAT_ROTATION[c.sessionWeeks][c.weekIndex] ?? [];
  for (const v of villages) {
    if (!c.roster.byVillage[v]) continue;
    const friday = [...halfSlots(5, 1)];
    if (villageFree(c, v, friday)) putVillage(c, v, friday, 'Shabbat Prep');
    else warn(c, `Shabbat Prep on Friday afternoon could not be placed for village ${v} because that time is already filled in.`);
    // one single period earlier in the week, in period 1 or 2, Monday to Thursday
    const singles: number[][] = [];
    for (const day of shuffle(c.rng, [1, 2, 3, 4])) for (const p of shuffle(c.rng, [0, 1])) singles.push([slotAt(day, p)]);
    if (!placeVillageFirstFit(c, v, singles, 'Shabbat Prep', 'Shabbat Prep')) {
      warn(c, `The extra Shabbat Prep period for village ${v} could not be placed earlier in the week.`);
    }
  }
}

function placeTiyul(c: Ctx): void {
  const usedHalves = new Map<string, string>(); // "day.half" -> village
  const conflicts = (v: string, halves: [number, number][]): boolean =>
    halves.some(([d, h]) => {
      const other = usedHalves.get(`${d}.${h}`);
      return !!other && !((other === 'O' && v === 'C') || (other === 'C' && v === 'O'));
    });

  for (const v of c.calendar.tiyul) {
    if (!c.roster.byVillage[v]) continue;
    const overnight = v === 'S' || v === 'M';
    const candidates: { halves: [number, number][]; slots: number[][] }[] = [];
    if (overnight) {
      const days = c.lastWeek ? [1, 2] : [1, 2, 3];
      for (const d of days) {
        candidates.push({
          halves: [[d, 1], [d + 1, 0]],
          slots: [[...halfSlots(d, 1)], [...halfSlots(d + 1, 0)]],
        });
      }
    } else {
      for (let d = 0; d <= 4; d++) candidates.push({ halves: [[d, 1]], slots: [[...halfSlots(d, 1)]] });
    }

    let placed = false;
    for (const cand of shuffle(c.rng, candidates)) {
      if (conflicts(v, cand.halves)) continue;
      const ok = cand.slots.every((slots) => villageFree(c, v, slots) && !villageAreaOnDay(c, v, dayOf(slots[0]), 'Trips'));
      if (!ok) continue;
      cand.slots.forEach((slots) => putVillage(c, v, slots, 'Tiyul'));
      cand.halves.forEach(([d, h]) => usedHalves.set(`${d}.${h}`, v));
      placed = true;
      break;
    }
    if (!placed) warn(c, `Tiyul for village ${v} could not be placed this week.`);
  }
}

/** Fixed events first: they never move, and everything flexible is built around them. */
export function placeCalendar(c: Ctx): void {
  placeHobbies(c);
  placeLastWeekExtras(c);
  placeSundayOfWeekOne(c);
  placeMiniBikeTrip(c);
  placeShabbatPrep(c);
  placeTiyul(c);
}
