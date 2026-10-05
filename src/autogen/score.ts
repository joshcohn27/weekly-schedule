import { ACTIVE_LABELS, WET_LABELS, WEIGHTS } from './config';
import { SLOTS, blocksOf, dayOf } from './history';
import { shareLevel } from './roster';
import { groupAt, type Ctx } from './state';

/** What one period's group of bunks in one area costs by preference: one bunk at Music, Teva and Dance, the same age, no trios at Ropes. */
export function groupSoft(c: Ctx, s: number, area: string): number {
  const g = groupAt(c, s, area);
  if (g.length < 2) return 0;
  const r = c.roster;
  const pairs: number[] = [];
  for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) pairs.push(shareLevel(r, g[i], g[j], area));
  let score = 0;
  if (area === 'Athletics' || area === 'A&C') {
    if (g.length === 3) score += WEIGHTS.thirdBunk;
  } else if (area === 'Ropes') {
    if (g.length === 3) score += WEIGHTS.trio;
  } else score += WEIGHTS.sharedPreferredOne;
  if (pairs.some((p) => p === 1)) score += WEIGHTS.pairFarAge;
  return score;
}

/** Preferences about who is together, plus fair pool groups. */
function sharingScore(c: Ctx): number {
  let score = 0;
  const r = c.roster;
  for (let s = 0; s < SLOTS; s++) {
    for (const area of ['Athletics', 'A&C', 'Music', 'Teva', 'Dance', 'Ropes'] as const) score += groupSoft(c, s, area);
    const seniors = [...(r.byVillage.S ?? []), ...(r.byVillage.M ?? [])].filter((b) => c.grid[b][s] === 'Pool');
    if (seniors.length > 0 && (seniors.length < 2 || seniors.length > 5)) score += WEIGHTS.poolGroupSize;
  }
  return score;
}

/** Soft-preference score for a finished attempt. Lower is better. */
export function softScore(c: Ctx): number {
  let score = c.unmet * WEIGHTS.fairnessPerBlock + sharingScore(c);
  const n = c.roster.n;

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
  return score;
}
