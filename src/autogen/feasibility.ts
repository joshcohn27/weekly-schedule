import { villageOf } from '../autofill';
import type { Schedule } from '../types';
import { MUSIC_LIGHT_PER_SESSION, MUSIC_LIGHT_VILLAGES, SHABBAT_PREP_STAFF, TIYUL_WEEKS, TRIP_LABELS, hobbyWeeks, shabbatFor, type SessionWeeks } from './config';
import { CAMP, type CalendarEvent } from './sessionCalendar';
import { coreOf, settingAreas, type Settings } from './settings';

/**
 * Arithmetic on the settings, before anything is generated: can a schedule exist, and if not, what to change.
 * It counts periods; it does not build a schedule. Two of its limits are measured, not derived (see the constants).
 */
export interface SettingsProblem {
  /**
   * 'no': the periods do not add up, no schedule exists. 'unlikely': it adds up on paper, but settings this tight did not
   * generate when tried. 'short': a schedule comes out, but the calendar leaves less room than the numbers ask for, so
   * bunks will end the session short of some of them.
   */
  level: 'no' | 'unlikely' | 'short';
  /** What is wrong, in a sentence. */
  text: string;
  /** What to try. */
  fix: string;
}

const DAYS_NORMAL = 6;
const DAYS_LAST = 4;

/**
 * MEASURED, 22-bunk default roster, 2026-10: a village whose leftover periods were 63% of what its Athletics and A&C can
 * hold generated every time (30 of 30 sessions); at 80% a run did not find a good session in ten minutes. The line
 * between them has not been found, so anything over COMFORTABLE is reported as unlikely.
 */
const COMFORTABLE = 0.7;
/**
 * MEASURED: areas that take one bunk at a time worked when they needed 59% of the session's periods (22 bunks twice) and
 * failed at 89% (22 bunks three times). Over this share is reported as unlikely.
 */
const ONE_AT_A_TIME_SHARE = 0.75;

const nameOf = (area: string): string => (area === 'Israel Education' ? 'Israel' : area);
const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;

