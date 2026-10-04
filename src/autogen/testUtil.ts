import { emptySchedule, newBunk } from '../sample';
import type { Schedule, WeeksState } from '../types';
import { generateWeek, isBad, type AutoGenResult, type SessionWeeks } from './index';
import { blocksOf, halfSlots, slotAt } from './history';

/** Same bunks, all activities blank. */
export const blankCopy = (s: Schedule): Schedule => ({
  bunks: s.bunks.map((b) => ({ ...b, id: b.id, slots: Array<string>(24).fill('') })),
  days: s.days.map((d) => ({ ...d })),
});

/**
 * A blank week with its trips entered the way a person would before generating: Tusc's mini bike trip in week 2 and its
 * three-day trip in the last week of a 4-week session, and a Tiyul for O (week 2), C and S (week 3) and M (week 4, or 2).
 */
export function weekWithTrips(roster: Schedule, week: number, sessionWeeks: SessionWeeks = 4): Schedule {
  const s = blankCopy(roster);
  const set = (letter: string, slots: number[], label: string) => {
    for (const b of s.bunks) if (b.name.startsWith(letter)) for (const x of slots) b.slots[x] = label;
  };
  const overnight = [...halfSlots(1, 1), ...halfSlots(2, 0)];
  if (week === 2) {
    set('T', [...halfSlots(4, 1)], 'Bike Trip');
    set('O', [...halfSlots(2, 1)], 'Tiyul');
    if (sessionWeeks === 3) set('M', overnight, 'Tiyul');
  }
  if (week === 3) {
    set('C', [...halfSlots(2, 1)], 'Tiyul');
    set('S', overnight, 'Tiyul');
  }
  if (week === 4 && sessionWeeks === 4) {
    set('T', [0, 1, 2].flatMap((day) => [0, 1, 2, 3].map((p) => slotAt(day, p))), 'Bike Trip');
    set('M', [...halfSlots(2, 1), ...halfSlots(3, 0)], 'Tiyul');
  }
  return s;
}

export interface SessionRun {
  weeks: WeeksState;
  results: AutoGenResult[];
  ms: number[];
  warnings: string[];
}

/**
 * Enter the trips for every week, then generate weeks 1..sessionWeeks in order, each building around its trips and reading the
 * others. A week that does not come out good is generated again with a new seed, up to `tries` times, the way the app does
 * (the app also redoes the week before; this does not). `ms` is the time of the try that was kept.
 */
export function runSession(roster: Schedule, seed: number, sessionWeeks: SessionWeeks = 4, maxMs = 20_000, tries = 8): SessionRun {
  const weeks: WeeksState = { current: 0, weeks: [null, null, null, null] };
  for (let w = 1; w <= sessionWeeks; w++) weeks.weeks[w - 1] = weekWithTrips(roster, w, sessionWeeks);
  const results: AutoGenResult[] = [];
  const ms: number[] = [];
  for (let w = 1; w <= sessionWeeks; w++) {
    let t0 = performance.now();
    let res = generateWeek({ weeks, weekIndex: w, mode: 'fill-empty', sessionWeeks, seed: seed * 101 + w, maxMs });
    for (let k = 1; k < tries && isBad(res.quality); k++) {
      t0 = performance.now();
      res = generateWeek({ weeks, weekIndex: w, mode: 'fill-empty', sessionWeeks, seed: seed * 101 + w + k * 104729, maxMs });
    }
    ms.push(performance.now() - t0);
    weeks.weeks[w - 1] = res.schedule;
    results.push(res);
  }
  return { weeks, results, ms, warnings: results.flatMap((r) => r.warnings) };
}

/** Blocks of a program area a bunk has across all loaded weeks. */
export function sessionBlocks(weeks: WeeksState, name: string, area: string): number {
  let n = 0;
  for (const s of weeks.weeks) {
    const b = s?.bunks.find((x) => x.name === name);
    if (b) n += blocksOf(b.slots).filter((k) => k.area === area).length;
  }
  return n;
}

/** A roster with the given number of bunks per village letter, one grade per bunk stepping up. */
export function rosterOf(counts: Record<string, number>, grade?: (letter: string, i: number) => string): Schedule {
  const s = emptySchedule();
  for (const [letter, k] of Object.entries(counts)) {
    for (let i = 1; i <= k; i++) s.bunks.push(newBunk(`${letter}${i}`, grade ? grade(letter, i) : `${4 + i}th`, String(10 + (i % 4))));
  }
  return s;
}
