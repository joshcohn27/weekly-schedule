import { areaOf } from '../config';
import {
  DAY_CAP,
  FILL_MAX_STEPS,
  FILL_NOISE,
  FILL_POLISH_STEPS,
  FILL_REST_STEPS,
  FILL_STALL_STEPS,
  FIXED_ATHLETICS_DAYS,
  FLEXIBLE_VILLAGES,
  GAP_MAX_MT,
  GAP_MAX_OCS,
  GAP_SLACK_BEFORE_LAST_WEEK,
  MUSIC_LIGHT_VILLAGES,
  RARE_AREAS,
  SESSION_FILLER_MAX,
  SHABBAT_PREP_STAFF,
  SLOT_CAP,
  MIN_WEEK_CAPACITY,
  AREA_WEEK_SHARE,
  CAMPER_CAP,
  VILLAGE_TARGETS,
  BUDDY_PLANNING,
  visitFree,
  TOP_UP_FAIR_SLACK,
  TOP_UP_MAX_LOAD,
  TOP_UP_SLACK,
  TRIP_LABELS,
  UH_BONUS_NOW,
  UH_HELD_BACK,
  WEEK_FOUR_NOW,
  UH_MAX_PER_SESSION,
  UH_RELEASE_TRIP_PERIODS,
  WEEK_BLOCK_MAX,
  WEIGHTS,
} from './config';
import { SLOTS, dayOf } from './history';
import { TOKEN_AREAS, TOKEN_LABEL, expectedSpare, inWeekCount, leftoverRoom, remainingWeeks, sessionTargetOf, type Plan } from './planner';
import { shuffle } from './rng';
import { shareLevel } from './roster';
import { isShortWeek, openPeriods } from './weekRoom';
import { firstDay, groupBreaks, isFixedMohawkAthletics, sharedArea } from './share';
import { ALL_SLOTS, buildDayMasks, fillable, isFree, type Ctx } from './state';

// The areas that may fall a block short when a bunk has no room are RARE_AREAS. Music is only ever dropped as a last resort.
/** What a leftover period may always be. The areas in SESSION_FILLER_MAX may fill one too, up to that many a session. */
const LEFTOVER_ALWAYS = ['Athletics', 'A&C', 'Time with UH', 'Music'];
/** Does the row have this program area on this day? A day off either end of the week has nothing. */
const has = (row: readonly string[], day: number, area: string): boolean =>
  day >= 0 && day < 6 && (areaOf(row[day * 4]) === area || areaOf(row[day * 4 + 1]) === area || areaOf(row[day * 4 + 2]) === area || areaOf(row[day * 4 + 3]) === area);
/** A rule break counts this much, so a move that fixes one always beats any change of preference. */
const HARD = 1000;

/** The areas the sharing rules cover, and their position in the search's tables. */
const SHARED: string[] = [];
const SHARED_INDEX = new Map<string, number>();
const ix = (area: string): number => SHARED_INDEX.get(area) as number;
/** The settings can add program areas, so the tables are laid out afresh for each fill. */
function refreshShared(): void {
  SHARED.length = 0;
  SHARED.push(...Object.keys(SLOT_CAP));
  SHARED_INDEX.clear();
  SHARED.forEach((a, i) => SHARED_INDEX.set(a, i));
}

const labelOf = (area: string): string => TOKEN_LABEL[area] ?? area;

/**
 * Fill every remaining period. Each bunk gets its planned rare areas and Music, and its other empty periods become
 * Athletics, A&C or (within its session limit) Time with UH. Everything is put down roughly and then improved by a local
 * search: take a period that breaks a rule and make the swap inside that bunk's week (or the change of leftover area)
 * that helps most, until nothing breaks a rule. No rule is ever bent to fill a period. Returns true when the search
 * ended with no rule break.
 */
export function fillFlexible(c: Ctx, plan: Plan): boolean {
  refreshShared();
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
      const options = RARE_AREAS.filter((a) => (tok[b][a] ?? 0) > 0);
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

  trimToWeek(c, tok, free);
  topUp(c, tok, free, total);
  fitToVillageDays(c, tok, free);
  if (BUDDY_PLANNING) matchBuddies(c, tok, free, total);

  const search = new FillSearch(c, free);
  search.seed(tok);
  const clean = search.run();
  c.dayMask = buildDayMasks(c.grid);
  // In a week with Shabbat Prep the Music specialists lose those periods, so a bunk whose Music did not fit goes without
  // it this week and it is not held against the week.
  for (let b = 0; b < n; b++) if ((tok[b].Music ?? 0) > 0 && search.musicIsOptional && !c.grid[b].includes('Music')) c.excused.push(b);
  return clean;
}

