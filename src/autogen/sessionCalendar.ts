import { GUEST_VILLAGE, isGuest, villageOf } from '../autofill';
import { SLOT_COUNT } from '../config';
import type { Schedule } from '../types';
import { slotAt } from './history';

/**
 * Something on the session's calendar that is not a period: a trip, a Tiyul, a village day, Mass Program, Color War,
 * Visitor's Day. It is put on the schedule before anything is generated, and the generator builds around it.
 */
export interface CalendarEvent {
  /** What the schedule says in those periods. */
  label: string;
  /** 'camp' for every bunk, a village (its letter, or "TC" for Taste of CSL), or one bunk by name. */
  who: string;
  /** Week of the session, 1 for the first. */
  week: number;
  /** 0 is Sunday, 5 is Friday. */
  day: number;
  /** Periods of that day, 0 for period 1 to 3 for period 4. */
  periods: number[];
}

export const CAMP = 'camp';
/** Taste of CSL in two halves, however many bunks it has: the first half follows what "TC 1" did in 2026 and the second half what "TC 2" did. */
export const GUESTS_FIRST = 'TC first half';
export const GUESTS_SECOND = 'TC second half';
const AM = [0, 1];
const PM = [2, 3];
const ALL_DAY = [0, 1, 2, 3];
const SUN = 0;
const MON = 1;
const TUE = 2;
const WED = 3;
const THU = 4;
const FRI = 5;

/** The label a village's own day goes by: "O-Day" for village O. */
export const villageDayLabel = (v: string): string => `${v}-Day`;
const camp = (label: string, week: number, day: number, periods: number[]): CalendarEvent => ({ label, who: CAMP, week, day, periods });
const village = (who: string, label: string, week: number, day: number, periods: number[]): CalendarEvent => ({ label, who, week, day, periods });
/** A Tiyul that leaves after lunch and is back for lunch the next day. */
const overnight = (who: string, week: number, day: number): CalendarEvent[] => [village(who, 'Tiyul', week, day, PM), village(who, 'Tiyul', week, day + 1, AM)];

export interface SessionTemplate {
  id: 'session1' | 'session2';
  name: string;
  weeks: 3 | 4;
  /** Opening day and the last day of the session, as yyyy-mm-dd. */
  opens: string;
  closes: string;
  events: CalendarEvent[];
  /** The bunks the session starts with: name, grades, campers. */
  roster: [string, string, string][];
  /** The most bunks each village has in this session, for filling in the biggest camp in one go. */
  most: Record<string, number>;
  /** A village's own number of times for an area in this session (area, then village letter), and the villages that start ropes on High. */
  villageTargets?: Record<string, Record<string, number>>;
  ropesStartHigh?: string[];
  /** Where this session's numbers differ from the app's own: times a session for an area, or for each village (Dance). */
  numbers?: Record<string, { min?: number; max?: number; villages?: Record<string, number> }>;
}

/** The date of a day of a session: the Sunday of the week opening day falls in is day 0 of week 1. */
export function dateOf(template: SessionTemplate, week: number, day: number): Date {
  const [y, m, d] = template.opens.split('-').map(Number);
  const opening = new Date(y, m - 1, d);
  return new Date(y, m - 1, d - opening.getDay() + (week - 1) * 7 + day);
}
/** That date the way the camp writes it on a schedule: "6.27". */
export const shortDate = (date: Date): string => `${date.getMonth() + 1}.${date.getDate()}`;

/**
 * Session 1 as it was in 2026, four weeks. Left out on purpose: the things that only happened that year (the field trip,
 * the July 4 program, Fight Song). Clean up and Visitor's Day are always the Sunday that starts week 3, and village day is
 * always the Sunday that starts week 4. Tusc has no village day in this session: it is away on the three-day bike trip.
 */
export const SESSION_1: SessionTemplate = {
  id: 'session1',
  name: 'Session 1 (4 weeks)',
  weeks: 4,
  // summer 2027: opening day is Sunday June 27 and has no periods; they start on Monday
  opens: '2027-06-27',
  closes: '2027-07-23',
  events: [
    camp('Opening Day', 1, SUN, ALL_DAY),
    village('O', 'Tiyul', 2, TUE, PM),
    village('T', 'Bike Trip', 2, WED, PM), // the mini bike trip
    village('C', 'Tiyul', 2, THU, PM),
    camp('All Camp Clean Up', 3, SUN, AM),
    camp("Visitor's Day", 3, SUN, PM),
    camp('Mass Program', 3, WED, PM),
    camp('Mass Program', 3, THU, ALL_DAY),
    ...['O', 'C', 'S', 'M'].map((v) => village(v, villageDayLabel(v), 4, SUN, ALL_DAY)),
    ...[SUN, MON, TUE].map((day) => village('T', 'Bike Trip', 4, day, ALL_DAY)),
    ...overnight('S', 4, MON),
    ...overnight('M', 4, TUE),
  ],
  most: { O: 5, C: 6, S: 6, M: 6, T: 4 },
  roster: [
    ['O1', '4th', '11'], ['O2', '4th/5th', '12'], ['O3', '5th', '9'], ['O4', '5th/6th', '13'], ['O5', '6th', '10'],
    ['C1', '4th', '12'], ['C2', '4th/5th', '8'], ['C3', '5th/6th', '13'], ['C4', '6th', '11'],
    ['S1', '7th', '10'], ['S2', '7th/8th', '14'], ['S3', '8th', '12'], ['S4', '8th/9th', '9'], ['S5', '9th', '13'],
    ['M1', '7th', '11'], ['M2', '7th/8th', '13'], ['M3', '8th/9th', '10'], ['M4', '9th', '12'],
    ['T1', '10th', '14'], ['T2', '10th', '11'], ['T3', '10th', '13'], ['T4', '10th', '12'],
  ],
};

