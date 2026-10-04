import { ACTIVITIES, areaOf } from '../config';
import type { WeeksState } from '../types';
import {
  DAY_CAP,
  POOL_LESSONS,
  POOL_MAX_CAMPERS,
  POOL_MAX_PER_WEEK,
  SESSION_HARD_MAX,
  SHABBAT_ROTATION,
  SINGLE_PERIOD_AREAS,
  TRIP_LABELS,
  UH_MAX_PER_SESSION,
  VILLAGE_LEVEL_LABELS,
  WEEK_BLOCK_MAX,
  type SessionWeeks,
} from './config';
import {
  SLOTS,
  blocksOf,
  buildHistory,
  dayOf,
  halfSlots,
  isFilledWeek,
  ordinalAt,
  periodOf,
  slotAt,
  villageWeeksWithLabel,
  type BunkHistory,
} from './history';
import { buildRoster, isRun, shareLevel, type Roster } from './roster';
import { OPEN, isFixedMohawkAthletics, sharedArea, slotGroupProblems } from './share';

export type Rule = 'H1' | 'H2' | 'H3' | 'H4' | 'H5' | 'H6' | 'H7' | 'H8' | 'H9' | 'H10' | 'H11' | 'H12' | 'H13' | 'H14' | 'H15' | 'H16' | 'H17' | 'H18';

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
const VILLAGE_LEVEL = new Set(VILLAGE_LEVEL_LABELS);
const POOL_LABELS = new Set(['Pool', 'Swim Test', 'Tusc Triathlon Training']);
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const where = (slot: number): string => `${DAY_NAMES[dayOf(slot)]} period ${periodOf(slot) + 1}`;

export interface ValidationInput {
  weeks: WeeksState;
  weekIndex: number;
  sessionWeeks: SessionWeeks;
  roster: Roster;
  hist: BunkHistory[];
  /** The week being checked, grid[bunk][slot]. */
  grid: string[][];
  locked?: boolean[][];
}

