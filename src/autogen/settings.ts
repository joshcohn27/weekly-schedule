import { isBuiltInName, setCustomAreas } from '../config';
import { DANCE_TARGETS, DAY_CAP, RARE_AREAS, SESSION_FILLER_MAX, SESSION_HARD_MAX, SESSION_TARGETS, SHARING, SLOT_CAP, type Sharing } from './config';
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
  const sharing = sharingOf(s);
  SHARING.within = sharing.within;
  SHARING.across = sharing.across;
  SHARING.grades = sharing.grades;
  SHARING.pairs = { ...sharing.pairs };
}

/** Are these the default settings? */
export const isDefaultSettings = (s: Settings | null | undefined): boolean => JSON.stringify(normalizeSettings(s ?? null)) === JSON.stringify(STARTING);
