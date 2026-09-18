import { DAYS, SLOT_COUNT, isKnownLabel } from './config';
import { emptyDay, uid } from './sample';
import type { Bunk, DayInfo, Schedule } from './types';

const KEY = 'weekly-schedule-v1';
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** Accepts whatever is in localStorage and returns a valid Schedule, or null. */
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
      slots: Array.from({ length: SLOT_COUNT }, (_, i) => {
        const label = str(slots[i]);
        return isKnownLabel(label) ? label : '';
      }),
    };
  });

  const rawDays = Array.isArray(obj.days) ? obj.days : [];
  const days: DayInfo[] = DAYS.map((_, i) => ({ ...emptyDay(), ...(rawDays[i] ?? {}) }));
  return { bunks, days };
}

export function loadSchedule(): Schedule | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? normalize(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function saveSchedule(schedule: Schedule): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(schedule));
  } catch {
    // storage full or blocked: the app still works, it just won't remember
  }
}