/**
 * Session 2 as it was in 2026, three weeks, with Color War. Periods start on the Tuesday of week 1. Seneca's Tiyul is the
 * day before Mohawk's (in 2026 rain pushed it onto village day, which nobody wanted). Tusc has a village day here.
 */
export const SESSION_2: SessionTemplate = {
  id: 'session2',
  name: 'Session 2 (3 weeks, with Color War)',
  weeks: 3,
  // summer 2027: opening day is Monday July 26; periods start on Tuesday
  opens: '2027-07-26',
  closes: '2027-08-15',
  events: [
    camp('No Periods', 1, SUN, ALL_DAY),
    camp('Opening Day', 1, MON, ALL_DAY),
    village('T', 'Trip', 1, TUE, ALL_DAY),
    // Taste of CSL, week 1 only, exactly as in 2026: the first half of its bunks do what "TC 1" did, the second half what
    // "TC 2" did (with four bunks: TC1 and TC2, then TC3 and TC4)
    village(GUEST_VILLAGE, 'Swim Test', 1, TUE, [0]),
    village(GUEST_VILLAGE, 'Pool', 1, TUE, [1]),
    village(GUESTS_FIRST, 'A&C', 1, TUE, [2]),
    village(GUESTS_FIRST, 'Low Ropes', 1, TUE, [3]),
    village(GUESTS_SECOND, 'Low Ropes', 1, TUE, [2]),
    village(GUESTS_SECOND, 'A&C', 1, TUE, [3]),
    village(GUEST_VILLAGE, 'Waterfront', 1, WED, AM),
    village(GUEST_VILLAGE, 'PM Hobbies', 1, WED, PM),
    village(GUEST_VILLAGE, 'Athletics', 1, THU, [0]),
    village(GUEST_VILLAGE, 'Music', 1, THU, [1]),
    village(GUEST_VILLAGE, 'Pool', 1, THU, [2]),
    village(GUEST_VILLAGE, 'Teva', 1, THU, [3]),
    village(GUEST_VILLAGE, 'AM Hobbies', 1, FRI, AM),
    village(GUEST_VILLAGE, 'A&C', 1, FRI, [2]),
    village(GUEST_VILLAGE, 'Dance', 1, FRI, [3]),
    village('O', 'Tiyul', 2, SUN, PM),
    village('C', 'Tiyul', 2, SUN, PM),
    ...overnight('S', 2, MON),
    ...overnight('M', 2, TUE),
    ...['O', 'C', 'S', 'M', 'T'].map((v) => village(v, villageDayLabel(v), 2, THU, ALL_DAY)),
    camp('All Camp Clean Up', 3, SUN, [2]),
    camp('Color War', 3, MON, ALL_DAY),
    camp('Color War', 3, TUE, ALL_DAY),
    camp('Tusc Triathlon', 3, THU, PM),
  ],
  // a shorter session: Yoga once (twice at the most) and Dance one fewer for everybody
  numbers: { Yoga: { min: 1, max: 2 }, Dance: { min: 1, villages: { O: 2, S: 2, C: 1, T: 1, M: 1 } } },
  // Tusc is the same campers as Session 1: Ceramics once is plenty, and one more ropes, High (three in the summer)
  villageTargets: { Ceramics: { T: 1 }, Ropes: { T: 1 } },
  ropesStartHigh: ['T'],
  // 4 Onondaga, 4 Cayuga, 5 Seneca, 5 Mohawk, 4 Tusc, and Taste of CSL for week 1
  most: { TC: 4, O: 5, C: 6, S: 6, M: 6, T: 4 },
  roster: [
    ['TC1', '3rd', '11'], ['TC2', '3rd', '11'], ['TC3', '3rd', '12'], ['TC4', '3rd', '12'],
    ['O1', '4th', '11'], ['O2', '4th/5th', '12'], ['O3', '5th/6th', '9'], ['O4', '6th', '13'],
    ['C1', '4th', '12'], ['C2', '4th/5th', '8'], ['C3', '5th/6th', '13'], ['C4', '6th', '11'],
    ['S1', '7th', '10'], ['S2', '7th/8th', '14'], ['S3', '8th', '12'], ['S4', '8th/9th', '9'], ['S5', '9th', '13'],
    ['M1', '7th', '11'], ['M2', '7th/8th', '13'], ['M3', '8th', '10'], ['M4', '8th/9th', '12'], ['M5', '9th', '9'],
    ['T1', '10th', '14'], ['T2', '10th', '11'], ['T3', '10th', '13'], ['T4', '10th', '12'],
  ],
};

