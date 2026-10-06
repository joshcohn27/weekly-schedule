import { isGuest, villageOf } from '../autofill';
import type { Schedule } from '../types';
import { DEFAULT_CAMPERS, ROPES_MAX_CAMPERS, TRIP_LABELS, hobbiesInWeek } from './config';
import { sessionTargetOf } from './planner';

/**
 * The camp has one ropes course, and one group is there in a half-day. Over a session that is only so many groups, however
 * the schedule is arranged. This counts the half-days the session has for ropes and the groups the settings ask for, so
 * the page can say plainly when ropes for everyone does not fit, and the generator knows whether to hold every half-day
 * for ropes or to give as many as it can without crowding out the rest.
 */
export interface RopesOutlook {
  /** Half-days of the session in which a group could be at ropes. */
  halfDays: number;
  /** Group visits the settings ask for: every group of bunks, as many times as its village has ropes. */
  groups: number;
  /** Does it fit, with a little slack for Waterfront and trips getting in the way? */
  fits: boolean;
  /** The fewest campers at once that would make it fit (a multiple of five), or null when no number up to 90 does. */
  campersToFit: number | null;
}

/** Ropes for everyone comes out when the groups need no more than this share of the half-days. Measured: 86% came out every time, 100% did not. */
export const ROPES_FITS_SHARE = 0.9;

const SET_LABELS = ['AM Hobbies', 'PM Hobbies', 'Hobby Culmination', 'Packing Time', 'Banquet Prep'];
const closed = (label: string): boolean => TRIP_LABELS.includes(label) || SET_LABELS.includes(label);

/** How many groups a village's bunks make at ropes: neighbours together, up to the camper limit. */
function groupsOf(campers: number[], limit: number): number {
  let groups = 0;
  let sum = 0;
  for (const n of campers) {
    if (sum > 0 && sum + n > limit) {
      groups++;
      sum = 0;
    }
    sum += n;
  }
  return sum > 0 ? groups + 1 : groups;
}

export function ropesOutlook(weeks: (Schedule | null)[], sessionWeeks: number, limit: number = ROPES_MAX_CAMPERS): RopesOutlook {
  const first = weeks.find((w) => w && w.bunks.some((b) => !isGuest(b.name)));
  const bunks = (first?.bunks ?? []).filter((b) => !isGuest(b.name));
  // half-days: one where at least some bunk has both periods open
  let halfDays = 0;
  for (let w = 0; w < sessionWeeks; w++) {
    const week = weeks[w] ?? first ?? null;
    const last = sessionWeeks === 4 && w === 3;
    const rows = (week?.bunks ?? []).filter((b) => !isGuest(b.name)).map((b) => b.slots);
    const hasHobbies = rows.some((r) => r.some((l) => l === 'AM Hobbies' || l === 'PM Hobbies'));
    let open = 0;
    for (let day = 0; day < 6; day++) {
      for (const half of [0, 2]) {
        if (last && day >= 4) continue; // Thursday is the culmination and packing, Friday is departure
        const s = day * 4 + half;
        if (rows.length === 0 || rows.some((r) => !closed(r[s]) && !closed(r[s + 1]))) open++;
      }
    }
    // a week that is not built yet still has its hobby half-days to lose
    if (!hasHobbies) open -= hobbiesInWeek(w + 1, sessionWeeks);
    halfDays += Math.max(0, open);
  }
  const villages = [...new Set(bunks.map((b) => villageOf(b.name)))];
  const count = (cap: number): number =>
    villages.reduce((sum, v) => {
      const campers = bunks.filter((b) => villageOf(b.name) === v).map((b) => {
        const n = parseInt(b.count, 10);
        return Number.isFinite(n) && n > 0 ? n : DEFAULT_CAMPERS;
      });
      return sum + groupsOf(campers, cap) * sessionTargetOf(v, sessionWeeks, 'Ropes');
    }, 0);
  const groups = count(limit);
  const fits = groups <= halfDays * ROPES_FITS_SHARE;
  let campersToFit: number | null = null;
  if (!fits) {
    for (let cap = Math.ceil((limit + 1) / 5) * 5; cap <= 90; cap += 5) {
      if (count(cap) <= halfDays * ROPES_FITS_SHARE) {
        campersToFit = cap;
        break;
      }
    }
  }
  return { halfDays, groups, fits, campersToFit };
}
