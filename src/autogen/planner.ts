import {
  BUILT_WEEK_MAX_EMPTY,
  CALENDAR,
  hobbiesInWeek,
  shabbatPrepPeriods,
  DAY_CAP,
  LATER_WEEK_ROOM_BONUS,
  FLEXIBLE_LATER_WEEK_SHARE,
  FLEXIBLE_VILLAGES,
  DANCE_TARGETS,
  triathlonPeriodsAWeek,
  LAST_WEEK_SHARE,
  LATER_WEEKS_NEGLIGIBLE,
  MIN_WEEK_CAPACITY,
  MUSIC_LIGHT_PER_SESSION,
  MUSIC_LIGHT_VILLAGES,
  MUSIC_PER_WEEK,
  POOL_TARGETS,
  POOL_TARGET_OTHER,
  SESSION_TARGETS,
  VILLAGE_TARGETS,
  SHABBAT_ROTATION,
  TRI_AWAY_PERIODS,
  TRIP_LABELS,
} from './config';
import { blocksOf, isBuiltWeek } from './history';
import { ropeGroups } from './groups';
import { weightedSample } from './rng';
import type { Ctx } from './state';
import { ROPES_HALF_DAY_SHARE, ROPES_TIGHT, TOO_SHORT_FOR_WEEKLY, leagueWant, openPeriods, waterfrontWant } from './weekRoom';
import { shuffle } from './rng';

/** The areas planned as single periods, a count per bunk. The Settings tab can add to them (see settings.ts). */
export const BUILT_IN_TOKEN_AREAS = ['Music', 'Judaics', 'Israel Education', 'Teva', 'Ceramics', 'Yoga', 'Dance', 'TW UH'];
export const TOKEN_AREAS: string[] = [...BUILT_IN_TOKEN_AREAS];
export type TokenArea = string;
/** 'Ropes', 'Pool', or one of TOKEN_AREAS. */
export type PlanArea = string;
/** How many blocks of each area each bunk gets this week (Ropes are doubles, the rest single periods). */
export type Plan = Record<PlanArea, number[]>;

/** The label a token area is written as. */
export const TOKEN_LABEL: Record<string, string> = {
  Music: 'Music',
  Judaics: 'Judaics',
  'Israel Education': 'Israel',
  Teva: 'Teva',
  Ceramics: 'Ceramics',
  Yoga: 'Yoga',
  Dance: 'Dance',
  'TW UH': 'Time with UH',
};

/**
 * Is this bunk's weekly Music due this week? Every bunk, every week, except the villages in MUSIC_LIGHT_VILLAGES: there a
 * bunk has Music in two of the first three weeks, and which week it skips goes by its place in the village list.
 */
export function musicDue(v: string, pos: number, weekIndex: number): boolean {
  if (!MUSIC_LIGHT_VILLAGES.includes(v)) return true;
  return weekIndex <= MUSIC_LIGHT_PER_SESSION + 1 && weekIndex !== (pos % (MUSIC_LIGHT_PER_SESSION + 1)) + 1;
}

