import { areaOf } from '../config';
import {
  DAY_CAP,
  FILL_MAX_STEPS,
  FILL_NOISE,
  FILL_POLISH_STEPS,
  FILL_REST_STEPS,
  FILL_STALL_STEPS,
  FLEXIBLE_VILLAGES,
  GAP_MAX_MT,
  GAP_MAX_OCS,
  GAP_SLACK_BEFORE_LAST_WEEK,
  MUSIC_LIGHT_VILLAGES,
  SESSION_FILLER_MAX,
  SLOT_CAP,
  TRIP_LABELS,
  UH_HELD_BACK,
  UH_MAX_PER_SESSION,
  UH_RELEASE_TRIP_PERIODS,
  WEEK_BLOCK_MAX,
  WEIGHTS,
} from './config';
import { SLOTS, dayOf } from './history';
import { TOKEN_AREAS, TOKEN_LABEL, inWeekCount, sessionTargetOf, type Plan } from './planner';
import { shuffle } from './rng';
import { shareLevel } from './roster';
import { groupBreaks, isFixedMohawkAthletics, sharedArea } from './share';
import { ALL_SLOTS, buildDayMasks, fillable, isFree, type Ctx } from './state';

// Areas that may fall a block short when a bunk has no room. Music is only ever dropped as a last resort.
const MAY_FALL_SHORT = ['TW UH', 'Yoga', 'Ceramics', 'Teva', 'Dance', 'Israel Education', 'Judaics'];
/** What a leftover period may be. Yoga, Ceramics and Judaics only up to SESSION_FILLER_MAX a session. */
const LEFTOVER = ['Athletics', 'A&C', 'Time with UH', 'Music', 'Yoga', 'Ceramics', 'Judaics'];
const FILLERS = Object.keys(SESSION_FILLER_MAX);
/** Does the row have this program area on this day? A day off either end of the week has nothing. */
const has = (row: readonly string[], day: number, area: string): boolean =>
  day >= 0 && day < 6 && (areaOf(row[day * 4]) === area || areaOf(row[day * 4 + 1]) === area || areaOf(row[day * 4 + 2]) === area || areaOf(row[day * 4 + 3]) === area);
/** A rule break counts this much, so a move that fixes one always beats any change of preference. */
const HARD = 1000;

/** The areas the sharing rules cover, and their position in the search's tables. */
const SHARED = Object.keys(SLOT_CAP);
const SHARED_INDEX = new Map(SHARED.map((a, i) => [a, i]));
const ix = (area: string): number => SHARED_INDEX.get(area) as number;

const labelOf = (area: string): string => TOKEN_LABEL[area as (typeof TOKEN_AREAS)[number]];

/**
 * Fill every remaining period. Each bunk gets its planned rare areas and Music, and its other empty periods become
 * Athletics, A&C or (within its session limit) Time with UH. Everything is put down roughly and then improved by a local
 * search: take a period that breaks a rule and make the swap inside that bunk's week (or the change of leftover area)
 * that helps most, until nothing breaks a rule. No rule is ever bent to fill a period. Returns true when the search
 * ended with no rule break.
 */