/** Check a week that is already in hand (roster and history built) against the hard rules H1 to H16. */
export function validateGrid(input: ValidationInput): Violation[] {
  const { weeks, weekIndex, sessionWeeks, roster, hist, grid } = input;
  const n = roster.n;
  const locked = (b: number, s: number): boolean => !!input.locked?.[b]?.[s];
  const lockedAny = (b: number, start: number, len: number): boolean => {
    for (let k = 0; k < len; k++) if (locked(b, start + k)) return true;
    return false;
  };
  const blocks = grid.map((row) => blocksOf(row));
  const out: Violation[] = [];
  const add = (rule: Rule, message: string, bunk?: number, slot?: number) =>
    out.push({ rule, message, bunk: bunk === undefined ? undefined : roster.names[bunk], slot });

  const lastWeek = sessionWeeks === 4 && weekIndex === 4;
  const weekIsLocked = (b: number): boolean => !!input.locked?.[b]?.some(Boolean);

  // H1: every period filled (Friday of the last week of a 4-week session stays empty)
  for (let b = 0; b < n; b++) {
    for (let s = 0; s < SLOTS; s++) {
      if (grid[b][s] === '' && !(lastWeek && dayOf(s) === 5)) add('H1', `${roster.names[b]} has nothing on ${where(s)}.`, b, s);
    }
  }

  // H2: no program area twice on one day (Bike Trip days are exempt)
  for (let b = 0; b < n; b++) {
    for (let day = 0; day < 6; day++) {
      const today = blocks[b].filter((k) => k.day === day);
      if (today.length < 2 || today.some((k) => k.label === 'Bike Trip')) continue;
      const seen = new Map<string, number>();
      for (const k of today) {
        if (!k.area || lockedAny(b, k.start, k.len)) continue;
        seen.set(k.area, (seen.get(k.area) ?? 0) + 1);
      }
      for (const [area, count] of seen) if (count > 1) add('H2', `${roster.names[b]} has ${area} ${count} times on ${DAY_NAMES[day]}.`, b, slotAt(day, 0));
    }
  }

  // H3: village-level blocks cover every bunk of the village at once
  for (const v of roster.villages) {
    const members = roster.byVillage[v];
    for (let s = 0; s < SLOTS; s++) {
      const seen = new Set<string>();
      for (const b of members) if (VILLAGE_LEVEL.has(grid[b][s])) seen.add(grid[b][s]);
      for (const label of seen) {
        const has = members.filter((b) => grid[b][s] === label);
        if (has.length === members.length) continue;
        const missing = members.filter((b) => grid[b][s] !== label && !locked(b, s));
        if (missing.length > 0 && has.some((b) => !locked(b, s))) {
          add('H3', `${label} on ${where(s)} covers only part of village ${v || '(no letter)'}.`, missing[0], s);
        }
      }
    }
  }

  // H4: Waterfront is a double period on periods 1-2 or 3-4, one village per half-day
  for (let b = 0; b < n; b++) {
    for (const k of blocks[b]) {
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

  // H5, H13, H14: who may share a period and an area, how many, and on the same ordinal.
  // Cells that were filled before generating, and Mohawk's fixed Sunday Athletics, are left out of the groups.
  for (let s = 0; s < SLOTS; s++) {
    const groups = new Map<string, number[]>();
    for (let b = 0; b < n; b++) {
      const label = grid[b][s];
      const area = sharedArea(label);
      if (!area || locked(b, s) || isFixedMohawkAthletics(weekIndex, roster.village[b], s, label)) continue;
      groups.set(area, [...(groups.get(area) ?? []), b]);
    }
    for (const [area, group] of groups) {
      for (const p of slotGroupProblems(roster, area, group, (b) => ordinalAt(grid[b], hist[b].earlier, s), OPEN, `on ${where(s)}`)) add(p.rule, p.message, group[0], s);
    }
  }

  // H15: at most so many bunks of one village at an area in a day, and so many Athletics and A&C blocks a bunk a week
  for (const v of roster.villages) {
    for (let day = 0; day < 6; day++) {
      for (const [area, cap] of Object.entries(DAY_CAP)) {
        const here = roster.byVillage[v].filter((b) =>
          blocks[b].some(
            (k) => k.day === day && k.area === area && !lockedAny(b, k.start, k.len) && !isFixedMohawkAthletics(weekIndex, v, k.start, k.label),
          ),
        );
        if (here.length > cap) add('H15', `${here.length} bunks of village ${v} have ${area} on ${DAY_NAMES[day]}, and the most is ${cap}.`, here[0], slotAt(day, 0));
      }
    }
  }
  for (let b = 0; b < n; b++) {
    for (const [area, max] of Object.entries(WEEK_BLOCK_MAX)) {
      const count = blocks[b].filter((k) => k.area === area && !lockedAny(b, k.start, k.len) && !isFixedMohawkAthletics(weekIndex, roster.village[b], k.start, k.label)).length;
      if (count > max) add('H15', `${roster.names[b]} has ${count} ${area} blocks this week, and the most is ${max}.`, b);
    }
  }

  // H15: Time with UH at most so many times a session
  for (let b = 0; b < n; b++) {
    const mine = blocks[b].filter((k) => k.area === 'TW UH');
    const total = (hist[b].earlier['TW UH'] ?? 0) + (hist[b].later['TW UH'] ?? 0) + mine.length;
    if (total > UH_MAX_PER_SESSION && mine.some((k) => !lockedAny(b, k.start, k.len))) {
      add('H15', `${roster.names[b]} has Time with UH ${total} times in the session, and the most is ${UH_MAX_PER_SESSION}.`, b);
    }
  }

  // H6: Ropes are double periods, low first then high, and never more than two per session
  for (let b = 0; b < n; b++) {
    let total = (hist[b].earlier.Ropes ?? 0) + (hist[b].later.Ropes ?? 0);
    for (const k of blocks[b]) {
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

  // H7: Judaics at most three times and Israel at most twice per bunk per session
  for (let b = 0; b < n; b++) {
    for (const [area, max] of Object.entries(SESSION_HARD_MAX)) {
      const total = (hist[b].earlier[area] ?? 0) + (hist[b].later[area] ?? 0) + blocks[b].filter((k) => k.area === area).length;
      if (total > max) add('H7', `${roster.names[b]} has ${area} ${total} times in the session.`, b);
    }
  }

  // H8: Shabbat Prep once per village per session, following the calendar. Tiyul is entered by hand and is not checked.
  const prepElsewhere = villageWeeksWithLabel(weeks, weekIndex, 'Shabbat Prep');
  for (const v of roster.villages) {
    const members = roster.byVillage[v];
    if (members.some((b) => grid[b].includes('Shabbat Prep')) && (prepElsewhere[v] ?? 0) > 0) add('H8', `Village ${v} has Shabbat Prep in more than one week.`, members[0]);
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

  // H9, H10 and H16: the pool. One group per period; Tusc training only when nobody is swimming.
  for (let s = 0; s < SLOTS; s++) {
    let tri = false;
    const at: number[] = [];
    const pool: number[] = [];
    const test: number[] = [];
    for (let b = 0; b < n; b++) {
      const l = grid[b][s];
      if (!POOL_LABELS.has(l)) continue;
      at.push(b);
      if (l === 'Tusc Triathlon Training') tri = true;
      else if (l === 'Swim Test') test.push(b);
      else pool.push(b);
    }
    if (at.length === 0) continue;
    if (tri && (pool.length > 0 || test.length > 0)) add('H9', `Triathlon training shares ${where(s)} with the pool.`, undefined, s);
    if (pool.length === 0 && test.length === 0) continue;

    const wholeVillage = (group: number[]): boolean => {
      const v = roster.village[group[0]];
      return group.every((b) => roster.village[b] === v) && group.length === roster.byVillage[v].length;
    };
    const campers = pool.reduce((sum, b) => sum + roster.campers[b], 0);
    if (campers > POOL_MAX_CAMPERS && pool.length > 0 && !wholeVillage(pool)) add('H10', `${campers} campers at the pool on ${where(s)}.`, pool[0], s);

    if (pool.length > 0 && test.length > 0) add('H16', `The Swim Test shares ${where(s)} with a pool group.`, pool[0], s);
    if (new Set(test.map((b) => roster.village[b])).size > 1) add('H16', `More than one village has the Swim Test on ${where(s)}.`, test[0], s);
    if (pool.length === 0 || pool.some((b) => locked(b, s))) continue;

    const names = pool.map((b) => roster.names[b]).join(', ');
    const vs = [...new Set(pool.map((b) => roster.village[b]))];
    const problem = (why: string) => add('H16', `${names} are at the pool together on ${where(s)}, but ${why}.`, pool[0], s);
    if (vs.includes('T')) {
      if (vs.length > 1) problem('Tusc never goes to the pool with another village');
      else if (pool.length !== roster.byVillage.T.length) problem('every Tusc bunk goes to the pool together');
    } else if (vs.length === 1) {
      if (!isRun(roster, pool)) problem('a pool group is bunks in a row in the village list');
      if (pool.length > 1 && (vs[0] === 'O' || vs[0] === 'C')) {
        const lesson = pool.some((b) => (hist[b].earlierLabels.Pool ?? 0) + blocks[b].filter((k) => k.label === 'Pool' && k.start < s).length < POOL_LESSONS);
        if (lesson) problem('a lesson is one bunk alone');
      }
    } else if (vs.length === 2 && vs.includes('S') && vs.includes('M')) {
      const sBunks = pool.filter((b) => roster.village[b] === 'S');
      const mBunks = pool.filter((b) => roster.village[b] === 'M');
      if (!isRun(roster, sBunks) || !isRun(roster, mBunks)) problem('each village at the pool is bunks in a row in its list');
      if (sBunks.some((a) => mBunks.some((m) => shareLevel(roster, a, m, 'Pool') === 0))) problem('S and M only swim together at the same age');
    } else {
      problem('these villages never share the pool');
    }
    const ords = pool.map((b) => ordinalAt(grid[b], hist[b].earlier, s));
    if (ords.some((o) => o !== ords[0])) add('H5', `${names} are at the pool together on ${where(s)} on different times (${ords.join(', ')}).`, pool[0], s);
  }
  // H16: every O and C bunk swims every week, at the pool or with the Swim Test, and nobody more than twice
  for (let b = 0; b < n; b++) {
    if (roster.village[b] !== 'O' && roster.village[b] !== 'C') continue;
    const swims = blocks[b].filter((k) => k.label === 'Pool' || k.label === 'Swim Test');
    if ((swims.length < 1 || swims.length > POOL_MAX_PER_WEEK) && !swims.some((k) => lockedAny(b, k.start, k.len)) && !(weekIsLocked(b))) {
      add('H16', `${roster.names[b]} swims ${swims.length} times this week, and it should be once or twice.`, b);
    }
  }

  // H11: hobbies and the last-week calendar
  const isHobby = (l: string): boolean => l === 'AM Hobbies' || l === 'PM Hobbies';
  const onTrip = (b: number, s: number): boolean => TRIP_LABELS.includes(grid[b][s]);
  for (let b = 0; b < n; b++) {
    for (const k of blocks[b]) {
      if (!isHobby(k.label) || lockedAny(b, k.start, k.len)) continue;
      const wantStart = k.label === 'AM Hobbies' ? 0 : 2;
      if (k.len !== 2 || periodOf(k.start) !== wantStart) add('H11', `${roster.names[b]} has ${k.label} on the wrong periods on ${where(k.start)}.`, b, k.start);
      if (weekIndex === 1 && k.day === 0) add('H11', `Hobbies on the first Sunday for ${roster.names[b]}.`, b, k.start);
    }
  }
  for (let s = 0; s < SLOTS; s++) {
    const labels = new Set<string>();
    for (let b = 0; b < n; b++) if (isHobby(grid[b][s])) labels.add(grid[b][s]);
    if (labels.size === 0) continue;
    const partner = s % 2 === 0 ? s + 1 : s - 1; // the other period of the same half-day
    for (let b = 0; b < n; b++) {
      const exempt = onTrip(b, s) || onTrip(b, partner);
      if (!labels.has(grid[b][s]) && !exempt && !locked(b, s) && !locked(b, partner)) add('H11', `${roster.names[b]} is missing hobbies on ${where(s)}.`, b, s);
    }
  }
  if (lastWeek) {
    for (let b = 0; b < n; b++) {
      const isT = roster.village[b] === 'T';
      const want = (day: number, half: number): string => {
        if (day === 1 && half === 0) return 'AM Hobbies';
        if (day === 4 && half === 0) return 'Hobby Culmination';
        if (day === 4 && half === 1) return isT ? 'Banquet Prep' : 'Packing Time';
        return '';
      };
      for (const [day, half] of [[1, 0], [4, 0], [4, 1]]) {
        for (const s of halfSlots(day, half)) if (want(day, half) && grid[b][s] !== want(day, half) && !locked(b, s) && !onTrip(b, s)) add('H11', `${roster.names[b]} should have ${want(day, half)} on ${where(s)}.`, b, s);
      }
      for (let p = 0; p < 4; p++) if (grid[b][slotAt(5, p)] !== '' && !locked(b, slotAt(5, p))) add('H11', `${roster.names[b]} has something on the last Friday.`, b, slotAt(5, p));
      const extra = grid[b].findIndex((l, s) => isHobby(l) && !(dayOf(s) === 1 && periodOf(s) < 2));
      if (extra >= 0) add('H11', `${roster.names[b]} has hobbies outside Monday morning in the last week.`, b, extra);
    }
  } else if (n > 0) {
    const halves = new Set<string>();
    for (const row of grid) {
      row.forEach((l, s) => {
        if (isHobby(l)) halves.add(`${dayOf(s)}${periodOf(s) < 2 ? 'A' : 'P'}`);
      });
    }
    if (!halves.has('5A') && !locked(0, slotAt(5, 0))) add('H11', 'Friday morning hobbies are missing.', undefined, slotAt(5, 0));
    const allowed = new Set(['5A', '3P', '2A', '0A']);
    for (const h of halves) if (!allowed.has(h)) add('H11', `Hobbies on an unexpected half-day (${h}).`, undefined, undefined);
    if (halves.has('3P') && halves.has('2A')) add('H11', 'Both Tuesday morning and Wednesday afternoon hobbies.', undefined, undefined);
    if (!halves.has('3P') && !halves.has('2A') && !locked(0, slotAt(3, 2))) add('H11', 'The second weekly hobbies half-day is missing.', undefined, undefined);
  }

  // H17: nothing back to back. Athletics and A&C are single periods, and no area is in period 4 and again in period 1 the next day.
  for (let b = 0; b < n; b++) {
    for (const k of blocks[b]) {
      if (k.len > 1 && k.area && SINGLE_PERIOD_AREAS.includes(k.area) && !lockedAny(b, k.start, k.len)) {
        add('H17', `${roster.names[b]} has a double period of ${k.area} on ${where(k.start)}.`, b, k.start);
      }
    }
    for (let day = 0; day < 5; day++) {
      const last = slotAt(day, 3);
      const first = slotAt(day + 1, 0);
      const area = areaOf(grid[b][last]);
      if (!area || area !== areaOf(grid[b][first]) || locked(b, last) || locked(b, first)) continue;
      if (TRIP_LABELS.includes(grid[b][last]) || TRIP_LABELS.includes(grid[b][first])) continue;
      add('H17', `${roster.names[b]} has ${area} in period 4 on ${DAY_NAMES[day]} and again in period 1 the next day.`, b, last);
    }
  }

  // H18: nothing two days in a row. A bunk never has the same program area on back-to-back days (trips are exempt, Friday
  // into Sunday does not count, and two days that were both filled in by hand are left alone).
  for (let b = 0; b < n; b++) {
    for (let day = 0; day < 5; day++) {
      const today = blocks[b].filter((k) => k.day === day && k.area && k.area !== 'Trips');
      const tomorrow = blocks[b].filter((k) => k.day === day + 1);
      for (const area of new Set(today.map((k) => k.area as string))) {
        const next = tomorrow.filter((k) => k.area === area);
        if (next.length === 0) continue;
        const byHand = [...today.filter((k) => k.area === area), ...next].every((k) => lockedAny(b, k.start, k.len));
        if (!byHand) add('H18', `${roster.names[b]} has ${area} on ${DAY_NAMES[day]} and again on ${DAY_NAMES[day + 1]}.`, b, slotAt(day + 1, 0));
      }
    }
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

/** Check one week against the hard rules H1 to H16. An empty list means the week is valid. */
export function validateWeek(weeks: WeeksState, weekIndex: number, sessionWeeks: SessionWeeks, opts: ValidateOptions = {}): Violation[] {
  const schedule = weeks.weeks[weekIndex - 1];
  if (!isFilledWeek(schedule)) return [];
  const roster = buildRoster(schedule.bunks);
  const hist = buildHistory(weeks, weekIndex, roster.names);
  return validateGrid({ weeks, weekIndex, sessionWeeks, roster, hist, grid: schedule.bunks.map((b) => b.slots), locked: opts.locked });
}
