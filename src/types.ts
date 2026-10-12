import type { Settings } from './autogen/settings';

export interface Bunk {
  id: string;
  name: string;
  grades: string;
  count: string;
  /** 24 slots: 6 days x 4 periods. Each is an activity label or '' for empty. */
  slots: string[];
  /** Slots emptied with the Clear tool that are still empty. They show in yellow until something is put there again. */
  cleared?: number[];
  /**
   * Periods where Auto generate had to go one over a limit to finish the week (three bunks where the limit is two, say).
   * Each remembers what was put there, so the mark goes when the period is changed.
   */
  over?: OverLimit[];
}

export interface OverLimit {
  slot: number;
  label: string;
  /** What is over, in a sentence. */
  note: string;
}

export interface DayInfo {
  rhLod: string;
  ts: string;
  generalDay: string;
  dod: string;
  birthdays: string;
  evp: string;
  notes: string;
}

export interface Schedule {
  bunks: Bunk[];
  days: DayInfo[];
}

/** Up to WEEK_COUNT weeks. A null slot is an unused week. */
export interface WeeksState {
  weeks: (Schedule | null)[];
  current: number;
  /** The numbers Auto generate works with, when they are not the defaults. */
  settings?: Settings;
  /** Which session this is: 'session1' (4 weeks) or 'session2' (3 weeks, Color War). One saved before sessions were told apart has none and is Session 1. */
  session?: 'session1' | 'session2';
}

/** A rectangle of the schedule grid that displays as one merged cell. */
export interface Block {
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
  label: string; // '' for an empty cell
}
