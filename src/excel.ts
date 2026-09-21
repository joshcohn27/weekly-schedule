import * as XLSX from 'xlsx';
import { DAYS, PERIODS_PER_DAY, SLOT_COUNT } from './config';
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

/** One week's workbook: its own tab (re-imported on upload) plus a read-only Tracking tab. */
export function buildWeekWorkbook(schedule: Schedule, weekNumber: number): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, buildWeekSheet(schedule), weekSheetName(weekNumber));
  XLSX.utils.book_append_sheet(wb, trackingSheetFromResult(computeTracking(schedule.bunks)), 'Tracking');
  return wb;
}

/** One workbook covering every loaded week, each on its own "Week N" tab, plus a session Tracking tab. */
export function buildAllWeeksWorkbook(weeks: (Schedule | null)[]): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const loadedWeeks: Schedule[] = [];

  weeks.forEach((schedule, i) => {
    if (!schedule || schedule.bunks.length === 0) return;
    loadedWeeks.push(schedule);
    XLSX.utils.book_append_sheet(wb, buildWeekSheet(schedule), weekSheetName(i + 1));
  });

  XLSX.utils.book_append_sheet(wb, trackingSheetFromResult(computeSessionTracking(loadedWeeks)), 'Whole Session Tracking');
  return wb;
}

export function downloadWeek(schedule: Schedule, weekNumber: number): void {
  XLSX.writeFile(buildWeekWorkbook(schedule, weekNumber), `${weekSheetName(weekNumber)}.xlsx`);
}

export function downloadAllWeeks(weeks: (Schedule | null)[]): void {
  XLSX.writeFile(buildAllWeeksWorkbook(weeks), 'all-weeks.xlsx');
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

export async function readUploadedFile(file: File): Promise<ParsedUpload[]> {
  const data = await file.arrayBuffer();
  const wb = XLSX.read(data, { type: 'array' });
  return parseUploadedWorkbook(wb);
}
