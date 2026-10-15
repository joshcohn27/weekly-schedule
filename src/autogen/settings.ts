import { isBuiltInName, setCustomAreas } from '../config';
import {
  DANCE_TARGETS,
  DAY_CAP,
  RARE_AREAS,
  SESSION_FILLER_MAX,
  SESSION_HARD_MAX,
  SESSION_TARGETS,
  SHARING,
  SLOT_CAP,
  CALENDAR,
  LEAGUE_BY_VILLAGE,
  LEAGUE_MAX_BY_VILLAGE,
  LEAGUE_MAX_PER_WEEK,
  WATERFRONT_MAX_PER_WEEK,
  WEEK_BLOCK_MIN,
  VILLAGE_FILLER_MAX,
  setWeeklyMost,
  POOL_LESSONS,
  POOL_MAX_CAMPERS,
  POOL_TARGETS,
  ROPES_MAX_CAMPERS,
  ROPES_BUNKS_ALWAYS,
  BY_CAMPERS_DAY_CAP,
  ROPES_START_HIGH,
  VILLAGE_TARGETS,
  AREA_BY_VILLAGE,
  AREA_CAMPERS,
  BY_CAMPERS_SLOT_CAP,
  CAMPER_CAP,
  VISIT,
  WEEK_BLOCK_MAX,
  rememberDayCaps,
  SHABBAT_PREP_EXTRA_MAX,
  setPool,
  setRopesMax,
  setShabbat,
  setWeekly,
  shabbatFor,
  weekly,
  type Sharing,
} from './config';
import { pairKey } from './roster';
import { BUILT_IN_TOKEN_AREAS, TOKEN_AREAS, TOKEN_LABEL } from './planner';
import { resetSharedAreas } from './share';
import { SESSION_CALENDAR, normalizeCalendar, type CalendarEvent, type SessionTemplate } from './sessionCalendar';
import { resetAreaBits } from './state';

/** How one program area is scheduled. Every number is per bunk unless it says otherwise. */
export interface AreaSettings {
  /** Times in a session: what every bunk is given, and the most it may have. A visit above `min` only fills a period that would otherwise be Athletics or A&C. */
  min: number;
  max: number;
  /** Bunks in the area in one period: 1 or 2. */
  atOnce: number;
  /** Bunks of one village in the area in one day. */
  villagePerDay: number;
  /** Times in a session for one village, by its letter, in place of `min` and `max` (Dance is different for each village). */
  villages?: Record<string, number>;
  /** For an area set village by village: the most a bunk of a village may have, where that is more than its number. The visits above the number only fill a period. */
  villagesMax?: Record<string, number>;
  /** The most campers there at once, on top of the limit in bunks. Left out: no limit in campers. */
  campers?: number;
}

/** The numbers a schedule is generated with. They are saved with the schedule, so each schedule carries its own. */
export interface Settings {
  areas: Record<string, AreaSettings>;
  /** Program areas that were added (archery, martial arts, ...), in the order they were added. Each has its entry in `areas`. */
  custom?: string[];
  /** Who may share a period, when it is not the default. */
  sharing?: Sharing;
  /** The numbers for Waterfront, league, the pool, Athletics, A&C, Music and Time with UH, when they are not the defaults. */
  core?: CoreSettings;
  /** Visit numbers, when they are not the default. */
  visits?: VisitSettings;
  /** A village's own number of times a session for an area (or 'Ropes'), in place of the area's: area, then village letter. */
  villageTargets?: Record<string, Record<string, number>>;
  /** Villages whose first ropes of this session is High Ropes. */
  ropesStartHigh?: string[];
  /** The session calendar (trips, village days, Mass Program, ...) when it is not the template for the session's length. */
  calendar?: CalendarEvent[];
  /** Which set of defaults these settings were saved under. Settings from before SETTINGS_VERSION are brought up to date when read. */
  v?: number;
}

/**
 * 2: Judaics and Yoga take two bunks at once (two of a village a day). Settings saved before that still hold the old one
 * and one for them, so those two numbers are moved up when such settings are read.
 * 3: Yoga takes 20 campers at once, not 22. Settings saved with the old 22 are moved to 20.
 * 4: Ceramics is exactly twice (it was 2 to 3) and goes by campers; Teva is 1 to 3 (it was exactly 3). Settings saved with
 *    the old numbers, which were the app's and not a choice, are moved to the new ones. The numbers a camp of 27 bunks
 *    needs are the starting ones: 3 bunks of a village a day everywhere (it was 2), and any two bunks of a village may
 *    share. A saved 2 is moved up the same way. (Athletics and A&C take 3 bunks at once at the most: a saved 4 is read as 3.)
 * 5: the user's program-area study (2026-10-12). Settings saved with the old starting numbers follow the app: Teva 2 to 4,
 *    Yoga 1 to 2 with 16 campers, Ceramics twice for every village, Time with UH 2 to 4, ropes 25 campers, the pool 75,
 *    league twice a week with Mohawk 3, A&C two bunks at once, and the camper limits at Judaics, Israel, Teva and Dance.
 * 6: Mohawk's league is 2 a week with a third when there is room (it was exactly 3), and Session 2 has six hobby sessions
 *    (it had seven). Settings saved with the old starting numbers follow the app.
 */
export const SETTINGS_VERSION = 6;
/** What Yoga's camper limit started at before settings version 3. */
const OLD_YOGA_CAMPERS = 22;
/** What Ceramics and Teva started at before settings version 4. */
const OLD_NUMBERS: Record<string, { min: number; max: number }> = { Ceramics: { min: 2, max: 3 }, Teva: { min: 3, max: 3 } };
/** What Teva and Yoga started at in settings version 4, and Ceramics village by village. */
const OLD_NUMBERS_4: Record<string, { min: number; max: number }> = { Teva: { min: 1, max: 3 }, Yoga: { min: 2, max: 3 } };
const OLD_CERAMICS_4 = JSON.stringify({ C: 1, M: 2, O: 1, S: 2, T: 2 });
/** What Ceramics started at in Session 2 in settings version 4. */
const OLD_CERAMICS_4_SECOND = JSON.stringify({ C: 0, M: 1, O: 0, S: 1, T: 1 });