export const SESSION_TEMPLATES: SessionTemplate[] = [SESSION_1, SESSION_2];
/** The template a session of this many weeks starts from. */
export const templateFor = (sessionWeeks: number): SessionTemplate => (sessionWeeks === 3 ? SESSION_2 : SESSION_1);

/** The calendar in force when it is not the template's: settings.ts sets it. Null means the template for the session's length. */
export const SESSION_CALENDAR: { events: CalendarEvent[] | null } = { events: null };
export const calendarFor = (sessionWeeks: number): CalendarEvent[] => SESSION_CALENDAR.events ?? templateFor(sessionWeeks).events;

/** Accepts whatever was saved and returns the events that make sense. Null when nothing usable was given. */
export function normalizeCalendar(raw: unknown): CalendarEvent[] | null {
  if (!Array.isArray(raw)) return null;
  const out: CalendarEvent[] = [];
  for (const e of raw as Partial<CalendarEvent>[]) {
    if (!e || typeof e !== 'object') continue;
    const label = typeof e.label === 'string' ? e.label.trim() : '';
    const who = typeof e.who === 'string' ? e.who.trim() : '';
    const periods = [...new Set((Array.isArray(e.periods) ? e.periods : []).filter((p) => Number.isInteger(p) && p >= 0 && p <= 3))].sort();
    if (!label || !who || !Number.isInteger(e.week) || (e.week as number) < 1 || (e.week as number) > 4) continue;
    if (!Number.isInteger(e.day) || (e.day as number) < 0 || (e.day as number) > 5 || periods.length === 0) continue;
    out.push({ label, who: who === CAMP ? CAMP : who.length === 1 ? who.toUpperCase() : who, week: e.week as number, day: e.day as number, periods });
  }
  return out;
}

const applies = (e: CalendarEvent, bunkName: string, guests: readonly string[]): boolean => {
  if (e.who === CAMP || villageOf(bunkName) === e.who || bunkName.trim() === e.who) return true;
  if (e.who !== GUESTS_FIRST && e.who !== GUESTS_SECOND) return false;
  const at = guests.indexOf(bunkName);
  return at >= 0 && (at < Math.ceil(guests.length / 2)) === (e.who === GUESTS_FIRST);
};
const slotsOf = (e: CalendarEvent): number[] => e.periods.map((p) => slotAt(e.day, p));

/**
 * Put the calendar on the weeks it is given (a null week is left alone; `only` limits it to some weeks, by 0-based index).
 * Only empty periods are written: whatever is already there stays. A village that already has one of these labels somewhere
 * the calendar would not put it (a Tiyul entered by hand on another day) keeps its own and does not get the calendar's as well.
 * Returns new weeks; the ones passed in are not changed.
 */
export function applyCalendar(weeks: (Schedule | null)[], events: readonly CalendarEvent[], only?: ReadonlySet<number>): (Schedule | null)[] {
  /** bunk name + label -> the cells the calendar gives it, as "week:slot". */
  const planned = new Map<string, Set<string>>();
  const names = new Set<string>();
  for (const w of weeks) for (const b of w?.bunks ?? []) names.add(b.name);
  // the Taste of CSL bunks in order: TC1, TC2, ... TC10
  const guests = [...names].filter(isGuest).sort((x, y) => Number(x.replace(/\D/g, '')) - Number(y.replace(/\D/g, '')) || x.localeCompare(y));
  for (const e of events) {
    for (const name of names) {
      if (!applies(e, name, guests)) continue;
      const key = `${name}|${e.label}`;
      if (!planned.has(key)) planned.set(key, new Set());
      for (const s of slotsOf(e)) planned.get(key)?.add(`${e.week}:${s}`);
    }
  }
  // entered by hand somewhere else: that bunk's own placing of the label stands
  const own = new Set<string>();
  weeks.forEach((w, i) => {
    for (const b of w?.bunks ?? []) {
      for (let s = 0; s < SLOT_COUNT; s++) {
        const cells = planned.get(`${b.name}|${b.slots[s]}`);
        if (cells && !cells.has(`${i + 1}:${s}`)) own.add(`${b.name}|${b.slots[s]}`);
      }
    }
  });
  return weeks.map((w, i) => {
    if (!w || (only && !only.has(i))) return w;
    const mine = events.filter((e) => e.week === i + 1);
    if (mine.length === 0) return w;
    return {
      ...w,
      bunks: w.bunks.map((b) => {
        const slots = [...b.slots];
        for (const e of mine) {
          if (!applies(e, b.name, guests) || own.has(`${b.name}|${e.label}`)) continue;
          for (const s of slotsOf(e)) if (slots[s] === '') slots[s] = e.label;
        }
        return { ...b, slots };
      }),
    };
  });
}
