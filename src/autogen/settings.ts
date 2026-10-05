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
  VISIT,
  WEEK_BLOCK_MAX,
  setWeekly,
  weekly,
  type Sharing,
} from './config';
import { pairKey } from './roster';
import { BUILT_IN_TOKEN_AREAS, TOKEN_AREAS, TOKEN_LABEL } from './planner';
import { resetSharedAreas } from './share';
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
}

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
  waterfrontPerWeek: number;
  leaguePerWeek: number;
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
  waterfrontPerWeek: [0, 3],
  leaguePerWeek: [0, 3],
  poolMaxPerWeek: [1, 2],
  musicPerWeek: [0, 1],
  uhMin: [0, 3],
  uhMax: [0, 6],
} as const;
/** [bunks at once: least, most], then the most times a week, for each shared area. */
const SHARED_LIMITS: Record<'athletics' | 'ac' | 'music' | 'uh', { atOnce: [number, number]; maxPerWeek: [number, number] }> = {
  athletics: { atOnce: [1, 4], maxPerWeek: [0, 3] },
  ac: { atOnce: [1, 3], maxPerWeek: [0, 3] },
  music: { atOnce: [1, 2], maxPerWeek: [1, 2] },
  uh: { atOnce: [1, 2], maxPerWeek: [0, 0] },
};
/** The program area each shared entry stands for. */
const SHARED_AREA_OF = { athletics: 'Athletics', ac: 'A&C', music: 'Music', uh: 'TW UH' } as const;

function readCore(): CoreSettings {
  const w = weekly();
  const shared = (key: keyof typeof SHARED_AREA_OF): SharedNumbers => {
    const area = SHARED_AREA_OF[key];
    return { atOnce: SLOT_CAP[area], villagePerDay: DAY_CAP[area], maxPerWeek: WEEK_BLOCK_MAX[area] ?? 0 };
  };
  return {
    waterfrontPerWeek: w.waterfront,
    leaguePerWeek: w.league,
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
/** The village key in DANCE_TARGETS that stands for a village not listed there. */
const OTHER = '*';

/** What config.ts holds when the app starts, read once before anything changes it. */
const STARTING: Settings = readConfig();

function readConfig(): Settings {
  const areas: Record<string, AreaSettings> = {};
  for (const area of SETTING_AREAS) {
    const dance = area === 'Dance';
    const min = dance ? DANCE_TARGETS[OTHER] : SESSION_TARGETS[area];
    areas[area] = { min, max: Math.max(min, SESSION_FILLER_MAX[area] ?? min), atOnce: SLOT_CAP[area], villagePerDay: DAY_CAP[area] };
    if (dance) {
      const villages = { ...DANCE_TARGETS };
      delete villages[OTHER];
      areas[area].villages = villages;
    }
  }
  return { areas };
}

/** The settings the app starts with: a fresh copy each time, safe to change. */
export const defaultSettings = (): Settings => JSON.parse(JSON.stringify(STARTING)) as Settings;

const whole = (v: unknown, least: number, most: number, fallback: number): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(most, Math.max(least, Math.round(n))) : fallback;
};

/** Accepts whatever was saved or uploaded and returns valid settings: anything missing or out of range falls back to the default. */
export function normalizeSettings(raw: unknown): Settings {
  const out = defaultSettings();
  const given = (raw as { areas?: Record<string, Partial<AreaSettings>> } | null)?.areas;
  if (!given || typeof given !== 'object') return out;
  // Added areas: the ones listed, or (a spreadsheet has no list) every area that does not come with the app.
  const listed = (raw as { custom?: unknown }).custom;
  const names = Array.isArray(listed) ? listed.map(String) : Object.keys(given).filter((k) => !SETTING_AREAS.includes(k));
  for (const name of names) {
    const g = given[name];
    const clean = cleanAreaName(name);
    if (!g || typeof g !== 'object' || whyNotAdd(out, clean)) continue;
    const min = whole(g.min, 0, 12, NEW_AREA.min);
    out.areas[clean] = { min, max: Math.max(min, whole(g.max, 0, 12, min)), atOnce: whole(g.atOnce, 1, 2, NEW_AREA.atOnce), villagePerDay: whole(g.villagePerDay, 1, 6, NEW_AREA.villagePerDay) };
    out.custom = [...(out.custom ?? []), clean];
  }
  const sharing = normalizeSharing((raw as { sharing?: unknown }).sharing);
  if (sharing) out.sharing = sharing;
  const core = normalizeCore((raw as { core?: unknown }).core);
  if (core) out.core = core;
  const visits = normalizeVisits((raw as { visits?: unknown }).visits);
  if (visits) out.visits = visits;
  for (const area of SETTING_AREAS) {
    const g = given[area];
    if (!g || typeof g !== 'object') continue;
    const d = out.areas[area];
    d.min = whole(g.min, 0, 12, d.min);
    d.max = Math.max(d.min, whole(g.max, 0, 12, d.max));
    d.atOnce = whole(g.atOnce, 1, 2, d.atOnce);
    d.villagePerDay = whole(g.villagePerDay, 1, 6, d.villagePerDay);
    if (d.villages && g.villages && typeof g.villages === 'object') {
      const villages: Record<string, number> = {};
      for (const [letter, n] of Object.entries(g.villages)) {
        const key = letter.trim().charAt(0).toUpperCase();
        if (key) villages[key] = whole(n, 0, 12, d.villages[key] ?? d.min);
      }
      d.villages = villages;
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
    if (a.villages) {
      replace(DANCE_TARGETS, { ...a.villages, [OTHER]: a.min });
      hardMax[area] = Math.max(a.min, ...Object.values(a.villages));
    } else {
      SESSION_TARGETS[area] = a.min;
      if (a.max > a.min) filler[area] = a.max;
      hardMax[area] = a.max;
    }
    SLOT_CAP[area] = a.atOnce;
    DAY_CAP[area] = a.villagePerDay;
  }
  replace(SESSION_FILLER_MAX, filler);
  replace(SESSION_HARD_MAX, hardMax);
  // Waterfront, league, the pool, Music, Time with UH, Athletics and A&C
  const core = coreOf(s);
  setWeekly({ waterfront: core.waterfrontPerWeek, league: core.leaguePerWeek, music: core.musicPerWeek, poolMax: core.poolMaxPerWeek, uhMax: core.uhMax });
  SESSION_TARGETS['TW UH'] = core.uhMin;
  for (const key of Object.keys(SHARED_AREA_OF) as (keyof typeof SHARED_AREA_OF)[]) {
    const area = SHARED_AREA_OF[key];
    SLOT_CAP[area] = core[key].atOnce;
    DAY_CAP[area] = core[key].villagePerDay;
    if (key !== 'uh') WEEK_BLOCK_MAX[area] = core[key].maxPerWeek;
  }
  const visits = visitsOf(s);
  VISIT.free = [...visits.free];
  VISIT.lastWeekSlack = visits.lastWeekSlack;
  const sharing = sharingOf(s);
  SHARING.within = sharing.within;
  SHARING.across = sharing.across;
  SHARING.grades = sharing.grades;
  SHARING.pairs = { ...sharing.pairs };
}

/** Are these the default settings? */
export const isDefaultSettings = (s: Settings | null | undefined): boolean => JSON.stringify(normalizeSettings(s ?? null)) === JSON.stringify(STARTING);
