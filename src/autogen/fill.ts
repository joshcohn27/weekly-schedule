import { CROSS_VILLAGE_PAIRABLE, DAY_OFF_AREAS, FLEXIBLE_VILLAGES, PAIR_PROBABILITY, SOLO_ONLY, UH_MAX_PER_SESSION, WET_LABELS } from './config';
import { areaOf } from '../config';
import { dayOf, ordinalAt, periodOf } from './history';
import { TOKEN_AREAS, TOKEN_LABEL, inWeekCount, sessionTargetOf, type Plan } from './planner';
import { chance, shuffle } from './rng';
import { ALL_SLOTS, areaOnDay, fillable, h5ok, isFree, put, type Ctx } from './state';

// Areas that may fall a block short when a bunk has no room. Music is only ever dropped as a last resort.
const MAY_FALL_SHORT = ['TW UH', 'Yoga', 'Ceramics', 'Teva', 'Dance', 'Israel Education', 'Judaics'];

/** Stands for "Athletics or A&C, whichever the bunk has fewer of": decided at the moment a period is filled. */
const FILL = 'FILL';

const labelOf = (area: string): string => TOKEN_LABEL[area as (typeof TOKEN_AREAS)[number]];

/** Give each day-off area a day nobody does it, spread so no day has more than two areas off. */
function pickDaysOff(c: Ctx): Record<string, number> {
  const days = shuffle(c.rng, c.days);
  const off: Record<string, number> = {};
  const load = new Map<number, number>();
  for (const area of shuffle(c.rng, DAY_OFF_AREAS)) {
    const day = days.find((d) => (load.get(d) ?? 0) < 2);
    if (day === undefined) break;
    off[area] = day;
    load.set(day, (load.get(day) ?? 0) + 1);
  }
  return off;
}

