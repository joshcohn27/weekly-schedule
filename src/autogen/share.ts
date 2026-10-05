import { areaOf } from '../config';
import { ROPES_MAX_CAMPERS, SLOT_CAP, VILLAGE_LEVEL_LABELS, VISIT } from './config';
import { isSameAgeGroup, shareLevel, type Roster } from './roster';

/**
 * Which last-resort grouping the generator may use right now. The validator always allows it, because it is legal;
 * the generator only turns it on after it has failed to find a good week without it.
 */
export interface Relax {
  /** Three consecutive bunks of one village may share Ropes. */
  trio: boolean;
}
export const STRICT: Relax = { trio: false };
export const OPEN: Relax = { trio: true };

export type ShareRule = 'H5' | 'H13' | 'H14';
export interface ShareProblem {
  rule: ShareRule;
  message: string;
}

const VILLAGE_LEVEL = new Set(VILLAGE_LEVEL_LABELS);

/**
 * The program area a cell counts under for the sharing rules, or null when the rules do not apply:
 * empty cells, village-level blocks, hobbies, the pool (which has its own rule) and anything not capped.
 */
const SHARED_AREA = new Map<string, string | null>();
/** Forget what was worked out: call it when the program areas or their caps have changed. */
export const resetSharedAreas = (): void => SHARED_AREA.clear();
export function sharedArea(label: string): string | null {
  if (!label) return null;
  const known = SHARED_AREA.get(label);
  if (known !== undefined) return known;
  let out: string | null = null;
  if (!VILLAGE_LEVEL.has(label)) {
    const area = areaOf(label);
    out = area && SLOT_CAP[area] !== undefined ? area : null;
  }
  SHARED_AREA.set(label, out);
  return out;
}

/** The note that goes under the schedule on the opening day, so nobody misses that Mohawk's swim test is not in a period. */
export const MOHAWK_SWIM_NOTE = 'Mohawk Swim test During General Swim';

/**
 * Nobody goes to Waterfront before the swim test. In week 1 that means not on Sunday morning, and not before the bunk's own
 * Swim Test when it has one that week. Mohawk takes its test during General Swim, after period 4 on the first day, so it
 * has no Waterfront at all that day. Would Waterfront starting in this slot be too early?
 */
export function beforeSwimTest(weekIndex: number, row: readonly string[], slot: number, village = ''): boolean {
  if (weekIndex !== 1) return false;
  if (slot < 2) return true; // Sunday morning
  if (village === 'M') return slot < 4; // the whole first day
  const test = row.indexOf('Swim Test');
  return test >= 0 && slot < test;
}

/** Mohawk's Sunday period 4 Athletics in week 1 is a fixed village-level calendar block, so it is outside the sharing rules. */
export const isFixedMohawkAthletics = (weekIndex: number, village: string, slot: number, label: string): boolean =>
  weekIndex === 1 && slot === 3 && village === 'M' && label === 'Athletics';

/**
 * Check the bunks that are in one program area in one period (rules H13, H14 and the equal ordinal of H5).
 *  - No more than SLOT_CAP bunks (Ropes goes by campers instead).
 *  - Athletics: two or three bunks, any bunks. The same ordinal is preferred there, never required.
 *  - A&C: two bunks that may share, or three bunks of the same age; always on the same ordinal.
 *  - Time with UH: two bunks of one village.
 *  - Ropes: neighbours in one village, with no more campers between them than ROPES_MAX_CAMPERS.
 *  - Everything else: two bunks only when shareLevel says they may, on the same ordinal.
 */
