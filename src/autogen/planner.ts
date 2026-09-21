import {
  DANCE_TARGETS,
  DANCE_TARGET_OTHER,
  LEAGUE_PER_WEEK,
  MIN_WEEK_CAPACITY,
  MUSIC_PER_WEEK,
  POOL_TARGETS,
  POOL_TARGET_OTHER,
  SESSION_TARGETS,
  SHABBAT_ROTATION,
  TIYUL_WEEKS,
  WATERFRONT_PER_WEEK,
} from './config';
import { blocksOf, isFilledWeek, villageWeeksWithLabel } from './history';
import { weightedSample } from './rng';
import type { Ctx } from './state';

export const TOKEN_AREAS = ['Music', 'Judaics', 'Israel Education', 'Teva', 'Ceramics', 'Yoga', 'Dance', 'TW UH'] as const;
export type TokenArea = (typeof TOKEN_AREAS)[number];
export type PlanArea = 'Ropes' | 'Pool' | TokenArea;
/** How many blocks of each area each bunk gets this week (Ropes are doubles, the rest single periods). */
export type Plan = Record<PlanArea, number[]>;

/** The label a token area is written as. */
export const TOKEN_LABEL: Record<TokenArea, string> = {
  Music: 'Music',
  Judaics: 'Judaics',
  'Israel Education': 'Israel',
  Teva: 'Teva',
  Ceramics: 'Ceramics',
  Yoga: 'Yoga',
  Dance: 'Dance',
  'TW UH': 'Time with UH',
};

/** How many blocks of an area a bunk should have over the whole session (Music and some Pool targets are weekly). */
export function sessionTargetOf(v: string, sessionWeeks: number, area: string): number {
  if (area === 'Dance') return DANCE_TARGETS[v] ?? DANCE_TARGET_OTHER;
  if (area === 'Music') return MUSIC_PER_WEEK * sessionWeeks;
  if (area === 'Pool') {
    const t = POOL_TARGETS[v];
    if (t?.perWeek !== undefined) return t.perWeek * sessionWeeks;
    return t?.perSession ?? POOL_TARGET_OTHER.perSession;
  }
  return SESSION_TARGETS[area] ?? 0;
}

export const inWeekCount = (c: Ctx, b: number, area: string): number => blocksOf(c.grid[b]).filter((k) => k.area === area).length;

type Counts = Record<string, number>;
const areaCounts = (row: readonly string[]): Counts => {
  const out: Counts = {};
  for (const k of blocksOf(row)) if (k.area) out[k.area] = (out[k.area] ?? 0) + 1;
  return out;
};
const counted = (c: Ctx, inWeek: Counts[], b: number, area: string): number =>
  (c.hist[b].earlier[area] ?? 0) + (c.hist[b].later[area] ?? 0) + (inWeek[b][area] ?? 0);

/**
 * Roughly how many single periods a bunk has to spare in a given week once the fixed calendar,
 * league, Waterfront and the weekly Music, Pool and Ropes are taken out. Used to spread what a
 * bunk still needs over the weeks left in proportion to the room each week really has.
 */
/** Periods a village's Tiyul takes in a given week: known for this week and (once decided) for later ones. */
function tiyulCells(c: Ctx, v: string, week: number): number {
  const list = TIYUL_WEEKS[c.sessionWeeks][v];
  if (!list || !list.includes(week)) return 0;
  const cells = v === 'S' || v === 'M' ? 4 : 2;
  const done = villageWeeksWithLabel(c.weeks, c.weekIndex, 'Tiyul')[v] ?? 0;
  if (done > 0) return 0;
  if (week === c.weekIndex) return c.calendar.tiyul.includes(v) ? cells : 0;
  if (c.calendar.tiyul.includes(v)) return 0; // it happens this week, so not later
  const later = list.filter((w) => w > c.weekIndex && !isFilledWeek(c.weeks.weeks[w - 1]));
  return later.includes(week) ? cells / later.length : 0; // certain if this is the only week left
}

