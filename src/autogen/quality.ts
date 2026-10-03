import type { WeeksState } from '../types';
import {
  FLEXIBLE_VILLAGES,
  GAP_MAX_MT,
  GAP_MAX_OCS,
  GAP_SLACK_BEFORE_LAST_WEEK,
  LEAGUE_PER_WEEK,
  MUSIC_PER_WEEK,
  POOL_TARGETS,
  POOL_TARGET_OTHER,
  RARE_AREAS,
  RARE_MT_MAX_SHORT_PER_BUNK,
  RARE_OCS_MAX_SHORT_BUNKS,
  RARE_SHORT_MAJOR_AT,
  SHABBAT_ROTATION,
  WATERFRONT_PER_WEEK,
  type SessionWeeks,
} from './config';
import { blocksOf, type BunkHistory } from './history';
import { sessionTargetOf } from './planner';
import type { Roster } from './roster';
import { validateGrid } from './validate';

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
  const lastWeek4 = sessionWeeks === 4 && weekIndex === 4;

  const hard = validateGrid({ weeks, weekIndex, sessionWeeks, roster, hist, grid, locked: input.locked }).map((v) => v.message);
  const major: string[] = [...(input.missing ?? [])];
  const minor: string[] = [];

  const blocks = grid.map((row) => blocksOf(row));
  const count = (b: number, area: string): number => blocks[b].filter((k) => k.area === area).length;
  const total = (b: number, area: string): number => (hist[b].earlier[area] ?? 0) + (hist[b].later[area] ?? 0) + count(b, area);
  const first = (v: string): number => roster.byVillage[v][0];

  // Music every week, for every bunk
  for (let b = 0; b < n; b++) if (count(b, 'Music') < MUSIC_PER_WEEK) major.push(`${roster.names[b]} has no Music this week.`);

  for (const v of roster.villages) {
    const f = first(v);
    if (v === 'T') {
      // triathlon: one double and two singles; skipped in the last week of a 4-week session, and never mentioned then
      if (!lastWeek4) {
        const periods = grid[f].filter((l) => l === 'Tusc Triathlon Training').length;
        if (periods < LEAGUE_PER_WEEK + 1) major.push(`Village ${v} is short on triathlon training this week.`);
      }
    } else if (count(f, 'League') < LEAGUE_PER_WEEK) {
      major.push(`Village ${v} is short on league this week.`);
    }
  }

  // Waterfront: villages within one block of each other, and nobody left out in a normal week
  const wf = roster.villages.map((v) => total(first(v), 'Waterfront'));
  const wfMax = Math.max(...wf);
  roster.villages.forEach((v, i) => {
    if (wfMax - wf[i] > 1) major.push(`Village ${v} is short on Waterfront.`);
    else if (!lastOfSession && count(first(v), 'Waterfront') === 0 && WATERFRONT_PER_WEEK > 0) major.push(`Village ${v} has no Waterfront this week.`);
  });

  for (let b = 0; b < n; b++) {
    // Pool: weekly minimum for some villages, a session total for the rest
    const t = POOL_TARGETS[roster.village[b]] ?? POOL_TARGET_OTHER;
    if ('perWeek' in t && t.perWeek !== undefined) {
      if (count(b, 'Pool') < t.perWeek) major.push(`${roster.names[b]} has no Pool this week.`);
    } else if (lastOfSession && total(b, 'Pool') < (t.perSession ?? 0)) major.push(`${roster.names[b]} is short on Pool.`);
    // Ropes: two per session
    if (lastOfSession && total(b, 'Ropes') < sessionTargetOf(roster.village[b], sessionWeeks, 'Ropes')) major.push(`${roster.names[b]} is short on Ropes.`);
  }

  // Shabbat Prep: the Friday double is a rule (checked above); the earlier single must be there too
  for (const v of SHABBAT_ROTATION[sessionWeeks][weekIndex] ?? []) {
    if (!roster.byVillage[v]) continue;
    if (!blocks[first(v)].some((k) => k.label === 'Shabbat Prep' && k.len === 1)) major.push(`Village ${v} is missing its extra Shabbat Prep period.`);
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
    if (s.by >= RARE_SHORT_MAJOR_AT) major.push(`${who}.`);
    else if (flexible(s.bunk)) minor.push(`${who}.`);
    else {
      smallOcs.add(s.bunk);
      minor.push(`${who}.`);
    }
  }
  if (smallOcs.size > RARE_OCS_MAX_SHORT_BUNKS) major.push(`${smallOcs.size} bunks in O, C and S are short on a rare area.`);
  for (const [b, by] of perBunk) if (flexible(b) && by > RARE_MT_MAX_SHORT_PER_BUNK) major.push(`${roster.names[b]} is short on several rare areas.`);

  // Athletics and A&C: not too far apart
  for (let b = 0; b < n; b++) {
    const gap = Math.abs(total(b, 'A&C') - total(b, 'Athletics'));
    const allowed = flexible(b) ? GAP_MAX_MT : GAP_MAX_OCS;
    if (gap > allowed + (lastOfSession ? 0 : GAP_SLACK_BEFORE_LAST_WEEK)) major.push(`${roster.names[b]} has Athletics and A&C ${gap} apart.`);
    else if (gap === allowed) minor.push(`${roster.names[b]} has Athletics and A&C ${gap} apart.`);
  }

  return { hard, major, minor };
}