/** An area that bunks may share: how many at once, how many of one village in a day, and (Athletics, A&C) how many times a bunk may have it in a week. */
export interface SharedNumbers {
  atOnce: number;
  villagePerDay: number;
  maxPerWeek: number;
}

/**
 * The areas that are not counted per session like the rarer ones. Waterfront and league are a number of times a week (a
 * short week gets fewer). Music is given `musicPerWeek` times a week and may fill a period up to `music.maxPerWeek`.
 * Time with UH is given `uhMin` times a session and may fill a period up to `uhMax`. The pool is once a week, with a second
 * swim allowed up to `poolMaxPerWeek`; who swims together is not a setting.
 */
export interface CoreSettings {
  /** Hobby sessions in the whole session, exactly. A session is a half-day for the whole camp; hobbyWeeks() shares them out over the weeks. */
  hobbySessions: number;
  /** Shabbat Prep: always true (kept so an older file that had it switched off can be read; that becomes "No Shabbat" every week). */
  shabbatPrep: boolean;
  /** Single periods of Shabbat Prep earlier in a village's Shabbat week, on top of the Friday afternoon double. */
  shabbatPrepExtra: number;
  /** The villages that have Shabbat in each week, week 1 first, and so get Shabbat Prep; an empty week is "No Shabbat". Null is the usual turns. */
  shabbatWeeks: string[][] | null;
  /** Ropes in a session (low ropes first, then high ropes), and the most campers at ropes at once. */
  ropesPerSession: number;
  ropesMaxCampers: number;
  /** This many bunks may always be at ropes together, whatever their campers. */
  ropesBunksAlways: number;
  /** Yoga goes by campers: two bunks have it together only when they have no more campers between them than this. */
  yogaMaxCampers: number;
  /** Ceramics goes by campers too. */
  ceramicsMaxCampers: number;
  /** The pool: swims a week, how many of an O or C bunk's first swims are lessons alone, and the most campers in the water at once. */
  poolPerWeek: number;
  poolLessons: number;
  poolMaxCampers: number;
  waterfrontPerWeek: number;
  /** The most Waterfront a village may have in a week: above `waterfrontPerWeek`, only when it has periods to spare. */
  waterfrontMaxPerWeek: number;
  /** League periods a week, and any village that has its own number (for Tusc: triathlon sessions). */
  leaguePerWeek: number;
  leagueByVillage: Record<string, number>;
  /** The most league a village may have in a week (above its number, only when it has periods to spare), and any village with its own most. */
  leagueMaxPerWeek: number;
  leagueMaxByVillage: Record<string, number>;
  /** The fewest Athletics and A&C a bunk should have in a week. They are aimed for: both are whatever periods are left. */
  athleticsMinPerWeek: number;
  acMinPerWeek: number;
  poolMaxPerWeek: number;
  musicPerWeek: number;
  uhMin: number;
  uhMax: number;
  athletics: SharedNumbers;
  ac: SharedNumbers;
  music: SharedNumbers;
  /** Time with UH has no weekly limit of its own: `maxPerWeek` is not used. */
  uh: SharedNumbers;
}

/** Visit numbers: the areas where bunks that share need NOT be on the same visit, and whether the last week may be one visit apart. */
export interface VisitSettings {
  free: string[];
  lastWeekSlack: boolean;
}

/** The ranges the core numbers are kept inside. */
const CORE_LIMITS = {
  hobbySessions: [0, 9],
  shabbatPrepExtra: [0, SHABBAT_PREP_EXTRA_MAX],
  ropesPerSession: [0, 2],
  ropesMaxCampers: [5, 200],
  ropesBunksAlways: [1, 4],
  yogaMaxCampers: [5, 200],
  ceramicsMaxCampers: [5, 200],
  poolPerWeek: [0, 1],
  poolLessons: [0, 4],
  poolMaxCampers: [10, 500],
  waterfrontPerWeek: [0, 3],
  waterfrontMaxPerWeek: [0, 3],
  leaguePerWeek: [0, 3],
  leagueMaxPerWeek: [0, 3],
  athleticsMinPerWeek: [0, 3],
  acMinPerWeek: [0, 3],
  poolMaxPerWeek: [0, 2],
  musicPerWeek: [0, 1],
  uhMin: [0, 6],
  uhMax: [0, 6],
} as const;
/** [bunks at once: least, most], then the most times a week, for each shared area. */
const SHARED_LIMITS: Record<'athletics' | 'ac' | 'music' | 'uh', { atOnce: [number, number]; maxPerWeek: [number, number] }> = {
  athletics: { atOnce: [1, 3], maxPerWeek: [0, 3] }, // never four bunks at once, at Athletics or at A&C
  ac: { atOnce: [1, 3], maxPerWeek: [0, 3] },
  music: { atOnce: [1, 2], maxPerWeek: [0, 3] }, // 3 stands for no weekly limit: nothing is two days running
  uh: { atOnce: [1, 2], maxPerWeek: [0, 0] },
};
/** Weeks the Shabbat setting covers. */
export const SHABBAT_WEEKS = 4;
/** The usual Shabbat turns, as the setting holds them: a list of villages for each week, sorted. */
const usualShabbat = (): string[][] => Array.from({ length: SHABBAT_WEEKS }, (_, i) => [...(shabbatFor(null, 4)[i + 1] ?? [])].sort());
/** The villages that have Shabbat in each week under these settings, week 1 first. */
export const shabbatWeeksOf = (s: Settings): string[][] => coreOf(s).shabbatWeeks ?? usualShabbat();
/** These settings with one week's Shabbat villages changed. An empty list is "No Shabbat" that week. */
export function withShabbatWeek(s: Settings, week: number, villages: string[]): Settings {
  const picked = shabbatWeeksOf(s).map((w, i) => (i === week - 1 ? villages : w));
  return withCore(s, { ...coreOf(s), shabbatWeeks: picked });
}
/** The program area each shared entry stands for. */
const SHARED_AREA_OF = { athletics: 'Athletics', ac: 'A&C', music: 'Music', uh: 'TW UH' } as const;

