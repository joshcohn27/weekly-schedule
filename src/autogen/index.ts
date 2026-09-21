import type { Schedule, WeeksState } from '../types';
import { placeCalendar, planCalendar } from './calendar';
import { ATTEMPTS, ENOUGH_VALID_ATTEMPTS, MAX_ROUNDS, MAX_TOTAL_MS, type SessionWeeks } from './config';
import { fillFlexible } from './fill';
import { SLOTS, blocksOf, buildHistory, isFilledWeek, type BunkHistory } from './history';
import { placeLeague, placePool, placeRopes, placeSolo, placeTri, placeWaterfront, relabelRopes } from './place';
import { TOKEN_LABEL, planWeek, sessionTargetOf, type TokenArea } from './planner';
import { compareQuality, isBad, weekQuality, type WeekQuality } from './quality';
import { mulberry32 } from './rng';
import { buildRoster, type Roster } from './roster';
import { softScore } from './score';
import type { Ctx } from './state';
import { buildDayMasks } from './state';

export type { SessionWeeks } from './config';
export { isBad, weekQuality } from './quality';
export type { QualityInput, WeekQuality } from './quality';
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
  /** Plain sentences about anything that was not met. For tests and the console only; never shown to the user. */
  warnings: string[];
  seed: number;
  /** How the returned week was judged. A normal result has no hard and no major issues. */
  quality: WeekQuality;
  /** Rounds of attempts it took. */
  rounds: number;
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

interface Found {
  grid: string[][];
  warnings: string[];
  quality: WeekQuality;
  score: number;
}

/**
 * Searches for a good week, one round at a time. A round is up to ATTEMPTS randomized attempts (stopping early
 * once enough clean ones exist); rounds repeat with new seeds until a week has no hard and no major issues,
 * or MAX_ROUNDS / MAX_TOTAL_MS is reached, in which case the best week found so far is returned.
 * Stepping one round at a time lets the UI stay responsive in between.
 */
class WeekSearch {
  rounds = 0;
  done = false;
  private best: Found | null = null;
  private readonly started = performance.now();
  private readonly sessionWeeks: SessionWeeks;
  private readonly source: Schedule | null;
  private readonly roster: Roster;
  private readonly hist: BunkHistory[];
  private readonly start: string[][];
  private readonly locked: boolean[][];
  private readonly lastWeek: boolean;

  constructor(private readonly opts: AutoGenOptions) {
    this.sessionWeeks = opts.sessionWeeks ?? 4;
    const source = opts.weeks.weeks[opts.weekIndex - 1];
    this.source = isFilledWeek(source) ? source : null;
    const bunks = this.source?.bunks ?? [];
    this.roster = buildRoster(bunks);
    this.hist = buildHistory(opts.weeks, opts.weekIndex, this.roster.names);
    this.start = bunks.map((b) => (opts.mode === 'replace-all' ? Array<string>(SLOTS).fill('') : [...b.slots]));
    this.locked = this.start.map((row) => row.map((label) => label !== ''));
    this.lastWeek = this.sessionWeeks === 4 && opts.weekIndex === 4;
    if (!this.source) this.done = true;
  }

  step(): void {
    if (this.done) return;
    const found = this.runRound(this.rounds++);
    if (!this.best || compareQuality(found.quality, this.best.quality) < 0) this.best = found;
    if (!isBad(this.best.quality) || this.rounds >= MAX_ROUNDS || performance.now() - this.started >= MAX_TOTAL_MS) this.done = true;
  }

  private runRound(round: number): Found {
    const { opts, roster, hist, start, locked, lastWeek, sessionWeeks } = this;
    const roundSeed = round === 0 ? opts.seed : (opts.seed + round * 0x632be5ab) | 0;
    const calendar = planCalendar(
      { weeks: opts.weeks, weekIndex: opts.weekIndex, sessionWeeks, lastWeek, villages: roster.villages },
      mulberry32(roundSeed ^ 0x51ed270b),
    );

    let best: Found | null = null;
    let valid = 0;
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      const c: Ctx = {
        weeks: opts.weeks,
        weekIndex: opts.weekIndex,
        sessionWeeks,
        roster,
        hist,
        grid: start.map((row) => [...row]),
        locked,
        rng: mulberry32(roundSeed + attempt * 0x9e3779b1),
        warnings: [],
        lastWeek,
        tripDay: null,
        unmet: 0,
        missing: [],
        carried: [],
        extras: 0,
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
      placeSolo(c, plan);
      fillFlexible(c, plan);
      relabelRopes(c);

      const quality = weekQuality({
        weeks: opts.weeks,
        weekIndex: opts.weekIndex,
        sessionWeeks,
        roster,
        hist,
        grid: c.grid,
        locked,
        missing: c.missing,
        carried: c.carried,
        tiyulDue: calendar.tiyul,
      });
      // rule breaks first, then anything not acceptable, then the small stuff, then the soft preferences
      const score = quality.hard.length * 1e6 + (quality.major.length + c.extras) * 1e4 + quality.minor.length * 50 + softScore(c);
      if (!best || score < best.score) best = { grid: c.grid, warnings: c.warnings, quality, score };
      if (quality.hard.length === 0) valid++;
      if (valid >= ENOUGH_VALID_ATTEMPTS && best.score < 1e4) break;
    }
    return best as Found;
  }

  result(): AutoGenResult {
    const { opts, source, roster, hist, sessionWeeks } = this;
    if (!source || !this.best) {
      return {
        schedule: opts.weeks.weeks[opts.weekIndex - 1] ?? { bunks: [], days: [] },
        warnings: ['Add bunks on the Build tab first.'],
        seed: opts.seed,
        quality: { hard: [], major: [], minor: [] },
        rounds: 0,
      };
    }
    const chosen = this.best;
    if (isBad(chosen.quality)) {
      console.debug('Auto generate could not find a fully clean week; returning the best one', {
        week: opts.weekIndex,
        rounds: this.rounds,
        hard: chosen.quality.hard,
        major: chosen.quality.major,
      });
    }
    return {
      schedule: { bunks: source.bunks.map((b, i) => ({ ...b, slots: chosen.grid[i] })), days: source.days },
      warnings: [...new Set([...chosen.warnings, ...chosen.quality.hard, ...sessionWarnings(roster, hist, chosen.grid, opts.weekIndex, sessionWeeks)])],
      seed: opts.seed,
      quality: chosen.quality,
      rounds: this.rounds,
    };
  }
}

/** Build one week. Keeps trying, quietly, until the week has no rule breaks and nothing that is not acceptable. */
export function generateWeek(opts: AutoGenOptions): AutoGenResult {
  const search = new WeekSearch(opts);
  while (!search.done) search.step();
  return search.result();
}

/** The same as generateWeek, but lets the browser breathe between rounds so the page stays responsive. */
export async function generateWeekAsync(opts: AutoGenOptions): Promise<AutoGenResult> {
  const search = new WeekSearch(opts);
  while (!search.done) {
    search.step();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  return search.result();
}
