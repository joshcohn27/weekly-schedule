import { DAYS, SLOT_COUNT, WEEK_COUNT } from './config';
import { emptyDay, sampleSchedule, uid } from './sample';
import type { Bunk, DayInfo, Schedule, WeeksState } from './types';

const OLD_KEY = 'weekly-schedule-v1';
const KEY = 'weekly-schedule-weeks-v1';
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** Accepts whatever is in localStorage (or an uploaded file) and returns a valid Schedule, or null. */
export function normalize(raw: unknown): Schedule | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as { bunks?: unknown; days?: unknown };
  if (!Array.isArray(obj.bunks)) return null;

  const bunks: Bunk[] = obj.bunks.map((b: any) => {
    const slots = Array.isArray(b?.slots) ? b.slots : [];
    return {
      id: str(b?.id) || uid(),
      name: str(b?.name),
      grades: str(b?.grades),
      count: str(b?.count),
      // Any non-empty text is accepted: activities can be picked from the list or written in freehand.
      slots: Array.from({ length: SLOT_COUNT }, (_, i) => str(slots[i])),
    };
  });

  const rawDays = Array.isArray(obj.days) ? obj.days : [];
  const days: DayInfo[] = DAYS.map((_, i) => ({ ...emptyDay(), ...(rawDays[i] ?? {}) }));
  return { bunks, days };
}

/** Accepts whatever is in localStorage and returns a valid WeeksState, or null. */
export function normalizeWeeksState(raw: unknown): WeeksState | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as { weeks?: unknown; current?: unknown };
  if (!Array.isArray(obj.weeks)) return null;
  const rawWeeks = obj.weeks as unknown[];

  const weeks: (Schedule | null)[] = Array.from({ length: WEEK_COUNT }, (_, i) => normalize(rawWeeks[i]));
  const current = typeof obj.current === 'number' && obj.current >= 0 && obj.current < WEEK_COUNT ? obj.current : 0;
  return { weeks, current };
}

export function loadWeeks(): WeeksState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return normalizeWeeksState(JSON.parse(raw));

    // migrate a single schedule saved by an older version of this app
    const oldRaw = localStorage.getItem(OLD_KEY);
    if (oldRaw) {
      const migrated = normalize(JSON.parse(oldRaw));
      if (migrated) return { weeks: [migrated, null, null, null], current: 0 };
    }
    return null;
  } catch {
    return null;
  }
}

export function saveWeeks(state: WeeksState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // storage full or blocked: the app still works, it just won't remember
  }
}

export function defaultWeeksState(): WeeksState {
  return { weeks: [sampleSchedule(), null, null, null], current: 0 };
}