/** Fill every remaining period. Returns true when nothing was left empty. */
export function fillFlexible(c: Ctx, plan: Plan): boolean {
  const n = c.roster.n;
  const tok: Record<string, number>[] = Array.from({ length: n }, () => ({}));
  const free: number[][] = Array.from({ length: n }, (_, b) => ALL_SLOTS.filter((s) => isFree(c, b, s) && fillable(c, s)));
  const total = (b: number, area: string): number => (c.hist[b].earlier[area] ?? 0) + (c.hist[b].later[area] ?? 0) + inWeekCount(c, b, area);
  const ath = Array.from({ length: n }, (_, b) => total(b, 'Athletics'));
  const ac = Array.from({ length: n }, (_, b) => total(b, 'A&C'));
  const dropped: Record<string, number> = {}; // blocks put off so far this week, per area, so no one area takes every hit
  const lastWeek = c.weekIndex >= c.sessionWeeks;

  for (const b of shuffle(c.rng, Array.from({ length: n }, (_, i) => i))) {
    for (const area of TOKEN_AREAS) if (plan[area][b] > 0) tok[b][area] = plan[area][b];
    let planned = Object.values(tok[b]).reduce((a, x) => a + x, 0);
    while (planned > free[b].length) {
      // Put off the area this bunk can best spare: not one it is already short on, and the one hit least so far.
      const options = MAY_FALL_SHORT.filter((a) => (tok[b][a] ?? 0) > 0);
      const spare = options.filter((a) => sessionTargetOf(c.roster.village[b], c.sessionWeeks, a) - (total(b, a) + tok[b][a] - 1) <= 1);
      const candidates = spare.length ? spare : options;
      if (candidates.length === 0) {
        if ((tok[b].Music ?? 0) > 0) {
          tok[b].Music--;
          planned--;
          c.unmet++;
          continue;
        }
        break;
      }
      const least = Math.min(...candidates.map((a) => dropped[a] ?? 0));
      const area = shuffle(c.rng, candidates.filter((a) => (dropped[a] ?? 0) === least))[0];
      tok[b][area]--;
      dropped[area] = (dropped[area] ?? 0) + 1;
      planned--;
      c.unmet++;
      if (lastWeek && !FLEXIBLE_VILLAGES.includes(c.roster.village[b])) c.structural++;
    }
    if (free[b].length > planned) tok[b][FILL] = free[b].length - planned;
  }

  // In the last week, work out up front how many Athletics and A&C each bunk needs to end level (A&C ahead by 0 or 1).
  const quota: ({ Athletics: number; 'A&C': number } | null)[] = tok.map((t, b) => {
    const fillers = t[FILL] ?? 0;
    if (!lastWeek || fillers === 0) return null;
    const gap = ac[b] - ath[b];
    const goal = (fillers + 1 - gap) % 2 === 0 ? 1 : 0;
    const acAdd = Math.max(0, Math.min(fillers, (fillers + goal - gap) / 2));
    return { Athletics: fillers - acAdd, 'A&C': acAdd };
  });

  const areaKeys = tok.map((t) => Object.keys(t));
  const dayOff = pickDaysOff(c);
  const uhTotal = (b: number) => total(b, 'TW UH');
  /** Athletics goes to the bunk with fewer of it, A&C when they are level or ahead, so A&C stays the higher one. */
  const preferred = (b: number): string => {
    const q = quota[b];
    if (q) return q.Athletics > q['A&C'] ? 'Athletics' : 'A&C';
    return ath[b] < ac[b] ? 'Athletics' : 'A&C';
  };
  const other = (a: string): string => (a === 'Athletics' ? 'A&C' : 'Athletics');
  const canPlace = (b: number, s: number, day: number, area: string, label: string): boolean =>
    !areaOnDay(c, b, day, area) && h5ok(c, b, [s], label);
  const note = (b: number, area: string) => {
    if (area === 'Athletics') ath[b]++;
    else if (area === 'A&C') ac[b]++;
    const q = quota[b];
    if (q && (area === 'Athletics' || area === 'A&C') && q[area] > 0) q[area]--;
  };

  for (const s of ALL_SLOTS) {
    if (!fillable(c, s)) continue;
    const day = dayOf(s);
    for (const b of shuffle(c.rng, Array.from({ length: n }, (_, i) => i))) {
      if (!isFree(c, b, s)) continue;
      const prev = periodOf(s) > 0 ? c.grid[b][s - 1] : '';
      let best: { key: string; area: string; label: string; score: number } | null = null;
      for (const key of areaKeys[b]) {
        if (tok[b][key] <= 0) continue;
        let area = key;
        let label = key === FILL ? '' : labelOf(key);
        if (key === FILL) {
          const first = preferred(b);
          area = canPlace(b, s, day, first, first) ? first : canPlace(b, s, day, other(first), other(first)) ? other(first) : '';
          if (!area) continue;
          label = area;
        } else if (!canPlace(b, s, day, area, label)) continue;
        let score = -3 * tok[b][key] + c.rng() * 1.5;
        if (dayOff[area] === day) score += 1;
        if (SOLO_ONLY.includes(area) && c.grid.some((row) => row[s] === label)) score += 4;
        if (area === 'Athletics' && WET_LABELS.includes(prev)) score += 1.5;
        if (!best || score < best.score) best = { key, area, label, score };
      }

      if (!best) {
        // last resort: an extra Athletics or A&C, then an extra Time with UH
        const first = preferred(b);
        const extra = [first, other(first)].find((a) => canPlace(b, s, day, a, a));
        if (extra) best = { key: '', area: extra, label: extra, score: 0 };
        else if (uhTotal(b) < UH_MAX_PER_SESSION && canPlace(b, s, day, 'TW UH', 'Time with UH')) best = { key: '', area: 'TW UH', label: 'Time with UH', score: 0 };
      }
      if (!best) continue; // left empty; the validator reports it and the attempt loses

      put(c, b, [s], best.label);
      note(b, best.area);
      if (best.key && tok[b][best.key] > 0) tok[b][best.key]--;

      if (CROSS_VILLAGE_PAIRABLE.includes(best.area) && chance(c.rng, PAIR_PROBABILITY)) {
        let partner = -1;
        let bestDiff = Infinity;
        for (const p of c.roster.relatedTo[b]) {
          if (!isFree(c, p, s)) continue;
          const key = best.key === FILL ? FILL : best.area;
          if ((tok[p][key] ?? 0) <= 0) continue;
          if (key === FILL && preferred(p) !== best.area) continue; // keep both bunks' Athletics/A&C balanced
          const diff = Math.abs(c.roster.age[p] - c.roster.age[b]);
          if (diff > 1 || !canPlace(p, s, day, best.area, best.label)) continue;
          if (diff + c.rng() < bestDiff) {
            bestDiff = diff + c.rng();
            partner = p;
          }
        }
        if (partner >= 0) {
          put(c, partner, [s], best.label);
          note(partner, best.area);
          tok[partner][best.key === FILL ? FILL : best.area]--;
        }
      }
    }
  }
  rebalanceAthleticsAc(c);
  // Anything planned that never found a period is a shortfall; in the last week it is final.
  for (let b = 0; b < n; b++) {
    for (const area of TOKEN_AREAS) {
      const left = tok[b][area] ?? 0;
      if (left <= 0) continue;
      c.unmet += left;
      if (lastWeek && !FLEXIBLE_VILLAGES.includes(c.roster.village[b])) c.structural += left;
    }
  }
  return ALL_SLOTS.every((s) => !fillable(c, s) || c.grid.every((row) => row[s] !== ''));
}

