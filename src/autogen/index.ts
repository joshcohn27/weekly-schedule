import type { Schedule, WeeksState } from '../types';
import { placeCalendar, planCalendar } from './calendar';
import { ATTEMPTS, ENOUGH_VALID_ATTEMPTS, FLEXIBLE_VILLAGES, type SessionWeeks } from './config';
import { fillFlexible } from './fill';
import { SLOTS, blocksOf, buildHistory, isFilledWeek, type BunkHistory } from './history';
import { placeLeague, placePool, placeRopes, placeTri, placeWaterfront, relabelRopes } from './place';
import { TOKEN_LABEL, planWeek, sessionTargetOf, type TokenArea } from './planner';
import { mulberry32 } from './rng';
import { buildRoster, type Roster } from './roster';
import { softScore } from './score';
import type { Ctx } from './state';
import { buildDayMasks } from './state';
import { validateGrid, type Violation } from './validate';

export type { SessionWeeks } from './config';
export { validateWeek } from './validate';
export type { Violation } from './validate';

export interface AutoGenOptions {
  /** All loaded weeks. */
  weeks: WeeksState;
  /** The week to generate, 1 to 4. */
  weekIndex: number;
  mode: 'fill-empty' | 'replace-all';
  /** Default 4. */
  sessionWeeks?: SessionWeeks;
  /** The UI passes a fresh random seed every click. */
  seed: number;
}

export interface AutoGenResult {
  /** The new week: bunks and day details unchanged, activities filled. */
  schedule: Schedule;
  /** Plain sentences, empty when everything was met. */
  warnings: string[];
  seed: number;
}

/**
 * In the last week of the session, say plainly where a bunk ended short of its targets, or with
 * Athletics and A&C more than one apart. Earlier weeks carry what they could not fit forward.
 */
function sessionWarnings(roster: Roster, hist: BunkHistory[], grid: string[][], weekIndex: number, sessionWeeks: SessionWeeks): string[] {
  if (weekIndex < sessionWeeks) return [];
  const out: string[] = [];
  const nameOf = (area: string): string => (area === 'Ropes' || area === 'Pool' ? area : (TOKEN_LABEL[area as TokenArea] ?? area));
  for (let b = 0; b < roster.n; b++) {
    const blocks = blocksOf(grid[b]);
    const total = (area: string): number =>
      (hist[b].earlier[area] ?? 0) + (hist[b].later[area] ?? 0) + blocks.filter((k) => k.area === area).length;
    for (const area of ['Ropes', 'Pool', 'Judaics', 'Israel Education', 'Teva', 'Ceramics', 'Yoga', 'TW UH', 'Dance', 'Music']) {
      const want = sessionTargetOf(roster.village[b], sessionWeeks, area);
      const got = total(area);
      if (got < want) out.push(`${roster.names[b]} is short ${want - got} on ${nameOf(area)} (${got} of ${want} over the session).`);
    }
    const ath = total('Athletics');
    const ac = total('A&C');
    if (ac - ath === -1) out.push(`${roster.names[b]} has one more Athletics than A&C over the session (${ath} and ${ac}).`);
    else if (Math.abs(ac - ath) > 1) out.push(`${roster.names[b]} has Athletics and A&C more than one apart over the session (${ath} and ${ac}).`);
  }
  return out;
}

/**
 * Bunks whose Athletics and A&C ended too far apart: O, C and S must be level (A&C ahead by 0 or 1)
 * in the last week; Mohawk and Tusc may be two apart. Earlier weeks only avoid pile-ups.
 */