/** How many blocks of an area a bunk should have over the whole session (Music and some Pool targets are weekly). */
export function sessionTargetOf(v: string, sessionWeeks: number, area: string): number {
  if (area === 'Dance') return DANCE_TARGETS[v] ?? DANCE_TARGETS['*'];
  if (area === 'Music') return MUSIC_LIGHT_VILLAGES.includes(v) ? MUSIC_LIGHT_PER_SESSION : MUSIC_PER_WEEK * sessionWeeks;
  if (area === 'Pool') {
    const t = POOL_TARGETS[v];
    if (t?.perWeek !== undefined) return t.perWeek * sessionWeeks;
    return Math.min(t?.perSession ?? POOL_TARGET_OTHER.perSession, sessionWeeks);
  }
  return VILLAGE_TARGETS[area]?.[v] ?? SESSION_TARGETS[area] ?? 0;
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
 * Periods a bunk's trips take in a week: the ones that are on the schedule, and nothing else. Trips are entered by hand, and
 * a week with none entered is planned as a week with none. (It used to be planned as if the usual trips would turn up, which
 * left a village with nothing to do in a week it turned out to spend in camp.)
 */
function tripCells(c: Ctx, b: number, week: number): number {
  const schedule = c.weeks.weeks[week - 1];
  return schedule?.bunks.find((x) => x.name.trim() === c.roster.names[b])?.slots.filter((l) => TRIP_LABELS.includes(l)).length ?? 0;
}
/** Tusc trains for the triathlon every week it is in camp: four periods, or none in a week it is away on the long bike trip. */
const triathlonPeriods = (c: Ctx, b: number, week: number): number => (tripCells(c, b, week) >= TRI_AWAY_PERIODS ? 0 : triathlonPeriodsAWeek());

/**
 * Roughly how many single periods a bunk has to spare in a given week once the fixed calendar, trips,
 * league, Waterfront and the weekly Music, Pool and Ropes are taken out. Used to spread what a
 * bunk still needs over the weeks left in proportion to the room each week really has.
 */
export function expectedSpare(c: Ctx, b: number, week: number): number {
  const v = c.roster.village[b];
  const last = c.sessionWeeks === 4 && week === 4;
  const pool = POOL_TARGETS[v]?.perWeek ?? 1;
  const upkeep = MUSIC_PER_WEEK + pool + 1; // Music, Pool and about one Ropes double every other week
  if (week === c.weekIndex) {
    // this week is in hand: count what is really still empty, less what is yet to be placed
    let free = 0;
    for (let s = 0; s < 24; s++) if (c.grid[b][s] === '' && !(last && s >= 20)) free++;
    const row = blocksOf(c.grid[b]);
    const open = openPeriods(c.grid[b], last);
    const leagueWanted = v === 'T' ? (triathlonPeriods(c, b, week) > 0 ? leagueWant(v, open) + 1 : 0) : leagueWant(v, open) * (v === 'M' ? 2 : 1);
    const leagueHave = row.filter((k) => k.area === 'League').reduce((sum, k) => sum + k.len, 0);
    const wfHave = row.filter((k) => k.area === 'Waterfront').length;
    free -= Math.max(0, leagueWanted - leagueHave);
    free -= 2 * Math.max(0, waterfrontWant(open) - wfHave);
    return free - upkeep;
  }
  // a week still to come: what the calendar, hobbies and the set blocks will leave it
  let open = 24;
  const hobbies = hobbiesInWeek(week, c.sessionWeeks);
  if (last) open -= 8 + (hobbies > 0 ? 2 : 0); // Friday, Thursday and Monday hobbies
  else open -= 2 * hobbies; // two periods for each hobby session this week
  if (week === 1) open -= 1; // the swim test, or Mohawk's Athletics
  if ((SHABBAT_ROTATION[c.sessionWeeks][week] ?? []).includes(v)) open -= shabbatPrepPeriods();
  open = Math.max(0, open - tripCells(c, b, week)); // trips, village day, Mass Program and the rest of the calendar
  let free = open;
  // league and Waterfront are an average over the session: a week cut short has fewer
  if (v === 'T') free -= triathlonPeriods(c, b, week) > 0 ? leagueWant(v, open) + 1 : 0; // triathlon: the first session is a double
  else free -= leagueWant(v, open) * (v === 'M' ? 2 : 1);
  free -= 2 * waterfrontWant(open);
  // Ropes are done before the last week. A later week tends to have more room than this count says, and guessing low
  // makes the early weeks use up the rare areas, so the guess leans high.
  return free - upkeep + (last ? 1 : 0) + LATER_WEEK_ROOM_BONUS;
}

/** A week with (almost) no room gets no share, so what a bunk needs is done in the weeks that have room. */
const capacityWeight = (c: Ctx, b: number, week: number): number => {
  const spare = expectedSpare(c, b, week);
  if (spare < MIN_WEEK_CAPACITY) return 0;
  let weight = c.sessionWeeks === 4 && week === 4 ? spare * LAST_WEEK_SHARE : spare;
  if (week > c.weekIndex && FLEXIBLE_VILLAGES.includes(c.roster.village[b])) weight *= FLEXIBLE_LATER_WEEK_SHARE ** (week - c.weekIndex);
  return weight;
};

/** This week, plus every later week of the session that is not already built. */
export function remainingWeeks(c: Ctx): number[] {
  const out: number[] = [];
  for (let w = c.weekIndex; w <= c.sessionWeeks; w++) if (w === c.weekIndex || !isBuiltWeek(c.weeks.weeks[w - 1], BUILT_WEEK_MAX_EMPTY)) out.push(w);
  return out.length ? out : [c.weekIndex];
}

/**
 * Spread what each bunk still needs over the weeks left, weighting a short last week less. The
 * fractional part is drawn once for the whole roster, so the load per week stays even.
 */
function lottery(c: Ctx, inWeek: Counts[], area: string, target: (b: number) => number, cap: (b: number) => number | null, nowShare?: number[]): Drawn {
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
    const rawShare = nowShare ? need * nowShare[b] : wSum > 0 ? (need * capacityWeight(c, b, c.weekIndex)) / wSum : need / weeks.length;
    const share = need - rawShare < LATER_WEEKS_NEGLIGIBLE ? need : rawShare;
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


/**
 * Roughly how many leftover periods (Athletics and A&C) a bunk can take in a week. They are single periods, one of each a day
 * for the bunk and DAY_CAP bunks a day for its village, so it goes by the days the bunk has open, not by its empty periods.
 * A week squeezed onto a few days by a trip and Shabbat Prep has very little, and needs its rare areas saved for it.
 */
export function leftoverRoom(c: Ctx, b: number, week: number): number {
  const v = c.roster.village[b];
  const last = c.sessionWeeks === 4 && week === 4;
  const now = week === c.weekIndex;
  const prep = (SHABBAT_ROTATION[c.sessionWeeks][week] ?? []).includes(v);
  const row = now ? c.grid[b] : c.weeks.weeks[week - 1]?.bunks.find((x) => x.name.trim() === c.roster.names[b])?.slots;
  let days = 0;
  for (let day = 0; day < (last ? 4 : 6); day++) {
    let free = 0;
    for (let p = 0; p < 4; p++) {
      if (row && row[day * 4 + p] !== '') continue;
      // a week that is not in hand yet: Friday morning is hobbies and, on the village's turn, the afternoon is Shabbat Prep
      const hobby = hobbiesInWeek(week, c.sessionWeeks) > 0;
      if (!now && ((day === 5 && ((hobby && p < 2) || (prep && CALENDAR.shabbatPrep))) || (hobby && last && day === 1 && p < 2))) continue;
      free++;
    }
    if (free > 0) days++;
  }
  const upkeep = MUSIC_PER_WEEK + (POOL_TARGETS[v]?.perWeek ?? 1) + 1;
  const periods = Math.max(0, expectedSpare(c, b, week)) + upkeep; // what Waterfront, league and the calendar leave
  const perDay = Math.min(2, (DAY_CAP.Athletics + DAY_CAP['A&C']) / c.roster.byVillage[v].length);
  return perDay * Math.min(days, periods / 2);
}

/**
 * What share of the rare areas a bunk still needs should be done this week. The periods left over after them can only be
 * Athletics, A&C or Time with UH, and a week has room for only so many of those, so the leftover is spread over the weeks
 * in step with the room each week has for it; the rare areas take the rest of this week's periods.
 */
function shareForThisWeek(c: Ctx, rareNeed: (b: number) => number): number[] {
  const weeks = remainingWeeks(c);
  return Array.from({ length: c.roster.n }, (_, b) => {
    const need = rareNeed(b);
    if (need <= 0) return 0;
    const spare = weeks.map((w) => Math.max(0, expectedSpare(c, b, w)));
    const now = spare[weeks.indexOf(c.weekIndex)];
    const leftover = Math.max(0, spare.reduce((a, x) => a + x, 0) - need);
    const periods = weeks.map((w, i) => (spare[i] >= MIN_WEEK_CAPACITY ? leftoverRoom(c, b, w) : 0));
    const allPeriods = periods.reduce((a, x) => a + x, 0);
    const leftoverNow = allPeriods > 0 ? Math.min(now, (leftover * periods[weeks.indexOf(c.weekIndex)]) / allPeriods) : now;
    return Math.max(0, Math.min(1, (now - leftoverNow) / need));
  });
}

/**
 * A village only gets so many bunks at Music a day. When its bunks have too few free days this week for everyone
 * (Tusc back from the bike trip with one day left), the Music that cannot fit is not planned at all.
 */
function limitMusicToRoom(c: Ctx, music: number[]): void {
  const cap = DAY_CAP.Music;
  for (const v of c.roster.villages) {
    const want = c.roster.byVillage[v].filter((b) => music[b] > 0);
    let room = 0;
    for (const day of c.days) room += Math.min(cap, want.filter((b) => [0, 1, 2, 3].some((p) => c.grid[b][day * 4 + p] === '')).length);
    // the bunks that have had the least Music keep theirs
    const order = [...want].sort((x, y) => counted(c, c.grid.map(areaCounts), x, 'Music') - counted(c, c.grid.map(areaCounts), y, 'Music') || c.rng() - 0.5);
    for (const b of order.slice(Math.max(0, room))) music[b] = 0;
  }
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
  const draw = (area: PlanArea, key: string, target: (b: number) => number, cap: (b: number) => number | null, nowShare?: number[]) => {
    const d = lottery(c, inWeek, key, target, cap, nowShare);
    plan[area] = d.k;
    mins[area] = d.min;
  };

  // Ropes go in groups (bunks next to each other in a village, up to the camper limit), so a group draws its week once and every member follows.
  const ropeNeed = Array.from({ length: n }, (_, b) => b).filter((b) => counted(c, inWeek, b, 'Ropes') < sessionTargetOf(c.roster.village[b], c.sessionWeeks, 'Ropes'));
  const groups = ropeGroups(c.roster, ropeNeed, (b) => counted(c, inWeek, b, 'Ropes'), () => 0);
  const leaders = new Set(groups.map((g) => g[0]));
  draw('Ropes', 'Ropes', (b) => (leaders.has(b) ? sessionTargetOf(c.roster.village[b], c.sessionWeeks, 'Ropes') : counted(c, inWeek, b, 'Ropes')), () => 1);
  // One group at ropes a half-day in the whole camp: a week only has so many half-days, and fewer when the calendar is
  // in it. The groups beyond what this week can hold go another week (the ones that cannot wait keep their place).
  let halfDays = 0;
  for (const day of c.days) for (const half of [0, 2]) if (c.grid.some((row) => row[day * 4 + half] === '' && row[day * 4 + half + 1] === '')) halfDays++;
  const room = Math.max(0, Math.round(halfDays * ROPES_HALF_DAY_SHARE));
  const had = (g: number[]): number => counted(c, inWeek, g[0], 'Ropes');
  if (!ROPES_TIGHT) {
    const going = shuffle(c.rng, groups.filter((g) => plan.Ropes[g[0]] > 0)).sort((x, y) => mins.Ropes[y[0]] - mins.Ropes[x[0]]);
    for (const g of going.slice(room)) if (mins.Ropes[g[0]] === 0) plan.Ropes[g[0]] = 0;
  } else {
    // Ropes for everyone does not fit in this session, so nobody goes a second time while somebody has not been at all:
    // the groups that have been the fewest times take this week's half-days, whatever the draw said.
    const order = shuffle(c.rng, groups).sort((x, y) => had(x) - had(y) || plan.Ropes[y[0]] - plan.Ropes[x[0]]);
    order.forEach((g, i) => {
      plan.Ropes[g[0]] = i < room ? 1 : 0;
      mins.Ropes[g[0]] = Math.min(mins.Ropes[g[0]], plan.Ropes[g[0]]);
    });
  }
  for (const g of groups) {
    for (const member of g.slice(1)) {
      plan.Ropes[member] = plan.Ropes[g[0]];
      mins.Ropes[member] = mins.Ropes[g[0]];
    }
  }

  // Pool: some villages have a weekly minimum (a Swim Test counts), the rest a per-session total.
  draw(
    'Pool',
    'Pool',
    (b) => (POOL_TARGETS[c.roster.village[b]]?.perWeek !== undefined ? 0 : sessionTargetOf(c.roster.village[b], c.sessionWeeks, 'Pool')),
    () => 1,
  );
  const poolMins = mins.Pool;
  plan.Pool = plan.Pool.map((k, b) => {
    const t = POOL_TARGETS[c.roster.village[b]];
    // a bunk with next to no periods this week is not expected at the pool
    const short = openPeriods(c.grid[b], c.lastWeek) < TOO_SHORT_FOR_WEEKLY;
    return t?.perWeek !== undefined ? (short ? 0 : Math.max(0, t.perWeek - (inWeek[b].Pool ?? 0))) : short ? 0 : k;
  });
  // a weekly minimum (O, C, T) is never put off; the per-session villages follow the draw
  mins.Pool = plan.Pool.map((k, b) => (POOL_TARGETS[c.roster.village[b]]?.perWeek !== undefined ? k : poolMins[b]));

  plan.Music = Array.from({ length: n }, (_, b) =>
    musicDue(c.roster.village[b], c.roster.pos[b], c.weekIndex) && openPeriods(c.grid[b], c.lastWeek) >= TOO_SHORT_FOR_WEEKLY ? Math.max(0, MUSIC_PER_WEEK - (inWeek[b].Music ?? 0)) : 0,
  );
  limitMusicToRoom(c, plan.Music);
  mins.Music = plan.Music.slice();

  const danceTarget = (b: number) => DANCE_TARGETS[c.roster.village[b]] ?? DANCE_TARGETS['*'];
  const rareTarget = (b: number, area: string): number => (area === 'Dance' ? danceTarget(b) : sessionTargetOf(c.roster.village[b], c.sessionWeeks, area));
  const RARE = TOKEN_AREAS.filter((a) => a !== 'Music');
  const nowShare = shareForThisWeek(c, (b) => RARE.reduce((sum, a) => sum + Math.max(0, rareTarget(b, a) - counted(c, inWeek, b, a)), 0));

  // every area with a plain per-session number, the ones added on the Settings tab among them
  for (const area of TOKEN_AREAS) if (!OWN_PLAN.includes(area)) draw(area, area, (b) => sessionTargetOf(c.roster.village[b], c.sessionWeeks, area), () => null, nowShare);
  draw('Dance', 'Dance', danceTarget, (b) => capOf(danceTarget(b)), nowShare);

  // Time with the Unit Head: the youngest and oldest bunks go first (week 1, or week 2 at the latest).
  draw('TW UH', 'TW UH', () => SESSION_TARGETS['TW UH'], () => null, nowShare);
  plan['TW UH'] = plan['TW UH'].map((count, b) => {
    const need = Math.max(0, SESSION_TARGETS['TW UH'] - counted(c, inWeek, b, 'TW UH'));
    if (c.weekIndex <= 2 && (c.roster.young[b] || c.roster.old[b])) return need > 0 ? 1 : 0;
    return count;
  });
  mins['TW UH'] = plan['TW UH'].map((k, b) => (c.weekIndex <= 2 && (c.roster.young[b] || c.roster.old[b]) ? k : mins['TW UH'][b]));

  trimToRoom(c, plan, mins);
  return plan;
}

/** Areas that are planned by their own rule in planWeek, not by a plain per-session number. */
const OWN_PLAN = ['Music', 'Dance', 'TW UH'];
// Put off first: Time with UH and the areas added on the Settings tab, then the rarer areas, the core ones, the structural ones.
const TRIM_BUILT_IN = ['Yoga', 'Ceramics', 'Teva', 'Dance', 'Israel Education', 'Judaics', 'Pool', 'Ropes'];
const trimOrder = (): PlanArea[] => ['TW UH', ...TOKEN_AREAS.filter((a) => !BUILT_IN_TOKEN_AREAS.includes(a)), ...TRIM_BUILT_IN];

/**
 * A bunk should not be planned more than it has room for once league and its share of Waterfront
 * are counted. Anything beyond that which is not already due is put off to a later week, where
 * the quota planner picks it up again.
 */
function trimToRoom(c: Ctx, plan: Plan, mins: Plan): void {
  for (let b = 0; b < c.roster.n; b++) {
    const v = c.roster.village[b];
    const open = openPeriods(c.grid[b], c.lastWeek);
    const wf = 2 * waterfrontWant(open);
    let free = 0;
    for (let s = 0; s < 24; s++) if (c.grid[b][s] === '' && !(c.lastWeek && s >= 20)) free++;
    const league = v === 'T' ? (triathlonPeriods(c, b, c.weekIndex) > 0 ? leagueWant(v, open) + 1 : 0) : leagueWant(v, open) * (v === 'M' ? 2 : 1);
    const room = free - league - wf;
    const planned = (): number => plan.Pool[b] + 2 * plan.Ropes[b] + plan.Music[b] + TOKEN_AREAS.reduce((sum, a) => sum + (a === 'Music' ? 0 : plan[a][b]), 0);
    for (const area of trimOrder()) {
      while (planned() > room && plan[area][b] > mins[area][b]) plan[area][b]--;
    }
    // still more than the week holds (the last week is asked for everything that is left): what does not fit is not planned
    for (const area of trimOrder()) {
      if (area === 'Pool' || area === 'Ropes') continue;
      while (planned() > room && plan[area][b] > 0) {
        plan[area][b]--;
        c.carried.push({ bunk: b, area });
      }
    }
  }
}