function readCore(): CoreSettings {
  const w = weekly();
  const shared = (key: keyof typeof SHARED_AREA_OF): SharedNumbers => {
    const area = SHARED_AREA_OF[key];
    return { atOnce: SLOT_CAP[area], villagePerDay: DAY_CAP[area], maxPerWeek: WEEK_BLOCK_MAX[area] ?? 0 };
  };
  return {
    hobbySessions: CALENDAR.hobbySessions,
    shabbatPrep: CALENDAR.shabbatPrep,
    shabbatPrepExtra: CALENDAR.shabbatPrepExtra,
    shabbatWeeks: null,
    ropesPerSession: SESSION_TARGETS.Ropes,
    ropesMaxCampers: ROPES_MAX_CAMPERS,
    ropesBunksAlways: ROPES_BUNKS_ALWAYS,
    yogaMaxCampers: CAMPER_CAP.Yoga,
    ceramicsMaxCampers: CAMPER_CAP.Ceramics,
    poolPerWeek: POOL_TARGETS.O?.perWeek ?? 1,
    poolLessons: POOL_LESSONS,
    poolMaxCampers: POOL_MAX_CAMPERS,
    waterfrontPerWeek: w.waterfront,
    waterfrontMaxPerWeek: WATERFRONT_MAX_PER_WEEK,
    leaguePerWeek: w.league,
    leagueByVillage: { ...LEAGUE_BY_VILLAGE },
    leagueMaxPerWeek: LEAGUE_MAX_PER_WEEK,
    leagueMaxByVillage: { ...LEAGUE_MAX_BY_VILLAGE },
    athleticsMinPerWeek: WEEK_BLOCK_MIN.Athletics ?? 0,
    acMinPerWeek: WEEK_BLOCK_MIN['A&C'] ?? 0,
    poolMaxPerWeek: w.poolMax,
    musicPerWeek: w.music,
    uhMin: SESSION_TARGETS['TW UH'],
    uhMax: w.uhMax,
    athletics: shared('athletics'),
    ac: shared('ac'),
    music: shared('music'),
    uh: shared('uh'),
  };
}
const STARTING_POOL: Record<string, { perWeek?: number; perSession?: number }> = JSON.parse(JSON.stringify(POOL_TARGETS));
const STARTING_CORE: CoreSettings = readCore();
const STARTING_VISITS: VisitSettings = { free: [...VISIT.free], lastWeekSlack: VISIT.lastWeekSlack };
export const defaultCore = (): CoreSettings => JSON.parse(JSON.stringify(STARTING_CORE)) as CoreSettings;
export const defaultVisits = (): VisitSettings => JSON.parse(JSON.stringify(STARTING_VISITS)) as VisitSettings;
export const coreOf = (s: Settings): CoreSettings => s.core ?? defaultCore();
export const visitsOf = (s: Settings): VisitSettings => s.visits ?? defaultVisits();

const wholeIn = (v: unknown, [least, most]: readonly [number, number], fallback: number): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(most, Math.max(least, Math.round(n))) : fallback;
};

/** Accepts whatever was saved or uploaded and returns valid core numbers. Null when they come out as the defaults. */
export function normalizeCore(raw: unknown): CoreSettings | null {
  const out = defaultCore();
  const g = raw as Partial<CoreSettings> | null;
  if (!g || typeof g !== 'object') return null;
  for (const key of Object.keys(CORE_LIMITS) as (keyof typeof CORE_LIMITS)[]) out[key] = wholeIn(g[key], CORE_LIMITS[key], out[key]);
  out.uhMax = Math.max(out.uhMin, out.uhMax);
  if (g.leagueByVillage && typeof g.leagueByVillage === 'object') {
    out.leagueByVillage = {};
    for (const [letter, n] of Object.entries(g.leagueByVillage)) {
      const v = letter.trim().charAt(0).toUpperCase();
      const times = wholeIn(n, CORE_LIMITS.leaguePerWeek, out.leaguePerWeek);
      if (v && times !== out.leaguePerWeek) out.leagueByVillage[v] = times; // a village on the usual number is not listed
    }
  }
  if (typeof g.shabbatPrepExtra === 'boolean') out.shabbatPrepExtra = g.shabbatPrepExtra ? 1 : 0; // an older file: yes or no
  if (Array.isArray(g.shabbatWeeks)) {
    const letters = (week: unknown): string[] => [...new Set((Array.isArray(week) ? week : []).map((v) => String(v).trim().charAt(0).toUpperCase()).filter(Boolean))].sort();
    const picked = Array.from({ length: SHABBAT_WEEKS }, (_, i) => letters((g.shabbatWeeks as unknown[])[i]));
    if (JSON.stringify(picked) !== JSON.stringify(usualShabbat())) out.shabbatWeeks = picked; // the usual turns are not kept as a change
  }
  // an older file with Shabbat Prep switched off: nobody has Shabbat in any week
  if (g.shabbatPrep === false) out.shabbatWeeks = Array.from({ length: SHABBAT_WEEKS }, () => []);
  out.poolMaxPerWeek = Math.max(out.poolMaxPerWeek, out.poolPerWeek);
  out.waterfrontMaxPerWeek = Math.max(out.waterfrontMaxPerWeek, out.waterfrontPerWeek);
  // a village's own most league: never under its number, and not listed when it is what the village would have anyway
  const leagueOfVillage = (v: string): number => out.leagueByVillage[v] ?? out.leaguePerWeek;
  const given = g.leagueMaxByVillage && typeof g.leagueMaxByVillage === 'object' ? g.leagueMaxByVillage : out.leagueMaxByVillage;
  out.leagueMaxByVillage = {};
  for (const [letter, n] of Object.entries(given)) {
    const v = letter.trim().charAt(0).toUpperCase();
    const most = Math.max(leagueOfVillage(v), wholeIn(n, CORE_LIMITS.leagueMaxPerWeek, out.leagueMaxPerWeek));
    if (v && most !== Math.max(leagueOfVillage(v), out.leagueMaxPerWeek)) out.leagueMaxByVillage[v] = most;
  }
  for (const key of Object.keys(SHARED_LIMITS) as (keyof typeof SHARED_LIMITS)[]) {
    const given = g[key];
    if (!given || typeof given !== 'object') continue;
    out[key] = {
      atOnce: wholeIn(given.atOnce, SHARED_LIMITS[key].atOnce, out[key].atOnce),
      villagePerDay: wholeIn(given.villagePerDay, [1, 6], out[key].villagePerDay),
      maxPerWeek: wholeIn(given.maxPerWeek, SHARED_LIMITS[key].maxPerWeek, out[key].maxPerWeek),
    };
  }
  out.music.maxPerWeek = Math.max(out.music.maxPerWeek, out.musicPerWeek);
  out.athleticsMinPerWeek = Math.min(out.athleticsMinPerWeek, out.athletics.maxPerWeek);
  out.acMinPerWeek = Math.min(out.acMinPerWeek, out.ac.maxPerWeek);
  return JSON.stringify(out) === JSON.stringify(STARTING_CORE) ? null : out;
}

