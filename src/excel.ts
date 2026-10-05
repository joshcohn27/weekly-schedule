import * as XLSX from 'xlsx';
import { coreOf, defaultCore, defaultSettings, normalizeSettings, settingAreas, sharingOf, visitsOf, type CoreSettings, type Settings } from './autogen/settings';
import { DAYS, PERIODS_PER_DAY, SLOT_COUNT } from './config';
import { specialistRows, specialistSchedules, specialistSheetName } from './specialist';
import { normalize } from './storage';
import { computeSessionTracking, computeTracking, type TrackingResult } from './tracking';
import type { DayInfo, Schedule } from './types';

const SLOT_HEADERS = DAYS.flatMap((d) =>
  Array.from({ length: PERIODS_PER_DAY }, (_, p) => `${d.slice(0, 3)} P${p + 1}`),
);

const DAY_FIELDS: { key: keyof DayInfo; label: string }[] = [
  { key: 'rhLod', label: 'RH & LOD' },
  { key: 'ts', label: 'TS' },
  { key: 'generalDay', label: 'General Day' },
  { key: 'dod', label: 'DOD' },
  { key: 'birthdays', label: 'Birthdays' },
  { key: 'evp', label: 'EVP' },
  { key: 'notes', label: 'Notes' },
];

const weekSheetName = (weekNumber: number): string => `Week ${weekNumber}`;
const WEEK_SHEET_RE = /^Week (\d+)$/;

/** One tab per week: the bunk/schedule grid, then a blank row, then the day-info block. */
function buildWeekSheet(schedule: Schedule): XLSX.WorkSheet {
  const rows: unknown[][] = [
    ['Bunk', 'Grades', 'Count', ...SLOT_HEADERS],
    ...schedule.bunks.map((b) => [b.name, b.grades, b.count, ...b.slots]),
    [],
    ['Field', ...DAYS],
    ...DAY_FIELDS.map(({ key, label }) => [label, ...schedule.days.map((d) => d[key])]),
  ];
  return XLSX.utils.aoa_to_sheet(rows);
}

/** Reads a week tab built by buildWeekSheet back into a Schedule. */
function parseWeekSheet(sheet: XLSX.WorkSheet): Schedule | null {
  // raw: false reads each cell as the text Excel shows, so a count typed as a number ("12") isn't dropped.
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false });
  const fieldRowIndex = rows.findIndex((row) => row[0] === 'Field');
  const scheduleRows = fieldRowIndex === -1 ? rows : rows.slice(0, fieldRowIndex);
  if (scheduleRows.length === 0 || scheduleRows[0][0] !== 'Bunk') return null;

  const bunks = scheduleRows
    .slice(1)
    .filter((row) => row.length > 0)
    .map((row) => ({
      name: row[0],
      grades: row[1],
      count: row[2],
      slots: row.slice(3, 3 + SLOT_COUNT),
    }));

  let days: unknown[] = [];
  if (fieldRowIndex !== -1) {
    const daysRows = rows.slice(fieldRowIndex);
    const byField = new Map(daysRows.slice(1).map((row) => [row[0], row.slice(1)]));
    days = DAYS.map((_, i) => {
      const day: Record<string, unknown> = {};
      for (const { key, label } of DAY_FIELDS) day[key] = byField.get(label)?.[i] ?? '';
      return day;
    });
  }

  return normalize({ bunks, days });
}

function trackingSheetFromResult(result: TrackingResult): XLSX.WorkSheet {
  const rows = [
    ['Bunk', ...result.areas, 'Total'],
    ...result.rows.map((r) => [r.bunk.name, ...r.counts, r.total]),
    ['All bunks', ...result.totals, result.grandTotal],
  ];
  return XLSX.utils.aoa_to_sheet(rows);
}

const SETTINGS_SHEET = 'Settings';
const SETTINGS_HEADER = ['Program area', 'Times per session: at least', 'At most', 'Bunks at once', 'Bunks of one village in a day', 'By village'];

