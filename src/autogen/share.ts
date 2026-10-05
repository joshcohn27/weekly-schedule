import { areaOf } from '../config';
import { SLOT_CAP, VILLAGE_LEVEL_LABELS, VISIT } from './config';
import { isConsecutiveTrio, isSameAgeGroup, shareLevel, type Roster } from './roster';

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
 *  - No more than SLOT_CAP bunks (Ropes: two, or three as a trio).
 *  - Athletics: two or three bunks, any bunks. The same ordinal is preferred there, never required.
 *  - A&C: two bunks that may share, or three bunks of the same age; always on the same ordinal.
 *  - Time with UH: two bunks of one village.
 *  - Ropes: two bunks that may share, or as a last resort three in a row in one village.
 *  - Everything else: two bunks only when shareLevel says they may, on the same ordinal.
 */
export function slotGroupProblems(
  r: Roster,
  area: string,
  group: readonly number[],
  ordinal: (bunk: number) => number | null,
  relax: Relax = OPEN,
  where = '',
): ShareProblem[] {
  const out: ShareProblem[] = [];
  if (group.length <= 1) return out;
  const cap = SLOT_CAP[area];
  const names = group.map((b) => r.names[b]).join(', ');
  const at = where ? ` ${where}` : '';
  if (cap === undefined) return out;
  const hardCap = area === 'Ropes' ? 3 : cap;
  if (group.length > hardCap) {
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
  } else if (area === 'Ropes') {
    if (!isConsecutiveTrio(r, group)) bad('three at Ropes must be three in a row in one village');
    else if (!relax.trio) bad('a group of three at Ropes is only a last resort');
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
export function groupBreaks(r: Roster, area: string, group: readonly number[], ordinal: (bunk: number) => number, relax: Relax): number {
  if (group.length <= 1) return 0;
  const cap = SLOT_CAP[area];
  if (cap === undefined) return 0;
  if (group.length > (area === 'Ropes' ? 3 : cap)) return 1;
  const free = VISIT.free.includes(area);
  const differ = (a: number, b: number): number => {
    if (free) return 0;
    const oa = ordinal(a);
    const ob = ordinal(b);
    return oa > 0 && ob > 0 && Math.abs(oa - ob) > VISIT.slackNow ? 1 : 0;
  };
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
  // three at Ropes
  return unequal + (isConsecutiveTrio(r, group) && relax.trio ? 0 : 1);
}