/** Accepts whatever was saved or uploaded and returns valid visit settings. Null when they come out as the default. */
export function normalizeVisits(raw: unknown): VisitSettings | null {
  const g = raw as Partial<VisitSettings> | null;
  if (!g || typeof g !== 'object') return null;
  const out: VisitSettings = {
    free: Array.isArray(g.free) ? [...new Set(g.free.map(String))].sort() : defaultVisits().free,
    lastWeekSlack: typeof g.lastWeekSlack === 'boolean' ? g.lastWeekSlack : false,
  };
  const same = JSON.stringify({ ...out, free: [...out.free].sort() }) === JSON.stringify({ ...STARTING_VISITS, free: [...STARTING_VISITS.free].sort() });
  return same ? null : out;
}

/** The most league periods a week for one village under these settings. */
export const leagueMostOf = (s: Settings, v: string): number => Math.max(leagueOf(s, v), coreOf(s).leagueMaxByVillage[v] ?? coreOf(s).leagueMaxPerWeek);
/** League periods a week for one village under these settings. */
export const leagueOf = (s: Settings, v: string): number => coreOf(s).leagueByVillage[v] ?? coreOf(s).leaguePerWeek;

/** These settings with the core numbers, or the visit settings, changed. What comes out as the default is not kept. */
export function withCore(s: Settings, core: CoreSettings): Settings {
  const { core: _old, ...rest } = s;
  const next = normalizeCore(core);
  return next ? { ...rest, core: next } : rest;
}
export function withVisits(s: Settings, visits: VisitSettings): Settings {
  const { visits: _old, ...rest } = s;
  const next = normalizeVisits(visits);
  return next ? { ...rest, visits: next } : rest;
}
/** Must bunks that share this area be on the same visit number? */
export const sameVisitIn = (s: Settings, area: string): boolean => !visitsOf(s).free.includes(area);
/** These settings with the same-visit rule switched on or off for one area. */
export function withSameVisit(s: Settings, area: string, required: boolean): Settings {
  const v = visitsOf(s);
  const free = v.free.filter((a) => a !== area);
  return withVisits(s, { ...v, free: required ? free : [...free, area] });
}

/** The sharing the app starts with, read once before anything changes it. */
const STARTING_SHARING: Sharing = JSON.parse(JSON.stringify(SHARING)) as Sharing;
export const defaultSharing = (): Sharing => JSON.parse(JSON.stringify(STARTING_SHARING)) as Sharing;
/** The sharing these settings use: their own, or the default. */
export const sharingOf = (s: Settings): Sharing => s.sharing ?? defaultSharing();

/** Accepts whatever was saved or uploaded and returns valid sharing. Null when it comes out as the default. */
export function normalizeSharing(raw: unknown): Sharing | null {
  const out = defaultSharing();
  const g = raw as Partial<Sharing> | null;
  if (!g || typeof g !== 'object') return null;
  if (g.within === 'next' || g.within === 'village') out.within = g.within;
  if (typeof g.across === 'boolean') out.across = g.across;
  if (g.grades === 'same' || g.grades === 'one' || g.grades === 'any') out.grades = g.grades;
  if (g.pairs && typeof g.pairs === 'object') {
    for (const [key, may] of Object.entries(g.pairs)) {
      const [x, y] = key.split('|').map((n) => n.trim());
      if (x && y && x !== y && typeof may === 'boolean') out.pairs[pairKey(x, y)] = may;
    }
  }
  return JSON.stringify(out) === JSON.stringify(STARTING_SHARING) ? null : out;
}

/** The program areas that come with the app and have settings, in the order they are shown. */
export const SETTING_AREAS = ['Judaics', 'Israel Education', 'Teva', 'Ceramics', 'Yoga', 'Dance'];
/** Every area these settings cover: the ones that come with the app, then the ones that were added. */
export const settingAreas = (s: Settings): string[] => [...SETTING_AREAS, ...(s.custom ?? [])];
/** The most program areas that can be added. */
export const MAX_ADDED_AREAS = 6;
/** What a new program area starts with, until the person adding it says otherwise. */
export const NEW_AREA: AreaSettings = { min: 2, max: 2, atOnce: 1, villagePerDay: 2 };