/** The Settings tab: one row per program area. "By village" reads "O 3, S 3, C 2" for an area that is set village by village. */
function buildSettingsSheet(settings: Settings): XLSX.WorkSheet {
  const rows = settingAreas(settings).map((area) => {
    const a = settings.areas[area];
    const byVillage = a.villages ? Object.entries(a.villages).map(([v, n]) => `${v} ${n}`).join(', ') : '';
    return [area, a.min, a.max, a.atOnce, a.villagePerDay, byVillage];
  });
  const sheet = XLSX.utils.aoa_to_sheet([SETTINGS_HEADER, ...rows]);
  sheet['!cols'] = [{ wch: 18 }, { wch: 26 }, { wch: 9 }, { wch: 14 }, { wch: 28 }, { wch: 28 }];
  return sheet;
}

/** Reads the Settings tab back. Null when the workbook has none; anything missing or odd in it falls back to the default. */
export function parseSettingsSheet(wb: XLSX.WorkBook): Settings | null {
  const sheet = wb.Sheets[SETTINGS_SHEET];
  if (!sheet) return null;
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false });
  const areas: Record<string, unknown> = {};
  for (const row of rows.slice(1)) {
    const villages: Record<string, number> = {};
    for (const part of String(row[5] ?? '').split(',')) {
      const match = part.trim().match(/^(\S+)\s+(\d+)$/);
      if (match) villages[match[1]] = Number(match[2]);
    }
    areas[String(row[0] ?? '')] = { min: row[1], max: row[2], atOnce: row[3], villagePerDay: row[4], ...(Object.keys(villages).length ? { villages } : {}) };
  }
  return normalizeSettings({ areas, sharing: parseSharingSheet(wb), ...parseMainSheet(wb) });
}

const SHARING_SHEET = 'Sharing';
const WITHIN_TEXT: Record<string, string> = { next: 'only the bunk next to it in the list', village: 'any bunk of the village' };
const GRADES_TEXT: Record<string, string> = { same: 'the same grade', one: 'within one grade', any: 'any grades' };
const keyOf = (texts: Record<string, string>, value: unknown): string | undefined => Object.keys(texts).find((k) => texts[k] === value || k === value);

/** The Sharing tab: the three basic choices, then every pair that was changed by hand on the grid. */
function buildSharingSheet(settings: Settings): XLSX.WorkSheet {
  const s = sharingOf(settings);
  const sheet = XLSX.utils.aoa_to_sheet([
    ['Who may share a period', ''],
    ['Inside a village', WITHIN_TEXT[s.within]],
    ['Paired villages (O with C, S with M)', s.across ? 'may mix' : 'never mix'],
    ['Grades', GRADES_TEXT[s.grades]],
    [],
    ['Bunk', 'Bunk', 'Changed by hand to'],
    ...Object.entries(s.pairs).map(([key, may]) => [...key.split('|'), may ? 'may share' : 'may not share']),
  ]);
  sheet['!cols'] = [{ wch: 36 }, { wch: 36 }, { wch: 20 }];
  return sheet;
}

function parseSharingSheet(wb: XLSX.WorkBook): unknown {
  const sheet = wb.Sheets[SHARING_SHEET];
  if (!sheet) return undefined;
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false });
  const pairs: Record<string, boolean> = {};
  const start = rows.findIndex((r) => r[0] === 'Bunk' && r[1] === 'Bunk');
  if (start >= 0) for (const r of rows.slice(start + 1)) if (r[0] && r[1]) pairs[`${String(r[0]).trim()}|${String(r[1]).trim()}`] = r[2] === 'may share';
  return { within: keyOf(WITHIN_TEXT, rows[1]?.[1]), across: rows[2]?.[1] !== 'never mix', grades: keyOf(GRADES_TEXT, rows[3]?.[1]), pairs };
}