export function fillFlexible(c: Ctx, plan: Plan): boolean {
  const n = c.roster.n;
  const tok: Record<string, number>[] = Array.from({ length: n }, () => ({}));
  const free: number[][] = Array.from({ length: n }, (_, b) => ALL_SLOTS.filter((s) => isFree(c, b, s) && fillable(c, s)));
  const total = (b: number, area: string): number => (c.hist[b].earlier[area] ?? 0) + (c.hist[b].later[area] ?? 0) + inWeekCount(c, b, area);
  const dropped: Record<string, number> = {}; // blocks put off so far this week, per area, so no one area takes every hit

  for (const b of shuffle(c.rng, Array.from({ length: n }, (_, i) => i))) {
    for (const area of TOKEN_AREAS) if (plan[area][b] > 0) tok[b][area] = plan[area][b];
    let planned = Object.values(tok[b]).reduce((a, x) => a + x, 0);
    // a bunk that has had no A&C yet keeps one period for it, even if a rare area has to wait
    const forAc = total(b, 'A&C') === 0 && free[b].length > 0 ? 1 : 0;
    while (planned > free[b].length - forAc) {
      // Put off the area this bunk can best spare: not one it is already short on, and the one hit least so far.
      const options = MAY_FALL_SHORT.filter((a) => (tok[b][a] ?? 0) > 0);
      const spare = options.filter((a) => sessionTargetOf(c.roster.village[b], c.sessionWeeks, a) - (total(b, a) + tok[b][a] - 1) <= 1);
      const candidates = spare.length ? spare : options;
      if (candidates.length === 0) {
        if ((tok[b].Music ?? 0) > 0) {
          tok[b].Music--;
          planned--;
          c.unmet++;
          continue;
        }
        break;
      }
      const least = Math.min(...candidates.map((a) => dropped[a] ?? 0));
      const area = shuffle(c.rng, candidates.filter((a) => (dropped[a] ?? 0) === least))[0];
      tok[b][area]--;
      dropped[area] = (dropped[area] ?? 0) + 1;
      planned--;
      c.unmet++;
      c.carried.push({ bunk: b, area });
    }
  }

  fitToVillageDays(c, tok, free);

  const search = new FillSearch(c, free);
  search.seed(tok);
  const clean = search.run();
  c.dayMask = buildDayMasks(c.grid);
  return clean;
}

/**
 * A village may only have so many bunks at an area in one day. When its bunks are free on too few days for all of them
 * (Mohawk around its Tiyul, Tusc back from the bike trip), the blocks that cannot fit are put off instead of being forced in.
 * Music that cannot fit is excused for the week.
 */
function fitToVillageDays(c: Ctx, tok: Record<string, number>[], free: number[][]): void {
  for (const v of c.roster.villages) {
    const members = c.roster.byVillage[v];
    for (const area of TOKEN_AREAS) {
      const cap = DAY_CAP[area];
      if (cap === undefined) continue;
      const used = [0, 0, 0, 0, 0, 0];
      // days the village already has bunks at this area (placed by hand)
      for (const b of members) for (let day = 0; day < 6; day++) if ([0, 1, 2, 3].some((p) => areaOf(c.grid[b][day * 4 + p]) === area)) used[day]++;
      const daysOf = (b: number): number[] => [...new Set(free[b].map(dayOf))].filter((day) => ![0, 1, 2, 3].some((p) => areaOf(c.grid[b][day * 4 + p]) === area));
      const want = shuffle(c.rng, members.filter((b) => (tok[b][area] ?? 0) > 0)).sort((x, y) => daysOf(x).length - daysOf(y).length);
      for (const b of want) {
        const mine = new Set<number>();
        for (let k = 0; k < tok[b][area]; k++) {
          const day = daysOf(b).filter((d) => !mine.has(d) && used[d] < cap).sort((x, y) => used[x] - used[y])[0];
          if (day === undefined) {
            tok[b][area] -= tok[b][area] - k;
            c.unmet++;
            if (area === 'Music') c.excused.push(b);
            else c.carried.push({ bunk: b, area });
            break;
          }
          mine.add(day);
          used[day]++;
        }
      }
    }
  }
}

interface Move {
  cells: number[];
  labels: string[];
}