/** A name as it will be kept: trimmed, single spaces, without the characters a spreadsheet tab cannot have. */
export const cleanAreaName = (name: string): string => name.replace(/[\\/?*[\]:,]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 24);

/** Why this name cannot be added, or null when it can. */
export function whyNotAdd(s: Settings, name: string): string | null {
  const clean = cleanAreaName(name);
  if (!clean) return 'Give the program area a name.';
  if (isBuiltInName(clean)) return `"${clean}" is already an activity.`;
  if ((s.custom ?? []).some((c) => c.toLowerCase() === clean.toLowerCase())) return `"${clean}" has already been added.`;
  if ((s.custom ?? []).length >= MAX_ADDED_AREAS) return `No more than ${MAX_ADDED_AREAS} program areas can be added.`;
  return null;
}

/** These settings with a program area added (unchanged when the name cannot be used) or removed. */
export function addArea(s: Settings, name: string, area: AreaSettings = NEW_AREA): Settings {
  if (whyNotAdd(s, name)) return s;
  const clean = cleanAreaName(name);
  return normalizeSettings({ ...s, areas: { ...s.areas, [clean]: area }, custom: [...(s.custom ?? []), clean] });
}
export function removeArea(s: Settings, name: string): Settings {
  const areas = { ...s.areas };
  delete areas[name];
  return normalizeSettings({ ...s, areas, custom: (s.custom ?? []).filter((c) => c !== name) });
}
/** The areas that went from one bunk at a time to two (settings version 2). */
const OPENED_UP = ['Judaics', 'Yoga'];
/** The village key in DANCE_TARGETS that stands for a village not listed there. */
const OTHER = '*';

/** What config.ts holds when the app starts, read once before anything changes it. */
const STARTING: Settings = readConfig();

function readConfig(): Settings {
  const areas: Record<string, AreaSettings> = {};
  for (const area of SETTING_AREAS) {
    const dance = area === 'Dance';
    const min = dance ? DANCE_TARGETS[OTHER] : SESSION_TARGETS[area];
    const byCampers = CAMPER_CAP[area] !== undefined; // the check reads such an area as about two bunks at a time
    areas[area] = { min, max: Math.max(min, SESSION_FILLER_MAX[area] ?? min), atOnce: byCampers ? 2 : SLOT_CAP[area], villagePerDay: byCampers ? 3 : DAY_CAP[area], ...(AREA_CAMPERS[area] !== undefined ? { campers: AREA_CAMPERS[area] } : {}) };
    if (dance) {
      const villages = { ...DANCE_TARGETS };
      delete villages[OTHER];
      areas[area].villages = villages;
    } else if (AREA_BY_VILLAGE[area]) {
      areas[area].villages = { ...AREA_BY_VILLAGE[area] };
    }
  }
  return { areas, v: SETTINGS_VERSION };
}

/** The settings the app starts with: a fresh copy each time, safe to change. */
export const defaultSettings = (): Settings => JSON.parse(JSON.stringify(STARTING)) as Settings;

const whole = (v: unknown, least: number, most: number, fallback: number): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(most, Math.max(least, Math.round(n))) : fallback;
};

/** Core numbers saved before settings version 4: the app's old 2 bunks of a village a day follow the app to 3. */
function broughtUp(core: unknown, saved: number, oldSecond = false): unknown {
  if (saved >= 6 || !core || typeof core !== 'object') return core;
  if (saved === 5) {
    // version 6: Mohawk's exactly 3 league follows the app to 2 with a third when there is room, and Session 2's seven hobby sessions to six
    const six = JSON.parse(JSON.stringify(core)) as Record<string, unknown> & { leagueByVillage?: Record<string, number>; leagueMaxByVillage?: Record<string, number> };
    if (JSON.stringify(six.leagueByVillage ?? {}) === JSON.stringify({ M: 3 }) && Object.keys(six.leagueMaxByVillage ?? {}).length === 0) Object.assign(six, { leagueByVillage: {}, leagueMaxByVillage: { M: 3 } });
    if (Number(six.ropesBunksAlways) === 3 && Number(six.hobbySessions) === 7) six.hobbySessions = 6;
    return six;
  }
  const five = JSON.parse(JSON.stringify(core)) as Record<string, unknown> & { ac?: Partial<SharedNumbers>; leagueByVillage?: Record<string, number> };
  // version 5: the app's old starting numbers follow the app to the ones from the study
  const move = (key: string, was: number, now: number) => {
    if (Number(five[key]) === was) five[key] = now;
  };
  // Session 2 as it started before version 5 had ropes once: it is twice now, with three bunks together. Its Time with UH stays 1 to 3.
  if (oldSecond) Object.assign(five, { ropesPerSession: 2, ropesBunksAlways: 3, ...(Number(five.hobbySessions) === 7 ? { hobbySessions: 6 } : {}) });
  else if (Number(five.uhMin) === 1 && Number(five.uhMax) === 3) Object.assign(five, { uhMin: 2, uhMax: 4 });
  move('ropesMaxCampers', 30, 25);
  move('yogaMaxCampers', 20, 16);
  move('poolMaxCampers', 80, 75);
  if (Number(five.leaguePerWeek) === 3 && Object.keys(five.leagueByVillage ?? {}).length === 0) Object.assign(five, { leaguePerWeek: 2, leagueByVillage: {}, leagueMaxByVillage: { M: 3 } });
  if (five.ac && Number(five.ac.atOnce) === 3) five.ac.atOnce = 2;
  if (saved >= 4) return five;
  const out = five as Record<string, Partial<SharedNumbers> | undefined>;
  for (const key of ['athletics', 'ac', 'music', 'uh']) {
    const n = out[key];
    if (!n || typeof n !== 'object') continue;
    if (Number(n.villagePerDay) < 3) n.villagePerDay = 3;
  }
  return out;
}