const MAIN_SHEET = 'Main areas';
const ANY_VISIT = 'Any visit number will do at';
const LAST_WEEK = 'One visit apart in the last week';
type SharedKey = 'athletics' | 'ac' | 'music' | 'uh';
const SHARED_NAMES: [SharedKey, string][] = [
  ['athletics', 'Athletics'],
  ['ac', 'A&C'],
  ['music', 'Music'],
  ['uh', 'Time with UH'],
];
/** Every number on the Main areas tab: its label, and how to read it from and write it to the settings. */
const MAIN_ROWS: { label: string; get: (c: CoreSettings) => number; set: (c: CoreSettings, n: unknown) => void }[] = [
  { label: 'Waterfront, times a week', get: (c) => c.waterfrontPerWeek, set: (c, n) => (c.waterfrontPerWeek = n as number) },
  { label: 'League, times a week', get: (c) => c.leaguePerWeek, set: (c, n) => (c.leaguePerWeek = n as number) },
  { label: 'Pool, at most a week', get: (c) => c.poolMaxPerWeek, set: (c, n) => (c.poolMaxPerWeek = n as number) },
  { label: 'Music, times a week', get: (c) => c.musicPerWeek, set: (c, n) => (c.musicPerWeek = n as number) },
  { label: 'Time with UH, at least a session', get: (c) => c.uhMin, set: (c, n) => (c.uhMin = n as number) },
  { label: 'Time with UH, at most a session', get: (c) => c.uhMax, set: (c, n) => (c.uhMax = n as number) },
  ...SHARED_NAMES.flatMap(([key, name]) => [
    ...(key === 'uh' ? [] : [{ label: `${name}, at most a week`, get: (c: CoreSettings) => c[key].maxPerWeek, set: (c: CoreSettings, n: unknown) => (c[key].maxPerWeek = n as number) }]),
    { label: `${name}, bunks at once`, get: (c: CoreSettings) => c[key].atOnce, set: (c: CoreSettings, n: unknown) => (c[key].atOnce = n as number) },
    { label: `${name}, bunks of one village in a day`, get: (c: CoreSettings) => c[key].villagePerDay, set: (c: CoreSettings, n: unknown) => (c[key].villagePerDay = n as number) },
  ]),
];

/** The Main areas tab: the numbers for Waterfront, league, the pool, Athletics, A&C, Music and Time with UH, and the visit rules. */
function buildMainSheet(settings: Settings): XLSX.WorkSheet {
  const core = coreOf(settings);
  const visits = visitsOf(settings);
  const sheet = XLSX.utils.aoa_to_sheet([
    ['Setting', 'Value'],
    ...MAIN_ROWS.map((r) => [r.label, r.get(core)]),
    [ANY_VISIT, visits.free.join(', ')],
    [LAST_WEEK, visits.lastWeekSlack ? 'yes' : 'no'],
  ]);
  sheet['!cols'] = [{ wch: 46 }, { wch: 28 }];
  return sheet;
}

function parseMainSheet(wb: XLSX.WorkBook): { core?: unknown; visits?: unknown } {
  const sheet = wb.Sheets[MAIN_SHEET];
  if (!sheet) return {};
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false });
  const value = new Map(rows.map((r) => [String(r[0] ?? ''), r[1]]));
  const core = defaultCore();
  for (const row of MAIN_ROWS) if (value.has(row.label)) row.set(core, value.get(row.label));
  const free = String(value.get(ANY_VISIT) ?? '').split(',').map((a) => a.trim()).filter(Boolean);
  return { core, visits: value.has(ANY_VISIT) ? { free, lastWeekSlack: value.get(LAST_WEEK) === 'yes' } : undefined };
}

/** One week's workbook: its own tab (re-imported on upload), a read-only Tracking tab, and the Settings, Main areas and Sharing tabs. */
export function buildWeekWorkbook(schedule: Schedule, weekNumber: number, settings: Settings = defaultSettings()): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, buildWeekSheet(schedule), weekSheetName(weekNumber));
  XLSX.utils.book_append_sheet(wb, trackingSheetFromResult(computeTracking(schedule.bunks)), 'Tracking');
  XLSX.utils.book_append_sheet(wb, buildSettingsSheet(settings), SETTINGS_SHEET);
  XLSX.utils.book_append_sheet(wb, buildMainSheet(settings), MAIN_SHEET);
  XLSX.utils.book_append_sheet(wb, buildSharingSheet(settings), SHARING_SHEET);
  return wb;
}

