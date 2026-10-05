import { areaOf } from '../config';
import type { WeeksState } from '../types';
import {
  AWAY_PERIODS_NO_MUSIC,
  CALENDAR,
  FLEXIBLE_VILLAGES,
  GAP_MAX_MT,
  GAP_MAX_OCS,
  GAP_SLACK_BEFORE_LAST_WEEK,
  leagueMinFor,
  MUSIC_PER_WEEK,
  POOL_SHORT_OK,
  POOL_TARGETS,
  POOL_TARGET_OTHER,
  RARE_AREAS,
  RARE_MT_MAX_SHORT_PER_BUNK,
  RARE_OCS_MAX_SHORT_BUNKS,
  RARE_SHORT_MAJOR_AT,
  SHABBAT_ROTATION,
  TRI_AWAY_PERIODS,
  TRIP_LABELS,
  type SessionWeeks,
} from './config';
import { blocksOf, type BunkHistory } from './history';
import { musicDue, sessionTargetOf } from './planner';
import type { Roster } from './roster';
import { validateGrid } from './validate';
import { SQUEEZED_SHARE, isShortWeek, leagueWant, openPeriods, ordinarySessionOpen, waterfrontWant } from './weekRoom';

/**
 * How good a generated week is.
 *  - hard: breaks a rule. Never acceptable.
 *  - major: a block that must be there is missing or short, or a bunk is too far off. Not acceptable.
 *  - minor: a small, allowed shortfall. Fine, and never shown to anyone.
 * Tusc's triathlon training in the last week of a 4-week session is expected to be skipped and is never mentioned.
 */
export interface WeekQuality {
  hard: string[];
  major: string[];
  minor: string[];
}

export interface QualityInput {
  weeks: WeeksState;
  weekIndex: number;
  sessionWeeks: SessionWeeks;
  roster: Roster;
  hist: BunkHistory[];
  /** The week being judged, grid[bunk][slot]. */
  grid: string[][];
  /** Cells that were already filled before generating; the rule checker leaves them alone. */
  locked?: boolean[][];
  /** Blocks the generator planned but could not place (ropes, pool, league, triathlon, Shabbat Prep). */
  missing?: string[];
  /** Rare-area blocks planned but not placed this week (they carry over unless this is the last week). */
  carried?: { bunk: number; area: string }[];
  /** How much looser the limits are (a week built around periods filled in by hand). Default 0. */
  stretch?: number;
  /** Bunks whose Music could not fit under their village's day cap this week. */
  musicExcused?: number[];
  /** The weeks of the Taste of CSL bunks, who are not part of the grid: nobody shares a program area with them. */
  guests?: readonly (readonly string[])[];
}

export const isBad = (q: WeekQuality): boolean => q.hard.length > 0 || q.major.length > 0;

/** Order two qualities: fewer hard, then fewer major, then fewer minor is better (negative when a is better). */
export const compareQuality = (a: WeekQuality, b: WeekQuality): number =>
  a.hard.length - b.hard.length || a.major.length - b.major.length || a.minor.length - b.minor.length;

const label = (area: string): string => (area === 'Israel Education' ? 'Israel' : area === 'TW UH' ? 'Time with UH' : area);