/** Accepts whatever was saved or uploaded and returns valid settings: anything missing or out of range falls back to the default. */
export function normalizeSettings(raw: unknown): Settings {
  const out = defaultSettings();
  const given = (raw as { areas?: Record<string, Partial<AreaSettings>> } | null)?.areas;
  if (!given || typeof given !== 'object') return out;
  const saved = Number((raw as { v?: unknown }).v ?? 1);
  const older = saved < 2;
  // Added areas: the ones listed, or (a spreadsheet has no list) every area that does not come with the app.
  const listed = (raw as { custom?: unknown }).custom;
  const names = Array.isArray(listed) ? listed.map(String) : Object.keys(given).filter((k) => !SETTING_AREAS.includes(k));
  for (const name of names) {
    const g = given[name];
    const clean = cleanAreaName(name);
    if (!g || typeof g !== 'object' || whyNotAdd(out, clean)) continue;
    const min = whole(g.min, 0, 12, NEW_AREA.min);
    const campers = whole(g.campers, 0, 200, 0);
    out.areas[clean] = { min, max: Math.max(min, whole(g.max, 0, 12, min)), atOnce: whole(g.atOnce, 1, 2, NEW_AREA.atOnce), villagePerDay: whole(g.villagePerDay, 1, 6, NEW_AREA.villagePerDay), ...(campers > 0 ? { campers } : {}) };
    out.custom = [...(out.custom ?? []), clean];
  }
  const sharing = normalizeSharing((raw as { sharing?: unknown }).sharing);
  if (sharing) out.sharing = sharing;
  const givenCore = (raw as { core?: { yogaMaxCampers?: unknown; ropesPerSession?: unknown } | null }).core;
  // Session 2's own starting settings from before version 5: ropes once, and Tusc starting on High Ropes
  const startHigh = (raw as { ropesStartHigh?: unknown }).ropesStartHigh;
  const oldSecond = saved < 5 && !!givenCore && Number(givenCore.ropesPerSession) === 1 && Array.isArray(startHigh) && startHigh.map(String).includes('T');
  // saved while Yoga started at 22 campers: that was the app's number, not a choice, so it follows the app to 20
  const core = normalizeCore(broughtUp(saved < 3 && givenCore && Number(givenCore.yogaMaxCampers) === OLD_YOGA_CAMPERS ? { ...givenCore, yogaMaxCampers: defaultCore().yogaMaxCampers } : givenCore, saved, oldSecond));
  if (core) out.core = core;
  const visits = normalizeVisits((raw as { visits?: unknown }).visits);
  if (visits) out.visits = visits;
  const calendar = normalizeCalendar((raw as { calendar?: unknown }).calendar);
  if (calendar) out.calendar = calendar;
  const byVillage = (raw as { villageTargets?: unknown }).villageTargets;
  if (byVillage && typeof byVillage === 'object') {
    const kept: Record<string, Record<string, number>> = {};
    for (const [area, villages] of Object.entries(byVillage as Record<string, unknown>)) {
      if (!villages || typeof villages !== 'object') continue;
      for (const [v, n] of Object.entries(villages as Record<string, unknown>)) {
        const letter = v.trim().charAt(0).toUpperCase();
        if (letter && Number.isFinite(Number(n))) (kept[area] ??= {})[letter] = Math.max(0, Math.min(12, Math.round(Number(n))));
      }
    }
    // an area that is now set village by village on the page: its saved numbers move there
    for (const area of Object.keys(kept)) {
      const villages = out.areas[area]?.villages;
      if (!villages) continue;
      Object.assign(villages, kept[area]);
      delete kept[area];
    }
    if (Object.keys(kept).length) out.villageTargets = kept;
  }
  const high = (raw as { ropesStartHigh?: unknown }).ropesStartHigh;
  if (Array.isArray(high) && high.length) out.ropesStartHigh = [...new Set(high.map((v) => String(v).trim().charAt(0).toUpperCase()).filter(Boolean))].sort();
  for (const area of SETTING_AREAS) {
    const g = given[area];
    if (!g || typeof g !== 'object') continue;
    const d = out.areas[area];
    // saved under the app's old numbers for this area: they follow the app to the new ones
    const old = saved < 4 ? OLD_NUMBERS[area] : saved < 5 && !(oldSecond && area === 'Teva') ? OLD_NUMBERS_4[area] : undefined; // Session 2's Teva is 1 to 3 still
    if (!(old && Number(g.min) === old.min && Number(g.max) === old.max)) {
      d.min = whole(g.min, 0, 12, d.min);
      d.max = Math.max(d.min, whole(g.max, 0, 12, d.max));
    }
    d.atOnce = whole(g.atOnce, 1, 2, d.atOnce);
    d.villagePerDay = whole(g.villagePerDay, 1, 6, d.villagePerDay);
    // saved before two bunks could be at Judaics or Yoga together: the old one and one become the new two and two
    if (older && OPENED_UP.includes(area) && d.atOnce === 1 && d.villagePerDay === 1) Object.assign(d, { atOnce: 2, villagePerDay: 2 });
    if (saved < 4 && d.villagePerDay < 3) d.villagePerDay = 3; // the app's old 2 (1 for Ceramics) follows the app to 3
    // a camper limit: one that is saved is kept (0 is "none"); a file from before there were any takes the app's
    if (g.campers !== undefined && saved >= 5) {
      // 0 is "no limit in campers", and is kept as a 0 where the app starts with a limit
      const campers = whole(g.campers, 0, 200, d.campers ?? 0);
      if (campers > 0 || d.campers !== undefined) d.campers = campers;
    }
    const sameAsOld = (v: unknown): boolean => JSON.stringify(Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, n]) => [k.trim().charAt(0).toUpperCase(), Number(n)]).sort())) === (oldSecond ? OLD_CERAMICS_4_SECOND : OLD_CERAMICS_4);
    if (saved < 5 && area === 'Ceramics' && g.villages && typeof g.villages === 'object' && sameAsOld(g.villages)) continue; // the app's old numbers follow the app
    if (d.villages && g.villages && typeof g.villages === 'object') {
      const villages: Record<string, number> = {};
      for (const [letter, n] of Object.entries(g.villages)) {
        const key = letter.trim().charAt(0).toUpperCase();
        if (key) villages[key] = whole(n, 0, 12, d.villages[key] ?? d.min);
      }
      d.villages = villages;
    }
    if (d.villages && g.villagesMax && typeof g.villagesMax === 'object') {
      const most: Record<string, number> = {};
      for (const [letter, n] of Object.entries(g.villagesMax)) {
        const key = letter.trim().charAt(0).toUpperCase();
        const own = d.villages[key] ?? d.min;
        const top = whole(n, 0, 12, own);
        if (key && top > own) most[key] = top;
      }
      if (Object.keys(most).length) d.villagesMax = most;
    }
  }
  return out;
}

