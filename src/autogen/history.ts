import { villageOf } from '../autofill';
import { PERIODS_PER_DAY, SLOT_COUNT, areaOf } from '../config';
import type { Schedule, WeeksState } from '../types';

export const SLOTS = SLOT_COUNT;
export const dayOf = (slot: number): number => Math.floor(slot / PERIODS_PER_DAY);
export const periodOf = (slot: number): number => slot % PERIODS_PER_DAY;
export const slotAt = (day: number, period: number): number => day * PERIODS_PER_DAY + period;
export const halfOfPeriod = (period: number): number => (period < 2 ? 0 : 1);
/** The two slots of a half-day (half 0 is periods 1-2, half 1 is periods 3-4). */
export const halfSlots = (day: number, half: number): [number, number] => [slotAt(day, half * 2), slotAt(day, half * 2 + 1)];

export interface Block {
  day: number;
  start: number;
  len: number;
  label: string;
  area: string | null;
}

/** Runs of the same label within one day. A double period is one block, and nothing merges across days. */
export function blocksOf(slots: readonly string[]): Block[] {
  const out: Block[] = [];
  for (let day = 0; day < SLOTS / PERIODS_PER_DAY; day++) {
    let p = 0;
    while (p < PERIODS_PER_DAY) {
      const s = slotAt(day, p);
      const label = slots[s] ?? '';
      if (!label) {
        p++;
        continue;
      }
      let len = 1;
      while (p + len < PERIODS_PER_DAY && slots[slotAt(day, p + len)] === label) len++;
      out.push({ day, start: s, len, label, area: areaOf(label) });
      p += len;
    }
  }
  return out;
}

export const isFilledWeek = (s: Schedule | null): s is Schedule => !!s && s.bunks.length > 0;

/** Other loaded, non-empty weeks, with their 1-based week numbers. */
export function otherWeeks(weeks: WeeksState, weekIndex: number): { week: number; schedule: Schedule }[] {
  const out: { week: number; schedule: Schedule }[] = [];
  weeks.weeks.forEach((s, i) => {
    if (i + 1 !== weekIndex && isFilledWeek(s)) out.push({ week: i + 1, schedule: s });
  });
  return out;
}

export interface BunkHistory {
  /** Blocks per program area in weeks before this one: the base for ordinals. */
  earlier: Record<string, number>;
  /** Blocks per program area in weeks after this one (they still count toward how much a bunk needs). */
  later: Record<string, number>;
}

const bump = (rec: Record<string, number>, key: string, by = 1) => {
  rec[key] = (rec[key] ?? 0) + by;
};

/** Match bunks across weeks by name and count their blocks per program area. */
export function buildHistory(weeks: WeeksState, weekIndex: number, names: string[]): BunkHistory[] {
  const hist: BunkHistory[] = names.map(() => ({ earlier: {}, later: {} }));
  for (const { week, schedule } of otherWeeks(weeks, weekIndex)) {
    const byName = new Map<string, string[]>();
    for (const b of schedule.bunks) if (b.name.trim()) byName.set(b.name.trim(), b.slots);
    names.forEach((name, i) => {
      const slots = byName.get(name);
      if (!name || !slots) return;
      for (const blk of blocksOf(slots)) {
        if (blk.area) bump(week < weekIndex ? hist[i].earlier : hist[i].later, blk.area);
      }
    });
  }
  return hist;
}

/** For each village letter, in how many other weeks did any of its bunks have this label? */
export function villageWeeksWithLabel(weeks: WeeksState, weekIndex: number, label: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const { schedule } of otherWeeks(weeks, weekIndex)) {
    const seen = new Set<string>();
    for (const b of schedule.bunks) if (b.slots.includes(label)) seen.add(villageOf(b.name));
    for (const v of seen) out[v] = (out[v] ?? 0) + 1;
  }
  return out;
}