class FillSearch {
  private readonly n: number;
  private readonly grid: string[][];
  /** ord[b][s]: which time at its area this cell is for the bunk, 0 when the cell has no area. */
  private readonly ord: number[][];
  /** ga[b][s]: the area this cell counts under for the sharing rules, or null (empty, filled by hand, or outside the rules). */
  private readonly ga: (string | null)[][];
  /** Which period-and-area groups, village days and bunks break a rule right now, kept up to date move by move. */
  private readonly badGroup: boolean[][];
  private readonly badCap: Record<string, boolean[][]> = {};
  private readonly badRow: boolean[];
  /** A cell that was just changed is left alone until this step, so the search does not undo itself. */
  private readonly restUntil: number[][];
  /** Bunks whose weekly Music is planned: the search may add a second one, but never take the only one away. */
  private musicPlanned: boolean[] = [];
  /** How many of each filler area (Yoga, Ceramics) is planned for each bunk this week: the search may add one, never take a planned one away. */
  private fillerPlanned: number[][] = [];
  /** How many of each filler area each bunk has in the other weeks. */
  private readonly fillerBase: number[][];
  private step = 0;
  private readonly allowedGap: number[];
  private readonly flexible: boolean[];
  /**
   * Each bunk's Athletics days: 0 for Sunday, Tuesday and Thursday, 1 for Monday, Wednesday and Friday. Its A&C goes on the
   * other days. Laid out like this from the start, neither is ever on two days in a row or twice in a day. Bunks next to
   * each other in a village (who may share A&C) have the same days, and the next two have the opposite ones.
   */
  private readonly athleticsDays: number[];
  /** Most Time with UH each bunk may have had by the end of this week. */
  private readonly uhLimit: number[];
  private readonly base: { ath: number; ac: number; uh: number }[];

  constructor(private readonly c: Ctx, private readonly cells: number[][]) {
    this.n = c.roster.n;
    this.grid = c.grid;
    this.ord = c.grid.map(() => Array<number>(SLOTS).fill(0));
    this.ga = c.grid.map(() => Array<string | null>(SLOTS).fill(null));
    this.badGroup = Array.from({ length: SLOTS }, () => Array<boolean>(SHARED.length).fill(false));
    for (const v of c.roster.villages) this.badCap[v] = Array.from({ length: 6 }, () => Array<boolean>(SHARED.length).fill(false));
    this.badRow = Array<boolean>(c.roster.n).fill(false);
    this.restUntil = c.grid.map(() => Array<number>(SLOTS).fill(0));
    const slack = c.weekIndex >= c.sessionWeeks - 1 ? 0 : GAP_SLACK_BEFORE_LAST_WEEK; // early on a gap can still be levelled out; the last week is too short to rely on
    this.flexible = c.roster.village.map((v) => FLEXIBLE_VILLAGES.includes(v));
    // which way round a village goes is drawn afresh each time; Mohawk's fixed Sunday Athletics in week 1 settles it for Mohawk
    const flip: Record<string, number> = {};
    for (const v of c.roster.villages) flip[v] = c.weekIndex === 1 && v === 'M' ? 0 : c.rng() < 0.5 ? 0 : 1;
    this.athleticsDays = c.roster.village.map((v, b) => (c.weekIndex === 1 && v === 'M' ? 0 : (Math.floor(c.roster.pos[b] / 2) + flip[v]) % 2));
    // the last one is kept for the week that needs it most: the last week, or a week the bunk is away on a trip for half a day or more
    this.uhLimit = c.grid.map((row) => {
      const away = row.filter((l) => TRIP_LABELS.includes(l)).length >= UH_RELEASE_TRIP_PERIODS;
      return UH_MAX_PER_SESSION - (c.weekIndex >= c.sessionWeeks || away ? 0 : UH_HELD_BACK);
    });
    this.allowedGap = c.roster.village.map((v) => (FLEXIBLE_VILLAGES.includes(v) ? GAP_MAX_MT : GAP_MAX_OCS) + slack + c.stretch);
    const other = (b: number, area: string): number => (c.hist[b].earlier[area] ?? 0) + (c.hist[b].later[area] ?? 0);
    this.fillerBase = c.grid.map((_, b) => FILLERS.map((a) => other(b, a)));
    this.base = c.grid.map((_, b) => ({ ath: other(b, 'Athletics'), ac: other(b, 'A&C'), uh: other(b, 'TW UH') }));
  }