/**
 * Bunks that share a period must be on the same visit, so two neighbours can only go to Teva together while they have been
 * the same number of times. The week's draw is made bunk by bunk and lets them drift apart, and then half the places in
 * an area go unused. So neighbours in a village (the first with the second, the third with the fourth, ...) are given the
 * same number of visits this week wherever they stand level, and the one that is behind is let catch up.
 */
function matchBuddies(c: Ctx, tok: Record<string, number>[], free: number[][], total: (b: number, area: string) => number): void {
  const areas = TOKEN_AREAS.filter((a) => a !== 'Music' && placesAtOnce(c, a) > 1 && !visitFree(a));
  for (const v of c.roster.villages) {
    const members = c.roster.byVillage[v];
    for (let k = 0; k + 1 < members.length; k += 2) {
      const pair = [members[k], members[k + 1]];
      // the two get the same areas this week: about as many as they had between them, the ones either was down for first
      const had = pair.map((x) => areas.reduce((sum, area) => sum + (tok[x][area] ?? 0), 0));
      const each = Math.floor((had[0] + had[1] + (c.rng() < 0.5 ? 1 : 0)) / 2);
      const most = (area: string): number =>
        Math.min(...pair.map((x) => Math.min(Math.max(0, sessionTargetOf(v, c.sessionWeeks, area) - total(x, area)), Math.ceil(new Set(free[x].map(dayOf)).size / 2))));
      // a bunk that is behind its neighbour in an area catches up first, so they are level again
      const behind = (area: string, x: number, y: number): number => Math.max(0, total(y, area) - total(x, area));
      const give: Record<string, number> = {};
      const wanted = shuffle(c.rng, areas).sort((x, y) => (tok[pair[0]][y] ?? 0) + (tok[pair[1]][y] ?? 0) - ((tok[pair[0]][x] ?? 0) + (tok[pair[1]][x] ?? 0)));
      let left = each;
      for (let round = 0; round < 3 && left > 0; round++) {
        for (const area of wanted) {
          if (left <= 0) break;
          if ((give[area] ?? 0) >= most(area)) continue;
          // first time round only what one of them was already down for; after that anything they both still owe
          if (round === 0 && (tok[pair[0]][area] ?? 0) + (tok[pair[1]][area] ?? 0) === 0) continue;
          give[area] = (give[area] ?? 0) + 1;
          left--;
        }
      }
      for (const area of areas) {
        const n = give[area] ?? 0;
        tok[pair[0]][area] = n + Math.min(1, behind(area, pair[0], pair[1]));
        tok[pair[1]][area] = n + Math.min(1, behind(area, pair[1], pair[0]));
        for (const x of pair) if (tok[x][area] === 0) delete tok[x][area];
      }
    }
  }
}

/**
 * How many bunks an area really takes at once, for planning. An area that goes by campers (Yoga) takes as many as fit
 * under its camper limit: with full bunks that is one, however many the table allows. Never more than two are counted on:
 * who may share and on which visit keeps the rest of the places from being used.
 */
function placesAtOnce(c: Ctx, area: string): number {
  const campers = CAMPER_CAP[area];
  if (campers === undefined) return Math.min(SLOT_CAP[area] ?? 1, 2);
  // the two smallest bunks that stand next to each other in a village: if they do not fit together, nobody does
  let pair = Infinity;
  for (const v of c.roster.villages) {
    const members = c.roster.byVillage[v];
    for (let k = 0; k + 1 < members.length; k++) pair = Math.min(pair, c.roster.campers[members[k]] + c.roster.campers[members[k + 1]]);
  }
  if (pair > campers) return 1;
  // some pairs fit and some do not: count on the share that does
  let fit = 0;
  let all = 0;
  for (const v of c.roster.villages) {
    const members = c.roster.byVillage[v];
    for (let k = 0; k + 1 < members.length; k++) {
      all++;
      if (c.roster.campers[members[k]] + c.roster.campers[members[k + 1]] <= campers) fit++;
    }
  }
  return 1 + (all > 0 ? fit / all : 0);
}

/**
 * What a week cannot hold is put off, however much a bunk still owes (the last week of a session the calendar has
 * squeezed is asked for everything that is left). A bunk has an area on days that are not next to each other, so no more
 * times than half its open days; and an area only has so many places in the week.
 */