export function checkSettings(settings: Settings, weeks: (Schedule | null)[], sessionWeeks: SessionWeeks = 4, calendar: readonly CalendarEvent[] | null = null): SettingsProblem[] {
  const roster = weeks.find((w) => w && w.bunks.length > 0)?.bunks ?? [];
  if (roster.length === 0) return [];
  const out: SettingsProblem[] = [];
  const four = sessionWeeks === 4;
  // hobbies take two periods for each session
  const hobbies = hobbyWeeks(coreOf(settings).hobbySessions, sessionWeeks).reduce((a, b) => a + b, 0);
  // the session calendar: what it takes from everybody (opening day, Mass Program, Color War, ...) and from one village
  const inSession = (e: CalendarEvent): boolean => e.week <= sessionWeeks && !(four && e.week === 4 && e.day >= 4);
  const events = (calendar ?? []).filter(inSession);
  const campClosed = events.filter((e) => e.who === CAMP).reduce((sum, e) => sum + e.periods.length, 0);
  const villageClosed = (v: string): number => events.filter((e) => e.who === v).reduce((sum, e) => sum + e.periods.length, 0);
  const periods = (four ? 24 * 3 + 16 : 24 * sessionWeeks) - 2 * hobbies - campClosed; // the last week of a 4-week session has no Friday and a set Thursday
  const days = four ? DAYS_NORMAL * 3 + DAYS_LAST : DAYS_NORMAL * sessionWeeks;
  const villages = [...new Set(roster.map((b) => villageOf(b.name)))].filter(Boolean);
  const membersOf = (v: string): number => roster.filter((b) => villageOf(b.name) === v).length;
  const timesFor = (area: string, v: string): number => settings.areas[area].villages?.[v] ?? settings.areas[area].min;

  // Shabbat Prep: the weeks each village has it, and the periods it takes from Music and Judaics (their specialists run it)
  const prepCore = coreOf(settings);
  const prepEach = prepCore.shabbatPrep ? 2 + prepCore.shabbatPrepExtra : 0;
  const shabbat = Object.values(shabbatFor(prepCore.shabbatWeeks, sessionWeeks)).map((week) => week.filter((v) => villages.includes(v)));
  const prepPeriods = shabbat.filter((week) => week.length > 0).length * prepEach;

  // 1. An area can only hold so many bunks in a session: (bunks at once) x (periods).
  const areas = settingAreas(settings);
  for (const area of areas) {
    const a = settings.areas[area];
    const visits = villages.reduce((sum, v) => sum + membersOf(v) * timesFor(area, v), 0);
    const room = (periods - (SHABBAT_PREP_STAFF.includes(area) ? prepPeriods : 0)) * a.atOnce;
    const most = Math.floor((room * ONE_AT_A_TIME_SHARE) / roster.length);
    if (calendar && visits > room * ONE_AT_A_TIME_SHARE) {
      // with the calendar in, Auto generate gives as many as fit instead of failing: say so, plainly
      out.push({
        level: 'short',
        text: `${nameOf(area)} is set to ${visits} visits in the session and has about ${Math.floor(room * ONE_AT_A_TIME_SHARE)} places it can really use, so some bunks will get fewer.`,
        fix: `To give everyone the same, try at most ${Math.max(0, most)} per bunk${a.atOnce === 1 ? ', or 2 bunks at once' : ''}.`,
      });
    } else if (visits > room) {
      out.push({
        level: 'no',
        text: `${nameOf(area)} is set to ${visits} visits in the session, and with ${plural(a.atOnce, 'bunk')} at a time there are only ${room} places.`,
        fix: `Try at most ${most} per bunk${a.atOnce === 1 ? ', or 2 bunks at once' : ''}.`,
      });
    } else if (visits > room * ONE_AT_A_TIME_SHARE) {
      out.push({
        level: 'unlikely',
        text: `${nameOf(area)} is set to ${visits} visits in the session out of ${room} places, which leaves almost no choice of when.`,
        fix: `Try at most ${most} per bunk${a.atOnce === 1 ? ', or 2 bunks at once' : ''}.`,
      });
    }
    // 2. A village can only send so many bunks to an area in a day.
    for (const v of villages) {
      const need = membersOf(v) * timesFor(area, v);
      if (need > a.villagePerDay * days) {
        out.push({
          level: 'no',
          text: `Village ${v} needs ${need} ${nameOf(area)} visits, and at ${plural(a.villagePerDay, 'bunk')} a day there are only ${a.villagePerDay * days} in the session.`,
          fix: `Try ${Math.ceil(need / days)} bunks of one village in a day for ${nameOf(area)}, or fewer visits.`,
        });
      }
    }
  }

  // 3. Every period these areas do not use must be Athletics, A&C, Time with UH or a second Music. Count them per bunk.
  const tripPeriods = (v: string): number => {
    let entered = 0;
    let any = false;
    for (const w of weeks) {
      const bunk = w?.bunks.find((b) => villageOf(b.name) === v);
      const n = bunk ? bunk.slots.filter((l) => TRIP_LABELS.includes(l)).length : 0;
      if (n > 0) any = true;
      entered += n;
    }
    if (calendar) return villageClosed(v) + (any ? Math.max(0, entered - campClosed - villageClosed(v)) : 0); // the calendar, and anything entered by hand on top of it
    if (any) return entered;
    if (v === 'T') return four ? 14 : 2; // the mini bike trip, and the three-day one in a 4-week session
    return TIYUL_WEEKS[sessionWeeks][v] ? (v === 'S' || v === 'M' ? 4 : 2) : 0;
  };
  // the numbers come from the settings being looked at, which need not be the ones in force
  const core = coreOf(settings);
  const flexible = areas.reduce((sum, a) => sum + (settings.areas[a].villages ? 0 : settings.areas[a].max - settings.areas[a].min), 0) + (core.uhMax - core.uhMin);
  const flexibleNames = areas.filter((a) => !settings.areas[a].villages).map(nameOf);
  let shortest: { v: string; by: number } | null = null;
  let worst: { v: string; over: number; leftover: number; room: number; level: 'no' | 'unlikely' } | null = null;
  for (const v of villages) {
    const n = membersOf(v);
    const normalWeeks = four ? 3 : sessionWeeks;
    const leagueTimes = core.leagueByVillage[v] ?? core.leaguePerWeek;
    const leagueWeeks = normalWeeks * leagueTimes + (four ? Math.min(2, leagueTimes) : 0);
    const league = v === 'T' ? normalWeeks * (leagueTimes > 0 ? leagueTimes + 1 : 0) : v === 'M' ? leagueWeeks * 2 : leagueWeeks;
    const waterfront = normalWeeks * core.waterfrontPerWeek * 2 + (four ? Math.min(1, core.waterfrontPerWeek) * 2 : 0);
    const music = core.musicPerWeek === 0 ? 0 : MUSIC_LIGHT_VILLAGES.includes(v) ? MUSIC_LIGHT_PER_SESSION : sessionWeeks;
    const prep = shabbat.filter((week) => week.includes(v)).length * prepEach;
    // Waterfront and league are an average over the session: a village the calendar takes periods from has fewer
    const share = calendar ? Math.max(0, periods - villageClosed(v)) / (periods + campClosed) : 1;
    const fixed = prep /* Shabbat Prep */ + 1 /* the first Sunday */ + tripPeriods(v) + Math.round(waterfront * share) + Math.round(league * share) + sessionWeeks * core.poolPerWeek /* pool */ + music + 2 * core.ropesPerSession /* ropes */ + core.uhMin /* Time with UH */;
    const planned = areas.reduce((sum, a) => sum + timesFor(a, v), 0);
    const leftover = periods - fixed - planned - flexible;
    // Athletics and A&C: a village sends DAY_CAP bunks a day to each, and a bunk has each on every other day at most
    const perDay = Math.min(1, (core.athletics.villagePerDay + core.ac.villagePerDay) / n);
    const perWeekMost = core.athletics.maxPerWeek + core.ac.maxPerWeek;
    const room = normalWeeks * Math.min(perWeekMost, perDay * DAYS_NORMAL) + (four ? Math.min(DAYS_LAST, perDay * DAYS_LAST) : 0);
    const secondMusic = MUSIC_LIGHT_VILLAGES.includes(v) ? 0 : sessionWeeks * Math.max(0, core.music.maxPerWeek - core.musicPerWeek);
    if (calendar && leftover + flexible < 0 && (!shortest || leftover + flexible < shortest.by)) shortest = { v, by: leftover + flexible };
    const level = leftover > room + secondMusic ? 'no' : leftover > room * COMFORTABLE ? 'unlikely' : null;
    if (!level) continue;
    const over = Math.ceil(leftover - room * COMFORTABLE);
    if (!worst || over > worst.over) worst = { v, over, leftover: Math.round(leftover), room: Math.round(room), level };
  }
  if (worst) {
    out.push({
      level: worst.level,
      text:
        worst.level === 'no'
          ? `A schedule is not possible with these settings: each village ${worst.v} bunk would have about ${worst.leftover} periods in the session that only Athletics and A&C can fill, and they can hold about ${worst.room}.`
          : `A schedule is unlikely with these settings: each village ${worst.v} bunk would have about ${worst.leftover} periods in the session that only Athletics and A&C can fill. They can hold about ${worst.room}, and it stops generating well before that.`,
      fix: `Try giving each bunk about ${worst.over} more ${worst.over === 1 ? 'visit' : 'visits'} a session: raise "at least" or "at most" on ${flexibleNames.join(', ')}, or Dance for village ${worst.v}; or more Waterfront or league a week.`,
    });
  }
  if (shortest) {
    const by = Math.ceil(-shortest.by);
    out.push({
      level: 'short',
      text: `With this session's calendar a village ${shortest.v} bunk has about ${by} fewer periods than these numbers ask for, so bunks will end the session short of a few visits. Auto generate fits in as many as it can.`,
      fix: 'Nothing has to change. To choose what gives way yourself, lower "at least" on the areas that matter least, or Waterfront or league.',
    });
  }
  return out;
}
