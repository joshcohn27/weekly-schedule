import { PERIODS_PER_DAY, areaOf } from './config';
import type { Bunk } from './types';

/** Villages are color-coded by the first letter of the bunk name (O, C, S, M, T, ...). */
export const villageOf = (name: string): string => name.trim().charAt(0).toUpperCase();

// These activities are never a single period on their own.
const ALWAYS_DOUBLE_PERIOD = new Set(['Low Ropes', 'High Ropes', 'Waterfront', 'MNL', 'MAL']);

const doublePeriodHalf = (period: number): number[] => (period < 2 ? [0, 1] : [2, 3]);

/**
 * Which periods (same day as the one picked) an individual dropdown selection should fill.
 * Hobbies is locked to its named half of the day; Ropes/Waterfront/MNL/MAL have no AM/PM
 * label of their own, so they fill whichever half contains the period actually picked.
 */
export function periodsForLabel(label: string, clickedPeriod: number): number[] {
  if (label === 'AM Hobbies') return [0, 1];
  if (label === 'PM Hobbies') return [2, 3];
  if (ALWAYS_DOUBLE_PERIOD.has(label)) return doublePeriodHalf(clickedPeriod);
  return [clickedPeriod];
}

/**
 * Which bunks an individual dropdown selection should fill: hobbies is always the whole camp,
 * a league is always the clicked bunk's whole village, anything else is just that one bunk.
 */
export function bunkIdsForLabel(label: string, clickedBunkId: string, bunks: Bunk[]): Set<string> {
  if (areaOf(label) === 'Hobbies') return new Set(bunks.map((b) => b.id));
  if (areaOf(label) === 'League') {
    const clicked = bunks.find((b) => b.id === clickedBunkId);
    const village = clicked ? villageOf(clicked.name) : null;
    return new Set(bunks.filter((b) => villageOf(b.name) === village).map((b) => b.id));
  }
  return new Set([clickedBunkId]);
}

/** The full set of slot indices (same day) an individual dropdown selection should fill. */
export function slotsForLabel(label: string, clickedSlot: number): number[] {
  const day = Math.floor(clickedSlot / PERIODS_PER_DAY);
  const clickedPeriod = clickedSlot % PERIODS_PER_DAY;
  return periodsForLabel(label, clickedPeriod).map((p) => day * PERIODS_PER_DAY + p);
}

export interface PeriodChoice {
  value: string;
  label: string;
}

/** Options for the bulk-fill toolbar's period picker: single periods, or a double period. */
export const PERIOD_CHOICES: PeriodChoice[] = [
  { value: '0', label: 'Period 1' },
  { value: '1', label: 'Period 2' },
  { value: '2', label: 'Period 3' },
  { value: '3', label: 'Period 4' },
  { value: 'AM', label: 'Morning (periods 1-2)' },
  { value: 'PM', label: 'Afternoon (periods 3-4)' },
];

export const periodsForChoice = (choice: string): number[] => (choice === 'AM' ? [0, 1] : choice === 'PM' ? [2, 3] : [Number(choice)]);