export function weekQuality(input: QualityInput): WeekQuality {
  const { weeks, weekIndex, sessionWeeks, roster, hist, grid } = input;
  const n = roster.n;
  const lastOfSession = weekIndex >= sessionWeeks;
  const stretch = input.stretch ?? 0;

  const hard = validateGrid({ weeks, weekIndex, sessionWeeks, roster, hist, grid, locked: input.locked }).map((v) => v.message);
  // Taste of CSL has a program area to itself
  for (const guest of input.guests ?? []) {
    guest.forEach((label, s) => {
      const area = areaOf(label);
      if (!area || area === 'Hobbies') return;
      for (let b = 0; b < n; b++) {
        if (grid[b][s] !== '' && areaOf(grid[b][s]) === area && !input.locked?.[b]?.[s]) hard.push(`${roster.names[b]} is at ${area} in a period Taste of CSL has it.`);
      }
    });
  }
  const major: string[] = [...(input.missing ?? [])];
  const minor: string[] = [];

  const blocks = grid.map((row) => blocksOf(row));
  const count = (b: number, area: string): number => blocks[b].filter((k) => k.area === area).length;
  const total = (b: number, area: string): number => (hist[b].earlier[area] ?? 0) + (hist[b].later[area] ?? 0) + count(b, area);
  const first = (v: string): number => roster.byVillage[v][0];
  const lastWeek = sessionWeeks === 4 && weekIndex === 4;
  /** Periods a bunk has open this week once the calendar and the set blocks are out: a week cut short is asked for less. */
  const open = (b: number): number => openPeriods(grid[b], lastWeek);

  // Music every week, for every bunk
  const away = (b: number): boolean => grid[b].filter((l) => TRIP_LABELS.includes(l)).length >= AWAY_PERIODS_NO_MUSIC || isShortWeek(open(b), lastWeek);
  /** Has the calendar left this bunk a good deal less than an ordinary session? Then it gets what fits, and ending short is no fault of the week. */
  const squeezed = (b: number): boolean => {
    let sum = 0;
    weeks.weeks.slice(0, sessionWeeks).forEach((w, i) => {
      const last = sessionWeeks === 4 && i === 3;
      const row = i === weekIndex - 1 ? grid[b] : w?.bunks.find((x) => x.name.trim() === roster.names[b])?.slots;
      sum += row ? openPeriods(row, last) : last ? 10 : 20;
    });
    return sum <= ordinarySessionOpen(sessionWeeks) * SQUEEZED_SHARE;
  };
  for (let b = 0; b < n; b++) {
    if (!musicDue(roster.village[b], roster.pos[b], weekIndex)) continue;
    if (count(b, 'Music') < MUSIC_PER_WEEK && !away(b) && !input.musicExcused?.includes(b)) major.push(`${roster.names[b]} has no Music this week.`);
  }

  for (const v of roster.villages) {
    const f = first(v);
    if (v === 'T') {
      // triathlon: one double and two singles; skipped in the last week of a 4-week session, and never mentioned then
      if (grid[f].filter((l) => TRIP_LABELS.includes(l)).length < TRI_AWAY_PERIODS) {
        const sessions = blocks[f].filter((k) => k.label === 'Tusc Triathlon Training').length;
        if (sessions < Math.min(leagueMinFor(v), leagueWant(v, open(f)))) major.push(`Village ${v} is short on triathlon training this week.`);
      }
    } else if (count(f, 'League') < Math.min(leagueMinFor(v), leagueWant(v, open(f)))) {
      major.push(`Village ${v} is short on league this week.`);
    }
  }

  // Waterfront: a village that should be there this week is. How even the villages come out over the session is never
  // held against a week: the calendar gives them different amounts of room.
  const wf = roster.villages.map((v) => total(first(v), 'Waterfront'));
  const wfMax = Math.max(...wf);
  roster.villages.forEach((v, i) => {
    // (one village a half-day: a week cut short may not have a half-day for everyone)
    if (!lastOfSession && count(first(v), 'Waterfront') === 0 && waterfrontWant(open(first(v))) > 0 && !isShortWeek(open(first(v)), lastWeek)) major.push(`Village ${v} has no Waterfront this week.`);
    else if (wfMax - wf[i] > 1) minor.push(`Village ${v} is behind on Waterfront.`);
  });

  for (let b = 0; b < n; b++) {
    // Pool: weekly minimum for some villages, a session total for the rest
    const t = POOL_TARGETS[roster.village[b]] ?? POOL_TARGET_OTHER;
    if ('perWeek' in t && t.perWeek !== undefined) {
      if (count(b, 'Pool') < t.perWeek && !isShortWeek(open(b), lastWeek)) major.push(`${roster.names[b]} has no Pool this week.`);
    } else if (lastOfSession) {
      const by = sessionTargetOf(roster.village[b], sessionWeeks, 'Pool') - total(b, 'Pool');
      if (by > POOL_SHORT_OK + stretch && !squeezed(b)) major.push(`${roster.names[b]} is short on Pool.`);
      else if (by > 0) minor.push(`${roster.names[b]} is short ${by} on Pool.`);
    }
    // Ropes: two per session
    if (lastOfSession && total(b, 'Ropes') < sessionTargetOf(roster.village[b], sessionWeeks, 'Ropes')) (squeezed(b) ? minor : major).push(`${roster.names[b]} is short on Ropes.`);
  }

  // Shabbat Prep: the Friday double is a rule (checked above); the earlier single periods must be there too
  for (const v of CALENDAR.shabbatPrep && CALENDAR.shabbatPrepExtra > 0 ? (SHABBAT_ROTATION[sessionWeeks][weekIndex] ?? []) : []) {
    if (!roster.byVillage[v]) continue;
    if (isShortWeek(open(first(v)), lastWeek)) continue; // a week cut short may have no period for it
    if (blocks[first(v)].filter((k) => k.label === 'Shabbat Prep' && k.len === 1).length < CALENDAR.shabbatPrepExtra) major.push(`Village ${v} is missing its extra Shabbat Prep period.`);
  }

  // Rare areas: how far short is each bunk?
  const short: { bunk: number; area: string; by: number }[] = [];
  if (lastOfSession) {
    for (let b = 0; b < n; b++) {
      for (const area of RARE_AREAS) {
        const by = sessionTargetOf(roster.village[b], sessionWeeks, area) - total(b, area);
        if (by > 0) short.push({ bunk: b, area, by });
      }
    }
  } else {
    for (const c of input.carried ?? []) {
      if (!RARE_AREAS.includes(c.area)) continue;
      const found = short.find((s) => s.bunk === c.bunk && s.area === c.area);
      if (found) found.by++;
      else short.push({ bunk: c.bunk, area: c.area, by: 1 });
    }
  }
  const flexible = (b: number): boolean => FLEXIBLE_VILLAGES.includes(roster.village[b]);
  const smallOcs = new Set<number>();
  const perBunk = new Map<number, number>();
  for (const s of short) {
    const who = `${roster.names[s.bunk]} is short ${s.by} on ${label(s.area)}`;
    perBunk.set(s.bunk, (perBunk.get(s.bunk) ?? 0) + s.by);
    if (s.by >= RARE_SHORT_MAJOR_AT + stretch && !squeezed(s.bunk)) major.push(`${who}.`);
    else if (flexible(s.bunk) || squeezed(s.bunk)) minor.push(`${who}.`);
    else {
      smallOcs.add(s.bunk);
      minor.push(`${who}.`);
    }
  }
  // Before the last week a block that was put off is only a delay: a later week can still make it up. The limits bite at the end.
  if (lastOfSession) {
    if (smallOcs.size > RARE_OCS_MAX_SHORT_BUNKS + stretch) major.push(`${smallOcs.size} bunks in O, C and S are short on a rare area.`);
    for (const [b, by] of perBunk) if (flexible(b) && !squeezed(b) && by > RARE_MT_MAX_SHORT_PER_BUNK + stretch) major.push(`${roster.names[b]} is short on several rare areas.`);
  }

  // Athletics and A&C: not too far apart, and nobody ends a session without any A&C
  for (let b = 0; b < n; b++) {
    if (lastOfSession && total(b, 'A&C') === 0 && total(b, 'Athletics') > 0 && !squeezed(b)) major.push(`${roster.names[b]} has had no A&C.`);
    const gap = Math.abs(total(b, 'A&C') - total(b, 'Athletics'));
    const allowed = (flexible(b) ? GAP_MAX_MT : GAP_MAX_OCS) + stretch;
    if (gap > allowed + (weekIndex >= sessionWeeks - 1 ? 0 : GAP_SLACK_BEFORE_LAST_WEEK)) major.push(`${roster.names[b]} has Athletics and A&C ${gap} apart.`);
    else if (gap === allowed) minor.push(`${roster.names[b]} has Athletics and A&C ${gap} apart.`);
  }

  return { hard, major, minor };
}
