import { TRIP_LABELS, WATERFRONT_PER_WEEK, leagueFor } from './config';

/** What takes a period out of a week before anything is shared out: the calendar, hobbies, the last week's set blocks, Shabbat Prep, the swim test. */
const SET_LABELS = ['AM Hobbies', 'PM Hobbies', 'Hobby Culmination', 'Packing Time', 'Banquet Prep', 'Shabbat Prep', 'Swim Test'];
/** Periods a bunk has for everything else in an ordinary week: six days less two hobby sessions. */
const ORDINARY_OPEN = 20;
/** A village with at least this many open periods in a week still gets to Waterfront once. */
const WATERFRONT_AT_LEAST_ONCE = 6;
/** A bunk with fewer open periods than this in a week is not expected at the pool or at Music that week. */
export const TOO_SHORT_FOR_WEEKLY = 4;

/**
 * Periods of a bunk's week that are open for Waterfront, league and the program areas: everything that is not on the
 * calendar (a trip, a village day, Mass Program, ...) or set (hobbies, Shabbat Prep, ...). The last Friday of a 4-week
 * session has no periods. It reads the same before and after the week is generated.
 */
export function openPeriods(row: readonly string[], lastWeek: boolean): number {
  let n = 0;
  for (let s = 0; s < row.length; s++) {
    if (lastWeek && s >= 20) continue;
    const label = row[s];
    if (label === '' || (!TRIP_LABELS.includes(label) && !SET_LABELS.includes(label))) n++;
  }
  return n;
}

/**
 * "Twice a week" is an average over the session: a week the calendar has cut short gets fewer. This is the share of an
 * ordinary week a bunk has left, 1 at the most.
 */
export const weekShare = (open: number): number => Math.min(1, open / ORDINARY_OPEN);

/** Waterfront blocks a village should have in a week in which it has this many open periods. */
export function waterfrontWant(open: number): number {
  if (WATERFRONT_PER_WEEK <= 0) return 0;
  return Math.max(open >= WATERFRONT_AT_LEAST_ONCE ? 1 : 0, Math.round(WATERFRONT_PER_WEEK * weekShare(open)));
}

/** League periods (for Tusc: triathlon sessions) a village should have in a week in which it has this many open periods. */
export const leagueWant = (village: string, open: number): number => Math.round(leagueFor(village) * weekShare(open));

/** A week with fewer open periods than this has been cut short by the calendar: what must happen every week is then only wanted, not required. */
export const FULL_WEEK_OPEN = 15;
/** The last week of a 4-week session is short to begin with (about ten open periods): it counts as cut short below this. */
export const FULL_LAST_WEEK_OPEN = 8;
export const isShortWeek = (open: number, lastWeek: boolean): boolean => open < (lastWeek ? FULL_LAST_WEEK_OPEN : FULL_WEEK_OPEN);
/** The camp has one ropes course, one group a half-day: no more than this share of a week's half-days is planned for it. */
export const ROPES_HALF_DAY_SHARE = 0.7;
/** Open periods a bunk has in a session with nothing on the calendar: ordinary weeks, and the short last week of a 4-week session. */
export const ordinarySessionOpen = (sessionWeeks: number): number => (sessionWeeks === 4 ? 3 * ORDINARY_OPEN + 10 : sessionWeeks * ORDINARY_OPEN);
/**
 * A bunk whose session has this share of an ordinary one or less has been squeezed by the calendar: the numbers "a session"
 * were set for a full one, so it gets as many as fit, and ending short is not held against the last week.
 */
export const SQUEEZED_SHARE = 0.9;