function athleticsAcMisses(roster: Roster, hist: BunkHistory[], grid: string[][], last: boolean): number {
  let misses = 0;
  for (let b = 0; b < roster.n; b++) {
    const blocks = blocksOf(grid[b]);
    const total = (area: string): number =>
      (hist[b].earlier[area] ?? 0) + (hist[b].later[area] ?? 0) + blocks.filter((k) => k.area === area).length;
    const gap = total('A&C') - total('Athletics');
    const flexible = FLEXIBLE_VILLAGES.includes(roster.village[b]);
    if (last && !flexible ? gap !== 0 && gap !== 1 : Math.abs(gap) > 2) misses++;
  }
  return misses;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

function describe(v: Violation): string {
  const when = v.slot === undefined ? '' : ` (${DAY_NAMES[Math.floor(v.slot / 4)]} period ${(v.slot % 4) + 1})`;
  return `${v.message.replace(/\.$/, '')}${v.slot !== undefined && !v.message.includes(DAY_NAMES[Math.floor(v.slot / 4)]) ? when : ''}.`;
}

/** Build one week. Runs several randomized attempts and keeps the one with no rule breaks and the best soft score. */
export function generateWeek(opts: AutoGenOptions): AutoGenResult {
  const sessionWeeks: SessionWeeks = opts.sessionWeeks ?? 4;
  const source = opts.weeks.weeks[opts.weekIndex - 1];
  if (!isFilledWeek(source)) {
    return { schedule: source ?? { bunks: [], days: [] }, warnings: ['Add bunks on the Build tab first.'], seed: opts.seed };
  }

  const roster = buildRoster(source.bunks);
  const hist = buildHistory(opts.weeks, opts.weekIndex, roster.names);
  const start: string[][] = source.bunks.map((b) => (opts.mode === 'replace-all' ? Array<string>(SLOTS).fill('') : [...b.slots]));
  const locked = start.map((row) => row.map((label) => label !== ''));

  const lastWeek = sessionWeeks === 4 && opts.weekIndex === 4;
  const calendar = planCalendar(
    { weeks: opts.weeks, weekIndex: opts.weekIndex, sessionWeeks, lastWeek, villages: roster.villages },
    mulberry32(opts.seed ^ 0x51ed270b),
  );

  let best: { grid: string[][]; warnings: string[]; violations: Violation[]; score: number } | null = null;
  let valid = 0;
  const lastOfSession = opts.weekIndex >= sessionWeeks;
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const c: Ctx = {
      weeks: opts.weeks,
      weekIndex: opts.weekIndex,
      sessionWeeks,
      roster,
      hist,
      grid: start.map((row) => [...row]),
      locked,
      rng: mulberry32(opts.seed + attempt * 0x9e3779b1),
      warnings: [],
      lastWeek,
      tripDay: null,
      unmet: 0,
      structural: 0,
      dayMask: buildDayMasks(start),
      days: [0, 1, 2, 3, 4, 5].filter((d) => !(lastWeek && d === 5)),
      calendar,
    };
    placeCalendar(c);
    const plan = planWeek(c);
    placeWaterfront(c, plan);
    placeLeague(c);
    placeTri(c);
    placeRopes(c, plan);
    placePool(c, plan);
    fillFlexible(c, plan);
    relabelRopes(c);

    const violations = validateGrid({ weeks: opts.weeks, weekIndex: opts.weekIndex, sessionWeeks, roster, hist, grid: c.grid, locked });
    const gapMisses = athleticsAcMisses(roster, hist, c.grid, lastOfSession);
    // rule breaks first, then blocks that had to be exact but were not, then the soft preferences
    const score = violations.length * 1e6 + (c.structural + (lastOfSession ? gapMisses : 0)) * 1e4 + (lastOfSession ? 0 : gapMisses * 300) + softScore(c);
    if (!best || score < best.score) best = { grid: c.grid, warnings: c.warnings, violations, score };
    if (violations.length === 0) valid++;
    if (valid >= ENOUGH_VALID_ATTEMPTS && best.score < 1e4) break;
  }

  const chosen = best as NonNullable<typeof best>;
  const warnings = [...chosen.warnings, ...chosen.violations.map(describe), ...sessionWarnings(roster, hist, chosen.grid, opts.weekIndex, sessionWeeks)];
  return {
    schedule: { bunks: source.bunks.map((b, i) => ({ ...b, slots: chosen.grid[i] })), days: source.days },
    warnings: [...new Set(warnings)],
    seed: opts.seed,
  };
}
