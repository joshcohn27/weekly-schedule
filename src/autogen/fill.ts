import { areaOf } from '../config';
import {
  DAY_CAP,
  FILL_MAX_STEPS,
  FILL_NOISE,
  FILL_POLISH_STEPS,
  FILL_STALL_STEPS,
  FLEXIBLE_VILLAGES,
  GAP_MAX_MT,
  GAP_MAX_OCS,
  SLOT_CAP,
  UH_MAX_PER_SESSION,
  WEEK_BLOCK_MAX,
  WEIGHTS,
} from './config';
import { SLOTS, blocksOf, dayOf } from './history';
import { TOKEN_AREAS, TOKEN_LABEL, inWeekCount, sessionTargetOf, type Plan } from './planner';
import { shuffle } from './rng';
import { shareLevel } from './roster';
import { groupBreaks, isFixedMohawkAthletics, sharedArea } from './share';
import { ALL_SLOTS, buildDayMasks, fillable, isFree, type Ctx } from './state';

// Areas that may fall a block short when a bunk has no room. Music is only ever dropped as a last resort.
const MAY_FALL_SHORT = ['TW UH', 'Yoga', 'Ceramics', 'Teva', 'Dance', 'Israel Education', 'Judaics'];
/** What a leftover period may be. */
const LEFTOVER = ['Athletics', 'A&C', 'Time with UH'];
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
    while (planned > free[b].length) {
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

  const search = new FillSearch(c, free);
  search.seed(tok);
  const clean = search.run();
  c.dayMask = buildDayMasks(c.grid);
  return clean;
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
  private readonly allowedGap: number[];
  private readonly base: { ath: number; ac: number; uh: number }[];

  constructor(private readonly c: Ctx, private readonly cells: number[][]) {
    this.n = c.roster.n;
    this.grid = c.grid;
    this.ord = c.grid.map(() => Array<number>(SLOTS).fill(0));
    this.ga = c.grid.map(() => Array<string | null>(SLOTS).fill(null));
    this.badGroup = Array.from({ length: SLOTS }, () => Array<boolean>(SHARED.length).fill(false));
    for (const v of c.roster.villages) this.badCap[v] = Array.from({ length: 6 }, () => Array<boolean>(SHARED.length).fill(false));
    this.badRow = Array<boolean>(c.roster.n).fill(false);
    this.allowedGap = c.roster.village.map((v) => (FLEXIBLE_VILLAGES.includes(v) ? GAP_MAX_MT : GAP_MAX_OCS));
    const other = (b: number, area: string): number => (c.hist[b].earlier[area] ?? 0) + (c.hist[b].later[area] ?? 0);
    this.base = c.grid.map((_, b) => ({ ath: other(b, 'Athletics'), ac: other(b, 'A&C'), uh: other(b, 'TW UH') }));
  }

  /** Put every bunk's planned blocks and leftover areas down roughly: the search does the rest. */
  seed(tok: Record<string, number>[]): void {
    const c = this.c;
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
          const sameDay = [0, 1, 2, 3].some((p) => areaOf(row[day * 4 + p]) === area);
          // keep the bunk's empty periods next to each other, so they can become double blocks
          const lonely = [s - 1, s + 1].filter((x) => x >= 0 && dayOf(x) === day && open.has(x)).length;
          const score = (sameDay ? 6 : 0) + 3 * Math.max(0, at(s, label) + 1 - (SLOT_CAP[area] ?? 1)) + at(s, label) + 0.8 * lonely + c.rng() * 1.5;
          if (score < bestScore) {
            best = s;
            bestScore = score;
          }
        }
        if (best < 0) break;
        row[best] = label;
        open.delete(best);
      }
      // each run of empty periods in a day becomes one block, Athletics or A&C, whichever the bunk has fewer of
      let ath = this.base[b].ath + inWeekCount(c, b, 'Athletics');
      let ac = this.base[b].ac + inWeekCount(c, b, 'A&C');
      let prev = -2;
      let label = '';
      for (const s of [...open].sort((x, y) => x - y)) {
        if (s !== prev + 1 || dayOf(s) !== dayOf(prev)) {
          label = ath < ac ? 'Athletics' : 'A&C';
          if (label === 'Athletics') ath++;
          else ac++;
        }
        row[s] = label;
        prev = s;
      }
    }
    for (let b = 0; b < this.n; b++) this.refresh(b);
  }

  /** Recount which time each of a bunk's cells is at its area. */
  private refresh(b: number): void {
    const row = this.grid[b];
    const ord = this.ord[b];
    const seen: Record<string, number> = {};
    const village = this.c.roster.village[b];
    for (let s = 0; s < SLOTS; s++) {
      const label = row[s];
      const area = label ? areaOf(label) : null;
      this.ga[b][s] = label !== '' && !this.c.locked[b][s] && !isFixedMohawkAthletics(this.c.weekIndex, village, s, label) ? sharedArea(label) : null;
      if (!area) {
        ord[s] = 0;
        continue;
      }
      if (s % 4 !== 0 && row[s - 1] === label) ord[s] = ord[s - 1];
      else {
        seen[area] = (seen[area] ?? 0) + 1;
        ord[s] = (this.c.hist[b].earlier[area] ?? 0) + seen[area];
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
    const village = c.roster.village[b];
    let cost = 0;
    let ath = 0;
    let ac = 0;
    let uh = 0;
    let athWeek = 0;
    let acWeek = 0;
    const blocks = blocksOf(row);
    for (let day = 0; day < 6; day++) {
      const today = blocks.filter((k) => k.day === day);
      if (today.some((k) => k.label === 'Bike Trip')) continue;
      const seen: Record<string, number> = {};
      for (const k of today) {
        if (!k.area || c.locked[b][k.start]) continue;
        seen[k.area] = (seen[k.area] ?? 0) + 1;
        if (seen[k.area] > 1) cost += HARD;
      }
    }
    for (const k of blocks) {
      if (k.area === 'TW UH') uh++;
      if (k.area !== 'Athletics' && k.area !== 'A&C') continue;
      const counted = !c.locked[b][k.start] && !isFixedMohawkAthletics(c.weekIndex, village, k.start, k.label);
      if (k.area === 'Athletics') {
        ath++;
        if (counted) athWeek++;
      } else {
        ac++;
        if (counted) acWeek++;
      }
    }
    cost += HARD * (Math.max(0, athWeek - WEEK_BLOCK_MAX.Athletics) + Math.max(0, acWeek - WEEK_BLOCK_MAX['A&C']));
    cost += HARD * Math.max(0, this.base[b].uh + uh - UH_MAX_PER_SESSION);
    const gap = this.base[b].ac + ac - (this.base[b].ath + ath);
    cost += WEIGHTS.gapOver * Math.max(0, Math.abs(gap) - this.allowedGap[b]) + (gap < 0 ? WEIGHTS.athleticsAhead : 0);
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
    for (const j of this.cells[b]) if (j !== s && row[j] !== here) moves.push({ cells: [s, j], labels: [row[j], here] });
    if (LEFTOVER.includes(here)) for (const to of LEFTOVER) if (to !== here) moves.push({ cells: [s], labels: [to] });
    let best: { move: Move; delta: number } | null = null;
    for (const move of moves) {
      const areas = this.areasOf(b, move);
      const before = this.localCost(b, move.cells, areas);
      const old = this.apply(b, move);
      const delta = this.localCost(b, move.cells, areas) - before + this.c.rng() * 0.01;
      this.apply(b, { cells: move.cells, labels: old });
      if (!best || delta < best.delta) best = { move, delta };
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
    };
    this.syncAll();
    let clean = false;
    let fewest = Infinity;
    let fewestAt = 0;
    for (let step = 0; step < FILL_MAX_STEPS; step++) {
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
      if (best && (best.delta < -0.5 || c.rng() < FILL_NOISE)) take(b, best.move);
    }
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