/** These settings with the sharing changed. Sharing that comes out as the default is not kept. */
export function withSharing(s: Settings, sharing: Sharing): Settings {
  const { sharing: _old, ...rest } = s;
  const next = normalizeSharing(sharing);
  return next ? { ...rest, sharing: next } : rest;
}

/**
 * These settings with one pair on the grid switched: `may` is what the pair should be from now on, and `basic` is what the
 * three basic choices alone give it. A pair that matches the basic choices is not kept as a change.
 */
export function withPair(s: Settings, x: string, y: string, may: boolean, basic: boolean): Settings {
  const sharing = sharingOf(s);
  const pairs = { ...sharing.pairs };
  if (may === basic) delete pairs[pairKey(x, y)];
  else pairs[pairKey(x, y)] = may;
  return withSharing(s, { ...sharing, pairs });
}

/** The rarer areas that come with the app, and the added areas that are in force right now. */
const BUILT_IN_RARE = [...RARE_AREAS];
let inForce: string[] = [];

const replace = (target: Record<string, number>, next: Record<string, number>): void => {
  for (const key of Object.keys(target)) delete target[key];
  Object.assign(target, next);
};

/**
 * Make these the settings the generator and the rule checker work with. The numbers in config.ts are what both read, so
 * they are overwritten in place. Call it before generating or checking; with nothing given it puts the defaults back.
 */
export function applySettings(settings?: Settings | null): void {
  const s = normalizeSettings(settings ?? null);
  const filler: Record<string, number> = {};
  const hardMax: Record<string, number> = {};
  const byVillage: Record<string, Record<string, number>> = {};
  const campersNow: Record<string, number> = {};
  const villageMost: Record<string, Record<string, number>> = {};
  // the added areas: each is an activity of its own, planned as single periods like the rarer areas that come with the app
  const custom = s.custom ?? [];
  for (const old of inForce) {
    delete SESSION_TARGETS[old];
    delete SLOT_CAP[old];
    delete DAY_CAP[old];
    delete TOKEN_LABEL[old];
  }
  inForce = [...custom];
  setCustomAreas(custom);
  TOKEN_AREAS.length = 0;
  TOKEN_AREAS.push(...BUILT_IN_TOKEN_AREAS, ...custom);
  RARE_AREAS.length = 0;
  RARE_AREAS.push(...BUILT_IN_RARE, ...custom);
  for (const name of custom) TOKEN_LABEL[name] = name;
  resetSharedAreas();
  resetAreaBits();
  for (const area of settingAreas(s)) {
    const a = s.areas[area];
    if (a.villages && area === 'Dance') {
      replace(DANCE_TARGETS, { ...a.villages, [OTHER]: a.min });
      hardMax[area] = Math.max(a.min, ...Object.values(a.villages), ...Object.values(a.villagesMax ?? {}));
    } else if (a.villages) {
      // set village by village, exactly: a village not listed gets the plain number
      SESSION_TARGETS[area] = a.min;
      byVillage[area] = { ...a.villages };
      hardMax[area] = Math.max(a.min, ...Object.values(a.villages), ...Object.values(a.villagesMax ?? {}));
    } else {
      SESSION_TARGETS[area] = a.min;
      if (a.max > a.min) filler[area] = a.max;
      hardMax[area] = a.max;
    }
    if (a.villagesMax) villageMost[area] = { ...a.villagesMax };
    if (a.campers) campersNow[area] = a.campers;
    // an area that goes by campers is not held to a number of bunks
    SLOT_CAP[area] = CAMPER_CAP[area] !== undefined ? BY_CAMPERS_SLOT_CAP : a.atOnce;
    DAY_CAP[area] = CAMPER_CAP[area] !== undefined ? BY_CAMPERS_DAY_CAP : a.villagePerDay;
  }
  replace(AREA_CAMPERS, campersNow);
  for (const key of Object.keys(VILLAGE_FILLER_MAX)) delete VILLAGE_FILLER_MAX[key];
  Object.assign(VILLAGE_FILLER_MAX, villageMost);
  replace(SESSION_FILLER_MAX, filler);
  replace(SESSION_HARD_MAX, hardMax);
  // Waterfront, league, the pool, Music, Time with UH, Athletics and A&C
  const core = coreOf(s);
  setWeekly({ waterfront: core.waterfrontPerWeek, league: core.leaguePerWeek, music: core.musicPerWeek, poolMax: core.poolMaxPerWeek, uhMax: core.uhMax });
  replace(LEAGUE_BY_VILLAGE, core.leagueByVillage);
  setWeeklyMost(core.waterfrontMaxPerWeek, core.leagueMaxPerWeek);
  replace(LEAGUE_MAX_BY_VILLAGE, core.leagueMaxByVillage);
  replace(WEEK_BLOCK_MIN, { Athletics: core.athleticsMinPerWeek, 'A&C': core.acMinPerWeek });
  SESSION_TARGETS['TW UH'] = core.uhMin;
  SESSION_TARGETS.Ropes = core.ropesPerSession;
  setRopesMax(core.ropesMaxCampers, core.ropesBunksAlways);
  CAMPER_CAP.Yoga = core.yogaMaxCampers;
  CAMPER_CAP.Ceramics = core.ceramicsMaxCampers;
  CALENDAR.hobbySessions = core.hobbySessions;
  CALENDAR.shabbatPrep = core.shabbatPrep;
  CALENDAR.shabbatPrepExtra = core.shabbatPrepExtra;
  setShabbat(core.shabbatWeeks);
  setPool(core.poolLessons, core.poolMaxCampers);
  // the pool: a weekly swim for the villages that have one, and a swim for each week of the session for the others
  for (const v of Object.keys(POOL_TARGETS)) {
    const start = STARTING_POOL[v];
    POOL_TARGETS[v] = start.perWeek !== undefined ? { perWeek: core.poolPerWeek } : { perSession: (start.perSession ?? 0) * core.poolPerWeek };
  }
  for (const key of Object.keys(SHARED_AREA_OF) as (keyof typeof SHARED_AREA_OF)[]) {
    const area = SHARED_AREA_OF[key];
    SLOT_CAP[area] = core[key].atOnce;
    DAY_CAP[area] = core[key].villagePerDay;
    if (key !== 'uh') WEEK_BLOCK_MAX[area] = core[key].maxPerWeek;
  }
  rememberDayCaps();
  SESSION_CALENDAR.events = s.calendar ?? null;
  for (const key of Object.keys(VILLAGE_TARGETS)) delete VILLAGE_TARGETS[key];
  Object.assign(VILLAGE_TARGETS, JSON.parse(JSON.stringify(s.villageTargets ?? {})));
  for (const [area, villages] of Object.entries(byVillage)) VILLAGE_TARGETS[area] = { ...(VILLAGE_TARGETS[area] ?? {}), ...villages };
  ROPES_START_HIGH.length = 0;
  ROPES_START_HIGH.push(...(s.ropesStartHigh ?? []));
  const visits = visitsOf(s);
  VISIT.free = [...visits.free];
  VISIT.lastWeekSlack = visits.lastWeekSlack;
  const sharing = sharingOf(s);
  SHARING.within = sharing.within;
  SHARING.across = sharing.across;
  SHARING.grades = sharing.grades;
  SHARING.pairs = { ...sharing.pairs };
}

