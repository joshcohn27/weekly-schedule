import { villageOf } from './autofill';
import { AREAS, PERIODS_PER_DAY, SLOT_COUNT, areaOf } from './config';
import type { Bunk } from './types';

/** Whose periods the Clear tool empties. */
export type ClearWho = { kind: 'all' } | { kind: 'village'; village: string } | { kind: 'bunk'; id: string };

export interface ClearRequest {
  who: ClearWho;
  /** A program area (or the label itself for an activity that has none), or null for everything. */
  area: string | null;
  /** 0 is Sunday; null is the whole week. */
  day: number | null;
  /** Periods of the day, 0 to 3. */
  periods: number[];
}

const areaKey = (label: string): string => areaOf(label) ?? label;

const inScope = (b: Bunk, who: ClearWho): boolean =>
  who.kind === 'all' || (who.kind === 'village' ? villageOf(b.name) === who.village : b.id === who.id);

/** The slots a request covers, before looking at what is in them. */
export function clearSlots(req: Pick<ClearRequest, 'day' | 'periods'>): number[] {
  const days = req.day === null ? Array.from({ length: SLOT_COUNT / PERIODS_PER_DAY }, (_, d) => d) : [req.day];
  return days.flatMap((d) => req.periods.map((p) => d * PERIODS_PER_DAY + p));
}

/** Would this cell be emptied? Only cells that have something in them count. */
const hit = (b: Bunk, slot: number, req: ClearRequest): boolean => b.slots[slot] !== '' && (req.area === null || areaKey(b.slots[slot]) === req.area);

/** How many periods a request would empty. */
export function countToClear(bunks: Bunk[], req: ClearRequest): number {
  const slots = clearSlots(req);
  return bunks.reduce((n, b) => n + (inScope(b, req.who) ? slots.filter((s) => hit(b, s, req)).length : 0), 0);
}

/** Empty the periods a request covers and mark them, so they show in yellow until something is put there again. */
export function applyClear(bunks: Bunk[], req: ClearRequest): Bunk[] {
  const slots = clearSlots(req);
  return bunks.map((b) => {
    if (!inScope(b, req.who)) return b;
    const gone = slots.filter((s) => hit(b, s, req));
    if (gone.length === 0) return b;
    return { ...b, slots: b.slots.map((l, s) => (gone.includes(s) ? '' : l)), cleared: [...new Set([...(b.cleared ?? []), ...gone])].sort((x, y) => x - y) };
  });
}

/** Was this period emptied with the Clear tool, and is it still empty? */
export const isCleared = (b: Bunk, slot: number): boolean => b.slots[slot] === '' && !!b.cleared?.includes(slot);

/** Forget the marks on periods that have been filled again (the same bunk comes back when there is nothing to forget). */
export function pruneCleared(b: Bunk): Bunk {
  if (!b.cleared) return b;
  const still = b.cleared.filter((s) => b.slots[s] === '');
  if (still.length === b.cleared.length) return b;
  const { cleared: _old, ...rest } = b;
  return still.length ? { ...rest, cleared: still } : rest;
}

/** Take every yellow mark off, leaving the periods empty. */
export const dropMarks = (bunks: Bunk[]): Bunk[] =>
  bunks.map((b) => {
    if (!b.cleared) return b;
    const { cleared: _old, ...rest } = b;
    return rest;
  });

/** What the Clear tool offers under "what": every program area, then anything else that is on the grid right now. */
export function clearChoices(bunks: Bunk[]): string[] {
  const out = [...AREAS];
  for (const b of bunks) for (const l of b.slots) if (l && !out.includes(areaKey(l))) out.push(areaKey(l));
  return out;
}
