import { ACTIVITIES, areaOf } from '../config';
import type { WeeksState } from '../types';
import {
  ORDINAL_EXEMPT_LABELS,
  POOL_MAX_CAMPERS,
  POOL_YOUNG_MAX_CAMPERS,
  SHABBAT_ROTATION,
  TIYUL_WEEKS,
  VILLAGE_LEVEL_LABELS,
  type SessionWeeks,
} from './config';
import { SLOTS, blocksOf, buildHistory, dayOf, halfSlots, isFilledWeek, ordinalAt, periodOf, slotAt, villageWeeksWithLabel } from './history';
import { buildRoster, related } from './roster';

export type Rule = 'H1' | 'H2' | 'H3' | 'H4' | 'H5' | 'H6' | 'H7' | 'H8' | 'H9' | 'H10' | 'H11' | 'H12';

export interface Violation {
  rule: Rule;
  message: string;
  bunk?: string;
  slot?: number;
}

export interface ValidateOptions {
  /** Cells to leave alone (they were already filled before generating), indexed [bunk][slot]. */
  locked?: boolean[][];
}

const ACTIVITY_LABELS = new Set(ACTIVITIES.map((a) => a.label));
const POOL_LABELS = ['Pool', 'Swim Test', 'Tusc Triathlon Training'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const where = (slot: number): string => `${DAY_NAMES[dayOf(slot)]} period ${periodOf(slot) + 1}`;

/** Check one week against the hard rules H1 to H12. An empty list means the week is valid. */
export function validateWeek(weeks: WeeksState, weekIndex: number, sessionWeeks: SessionWeeks, opts: ValidateOptions = {}): Violation[] {
  const schedule = weeks.weeks[weekIndex - 1];
  if (!isFilledWeek(schedule)) return [];

  const roster = buildRoster(schedule.bunks);
  const hist = buildHistory(weeks, weekIndex, roster.names);
  const grid = schedule.bunks.map((b) => b.slots);
  const n = roster.n;
  const locked = (b: number, s: number): boolean => !!opts.locked?.[b]?.[s];
  const lockedAny = (b: number, start: number, len: number): boolean => {
    for (let k = 0; k < len; k++) if (locked(b, start + k)) return true;
    return false;
  };
  const out: Violation[] = [];
  const add = (rule: Rule, message: string, bunk?: number, slot?: number) =>
    out.push({ rule, message, bunk: bunk === undefined ? undefined : roster.names[bunk], slot });

  const lastWeek = sessionWeeks === 4 && weekIndex === 4;

  // H1: every period filled (Friday of the last week of a 4-week session stays empty)
  for (let b = 0; b < n; b++) {
    for (let s = 0; s < SLOTS; s++) {
      if (grid[b][s] === '' && !(lastWeek && dayOf(s) === 5)) add('H1', `${roster.names[b]} has nothing on ${where(s)}.`, b, s);
    }
  }

  // H2: no program area twice on one day (Bike Trip days are exempt)
  for (let b = 0; b < n; b++) {
    const blocks = blocksOf(grid[b]);
    for (let day = 0; day < 6; day++) {
      const today = blocks.filter((k) => k.day === day);
      if (today.some((k) => k.label === 'Bike Trip')) continue;
      const seen = new Map<string, number>();
      for (const k of today) {
        if (!k.area || lockedAny(b, k.start, k.len)) continue;
        seen.set(k.area, (seen.get(k.area) ?? 0) + 1);
      }
      for (const [area, count] of seen) if (count > 1) add('H2', `${roster.names[b]} has ${area} ${count} times on ${DAY_NAMES[day]}.`, b, slotAt(day, 0));
    }
  }

  // H3: village-level blocks cover every bunk of the village at once
  for (const label of VILLAGE_LEVEL_LABELS) {
    for (const v of roster.villages) {
      const members = roster.byVillage[v];
      for (let s = 0; s < SLOTS; s++) {
        const has = members.filter((b) => grid[b][s] === label);
        if (has.length === 0 || has.length === members.length) continue;
        const missing = members.filter((b) => grid[b][s] !== label && !locked(b, s));
        if (missing.length > 0 && has.some((b) => !locked(b, s))) {
          add('H3', `${label} on ${where(s)} covers only part of village ${v || '(no letter)'}.`, missing[0], s);
        }
      }
    }
  }

  // H4: Waterfront is a double period on periods 1-2 or 3-4, one village per half-day
  for (let b = 0; b < n; b++) {
    for (const k of blocksOf(grid[b])) {
      if (k.label !== 'Waterfront' || lockedAny(b, k.start, k.len)) continue;
      if (k.len !== 2 || periodOf(k.start) % 2 !== 0) add('H4', `${roster.names[b]} has a misaligned Waterfront on ${where(k.start)}.`, b, k.start);
    }
  }
  for (let day = 0; day < 6; day++) {
    for (const half of [0, 1]) {
      const villagesHere = new Set<string>();
      for (const s of halfSlots(day, half)) for (let b = 0; b < n; b++) if (grid[b][s] === 'Waterfront') villagesHere.add(roster.village[b]);
      if (villagesHere.size > 1) add('H4', `More than one village at Waterfront on ${DAY_NAMES[day]} ${half === 0 ? 'morning' : 'afternoon'}.`, undefined, slotAt(day, half * 2));
    }
  }

  // H5: bunks that share a slot and an area, in the same village or S with M, must be on the same ordinal
  for (let s = 0; s < SLOTS; s++) {
    for (let i = 0; i < n; i++) {
      const li = grid[i][s];
      if (!li || !areaOf(li) || ORDINAL_EXEMPT_LABELS.includes(li)) continue;
      for (let j = i + 1; j < n; j++) {
        const lj = grid[j][s];
        if (!lj || areaOf(lj) !== areaOf(li) || ORDINAL_EXEMPT_LABELS.includes(lj) || !related(roster, i, j)) continue;
        if (locked(i, s) || locked(j, s)) continue;
        const oi = ordinalAt(grid[i], hist[i].earlier, s);
        const oj = ordinalAt(grid[j], hist[j].earlier, s);
        if (oi !== oj) add('H5', `${roster.names[i]} (time ${oi}) and ${roster.names[j]} (time ${oj}) share ${areaOf(li)} on ${where(s)}.`, i, s);
      }
    }
  }

  // H6: Ropes are double periods, low first then high, and never more than two per session
  for (let b = 0; b < n; b++) {
    let total = (hist[b].earlier.Ropes ?? 0) + (hist[b].later.Ropes ?? 0);
    for (const k of blocksOf(grid[b])) {
      if (k.area !== 'Ropes') continue;
      total++;
      if (lockedAny(b, k.start, k.len)) continue;
      if (k.len !== 2 || periodOf(k.start) % 2 !== 0) add('H6', `${roster.names[b]} has ropes that are not a double period on ${where(k.start)}.`, b, k.start);
      const ord = ordinalAt(grid[b], hist[b].earlier, k.start) ?? 1;
      const expected = ord === 1 ? 'Low Ropes' : 'High Ropes';
      if (k.label !== expected) add('H6', `${roster.names[b]}'s time ${ord} at ropes should be ${expected}.`, b, k.start);
    }
    if (total > 2) add('H6', `${roster.names[b]} has ${total} ropes blocks in the session.`, b);
  }

  // H7: Judaics and Israel at most twice per bunk per session
  for (let b = 0; b < n; b++) {
    for (const area of ['Judaics', 'Israel Education']) {
      const total = (hist[b].earlier[area] ?? 0) + (hist[b].later[area] ?? 0) + blocksOf(grid[b]).filter((k) => k.area === area).length;
      if (total > 2) add('H7', `${roster.names[b]} has ${area} ${total} times in the session.`, b);
    }
  }

  // H8: Shabbat Prep and Tiyul once per village per session, following the calendar
  for (const label of ['Shabbat Prep', 'Tiyul']) {
    const elsewhere = villageWeeksWithLabel(weeks, weekIndex, label);
    for (const v of roster.villages) {
      const members = roster.byVillage[v];
      const hereWeek = members.some((b) => grid[b].includes(label));
      if (hereWeek && (elsewhere[v] ?? 0) > 0) add('H8', `Village ${v} has ${label} in more than one week.`, members[0]);
      if (label === 'Tiyul' && hereWeek && !(TIYUL_WEEKS[sessionWeeks][v] ?? []).includes(weekIndex)) add('H8', `Village ${v} has Tiyul in a week that is not on its calendar.`, members[0]);
    }
  }
  const rotation = SHABBAT_ROTATION[sessionWeeks][weekIndex] ?? [];
  for (const v of roster.villages) {
    const members = roster.byVillage[v];
    const has = members.some((b) => grid[b].includes('Shabbat Prep'));
    const coversFriday = (b: number): boolean =>
      (grid[b][slotAt(5, 2)] === 'Shabbat Prep' && grid[b][slotAt(5, 3)] === 'Shabbat Prep') || lockedAny(b, slotAt(5, 2), 2);
    if (rotation.includes(v) && !members.every(coversFriday)) add('H8', `Village ${v} should have Shabbat Prep on Friday afternoon this week.`, members[0]);
    if (has && !rotation.includes(v)) add('H8', `Village ${v} has Shabbat Prep in a week that is not on its calendar.`, members[0]);
  }

  // H9: triathlon training only where nobody else is at the pool
  for (let s = 0; s < SLOTS; s++) {
    const tri = grid.some((g) => g[s] === 'Tusc Triathlon Training');
    if (tri && grid.some((g) => g[s] === 'Pool' || g[s] === 'Swim Test')) add('H9', `Triathlon training shares ${where(s)} with the pool.`, undefined, s);
  }

  // H10: pool capacity
  for (let s = 0; s < SLOTS; s++) {
    const at = [] as number[];
    for (let b = 0; b < n; b++) if (POOL_LABELS.includes(grid[b][s])) at.push(b);
    if (at.length === 0) continue;
    const total = at.reduce((sum, b) => sum + roster.campers[b], 0);
    const swimOnly = at.every((b) => grid[b][s] === 'Swim Test') && new Set(at.map((b) => roster.village[b])).size === 1;
    if (total > POOL_MAX_CAMPERS && at.length > 1 && !swimOnly) add('H10', `${total} campers at the pool on ${where(s)}.`, at[0], s);
    const young = at.filter((b) => grid[b][s] === 'Pool' && (roster.village[b] === 'O' || roster.village[b] === 'C'));
    const youngTotal = young.reduce((sum, b) => sum + roster.campers[b], 0);
    if (youngTotal > POOL_YOUNG_MAX_CAMPERS && young.length > 1) add('H10', `${youngTotal} O and C campers at the pool on ${where(s)}.`, young[0], s);
  }

  // H11: hobbies and the last-week calendar
  const hobbySlots = (b: number): number[] => {
    const r: number[] = [];
    for (let s = 0; s < SLOTS; s++) if (grid[b][s] === 'AM Hobbies' || grid[b][s] === 'PM Hobbies') r.push(s);
    return r;
  };
  for (let b = 0; b < n; b++) {
    for (const k of blocksOf(grid[b])) {
      if (k.label !== 'AM Hobbies' && k.label !== 'PM Hobbies') continue;
      if (lockedAny(b, k.start, k.len)) continue;
      const wantStart = k.label === 'AM Hobbies' ? 0 : 2;
      if (k.len !== 2 || periodOf(k.start) !== wantStart) add('H11', `${roster.names[b]} has ${k.label} on the wrong periods on ${where(k.start)}.`, b, k.start);
      if (weekIndex === 1 && k.day === 0) add('H11', `Hobbies on the first Sunday for ${roster.names[b]}.`, b, k.start);
    }
  }
  for (let s = 0; s < SLOTS; s++) {
    const labels = new Set<string>(grid.map((g) => g[s]).filter((l) => l === 'AM Hobbies' || l === 'PM Hobbies'));
    if (labels.size === 0) continue;
    for (let b = 0; b < n; b++) {
      const exempt = lastWeek && roster.village[b] === 'T';
      if (!labels.has(grid[b][s]) && !exempt && !locked(b, s)) add('H11', `${roster.names[b]} is missing hobbies on ${where(s)}.`, b, s);
    }
  }
  if (lastWeek) {
    for (let b = 0; b < n; b++) {
      const isT = roster.village[b] === 'T';
      const want = (day: number, half: number): string => {
        if (day === 1 && half === 0) return isT ? 'Bike Trip' : 'AM Hobbies';
        if (day === 4 && half === 0) return 'Hobby Culmination';
        if (day === 4 && half === 1) return isT ? 'Banquet Prep' : 'Packing Time';
        return '';
      };
      for (const [day, half] of [[1, 0], [4, 0], [4, 1]]) {
        for (const s of halfSlots(day, half)) if (want(day, half) && grid[b][s] !== want(day, half) && !locked(b, s)) add('H11', `${roster.names[b]} should have ${want(day, half)} on ${where(s)}.`, b, s);
      }
      for (let p = 0; p < 4; p++) if (grid[b][slotAt(5, p)] !== '' && !locked(b, slotAt(5, p))) add('H11', `${roster.names[b]} has something on the last Friday.`, b, slotAt(5, p));
      const extra = hobbySlots(b).filter((s) => !(dayOf(s) === 1 && periodOf(s) < 2));
      if (extra.length > 0) add('H11', `${roster.names[b]} has hobbies outside Monday morning in the last week.`, b, extra[0]);
    }
  } else {
    const anyBunk = 0;
    const halves = new Set(hobbySlots(anyBunk).map((s) => `${dayOf(s)}${periodOf(s) < 2 ? 'A' : 'P'}`));
    const fri = halves.has('5A');
    if (!fri && !locked(anyBunk, slotAt(5, 0))) add('H11', 'Friday morning hobbies are missing.', undefined, slotAt(5, 0));
    const allowed = new Set(['5A', '3P', '1A', '0A']);
    for (const h of halves) if (!allowed.has(h)) add('H11', `Hobbies on an unexpected half-day (${h}).`, undefined, undefined);
    if (halves.has('3P') && halves.has('1A')) add('H11', 'Both Tuesday morning and Wednesday afternoon hobbies.', undefined, undefined);
    if (!halves.has('3P') && !halves.has('1A') && !locked(anyBunk, slotAt(3, 2))) add('H11', 'The second weekly hobbies half-day is missing.', undefined, undefined);
  }

  // H12: only known activity labels (cells already filled before generating may be write-ins)
  for (let b = 0; b < n; b++) {
    for (let s = 0; s < SLOTS; s++) {
      const label = grid[b][s];
      if (label && !ACTIVITY_LABELS.has(label) && !locked(b, s)) add('H12', `"${label}" is not a known activity.`, b, s);
    }
  }
  return out;
}