function trimToWeek(c: Ctx, tok: Record<string, number>[], free: number[][]): void {
  const areas = TOKEN_AREAS.filter((a) => a !== 'Music');
  const putOff = (b: number, area: string): void => {
    tok[b][area]--;
    c.unmet++;
    c.carried.push({ bunk: b, area });
  };
  for (let b = 0; b < c.roster.n; b++) {
    const most = Math.ceil(new Set(free[b].map(dayOf)).size / 2);
    for (const area of areas) while ((tok[b][area] ?? 0) > most) putOff(b, area);
  }
  const periods = ALL_SLOTS.filter((s) => fillable(c, s) && free.some((cells) => cells.includes(s))).length;
  for (const area of areas) {
    const places = Math.floor(placesAtOnce(c, area) * periods * AREA_WEEK_SHARE);
    let planned = tok.reduce((sum, t) => sum + (t[area] ?? 0), 0);
    while (planned > places) {
      // from the bunk that has the most of it this week
      const most = Math.max(...tok.map((t) => t[area] ?? 0));
      const from = shuffle(c.rng, tok.map((t, b) => ((t[area] ?? 0) === most ? b : -1)).filter((b) => b >= 0))[0];
      putOff(from, area);
      planned--;
    }
  }
}

/**
 * The periods a bunk has left once its planned blocks are down can only be Athletics or A&C (and now and then a filler),
 * and a week only holds so many of those: one of each a day for the bunk, and DAY_CAP bunks a day for its village. The
 * week's draw is made before anything is placed, so a bunk can come out with far more left over than that. Such a bunk
 * takes a visit it still owes from a later week now: the area with the most room left in this week.
 */
