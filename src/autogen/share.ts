import { areaOf } from '../config';
import { SLOT_CAP, VILLAGE_LEVEL_LABELS } from './config';
import { isConsecutiveTrio, shareLevel, type Roster } from './roster';

/**
 * Which last-resort groupings the generator may use right now. The validator always allows both, because
 * they are legal; the generator only turns them on after it has failed to find a good week without them.
 */
export interface Relax {
  /** Athletics may hold unrelated bunks: two singles, a matched pair plus a single, or three singles. */
  singles: boolean;
  /** Three consecutive bunks of one village may share Ropes or Athletics. */
  trio: boolean;
}
export const STRICT: Relax = { singles: false, trio: false };
export const OPEN: Relax = { singles: true, trio: true };

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

/** Mohawk's Sunday period 4 Athletics in week 1 is a fixed village-level calendar block, so it is outside the sharing rules. */
export const isFixedMohawkAthletics = (weekIndex: number, village: string, slot: number, label: string): boolean =>
  weekIndex === 1 && slot === 3 && village === 'M' && label === 'Athletics';

/**
 * Check the bunks that are in one program area in one period (rules H13, H14 and the equal ordinal of H5).
 *  - No more than SLOT_CAP bunks (Ropes: two, or three as a trio).
 *  - Two bunks share only when shareLevel says they may, except unrelated Athletics singles.
 *  - Three: Athletics as a pair plus a single or three singles, or a consecutive trio at Ropes or Athletics.
 *  - Bunks that may share must be on the same ordinal.
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
  const trio = group.length === 3 && isConsecutiveTrio(r, group);
  const bad = (why: string) => out.push({ rule: 'H13', message: `${names} share ${area}${at}, but ${why}.` });

  if (group.length === 2) {
    if (matched.length === 0) {
      if (area !== 'Athletics') bad('they are not allowed to be together');
      else if (!relax.singles) bad('unrelated bunks only share Athletics as a last resort');
    }
  } else if (area === 'Ropes') {
    if (!trio) bad('three at Ropes must be three in a row in one village');
    else if (!relax.trio) bad('a group of three at Ropes is only a last resort');
  } else if (area === 'Athletics') {
    if (matched.length <= 1) {
      if (!relax.singles) bad('a third bunk at Athletics is only a last resort');
    } else if (!trio) bad('three at Athletics must be unrelated, a pair plus one, or three in a row in one village');
    else if (!relax.trio) bad('three in a row at Athletics is only a last resort');
  }
  for (const [a, b] of matched) {
    const oa = ordinal(a);
    const ob = ordinal(b);
    if (oa !== null && ob !== null && oa !== ob) {
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
  let breaks = 0;
  let matched = 0;
  for (let i = 0; i < group.length; i++) {
    for (let j = i + 1; j < group.length; j++) {
      if (shareLevel(r, group[i], group[j], area) === 0) continue;
      matched++;
      const oa = ordinal(group[i]);
      const ob = ordinal(group[j]);
      if (oa > 0 && ob > 0 && oa !== ob) breaks++;
    }
  }
  const trio = group.length === 3 && isConsecutiveTrio(r, group);
  if (group.length === 2) {
    if (matched === 0 && (area !== 'Athletics' || !relax.singles)) breaks++;
  } else if (area === 'Ropes') {
    if (!trio || !relax.trio) breaks++;
  } else if (area === 'Athletics') {
    if (matched <= 1) {
      if (!relax.singles) breaks++;
    } else if (!trio || !relax.trio) breaks++;
  }
  return breaks;
}