  /** Put every bunk's planned blocks and leftover areas down roughly: the search does the rest. */
  seed(tok: Record<string, number>[]): void {
    const c = this.c;
    this.musicPlanned = tok.map((t) => (t.Music ?? 0) > 0);
    this.fillerPlanned = tok.map((t) => FILLERS.map((a) => t[a] ?? 0));
    const at = (s: number, label: string): number => this.grid.reduce((k, row) => k + (row[s] === label ? 1 : 0), 0);
    for (const b of shuffle(c.rng, Array.from({ length: this.n }, (_, i) => i))) {
      const row = this.grid[b];
      const open = new Set(this.cells[b]);
      const tokens: string[] = [];
      for (const area of Object.keys(tok[b])) for (let k = 0; k < tok[b][area]; k++) tokens.push(area);
      for (const area of shuffle(c.rng, tokens)) {
        const label = labelOf(area);
        let best = -1;
        let bestScore = Infinity;
        for (const s of open) {
          const day = dayOf(s);
          const sameDay = has(row, day, area);
          const nextDay = has(row, day - 1, area) || has(row, day + 1, area);
          // a day takes one Athletics and one A&C at most, so the planned blocks go on the days with the most empty periods
          let openToday = 0;
          for (let p = 0; p < 4; p++) if (open.has(day * 4 + p)) openToday++;
          const score = (sameDay ? 6 : 0) + (nextDay ? 5 : 0) + 3 * Math.max(0, at(s, label) + 1 - (SLOT_CAP[area] ?? 1)) + at(s, label) - 1.2 * openToday + c.rng() * 1.5;
          if (score < bestScore) {
            best = s;
            bestScore = score;
          }
        }
        if (best < 0) break;
        row[best] = label;
        open.delete(best);
      }
      // every other empty period: the day's own area (Athletics on the bunk's Athletics days, A&C on the others), and when
      // the day already has that, Time with UH or Music where the days around it are clear of them
      for (const s of [...open].sort((x, y) => x - y)) {
        const day = dayOf(s);
        const own = (day + this.athleticsDays[b]) % 2 === 0 ? 'Athletics' : 'A&C';
        const clear = (label: string, area: string): boolean => !has(row, day, area) && !has(row, day - 1, area) && !has(row, day + 1, area) && row.every((l) => l !== label || area === 'Music');
        row[s] = !has(row, day, own) ? own : clear('Time with UH', 'TW UH') ? 'Time with UH' : clear('Music', 'Music') ? 'Music' : own;
      }
    }
    for (let b = 0; b < this.n; b++) this.refresh(b);
  }

  /** Recount which time each of a bunk's cells is at its area. */
  private refresh(b: number): void {
    const row = this.grid[b];
    const ord = this.ord[b];
    const ga = this.ga[b];
    const locked = this.c.locked[b];
    const earlier = this.c.hist[b].earlier;
    const weekIndex = this.c.weekIndex;
    const village = this.c.roster.village[b];
    const seen: Record<string, number> = {};
    for (let s = 0; s < SLOTS; s++) {
      const label = row[s];
      if (label === '') {
        ga[s] = null;
        ord[s] = 0;
        continue;
      }
      ga[s] = !locked[s] && !isFixedMohawkAthletics(weekIndex, village, s, label) ? sharedArea(label) : null;
      const area = areaOf(label);
      if (!area) {
        ord[s] = 0;
        continue;
      }
      if (s % 4 !== 0 && row[s - 1] === label) ord[s] = ord[s - 1];
      else {
        seen[area] = (seen[area] ?? 0) + 1;
        ord[s] = (earlier[area] ?? 0) + seen[area];
      }
    }
  }

  /** Rule breaks and preference cost of the bunks in one area in one period. */
  private groupCost(s: number, area: string): number {
    const g: number[] = [];
    for (let b = 0; b < this.n; b++) if (this.ga[b][s] === area) g.push(b);
    if (g.length < 2) return 0;
    const r = this.c.roster;
    let cost = HARD * groupBreaks(r, area, g, (b) => this.ord[b][s], this.c.relax);
    let far = false;
    for (let i = 0; i < g.length; i++) {
      for (let j = i + 1; j < g.length; j++) {
        const level = shareLevel(r, g[i], g[j], area);
        if (level === 1) far = true;
      }
    }
    if (area === 'Athletics' || area === 'A&C') {
      if (g.length === 3) cost += WEIGHTS.thirdBunk;
      if (area === 'Athletics' && g.some((x) => this.ord[x][s] !== this.ord[g[0]][s])) cost += WEIGHTS.athleticsUnequal;
    } else cost += WEIGHTS.sharedPreferredOne;
    if (far) cost += WEIGHTS.pairFarAge;
    return cost;
  }