export function expectedSpare(c: Ctx, b: number, week: number): number {
  const v = c.roster.village[b];
  const last = c.sessionWeeks === 4 && week === 4;
  let free = 24;
  if (last) {
    free -= 4; // Friday
    free -= v === 'T' ? 16 : 6; // Thursday, plus Monday hobbies or the bike trip
  } else if (week === c.weekIndex) {
    free -= c.calendar.hobbies.length * 2; // this week's hobbies are already decided
  } else {
    free -= 4 + (week > 1 ? 0.4 : 0); // hobbies, the optional Sunday one at 20 percent
  }
  if (week === 1) free -= 1; // Sunday swim test, or Mohawk's Athletics
  if (v === 'T') {
    free -= last ? 0 : LEAGUE_PER_WEEK + 1; // triathlon: one double and two singles
    if (week === 2) free -= 2; // mini bike trip
  } else {
    free -= v === 'M' ? LEAGUE_PER_WEEK * 2 : LEAGUE_PER_WEEK;
  }
  free -= last ? WATERFRONT_PER_WEEK * 1.5 : WATERFRONT_PER_WEEK * 2;
  if ((SHABBAT_ROTATION[c.sessionWeeks][week] ?? []).includes(v)) free -= 3;
  free -= tiyulCells(c, v, week);
  const pool = POOL_TARGETS[v]?.perWeek ?? 0.75;
  free -= MUSIC_PER_WEEK + pool + 1; // Music, Pool and about one Ropes double every other week
  return free;
}

/** A week with (almost) no room gets no share, so what a bunk needs is done in the weeks that have room. */
const capacityWeight = (c: Ctx, b: number, week: number): number => {
  const spare = expectedSpare(c, b, week);
  return spare < MIN_WEEK_CAPACITY ? 0 : spare;
};

/** This week, plus every later week of the session that is not already loaded. */
function remainingWeeks(c: Ctx): number[] {
  const out: number[] = [];
  for (let w = c.weekIndex; w <= c.sessionWeeks; w++) if (w === c.weekIndex || !isFilledWeek(c.weeks.weeks[w - 1])) out.push(w);
  return out.length ? out : [c.weekIndex];
}

/**
 * Spread what each bunk still needs over the weeks left, weighting a short last week less. The
 * fractional part is drawn once for the whole roster, so the load per week stays even.
 */
function lottery(c: Ctx, inWeek: Counts[], area: string, target: (b: number) => number, cap: (b: number) => number | null): Drawn {
  const n = c.roster.n;
  const k = new Array<number>(n).fill(0);
  const min = new Array<number>(n).fill(0);
  const remaining = remainingWeeks(c);
  const base = new Array<number>(n).fill(0);
  const cands: { item: number; weight: number }[] = [];

  for (let b = 0; b < n; b++) {
    const need = Math.max(0, target(b) - counted(c, inWeek, b, area));
    if (need === 0) continue;
    const limit = cap(b);
    // weeks that have no room do not count: if only this week has room, the whole need is due now
    const weeks = remaining.filter((w) => w === c.weekIndex || capacityWeight(c, b, w) > 0);
    if (weeks.length <= 1) {
      k[b] = limit === null ? need : Math.min(need, limit);
      min[b] = k[b];
      continue;
    }
    const wSum = weeks.reduce((sum, w) => sum + capacityWeight(c, b, w), 0);
    const share = wSum > 0 ? (need * capacityWeight(c, b, c.weekIndex)) / wSum : need / weeks.length;
    const forced = Math.floor(need / weeks.length);
    let floorPart = Math.max(Math.floor(share), forced);
    if (limit !== null) floorPart = Math.min(floorPart, limit);
    base[b] = floorPart;
    min[b] = Math.min(forced, floorPart);
    const frac = share - Math.floor(share);
    if (frac > 0 && floorPart <= Math.floor(share) && (limit === null || floorPart < limit) && floorPart < need) cands.push({ item: b, weight: frac });
  }
  const total = cands.reduce((sum, x) => sum + x.weight, 0);
  const extras = Math.floor(total) + (c.rng() < total - Math.floor(total) ? 1 : 0);
  const picked = new Set(weightedSample(c.rng, cands, extras));
  for (let b = 0; b < n; b++) if (base[b] > 0 || picked.has(b)) k[b] = base[b] + (picked.has(b) ? 1 : 0);
  return { k, min };
}

/** A week's draw for one area: how many per bunk, and how many of those cannot be put off to a later week. */
interface Drawn {
  k: number[];
  min: number[];
}

