import { isGuest } from './autofill';
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