  /** How many bunks of a village are over the day cap for an area. */
  private capCost(village: string, day: number, area: string): number {
    const cap = DAY_CAP[area];
    if (cap === undefined) return 0;
    let here = 0;
    for (const b of this.c.roster.byVillage[village]) {
      const ga = this.ga[b];
      const s = day * 4;
      if (ga[s] === area || ga[s + 1] === area || ga[s + 2] === area || ga[s + 3] === area) here++;
    }
    return here > cap ? HARD * (here - cap) : 0;
  }

  /** A bunk's own breaks: an area twice in a day, too many Athletics or A&C blocks, too much Time with UH, the two too far apart. */
  private rowCost(b: number): number {
    const c = this.c;
    const row = this.grid[b];
    const locked = c.locked[b];
    const fixedAthletics = c.weekIndex === 1 && c.roster.village[b] === 'M';
    let cost = 0;
    let ath = 0;
    let ac = 0;
    let uh = 0;
    let uhOwn = 0;
    let athWeek = 0;
    let acWeek = 0;
    let music = 0;
    const fillers = FILLERS.map(() => 0);
    const fillersOwn = FILLERS.map(() => 0);
    const today: string[] = [];
    // the areas the search places that the bunk has today and had the day before, and which of them the search may move
    let before: string[] = [];
    let beforeOwn: string[] = [];
    let placed: string[] = [];
    let own: string[] = [];
    for (let day = 0; day < 6; day++) {
      const first = day * 4;
      const trip = row[first] === 'Bike Trip' || row[first + 1] === 'Bike Trip' || row[first + 2] === 'Bike Trip' || row[first + 3] === 'Bike Trip';
      const athleticsToday = (day + this.athleticsDays[b]) % 2 === 0;
      today.length = 0;
      before = placed;
      beforeOwn = own;
      placed = [];
      own = [];
      for (let s = first; s < first + 4; s++) {
        const label = row[s];
        if (label === '') continue;
        if (s > first && row[s - 1] === label) {
          // the second period of a block: Athletics and A&C are never a double period
          if (!locked[s] && (label === 'Athletics' || label === 'A&C')) cost += HARD;
          continue;
        }
        const area = areaOf(label);
        if (!area) continue;
        // nothing in period 4 and again in period 1 the next day
        if (s === first && day > 0 && !locked[s] && !locked[s - 1] && area !== 'Trips' && areaOf(row[s - 1]) === area) cost += HARD;
        if (!trip && !locked[s]) {
          if (today.includes(area)) cost += HARD;
          else today.push(area);
        }
        // nothing two days in a row (when both were filled in by hand there is nothing the search can do about it)
        if (SHARED_INDEX.has(area) && area !== 'Ropes') {
          if (!locked[s] && !own.includes(area)) own.push(area);
          if (!placed.includes(area)) {
            placed.push(area);
            if (before.includes(area) && (!locked[s] || beforeOwn.includes(area))) cost += HARD;
          }
        }
        // Athletics on the bunk's Athletics days and A&C on the others
        if (!locked[s] && ((area === 'A&C' && athleticsToday) || (area === 'Athletics' && !athleticsToday && !(fixedAthletics && s === 3)))) cost += HARD;
        const filler = FILLERS.indexOf(area);
        if (filler >= 0) {
          fillers[filler]++;
          if (!locked[s]) fillersOwn[filler]++;
        }
        if (area === 'TW UH') {
          uh++;
          if (!locked[s]) uhOwn++;
        } else if (area === 'Music') {
          if (!locked[s]) music++;
        } else if (area === 'Athletics') {
          ath++;
          if (!locked[s] && !(fixedAthletics && s === 3)) athWeek++;
        } else if (area === 'A&C') {
          ac++;
          if (!locked[s]) acWeek++;
        }
      }
    }
    // a village that gives up some of its Music for A&C does not get the Music back as a filler
    const musicMax = MUSIC_LIGHT_VILLAGES.includes(c.roster.village[b]) ? (this.musicPlanned[b] ? 1 : 0) : WEEK_BLOCK_MAX.Music;
    cost += HARD * (Math.max(0, athWeek - WEEK_BLOCK_MAX.Athletics) + Math.max(0, acWeek - WEEK_BLOCK_MAX['A&C']) + Math.max(0, music - musicMax));
    // Mohawk and Tusc have few periods left over, and those should not all go to Athletics and Time with UH
    if (this.flexible[b] && ac === 0 && (athWeek > 0 || uh > 0)) cost += WEIGHTS.noAcWeek;
    // no bunk goes without A&C: one that has had none yet gets it before any leftover period goes to Athletics or Time with UH
    if (this.base[b].ac + ac === 0 && (athWeek > 0 || uhOwn > 0)) cost += WEIGHTS.gapOver;
    if (this.musicPlanned[b] && music === 0) cost += HARD; // the week's own Music is never given up
    for (let k = 0; k < FILLERS.length; k++) {
      // a planned Yoga or Ceramics stays; one more may fill a period, up to the most a session allows
      cost += HARD * Math.max(0, this.fillerPlanned[b][k] - fillers[k]);
      cost += HARD * Math.min(fillersOwn[k], Math.max(0, this.fillerBase[b][k] + fillers[k] - SESSION_FILLER_MAX[FILLERS[k]]));
      cost += WEIGHTS.fillerExtra * Math.max(0, fillers[k] - this.fillerPlanned[b][k]);
    }
    cost += WEIGHTS.musicExtra * Math.max(0, music - 1);
    // only what the search itself put down can be taken back
    cost += HARD * Math.min(uhOwn, Math.max(0, this.base[b].uh + uh - this.uhLimit[b])) + WEIGHTS.uhExtra * Math.max(0, this.base[b].uh + uh - 1);
    const gap = this.base[b].ac + ac - (this.base[b].ath + ath);
    if (this.flexible[b]) cost += WEIGHTS.flexibleAcBehind * Math.max(0, 1 - gap);
    cost += WEIGHTS.gapOver * Math.max(0, Math.abs(gap) - this.allowedGap[b]) + WEIGHTS.gapWide * Math.max(0, Math.abs(gap) - 1) + (gap < 0 ? WEIGHTS.athleticsAhead : 0);
    return cost;
  }

