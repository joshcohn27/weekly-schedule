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

/** The default Week 1 roster: villages youngest to oldest, blank activities ready to build. */
export function sampleSchedule(): Schedule {
  const bunks = [
    newBunk('O1', '4th', '11'),
    newBunk('O2', '4th/5th', '12'),
    newBunk('O3', '5th', '9'),
    newBunk('O4', '5th/6th', '13'),
    newBunk('O5', '6th', '10'),
    newBunk('C1', '4th', '12'),
    newBunk('C2', '4th/5th', '8'),
    newBunk('C3', '5th/6th', '13'),
    newBunk('C4', '6th', '11'),
    newBunk('S1', '7th', '10'),
    newBunk('S2', '7th/8th', '14'),
    newBunk('S3', '8th', '12'),
    newBunk('S4', '8th/9th', '9'),
    newBunk('S5', '9th', '13'),
    newBunk('M1', '7th', '11'),
    newBunk('M2', '7th/8th', '13'),
    newBunk('M3', '8th/9th', '10'),
    newBunk('M4', '9th', '12'),
    newBunk('T1', '10th', '14'),
    newBunk('T2', '10th', '11'),
    newBunk('T3', '10th', '13'),
    newBunk('T4', '10th', '12'),
  ];

  const days = DAYS.map(emptyDay);
  return { bunks, days };
}
