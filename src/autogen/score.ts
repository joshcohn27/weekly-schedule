import { CROSS_VILLAGE_PAIRABLE, DAY_OFF_AREAS, SOLO_ONLY, WEIGHTS, ACTIVE_LABELS, WET_LABELS } from './config';
import { SLOTS, blocksOf, dayOf } from './history';
import { pairable } from './roster';
import type { Ctx } from './state';
import { areaOf } from '../config';

/** Soft-preference score for a finished attempt. Lower is better. */
export function softScore(c: Ctx): number {
  let score = c.unmet * WEIGHTS.fairnessPerBlock;
  const n = c.roster.n;

  // Judaics and Israel: one bunk at a time
  for (let s = 0; s < SLOTS; s++) {
    for (const area of SOLO_ONLY) {
      const count = c.grid.filter((row) => areaOf(row[s]) === area).length;
      if (count > 1) score += (count - 1) * WEIGHTS.soloClash;
    }
  }

  // each area gets one day off from the whole camp
  const daysWithPeriods = [0, 1, 2, 3, 4, 5].filter((d) => !(c.lastWeek && d === 5));
  for (const area of DAY_OFF_AREAS) {
    const used = new Set<number>();
    for (let b = 0; b < n; b++) for (let s = 0; s < SLOTS; s++) if (areaOf(c.grid[b][s]) === area) used.add(dayOf(s));
    if (used.size > 0 && daysWithPeriods.every((d) => used.has(d))) score += WEIGHTS.missingDayOff;
  }

  // wet then active, and more than one wet block a day
  for (let b = 0; b < n; b++) {
    const row = c.grid[b];
    for (let s = 1; s < SLOTS; s++) {
      if (dayOf(s) !== dayOf(s - 1)) continue;
      const a = row[s - 1];
      const z = row[s];
      if (WET_LABELS.includes(a) && ACTIVE_LABELS.includes(z)) score += a === 'Pool' && z === 'Athletics' ? WEIGHTS.poolBeforeAthletics : WEIGHTS.wetThenActive;
      if (a === 'Athletics' && z === 'Pool') score -= WEIGHTS.athleticsBeforePoolBonus;
    }
    const wetPerDay = new Map<number, number>();
    for (const k of blocksOf(row)) if (WET_LABELS.includes(k.label)) wetPerDay.set(k.day, (wetPerDay.get(k.day) ?? 0) + 1);
    for (const count of wetPerDay.values()) if (count > 1) score += (count - 1) * WEIGHTS.extraWetInDay;
  }

  // reward pairs of pairable single-period activities
  for (let s = 0; s < SLOTS; s++) {
    for (let i = 0; i < n; i++) {
      const area = areaOf(c.grid[i][s]);
      if (!area || !CROSS_VILLAGE_PAIRABLE.includes(area)) continue;
      for (let j = i + 1; j < n; j++) {
        if (c.grid[j][s] === c.grid[i][s] && pairable(c.roster, i, j)) score -= WEIGHTS.pairReward;
      }
    }
  }
  return score;
}