/** Do this bunk's Athletics and A&C blocks all agree on their ordinal with related bunks in the same slot? */
function athleticsAcConsistent(c: Ctx, b: number): boolean {
  for (const s of ALL_SLOTS) {
    const label = c.grid[b][s];
    if (label !== 'Athletics' && label !== 'A&C') continue;
    for (const y of c.roster.relatedTo[b]) {
      if (c.grid[y][s] !== label || c.locked[y][s] || c.locked[b][s]) continue;
      if (ordinalAt(c.grid[b], c.hist[b].earlier, s) !== ordinalAt(c.grid[y], c.hist[y].earlier, s)) return false;
    }
  }
  return true;
}

/**
 * Filling a period takes the label that keeps a bunk's Athletics and A&C level, but a related bunk
 * in the same period can force the other one. Fix what is left over by flipping single periods
 * this week, keeping every flip that leaves the ordinals consistent.
 */
function rebalanceAthleticsAc(c: Ctx): void {
  const total = (b: number, area: string): number =>
    (c.hist[b].earlier[area] ?? 0) + (c.hist[b].later[area] ?? 0) + inWeekCount(c, b, area);
  for (let b = 0; b < c.roster.n; b++) {
    for (let guard = 0; guard < 6; guard++) {
      const gap = total(b, 'A&C') - total(b, 'Athletics'); // want 0 or 1
      if (gap === 0 || gap === 1) break;
      const from = gap < 0 ? 'Athletics' : 'A&C';
      const to = gap < 0 ? 'A&C' : 'Athletics';
      let flipped = false;
      for (const s of shuffle(c.rng, ALL_SLOTS)) {
        if (c.grid[b][s] !== from || c.locked[b][s]) continue;
        const day = dayOf(s);
        const p = periodOf(s);
        const neighbour = (q: number): boolean => q >= 0 && q < 4 && c.grid[b][s - p + q] === from;
        if (neighbour(p - 1) || neighbour(p + 1)) continue; // part of a double, not a single period
        if (areaOnDayNow(c, b, day, to)) continue;
        c.grid[b][s] = to;
        if (athleticsAcConsistent(c, b)) {
          flipped = true;
          break;
        }
        c.grid[b][s] = from;
      }
      if (!flipped) break;
    }
  }
}

/** areaOnDay reads a mask that can go stale once cells are relabelled, so look at the cells themselves. */
function areaOnDayNow(c: Ctx, b: number, day: number, label: string): boolean {
  for (let p = 0; p < 4; p++) if (areaOf(c.grid[b][day * 4 + p]) === areaOf(label)) return true;
  return false;
}
