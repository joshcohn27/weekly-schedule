import { isGuest } from '../autofill';
import { areaOf } from '../config';
import type { Schedule, WeeksState } from '../types';
import { VILLAGE_LEVEL_LABELS, type SessionWeeks } from './config';
import { dayOf } from './history';
import { validateWeek, type Violation } from './validate';

/** How many ways of emptying a period are tried each time round. */
const TRY_AT_ONCE = 24;
/** What an emptied period may be given back: single periods, the common ones first. */
const REFILL = ['Athletics', 'A&C', 'Music', 'Time with UH', 'Teva', 'Dance', 'Israel', 'Yoga', 'Ceramics', 'Judaics'];
/** Rules about too many bunks in one place: emptying one period may leave the group still too big. */
const CROWD_RULES = ['H13', 'H14', 'H15', 'H10'];
/** The most times round: a week is never far from clean when it gets here. */
const MAX_PASSES = 80;

/**
 * A week that ran out of time with a rule still broken is handed back clean instead: the periods that break a rule are
 * emptied, as few as it takes, and left marked (yellow) for a person to fill. Nothing that was on the week before it was
 * generated is touched: the calendar and whatever was entered by hand stay. What comes back has nothing in it that breaks
 * a rule. A period that was emptied is given another activity where one fits, so only the periods nothing fits in are left
 * empty; the week may still be short of something it should have.
 *
 * `weeks` is the session with this week in its place, `before` is the week as it was before generating.
 */
export function tidyWeek(schedule: Schedule, before: Schedule | null, weeks: WeeksState, weekIndex: number, sessionWeeks: SessionWeeks): Schedule {
  const was = new Map((before?.bunks ?? []).map((b) => [b.name.trim(), b.slots]));
  const locked = schedule.bunks.map((b) => b.slots.map((_, s) => (was.get(b.name.trim())?.[s] ?? '') !== ''));
  const grid = schedule.bunks.map((b) => [...b.slots]);
  const village = schedule.bunks.map((b) => (isGuest(b.name) ? `guest ${b.name}` : b.name.trim().charAt(0).toUpperCase()));
  const index = new Map(schedule.bunks.map((b, i) => [b.name.trim(), i]));
  const emptied = schedule.bunks.map(() => new Set<number>());

  const state = (): WeeksState => ({
    ...weeks,
    weeks: weeks.weeks.map((w, i) => (i === weekIndex - 1 ? { ...schedule, bunks: schedule.bunks.map((b, k) => ({ ...b, slots: grid[k] })) } : w)),
  });
  // an empty period is what this leaves behind on purpose, so it does not count against the week here
  // (what was there before counts in full here: a bunk put next to one that was entered by hand is still one too many)
  const broken = (): Violation[] => validateWeek(state(), weekIndex, sessionWeeks).filter((v) => v.rule !== 'H1');

  /** The whole block a cell belongs to (a double period goes together), for the whole village when it is a village block. */
  const unitOf = (b: number, s: number): [number, number][] => {
    const label = grid[b][s];
    if (!label) return [];
    const bunks = VILLAGE_LEVEL_LABELS.includes(label) ? grid.map((_, k) => k).filter((k) => village[k] === village[b] && grid[k][s] === label) : [b];
    const cells: [number, number][] = [];
    for (const k of bunks) {
      let from = s;
      let to = s;
      while (from % 4 > 0 && grid[k][from - 1] === label) from--;
      while (to % 4 < 3 && grid[k][to + 1] === label) to++;
      for (let x = from; x <= to; x++) cells.push([k, x]);
    }
    return cells.some(([k, x]) => locked[k][x]) ? [] : cells;
  };

  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const now = broken();
    if (now.length === 0) break;
    // Take the breaks one at a time. For each, the periods that could be the cause: the one it names, the others at the
    // same area in that period or on that day, or every period of the bunk it names. The first break that emptying
    // something makes better is dealt with; a break that nothing here can mend (something that is missing, not something
    // that is wrong) is left.
    let done = false;
    for (const v of now) {
      const seen = new Set<string>();
      const units: [number, number][][] = [];
      const offer = (b: number, s: number) => {
        const unit = unitOf(b, s);
        const key = unit.map(([k, x]) => `${k}:${x}`).sort().join(' ');
        if (unit.length === 0 || seen.has(key)) return;
        seen.add(key);
        units.push(unit);
      };
      const b = v.bunk === undefined ? undefined : index.get(v.bunk);
      if (b !== undefined && v.slot !== undefined) {
        offer(b, v.slot);
        const area = areaOf(grid[b][v.slot]);
        const day = dayOf(v.slot);
        // the others in that period: at the same area, or (when the bunk named has nothing there) whoever is there
        for (let k = 0; k < grid.length; k++) if (k !== b && (area ? areaOf(grid[k][v.slot]) === area : village[k] === village[b])) offer(k, v.slot);
        // a rule about the day (twice in a day, two days running, a village's day limit) may be about any period of it
        for (let s = day * 4; s < day * 4 + 4; s++) if (area && areaOf(grid[b][s]) === area) offer(b, s);
      } else if (b !== undefined) {
        for (let s = 0; s < grid[b].length; s++) offer(b, s);
      } else if (v.slot !== undefined) {
        for (let k = 0; k < grid.length; k++) offer(k, v.slot);
      }
      let best: { unit: [number, number][]; left: number } | null = null;
      for (const unit of units.slice(0, TRY_AT_ONCE)) {
        const saved = unit.map(([k, x]) => grid[k][x]);
        for (const [k, x] of unit) grid[k][x] = '';
        const left = broken().length;
        unit.forEach(([k, x], i) => (grid[k][x] = saved[i]));
        if (!best || left < best.left || (left === best.left && unit.length < best.unit.length)) best = { unit, left };
      }
      // too many in one place may take more than one emptying before the count of breaks drops
      const crowd = CROWD_RULES.includes(v.rule) && !!best && best.left === now.length;
      if (!best || (best.left >= now.length && !crowd)) continue; // emptying does not help this one
      for (const [k, x] of best.unit) {
        grid[k][x] = '';
        emptied[k].add(x);
      }
      done = true;
      break;
    }
    if (!done) break;
  }

  // Then put something back in each period that was emptied, where anything fits: the first single-period activity that
  // breaks no rule there. What is left empty after this has nothing that fits, and is marked for a person to fill.
  let left = broken().length;
  for (let k = 0; k < grid.length; k++) {
    for (const x of [...emptied[k]].sort((a, b) => a - b)) {
      if (grid[k][x] !== '') continue;
      // rotate the list by bunk and period, so the same activity is not tried first everywhere
      const from = (k * 7 + x) % REFILL.length;
      for (let i = 0; i < REFILL.length; i++) {
        grid[k][x] = REFILL[(from + i) % REFILL.length];
        const now = broken().length;
        if (now <= left) {
          left = now;
          break;
        }
        grid[k][x] = '';
      }
    }
  }

  return {
    ...schedule,
    bunks: schedule.bunks.map((b, k) => {
      if (emptied[k].size === 0) return b;
      const cleared = [...new Set([...(b.cleared ?? []), ...emptied[k]])].filter((s) => grid[k][s] === '').sort((x, y) => x - y);
      return { ...b, slots: grid[k], cleared };
    }),
  };
}