/** One workbook covering every loaded week, each on its own "Week N" tab, plus a session Tracking tab and the Settings tab. */
export function buildAllWeeksWorkbook(weeks: (Schedule | null)[], settings: Settings = defaultSettings()): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const loadedWeeks: Schedule[] = [];

  weeks.forEach((schedule, i) => {
    if (!schedule || schedule.bunks.length === 0) return;
    loadedWeeks.push(schedule);
    XLSX.utils.book_append_sheet(wb, buildWeekSheet(schedule), weekSheetName(i + 1));
  });

  XLSX.utils.book_append_sheet(wb, trackingSheetFromResult(computeSessionTracking(loadedWeeks)), 'Whole Session Tracking');
  XLSX.utils.book_append_sheet(wb, buildSettingsSheet(settings), SETTINGS_SHEET);
  XLSX.utils.book_append_sheet(wb, buildMainSheet(settings), MAIN_SHEET);
  XLSX.utils.book_append_sheet(wb, buildSharingSheet(settings), SHARING_SHEET);
  return wb;
}

/**
 * The session from each specialist's side: one tab per program area, with a grid for each week (days across, periods
 * down) that says which bunks come, which visit it is for them, and how many campers. Read-only: an upload ignores these tabs.
 */
export function buildSpecialistWorkbook(weeks: (Schedule | null)[]): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  for (const s of specialistSchedules(weeks)) {
    const sheet = XLSX.utils.aoa_to_sheet(specialistRows(s, weeks));
    sheet['!cols'] = [{ wch: 10 }, ...DAYS.map(() => ({ wch: 34 }))];
    XLSX.utils.book_append_sheet(wb, sheet, specialistSheetName(s.area));
  }
  if (wb.SheetNames.length === 0) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Nothing is scheduled yet.']]), 'Specialists');
  return wb;
}

export function downloadSpecialists(weeks: (Schedule | null)[]): void {
  XLSX.writeFile(buildSpecialistWorkbook(weeks), 'specialist-schedules.xlsx');
}

export function downloadWeek(schedule: Schedule, weekNumber: number, settings?: Settings): void {
  XLSX.writeFile(buildWeekWorkbook(schedule, weekNumber, settings), `${weekSheetName(weekNumber)}.xlsx`);
}

export function downloadAllWeeks(weeks: (Schedule | null)[], settings?: Settings): void {
  XLSX.writeFile(buildAllWeeksWorkbook(weeks, settings), 'all-weeks.xlsx');
}

export interface ParsedUpload {
  /** 1-based week number, exactly as encoded in the "Week N" tab name. */
  weekNumber: number;
  schedule: Schedule;
}

/**
 * Generic upload: reads every "Week N" tab in the workbook, however many there are.
 * Works the same whether the file came from "Download Week N" (one tab) or
 * "Download all weeks" (one tab per week). Non-week tabs (e.g. Tracking) are ignored.
 */
export function parseUploadedWorkbook(wb: XLSX.WorkBook): ParsedUpload[] {
  const out: ParsedUpload[] = [];
  for (const name of wb.SheetNames) {
    const match = name.match(WEEK_SHEET_RE);
    if (!match) continue;
    const schedule = parseWeekSheet(wb.Sheets[name]);
    if (schedule) out.push({ weekNumber: Number(match[1]), schedule });
  }
  return out.sort((a, b) => a.weekNumber - b.weekNumber);
}

/** The weeks in an uploaded file, and the settings it carries (null when it has no Settings tab). */
export async function readUploadedFile(file: File): Promise<{ weeks: ParsedUpload[]; settings: Settings | null }> {
  const data = await file.arrayBuffer();
  const wb = XLSX.read(data, { type: 'array' });
  return { weeks: parseUploadedWorkbook(wb), settings: parseSettingsSheet(wb) };
}