  /** Everything a change to these cells of one bunk can touch. */
  private localCost(b: number, cells: readonly number[], areas: readonly string[]): number {
    const ga = this.ga[b];
    const village = this.c.roster.village[b];
    let cost = this.rowCost(b);
    const days = new Set(cells.map(dayOf));
    for (const area of areas) {
      for (let s = 0; s < SLOTS; s++) if (cells.includes(s) || ga[s] === area) cost += this.groupCost(s, area);
      for (const day of days) cost += this.capCost(village, day, area);
    }
    return cost;
  }

  /** Bring the tables of what is broken up to date after a change to these cells of one bunk. */
  private sync(b: number, cells: readonly number[], areas: readonly string[]): void {
    const ga = this.ga[b];
    const village = this.c.roster.village[b];
    for (const area of areas) {
      const a = ix(area);
      for (let s = 0; s < SLOTS; s++) if (cells.includes(s) || ga[s] === area) this.badGroup[s][a] = this.groupCost(s, area) >= HARD;
      for (const s of cells) this.badCap[village][dayOf(s)][a] = this.capCost(village, dayOf(s), area) > 0;
    }
    this.badRow[b] = this.rowCost(b) >= WEIGHTS.gapOver;
  }

  private syncAll(): void {
    for (let b = 0; b < this.n; b++) this.sync(b, ALL_SLOTS, SHARED);
  }

  /** Does this cell take part in a rule break right now? */
  private broken(b: number, s: number): boolean {
    if (this.badRow[b]) return true;
    const area = this.ga[b][s];
    if (!area) return false;
    return this.badGroup[s][ix(area)] || this.badCap[this.c.roster.village[b]][dayOf(s)][ix(area)];
  }