/** The settings a session starts with: the app's own, with the template's numbers put in. */
export function templateSettings(template: SessionTemplate): Settings {
  const s = defaultSettings();
  for (const [area, n] of Object.entries(template.numbers ?? {})) {
    const a = s.areas[area];
    if (!a) continue;
    if (n.min !== undefined) a.min = n.min;
    a.max = Math.max(a.min, n.max ?? Math.min(a.max, a.min));
    if (n.villages && a.villages) a.villages = { ...n.villages };
  }
  const core = template.core ? { ...defaultCore(), ...template.core } : undefined;
  return normalizeSettings({ ...s, ...(core ? { core } : {}), villageTargets: template.villageTargets, ropesStartHigh: template.ropesStartHigh });
}

/** Does some village have six bunks or more? The usual numbers then leave too few places. */
export const bigVillageIn = (names: readonly string[]): string | undefined => {
  const count: Record<string, number> = {};
  for (const name of names) {
    const v = name.trim().charAt(0).toUpperCase();
    if (v && !/^TC\s*\d*$/i.test(name.trim())) count[v] = (count[v] ?? 0) + 1;
  }
  return Object.keys(count).find((v) => count[v] >= 6);
};
/** Are the settings for big villages in use? */
export function usesBigVillageSettings(s: Settings): boolean {
  const core = coreOf(s);
  return core.athletics.villagePerDay >= 3 && core.ac.villagePerDay >= 3 && s.areas.Ceramics.atOnce >= 2 && sharingOf(s).within === 'village' && settingAreas(s).every((a) => s.areas[a].villagePerDay >= 3);
}
/**
 * The settings a camp with six bunks in a village needs (measured: with 27 bunks the usual numbers did not come out, and
 * these did): 3 bunks of a village a day everywhere, and any two bunks of a
 * village within a grade may share, not only the ones next to each other. Offered, never applied unasked.
 */
export function withBigVillageSettings(s: Settings): Settings {
  const core = coreOf(s);
  const areas: Record<string, AreaSettings> = {};
  for (const a of Object.keys(s.areas)) areas[a] = { ...s.areas[a], villagePerDay: Math.max(3, s.areas[a].villagePerDay), ...(a === 'Ceramics' ? { atOnce: 2 } : {}) };
  const shared = (n: SharedNumbers, atOnce = n.atOnce): SharedNumbers => ({ ...n, atOnce, villagePerDay: Math.max(3, n.villagePerDay) });
  const next = withCore({ ...s, areas }, { ...core, athletics: shared(core.athletics), ac: shared(core.ac), music: shared(core.music), uh: shared(core.uh) });
  return withSharing(next, { ...sharingOf(next), within: 'village' });
}

/** Are these the default settings? */
export const isDefaultSettings = (s: Settings | null | undefined): boolean => JSON.stringify(normalizeSettings(s ?? null)) === JSON.stringify(STARTING);
