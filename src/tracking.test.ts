import { describe, expect, it } from 'vitest';
import { newBunk } from './sample';
import { computeTracking } from './tracking';
import type { Bunk } from './types';

const bunk = (name: string, fill: Record<number, string>): Bunk => {
  const b = newBunk(name);
  for (const [i, label] of Object.entries(fill)) b.slots[Number(i)] = label;
  return b;
};
const count = (t: ReturnType<typeof computeTracking>, name: string, area: string): number => {
  const row = t.rows.find((r) => r.bunk.name === name)!;
  return row.counts[t.areas.indexOf(area)];
};

describe('computeTracking', () => {
  it('counts a double period once', () => {
    const t = computeTracking([bunk('O1', { 0: 'Pool', 1: 'Pool' })]);
    expect(count(t, 'O1', 'Pool')).toBe(1);
  });

  it('counts a shared block once for each bunk', () => {
    const t = computeTracking([bunk('O1', { 2: 'Waterfront' }), bunk('O2', { 2: 'Waterfront' }), bunk('O3', { 2: 'Waterfront' })]);
    expect(['O1', 'O2', 'O3'].map((n) => count(t, n, 'Waterfront'))).toEqual([1, 1, 1]);
    expect(t.totals[t.areas.indexOf('Waterfront')]).toBe(3);
  });

  it('counts the same activity on different days separately', () => {
    const t = computeTracking([bunk('O1', { 3: 'Pool', 4: 'Pool' })]);
    expect(count(t, 'O1', 'Pool')).toBe(2);
  });

  it('folds village league names and Tusc activities into League', () => {
    const t = computeTracking([
      bunk('M1', { 0: 'MNL', 5: 'MAL' }),
      bunk('S1', { 0: 'SSL' }),
      bunk('C1', { 0: 'CHL' }),
      bunk('T1', { 0: 'Tusc Biking', 5: 'Tusc Triathlon Training' }),
    ]);
    expect([count(t, 'M1', 'League'), count(t, 'S1', 'League'), count(t, 'C1', 'League'), count(t, 'T1', 'League')]).toEqual([2, 1, 1, 2]);
  });

  it('counts High Ropes and Low Ropes as Ropes', () => {
    const t = computeTracking([bunk('O1', { 0: 'High Ropes', 5: 'Low Ropes' })]);
    expect(count(t, 'O1', 'Ropes')).toBe(2);
  });

  it('does not count all-camp events or village days', () => {
    const t = computeTracking([bunk('O1', { 0: 'All-Camp Event', 5: 'Village Day' })]);
    expect(t.rows[0].total).toBe(0);
    expect(t.grandTotal).toBe(0);
  });

  it('totals add up', () => {
    const t = computeTracking([bunk('O1', { 0: 'Pool', 5: 'Music' }), bunk('O2', { 5: 'Music' })]);
    expect(t.rows.map((r) => r.total)).toEqual([2, 1]);
    expect(t.grandTotal).toBe(3);
  });
});