  private areasOf(b: number, m: Move): string[] {
    const out: string[] = [];
    for (const label of [...m.cells.map((x) => this.grid[b][x]), ...m.labels]) {
      const area = sharedArea(label);
      if (area && !out.includes(area)) out.push(area);
    }
    return out;
  }

  private apply(b: number, m: Move): string[] {
    const before = m.cells.map((s) => this.grid[b][s]);
    m.cells.forEach((s, i) => (this.grid[b][s] = m.labels[i]));
    this.refresh(b);
    return before;
  }

  /** The best thing to do with one cell of a bunk: swap it with another of the bunk's periods, or change a leftover area. */
  private bestMove(b: number, s: number): { move: Move; delta: number } | null {
    const row = this.grid[b];
    const here = row[s];
    const moves: Move[] = [];
    const resting = this.restUntil[b];
    for (const j of this.cells[b]) if (j !== s && row[j] !== here && resting[j] <= this.step) moves.push({ cells: [s, j], labels: [row[j], here] });
    if (LEFTOVER.includes(here)) for (const to of LEFTOVER) if (to !== here) moves.push({ cells: [s], labels: [to] });
    let best: { move: Move; delta: number } | null = null;
    // every move is tried and taken back: the bunk's tables are copied once and put back, which is cheaper than recounting
    const ord = this.ord[b];
    const ga = this.ga[b];
    const keptOrd = ord.slice();
    const keptGa = ga.slice();
    for (const move of shuffle(this.c.rng, moves)) {
      const areas = this.areasOf(b, move);
      const before = this.localCost(b, move.cells, areas);
      const old = this.apply(b, move);
      const delta = this.localCost(b, move.cells, areas) - before + this.c.rng() * 0.01;
      move.cells.forEach((x, i) => (row[x] = old[i]));
      for (let k = 0; k < SLOTS; k++) {
        ord[k] = keptOrd[k];
        ga[k] = keptGa[k];
      }
      if (resting[s] > this.step && delta > -HARD / 2) continue; // a cell that just moved only moves again to fix a break
      if (!best || delta < best.delta) best = { move, delta };
      if (delta <= -HARD / 2) break; // it fixes a rule break: good enough, take it
    }
    return best;
  }

  /** Work on broken cells until none is left (or the step limit), then spend a little on preferences. */
  run(): boolean {
    const c = this.c;
    const take = (b: number, move: Move) => {
      const areas = this.areasOf(b, move);
      this.apply(b, move);
      this.sync(b, move.cells, areas);
      for (const x of move.cells) this.restUntil[b][x] = this.step + FILL_REST_STEPS + Math.floor(c.rng() * FILL_REST_STEPS);
    };
    this.syncAll();
    let clean = false;
    let fewest = Infinity;
    let fewestAt = 0;
    for (let step = 0; step < FILL_MAX_STEPS; step++) {
      this.step = step;
      const bad: [number, number][] = [];
      for (let b = 0; b < this.n; b++) for (const s of this.cells[b]) if (this.broken(b, s)) bad.push([b, s]);
      if (bad.length === 0) {
        clean = true;
        break;
      }
      if (bad.length < fewest) {
        fewest = bad.length;
        fewestAt = step;
      } else if (step - fewestAt > FILL_STALL_STEPS) break;
      const [b, s] = bad[Math.floor(c.rng() * bad.length)];
      const best = this.bestMove(b, s);
      // take the best move even when it does not help (a sideways step always, a step back sometimes): the rest rule keeps it from going in circles
      if (best && (best.delta < 0.5 || c.rng() < FILL_NOISE)) take(b, best.move);
    }
    this.step = Infinity;
    for (let step = 0; clean && step < FILL_POLISH_STEPS; step++) {
      const b = Math.floor(c.rng() * this.n);
      if (this.cells[b].length === 0) continue;
      const s = this.cells[b][Math.floor(c.rng() * this.cells[b].length)];
      const best = this.bestMove(b, s);
      if (best && best.delta < -0.5) take(b, best.move);
    }
    return clean;
  }
}
