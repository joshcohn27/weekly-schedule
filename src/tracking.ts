import { AREAS, areaOf } from './config';
import { computeBlocks } from './merge';
import type { Bunk, Schedule } from './types';

export interface TrackingRow {
  bunk: Bunk;
  counts: number[]; // same order as `areas`
  total: number;
}

export interface TrackingResult {
  areas: string[];
  rows: TrackingRow[];
  totals: number[];
  grandTotal: number;
}

/**
 * How many times each bunk has each program area.
 * A merged block counts once for every bunk it covers, so a double period counts once
 * and a block shared by three bunks counts once for each of them.
 */
export function computeTracking(bunks: Bunk[]): TrackingResult {
  const areas = AREAS;
  const counts = bunks.map(() => areas.map(() => 0));

  for (const block of computeBlocks(bunks)) {
    if (!block.label) continue;
    const area = areaOf(block.label);
    if (area === null) continue;
    const col = areas.indexOf(area);
    if (col < 0) continue;
    for (let r = block.row; r < block.row + block.rowSpan; r++) counts[r][col]++;
  }

  const rows = bunks.map((bunk, i) => ({
    bunk,
    counts: counts[i],
    total: counts[i].reduce((sum, n) => sum + n, 0),
  }));
  const totals = areas.map((_, col) => rows.reduce((sum, r) => sum + r.counts[col], 0));
  return { areas, rows, totals, grandTotal: totals.reduce((sum, n) => sum + n, 0) };
}

/**
 * Tracking totals across every loaded week, one row per bunk name.
 * A bunk named the same in several weeks (the usual case) is summed into a single row.
 */
export function computeSessionTracking(schedules: Schedule[]): TrackingResult {
  const areas = AREAS;
  const byName = new Map<string, TrackingRow>();

  for (const schedule of schedules) {
    for (const row of computeTracking(schedule.bunks).rows) {
      const key = row.bunk.name.trim() || row.bunk.id;
      const existing = byName.get(key);
      if (existing) {
        existing.counts = existing.counts.map((n, i) => n + row.counts[i]);
        existing.total += row.total;
      } else {
        byName.set(key, { bunk: row.bunk, counts: [...row.counts], total: row.total });
      }
    }
  }

  const rows = [...byName.values()];
  const totals = areas.map((_, col) => rows.reduce((sum, r) => sum + r.counts[col], 0));
  return { areas, rows, totals, grandTotal: totals.reduce((sum, n) => sum + n, 0) };
}
