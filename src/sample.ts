import { DAYS, PERIODS_PER_DAY, SLOT_COUNT } from './config';
import type { Bunk, DayInfo, Schedule } from './types';

export const uid = (): string => Math.random().toString(36).slice(2, 10);

export const emptyDay = (): DayInfo => ({
  rhLod: '',
  ts: '',
  generalDay: '',
  dod: '',
  birthdays: '',
  evp: '',
  notes: '',
});

export const newBunk = (name = '', grades = '', count = ''): Bunk => ({
  id: uid(),
  name,
  grades,
  count,
  slots: Array<string>(SLOT_COUNT).fill(''),
});

export const slotIndex = (day: number, period: number): number => day * PERIODS_PER_DAY + period;

export const emptySchedule = (): Schedule => ({ bunks: [], days: DAYS.map(emptyDay) });

/** A small example so first-time visitors see auto-merge and tracking working. */
export function sampleSchedule(): Schedule {
  const bunks = [
    newBunk('O1', '3rd/4th', '11'),
    newBunk('O2', '5th', '7'),
    newBunk('C1', '3rd/4th', '11'),
    newBunk('C2', '4th/5th', '12'),
    newBunk('S1', '7th', '12'),
    newBunk('S2', '7th', '11'),
    newBunk('M1', '7th', '13'),
    newBunk('T1', '10th', '15'),
  ];
  const put = (names: string[], day: number, periods: number[], label: string) => {
    for (const b of bunks) {
      if (!names.includes(b.name)) continue;
      for (const p of periods) b.slots[slotIndex(day, p)] = label;
    }
  };
  const all = bunks.map((b) => b.name);

  // Sunday
  put(all, 0, [0, 1], 'AM Hobbies');
  put(['O1', 'O2'], 0, [2], 'Waterfront');
  put(['C1', 'C2'], 0, [2], 'Pool');
  put(['S1', 'S2'], 0, [2], 'Athletics');
  put(['M1'], 0, [2], 'Judaics');
  put(['T1'], 0, [2], 'Teva');
  put(['O1', 'O2', 'C1', 'C2'], 0, [3], 'Music');
  put(['S1', 'S2', 'M1'], 0, [3], 'Yoga');
  put(['T1'], 0, [3], 'Time with UH');

  // Monday
  put(['O1', 'O2'], 1, [0, 1], 'Low Ropes');
  put(['C1', 'C2'], 1, [0, 1], 'Waterfront');
  put(['S1', 'S2'], 1, [0, 1], 'A&C');
  put(['M1'], 1, [0, 1], 'Pool');
  put(['T1'], 1, [0, 1], 'Tusc Biking');
  put(['O1', 'O2', 'C1', 'C2'], 1, [2], 'Judaics');
  put(['S1', 'S2'], 1, [2], 'SSL');
  put(['M1'], 1, [2], 'MNL');
  put(['T1'], 1, [2], 'Tusc Triathlon Training');
  put(all, 1, [3], 'PM Hobbies');

  const days = DAYS.map(emptyDay);
  return { bunks, days };
}