export function planWeek(c: Ctx): Plan {
  const n = c.roster.n;
  const plan = {} as Plan;
  const mins = {} as Plan;
  const inWeek = c.grid.map(areaCounts);
  const capOf = (target: number) => Math.max(1, Math.ceil(target / c.sessionWeeks));
  const draw = (area: PlanArea, key: string, target: (b: number) => number, cap: (b: number) => number | null) => {
    const d = lottery(c, inWeek, key, target, cap);
    plan[area] = d.k;
    mins[area] = d.min;
  };

  draw('Ropes', 'Ropes', () => SESSION_TARGETS.Ropes, () => 1);

  // Pool: some villages have a weekly minimum (a Swim Test counts), the rest a per-session total.
  draw(
    'Pool',
    'Pool',
    (b) => POOL_TARGETS[c.roster.village[b]]?.perSession ?? (POOL_TARGETS[c.roster.village[b]] ? 0 : POOL_TARGET_OTHER.perSession),
    () => 1,
  );
  const poolMins = mins.Pool;
  plan.Pool = plan.Pool.map((k, b) => {
    const t = POOL_TARGETS[c.roster.village[b]];
    return t?.perWeek !== undefined ? Math.max(0, t.perWeek - (inWeek[b].Pool ?? 0)) : k;
  });
  // a weekly minimum (O, C, T) is never put off; the per-session villages follow the draw
  mins.Pool = plan.Pool.map((k, b) => (POOL_TARGETS[c.roster.village[b]]?.perWeek !== undefined ? k : poolMins[b]));

  plan.Music = Array.from({ length: n }, (_, b) => Math.max(0, MUSIC_PER_WEEK - (inWeek[b].Music ?? 0)));
  mins.Music = plan.Music.slice();

  for (const area of ['Judaics', 'Israel Education', 'Teva', 'Ceramics', 'Yoga'] as const) draw(area, area, () => SESSION_TARGETS[area], () => null);

  const danceTarget = (b: number) => DANCE_TARGETS[c.roster.village[b]] ?? DANCE_TARGET_OTHER;
  draw('Dance', 'Dance', danceTarget, (b) => capOf(danceTarget(b)));

  // Time with the Unit Head: the youngest and oldest bunks go first (week 1, or week 2 at the latest).
  draw('TW UH', 'TW UH', () => SESSION_TARGETS['TW UH'], () => null);
  plan['TW UH'] = plan['TW UH'].map((count, b) => {
    const need = Math.max(0, SESSION_TARGETS['TW UH'] - counted(c, inWeek, b, 'TW UH'));
    if (c.weekIndex <= 2 && (c.roster.young[b] || c.roster.old[b])) return need > 0 ? 1 : 0;
    return count;
  });
  mins['TW UH'] = plan['TW UH'].map((k, b) => (c.weekIndex <= 2 && (c.roster.young[b] || c.roster.old[b]) ? k : mins['TW UH'][b]));

  trimToRoom(c, plan, mins);
  return plan;
}

// Put off first: the rarer areas, then the core ones, then the structural ones.
const TRIM_ORDER: PlanArea[] = ['TW UH', 'Yoga', 'Ceramics', 'Teva', 'Dance', 'Israel Education', 'Judaics', 'Pool', 'Ropes'];

/**
 * A bunk should not be planned more than it has room for once league and its share of Waterfront
 * are counted. Anything beyond that which is not already due is put off to a later week, where
 * the quota planner picks it up again.
 */
function trimToRoom(c: Ctx, plan: Plan, mins: Plan): void {
  const wf = c.lastWeek ? WATERFRONT_PER_WEEK : WATERFRONT_PER_WEEK * 2;
  for (let b = 0; b < c.roster.n; b++) {
    const v = c.roster.village[b];
    let free = 0;
    for (let s = 0; s < 24; s++) if (c.grid[b][s] === '' && !(c.lastWeek && s >= 20)) free++;
    const league = v === 'T' ? (c.lastWeek ? 0 : LEAGUE_PER_WEEK + 1) : LEAGUE_PER_WEEK * (v === 'M' ? 2 : 1);
    const room = free - league - wf;
    const planned = (): number => plan.Pool[b] + 2 * plan.Ropes[b] + plan.Music[b] + TOKEN_AREAS.reduce((sum, a) => sum + (a === 'Music' ? 0 : plan[a][b]), 0);
    for (const area of TRIM_ORDER) {
      while (planned() > room && plan[area][b] > mins[area][b]) plan[area][b]--;
    }
  }
}
