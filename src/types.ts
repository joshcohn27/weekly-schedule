export interface Bunk {
  id: string;
  name: string;
  grades: string;
  count: string;
  /** 24 slots: 6 days x 4 periods. Each is an activity label or '' for empty. */
  slots: string[];
  /** Slots emptied with the Clear tool that are still empty. They show in yellow until something is put there again. */
  cleared?: number[];
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
}

/** A rectangle of the schedule grid that displays as one merged cell. */
export interface Block {
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
  label: string; // '' for an empty cell
}
