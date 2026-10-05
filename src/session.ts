import { GUEST_VILLAGE, isGuest, villageOf } from './autofill';
import { SESSION_1, SESSION_TEMPLATES, applyCalendar, calendarFor, dateOf, shortDate, type SessionTemplate } from './autogen/sessionCalendar';
import { isDefaultSettings, templateSettings } from './autogen/settings';
import { DAYS, WEEK_COUNT } from './config';
import { emptySchedule, newBunk } from './sample';
import type { Schedule, WeeksState } from './types';

export type SessionId = SessionTemplate['id'];

/** The template a schedule belongs to. One saved before sessions were told apart is Session 1. */
export const templateOf = (id: string | undefined): SessionTemplate => SESSION_TEMPLATES.find((t) => t.id === id) ?? SESSION_1;

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const longDate = (iso: string): string => {
  const [, m, d] = iso.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}`;
};
/** "June 27 to July 23, 2027" */
export const datesOf = (t: SessionTemplate): string => `${longDate(t.opens)} to ${longDate(t.closes)}, ${t.opens.slice(0, 4)}`;

/** The six day headings of a week of the session, with their dates: "Sunday 6.27". */
export const dayLabels = (t: SessionTemplate, week: number): string[] => DAYS.map((d, i) => `${d} ${shortDate(dateOf(t, week, i))}`);
/** "Week 2 (7.4 to 7.9)" */
export const weekDates = (t: SessionTemplate, week: number): string => `${shortDate(dateOf(t, week, 0))} to ${shortDate(dateOf(t, week, 5))}`;

/**
 * A session as it starts: the template's bunks in every one of its weeks (Taste of CSL in week 1 only), its numbers, and
 * its calendar already on the schedule, so the trips, village day and the rest can be seen and moved before anything is
 * generated.
 */
export function startSession(t: SessionTemplate): WeeksState {
  const blank: (Schedule | null)[] = Array.from({ length: WEEK_COUNT }, (_, i) =>
    i < t.weeks ? { ...emptySchedule(), bunks: t.roster.filter(([name]) => i === 0 || !isGuest(name)).map(([name, grades, count]) => newBunk(name, grades, count)) } : null,
  );
  const settings = templateSettings(t);
  return { session: t.id, current: 0, weeks: applyCalendar(blank, t.events), ...(isDefaultSettings(settings) ? {} : { settings }) };
}

/** Put the calendar in force on every week of the session that has bunks. Only empty periods are written. */
export const withCalendar = (state: WeeksState): WeeksState => ({ ...state, weeks: applyCalendar(state.weeks, calendarFor(templateOf(state.session).weeks)) });

/**
 * How many days of a week of the session have already happened, counted from Sunday: today counts as happened. Those days
 * are left exactly as they are when the week is generated again.
 */
export function pastDaysOf(t: SessionTemplate, week: number, today: Date = new Date()): number {
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  let n = 0;
  for (let day = 0; day < DAYS.length; day++) if (dateOf(t, week, day).getTime() <= end) n++;
  return n;
}

/** The order the villages stand in on the schedule, youngest first; Taste of CSL at the top. */
const VILLAGE_ORDER = [GUEST_VILLAGE, 'O', 'C', 'S', 'M', 'T'];
/** The grades a village's bunks usually are, youngest first: what a bunk added in one click starts with. */
const USUAL_GRADES: Record<string, string[]> = {
  [GUEST_VILLAGE]: ['3rd'],
  O: ['4th', '4th/5th', '5th', '5th/6th', '6th', '6th'],
  C: ['4th', '4th/5th', '5th', '5th/6th', '6th', '6th'],
  S: ['7th', '7th/8th', '8th', '8th/9th', '9th', '9th'],
  M: ['7th', '7th/8th', '8th', '8th/9th', '9th', '9th'],
  T: ['10th'],
};
/** Campers a bunk is given when the biggest camp is filled in: a round number to plan with, not a limit anywhere. */
export const MAX_CAMPERS_PER_BUNK = 15;
const gradeFor = (village: string, position: number): string => {
  const list = USUAL_GRADES[village] ?? [''];
  return list[Math.min(position, list.length - 1)];
};

/** One week with a bunk added to a village: the next number, after the village's last bunk (or where the village belongs). */
function addTo(week: Schedule, village: string, count: string): Schedule {
  const mine = week.bunks.filter((b) => villageOf(b.name) === village);
  let n = mine.length + 1;
  while (week.bunks.some((b) => b.name.trim().toUpperCase() === `${village}${n}`)) n++;
  const bunk = newBunk(`${village}${n}`, gradeFor(village, mine.length), count);
  const rank = (name: string): number => {
    const at = VILLAGE_ORDER.indexOf(villageOf(name));
    return at < 0 ? VILLAGE_ORDER.length : at;
  };
  // after the last bunk of its own village, or before the first village that comes later
  let at = week.bunks.length;
  const last = week.bunks.map((b) => villageOf(b.name)).lastIndexOf(village);
  if (last >= 0) at = last + 1;
  else {
    const later = week.bunks.findIndex((b) => rank(b.name) > rank(bunk.name));
    if (later >= 0) at = later;
  }
  return { ...week, bunks: [...week.bunks.slice(0, at), bunk, ...week.bunks.slice(at)] };
}

/** Is this a week of the session a village's bunks are in? Taste of CSL is there for week 1 only. */
const inWeek = (village: string, index: number): boolean => village !== GUEST_VILLAGE || index === 0;

/**
 * Add one bunk to a village in every week of the session (so the weeks keep the same bunks), with the calendar put on its
 * empty periods. A week that has no bunks at all yet is given the new one too.
 */
export function withBunkAdded(state: WeeksState, village: string, count = ''): WeeksState {
  const t = templateOf(state.session);
  const weeks = state.weeks.map((w, i) => (i < t.weeks && inWeek(village, i) ? addTo(w ?? emptySchedule(), village, count) : w));
  return withCalendar({ ...state, weeks });
}

/**
 * Fill in the biggest camp the session has: every village up to its most bunks, in every week, and every bunk at
 * MAX_CAMPERS_PER_BUNK campers. Bunks that are there stay, with everything on their rows; only their camper count changes.
 */
export function withBiggestCamp(state: WeeksState): WeeksState {
  const t = templateOf(state.session);
  let next = state;
  for (const village of VILLAGE_ORDER) {
    const most = t.most[village] ?? 0;
    for (let guard = 0; guard < 12; guard++) {
      const short = next.weeks.some((w, i) => i < t.weeks && inWeek(village, i) && (w?.bunks.filter((b) => villageOf(b.name) === village).length ?? 0) < most);
      if (!short) break;
      next = {
        ...next,
        weeks: next.weeks.map((w, i) =>
          i < t.weeks && inWeek(village, i) && (w?.bunks.filter((b) => villageOf(b.name) === village).length ?? 0) < most ? addTo(w ?? emptySchedule(), village, String(MAX_CAMPERS_PER_BUNK)) : w,
        ),
      };
    }
  }
  const full = { ...next, weeks: next.weeks.map((w) => (w ? { ...w, bunks: w.bunks.map((b) => ({ ...b, count: String(MAX_CAMPERS_PER_BUNK) })) } : w)) };
  return withCalendar(full);
}

/** How many bunks the biggest camp of a session has (in a week everyone is there). */
export const biggestCampSize = (t: SessionTemplate): number => Object.values(t.most).reduce((a, b) => a + b, 0);
/** The villages a bunk can be added to with one click, in order. */
export const addableVillages = (t: SessionTemplate): string[] => VILLAGE_ORDER.filter((v) => t.most[v] !== undefined);