export function slotGroupProblems(
  r: Roster,
  area: string,
  group: readonly number[],
  ordinal: (bunk: number) => number | null,
  _relax: Relax = OPEN,
  where = '',
): ShareProblem[] {
  const out: ShareProblem[] = [];
  if (group.length <= 1) return out;
  const cap = SLOT_CAP[area];
  const names = group.map((b) => r.names[b]).join(', ');
  const at = where ? ` ${where}` : '';
  if (cap === undefined) return out;
  if (area === 'Ropes') {
    // Ropes goes by people, not by bunks: neighbours in one village, with no more campers than the ropes course takes
    const line = ropesLine(r, group);
    const campers = group.reduce((sum, b) => sum + r.campers[b], 0);
    if (!line) out.push({ rule: 'H13', message: `${names} share Ropes${at}, but bunks at Ropes together must be next to each other in one village.` });
    if (campers > ROPES_MAX_CAMPERS) out.push({ rule: 'H14', message: `${names} are ${campers} campers at Ropes${at}, and the most is ${ROPES_MAX_CAMPERS}.` });
    const order = line ?? [...group];
    for (let i = 1; i < order.length && !VISIT.free.includes(area); i++) {
      const oa = ordinal(order[i - 1]);
      const ob = ordinal(order[i]);
      if (oa !== null && ob !== null && Math.abs(oa - ob) > VISIT.slackNow) {
        out.push({ rule: 'H5', message: `${r.names[order[i - 1]]} (time ${oa}) and ${r.names[order[i]]} (time ${ob}) share ${area}${at}.` });
      }
    }
    return out;
  }
  if (group.length > cap) {
    out.push({ rule: 'H14', message: `${names} are ${group.length} at ${area}${at}, and the most is ${cap}.` });
    return out;
  }
  const matched: [number, number][] = [];
  for (let i = 0; i < group.length; i++) {
    for (let j = i + 1; j < group.length; j++) if (shareLevel(r, group[i], group[j], area) > 0) matched.push([group[i], group[j]]);
  }
  const bad = (why: string) => out.push({ rule: 'H13', message: `${names} share ${area}${at}, but ${why}.` });
  // who must be on the same ordinal: bunks that may share, and all three of a group of three at A&C
  let sameVisit = matched;

  // each bunk with the next: when everyone must be on the same visit, that is enough to say so
  const chain: [number, number][] = group.slice(1).map((b, i) => [group[i], b]);
  if (area === 'Athletics') {
    sameVisit = chain; // any bunks may be at Athletics together
  } else if (area === 'TW UH') {
    // two bunks of one village may have Time with UH together
    if (r.village[group[0]] !== r.village[group[1]]) bad('only bunks of one village have Time with UH together');
    sameVisit = chain;
  } else if (group.length === 2) {
    if (matched.length === 0) bad('they are not allowed to be together');
  } else if (area === 'A&C') {
    if (!isSameAgeGroup(r, group)) bad('three at A&C must all be the same age');
    sameVisit = [[group[0], group[1]], [group[1], group[2]]];
  }
  // the same visit is asked of every area except the ones the settings leave free (Athletics and Time with UH, to start with)
  if (VISIT.free.includes(area)) sameVisit = [];
  for (const [a, b] of sameVisit) {
    const oa = ordinal(a);
    const ob = ordinal(b);
    if (oa !== null && ob !== null && Math.abs(oa - ob) > VISIT.slackNow) {
      out.push({ rule: 'H5', message: `${r.names[a]} (time ${oa}) and ${r.names[b]} (time ${ob}) share ${area}${at}.` });
    }
  }
  return out;
}

/**
 * The number of problems slotGroupProblems would report, without building the messages. The fill search calls this
 * many thousands of times. `ordinal` returns 0 when a bunk has no ordinal there.
 */
export function groupBreaks(r: Roster, area: string, group: readonly number[], ordinal: (bunk: number) => number, _relax?: Relax): number {
  if (group.length <= 1) return 0;
  const cap = SLOT_CAP[area];
  if (cap === undefined) return 0;
  const free = VISIT.free.includes(area);
  const differ = (a: number, b: number): number => {
    if (free) return 0;
    const oa = ordinal(a);
    const ob = ordinal(b);
    return oa > 0 && ob > 0 && Math.abs(oa - ob) > VISIT.slackNow ? 1 : 0;
  };
  if (area === 'Ropes') {
    const line = ropesLine(r, group);
    let campers = 0;
    for (const b of group) campers += r.campers[b];
    const order = line ?? group;
    let n = (line ? 0 : 1) + (campers > ROPES_MAX_CAMPERS ? 1 : 0);
    for (let i = 1; i < order.length; i++) n += differ(order[i - 1], order[i]);
    return n;
  }
  if (group.length > cap) return 1;
  const chain = (): number => {
    let n = 0;
    for (let i = 1; i < group.length; i++) n += differ(group[i - 1], group[i]);
    return n;
  };
  if (area === 'Athletics') return chain();
  if (area === 'TW UH') return (r.village[group[0]] === r.village[group[1]] ? 0 : 1) + chain();
  if (area === 'A&C' && group.length === 3) {
    return (isSameAgeGroup(r, group) ? 0 : 1) + differ(group[0], group[1]) + differ(group[1], group[2]);
  }
  let matched = 0;
  let unequal = 0;
  for (let i = 0; i < group.length; i++) {
    for (let j = i + 1; j < group.length; j++) {
      if (shareLevel(r, group[i], group[j], area) === 0) continue;
      matched++;
      unequal += differ(group[i], group[j]);
    }
  }
  if (group.length === 2) return unequal + (matched === 0 ? 1 : 0);
  return unequal + 1; // three or more, anywhere a group of three has no rule of its own
}

/**
 * The bunks at Ropes together, in the order they stand in their village's list, when they are one unbroken line of
 * neighbours who may share. Null when they are not (two villages, a gap in the line, or neighbours too far apart in grade).
 */
export function ropesLine(r: Roster, group: readonly number[]): number[] | null {
  const line = [...group].sort((x, y) => r.pos[x] - r.pos[y]);
  for (let i = 1; i < line.length; i++) if (shareLevel(r, line[i - 1], line[i], 'Ropes') === 0) return null;
  return line;
}