function topUp(c: Ctx, tok: Record<string, number>[], free: number[][], total: (b: number, area: string) => number): void {
  const areas = TOKEN_AREAS.filter((a) => a !== 'Music');
  const periods = ALL_SLOTS.filter((s) => fillable(c, s) && c.grid.some((row, b) => row[s] === '' || free[b].includes(s))).length;
  const planned = (area: string): number => tok.reduce((sum, t) => sum + (t[area] ?? 0), 0);
  for (const b of shuffle(c.rng, Array.from({ length: c.roster.n }, (_, i) => i))) {
    const v = c.roster.village[b];
    const members = c.roster.byVillage[v];
    const days = new Set(free[b].map(dayOf)).size;
    const share = Math.min(1, (DAY_CAP.Athletics + DAY_CAP['A&C']) / (2 * members.length));
    const room = Math.floor(share * Math.min(WEEK_BLOCK_MAX.Athletics + WEEK_BLOCK_MAX['A&C'], 2 * days, 2 * Math.ceil(days / 2) + 2 * Math.floor(days / 2))) + TOP_UP_SLACK;
    const mine = (): number => Object.values(tok[b]).reduce((a, x) => a + x, 0);
    // this week's fair share of everything the bunk will have left over in the weeks still to come
    const later = remainingWeeks(c).filter((w) => w !== c.weekIndex);
    const owed = areas.reduce((sum, a) => sum + Math.max(0, sessionTargetOf(v, c.sessionWeeks, a) - total(b, a)), 0);
    const leftoverAll = free[b].length - (tok[b].Music ?? 0) + later.reduce((sum, w) => sum + Math.max(0, expectedSpare(c, b, w)), 0) - owed;
    const rooms = later.reduce((sum, w) => sum + (expectedSpare(c, b, w) >= MIN_WEEK_CAPACITY ? leftoverRoom(c, b, w) : 0), 0);
    const now = leftoverRoom(c, b, c.weekIndex);
    const fair = later.length === 0 ? Infinity : Math.ceil((Math.max(0, leftoverAll) * now) / Math.max(0.01, now + rooms)) + TOP_UP_FAIR_SLACK;
    const limit = Math.min(room, fair);
    while (free[b].length - mine() > limit) {
      const options = areas
        .filter((a) => sessionTargetOf(v, c.sessionWeeks, a) - total(b, a) - (tok[b][a] ?? 0) > 0)
        // an area goes on days that are not next to each other, and a village only sends so many bunks to it in a day
        .filter((a) => (tok[b][a] ?? 0) < Math.ceil(days / 2) && members.reduce((sum, x) => sum + (tok[x][a] ?? 0), 0) < (DAY_CAP[a] ?? Infinity) * days)
        .map((a) => ({ a, load: (planned(a) + 1) / (placesAtOnce(c, a) * periods) + (tok[b][a] ?? 0) + c.rng() * 0.05 }))
        .filter((o) => o.load - (tok[b][o.a] ?? 0) <= TOP_UP_MAX_LOAD);
      if (options.length === 0) break;
      const pick = options.reduce((x, y) => (y.load < x.load ? y : x)).a;
      tok[b][pick] = (tok[b][pick] ?? 0) + 1;
    }
  }
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
  /** The areas that may fill a leftover period this run (they come from the settings), and every label a leftover period may be. */
  private readonly fillers: string[];
  private readonly leftover: string[];
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
  /** Periods in which some village is at Shabbat Prep: the Music and Judaics specialists run it, so neither area has a bunk then. */
  private readonly prep: boolean[];
  /** Each bunk's neighbour in its village (the first with the second, the third with the fourth, ...), or -1. They share A&C, so they are kept level. */
  private readonly buddy: number[];
  /** The program areas Taste of CSL is at in each period: it has an area to itself, so nobody else is there then. */
  private readonly guestAt: Set<string>[];
  /** In a week with Shabbat Prep in it, a bunk's Music may be given up when it cannot fit. Any other week it never is. */
  readonly musicIsOptional: boolean;

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
      return UH_MAX_PER_SESSION + UH_BONUS_NOW - (c.weekIndex >= c.sessionWeeks || away ? 0 : UH_HELD_BACK);
    });
    this.allowedGap = c.roster.village.map((v) => (FLEXIBLE_VILLAGES.includes(v) ? GAP_MAX_MT : GAP_MAX_OCS) + slack + c.stretch);
    const other = (b: number, area: string): number => (c.hist[b].earlier[area] ?? 0) + (c.hist[b].later[area] ?? 0);
    this.fillers = Object.keys(SESSION_FILLER_MAX).filter((a) => TOKEN_AREAS.includes(a) && a !== 'Music' && a !== 'TW UH');
    this.leftover = [...LEFTOVER_ALWAYS, ...this.fillers.map(labelOf)];
    this.fillerBase = c.grid.map((_, b) => this.fillers.map((a) => other(b, a)));
    this.base = c.grid.map((_, b) => ({ ath: other(b, 'Athletics'), ac: other(b, 'A&C'), uh: other(b, 'TW UH') }));
    this.prep = ALL_SLOTS.map((s) => c.grid.some((row) => row[s] === 'Shabbat Prep'));
    this.buddy = c.roster.village.map((v, b) => {
      const members = c.roster.byVillage[v];
      const at = c.roster.pos[b];
      return members[at % 2 === 0 ? at + 1 : at - 1] ?? -1;
    });
    this.guestAt = ALL_SLOTS.map((s) => new Set((c.guests ?? []).map((row) => areaOf(row[s])).filter((a): a is string => !!a && a !== 'Hobbies')));
    // and in a week the calendar has cut short
    this.musicIsOptional = this.prep.some(Boolean) || c.grid.some((row) => isShortWeek(openPeriods(row, c.lastWeek), c.lastWeek));
  }

  /** Put every bunk's planned blocks and leftover areas down roughly: the search does the rest. */
  seed(tok: Record<string, number>[]): void {
    const c = this.c;
    this.musicPlanned = tok.map((t) => (t.Music ?? 0) > 0);
    this.fillerPlanned = tok.map((t) => this.fillers.map((a) => t[a] ?? 0));
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
          const staffAway = (this.prep[s] && SHABBAT_PREP_STAFF.includes(area)) || this.guestAt[s].has(area);
          const score = (staffAway ? 50 : 0) + (sameDay ? 6 : 0) + (nextDay ? 5 : 0) + 3 * Math.max(0, at(s, label) + 1 - (SLOT_CAP[area] ?? 1)) + at(s, label) - 1.2 * openToday + c.rng() * 1.5;
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
        const other = own === 'Athletics' ? 'A&C' : 'Athletics';
        const fits = (area: string): boolean => !has(row, day, area) && !has(row, day - 1, area) && !has(row, day + 1, area) && row.filter((l) => l === area).length < (WEEK_BLOCK_MAX[area] ?? 3);
        if (FIXED_ATHLETICS_DAYS) row[s] = !has(row, day, own) ? own : clear('Time with UH', 'TW UH') ? 'Time with UH' : !this.prep[s] && clear('Music', 'Music') ? 'Music' : own;
        else row[s] = fits(own) ? own : fits(other) ? other : clear('Time with UH', 'TW UH') ? 'Time with UH' : !this.prep[s] && clear('Music', 'Music') ? 'Music' : own;
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
    let musicAll = 0; // with the ones that were filled in by hand
    const fillers = this.fillers.map(() => 0);
    const fillersOwn = this.fillers.map(() => 0);
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
        // nobody shares an area with Taste of CSL
        if (!locked[s] && this.guestAt[s].has(area)) cost += HARD;
        // no Music or Judaics while a village is at Shabbat Prep
        if (this.prep[s] && !locked[s] && SHABBAT_PREP_STAFF.includes(area)) cost += HARD;
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
        if (FIXED_ATHLETICS_DAYS && !locked[s] && ((area === 'A&C' && athleticsToday) || (area === 'Athletics' && !athleticsToday && !(fixedAthletics && s === firstDay() * 4 + 3)))) cost += HARD;
        const filler = this.fillers.indexOf(area);
        if (filler >= 0) {
          fillers[filler]++;
          if (!locked[s]) fillersOwn[filler]++;
        }
        if (area === 'TW UH') {
          uh++;
          if (!locked[s]) uhOwn++;
        } else if (area === 'Music') {
          musicAll++;
          if (!locked[s]) music++;
        } else if (area === 'Athletics') {
          ath++;
          if (!locked[s] && !(fixedAthletics && s === firstDay() * 4 + 3)) athWeek++;
        } else if (area === 'A&C') {
          ac++;
          if (!locked[s]) acWeek++;
        }
      }
    }
    // a village that gives up some of its Music for A&C does not get the Music back as a filler
    // (in week 4 of 4 it may: one Music to fill a period)
    const musicMax = MUSIC_LIGHT_VILLAGES.includes(c.roster.village[b]) ? Math.max(this.musicPlanned[b] ? 1 : 0, WEEK_FOUR_NOW ? 1 : 0) : WEEK_BLOCK_MAX.Music;
    cost += HARD * (Math.max(0, athWeek - WEEK_BLOCK_MAX.Athletics) + Math.max(0, acWeek - WEEK_BLOCK_MAX['A&C']) + Math.min(music, Math.max(0, musicAll - musicMax)));
    // Mohawk and Tusc have few periods left over, and those should not all go to Athletics and Time with UH
    if (this.flexible[b] && ac === 0 && (athWeek > 0 || uh > 0)) cost += WEIGHTS.noAcWeek;
    // no bunk goes without A&C: one that has had none yet gets it before any leftover period goes to Athletics or Time with UH
    if (this.base[b].ac + ac === 0 && (athWeek > 0 || uhOwn > 0)) cost += WEIGHTS.gapOver;
    if (this.musicPlanned[b] && music === 0) cost += this.musicIsOptional ? WEIGHTS.musicSkipped : HARD; // the week's own Music is never given up, except to Shabbat Prep
    for (let k = 0; k < this.fillers.length; k++) {
      // a planned Yoga or Ceramics stays; one more may fill a period, up to the most a session allows
      cost += HARD * Math.max(0, this.fillerPlanned[b][k] - fillers[k]);
      cost += HARD * Math.min(fillersOwn[k], Math.max(0, this.fillerBase[b][k] + fillers[k] - (VILLAGE_TARGETS[this.fillers[k]]?.[c.roster.village[b]] ?? SESSION_FILLER_MAX[this.fillers[k]])));
      cost += WEIGHTS.fillerExtra * Math.max(0, fillers[k] - this.fillerPlanned[b][k]);
    }
    cost += WEIGHTS.musicExtra * Math.max(0, music - 1);
    // only what the search itself put down can be taken back
    cost += HARD * Math.min(uhOwn, Math.max(0, this.base[b].uh + uh - this.uhLimit[b])) + WEIGHTS.uhExtra * Math.max(0, this.base[b].uh + uh - 1);
    // Bunks at A&C together must be on the same visit, so neighbours who drift apart can no longer go together and half
    // of A&C's places are lost. A bunk is nudged to end the week level with its neighbour.
    const mate = this.buddy[b];
    if (BUDDY_PLANNING && mate >= 0 && !visitFree('A&C')) {
      let theirs = this.base[mate].ac;
      const other = this.grid[mate];
      for (let s = 0; s < SLOTS; s++) if (other[s] === 'A&C' && (s % 4 === 0 || other[s - 1] !== 'A&C')) theirs++;
      cost += WEIGHTS.buddyApart * Math.abs(this.base[b].ac + ac - theirs);
    }
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
    if (this.leftover.includes(here)) for (const to of this.leftover) if (to !== here) moves.push({ cells: [s], labels: [to] });
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
