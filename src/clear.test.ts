import { describe, expect, it } from 'vitest';
import { applyClear, clearChoices, clearSlots, countToClear, dropMarks, isCleared, pruneCleared, type ClearRequest } from './clear';
import { newBunk, slotIndex } from './sample';
import { normalize } from './storage';
import type { Bunk } from './types';

const ALL_DAY = [0, 1, 2, 3];
const monday = 1;

/** O1, O2 and C1 with a Monday of Waterfront (periods 1-2), Athletics and Low Ropes, and Athletics again on Tuesday. */
function roster(): Bunk[] {
  const bunks = [newBunk('O1'), newBunk('O2'), newBunk('C1')];
  for (const b of bunks) {
    b.slots[slotIndex(monday, 0)] = 'Waterfront';
    b.slots[slotIndex(monday, 1)] = 'Waterfront';
    b.slots[slotIndex(monday, 2)] = 'Athletics';
    b.slots[slotIndex(monday, 3)] = 'Low Ropes';
    b.slots[slotIndex(2, 0)] = 'Athletics';
  }
  return bunks;
}
const req = (r: Partial<ClearRequest>): ClearRequest => ({ who: { kind: 'all' }, area: null, day: monday, periods: ALL_DAY, ...r });
const filled = (b: Bunk): number => b.slots.filter(Boolean).length;

describe('the Clear tool', () => {
  it('clears a program area on a day for everyone, and marks the emptied periods', () => {
    const before = roster();
    const r = req({ area: 'Waterfront' });
    expect(countToClear(before, r)).toBe(6);
    const after = applyClear(before, r);
    for (const b of after) {
      expect(b.slots[slotIndex(monday, 0)]).toBe('');
      expect(b.slots[slotIndex(monday, 1)]).toBe('');
      expect(b.slots[slotIndex(monday, 2)]).toBe('Athletics');
      expect(b.cleared).toEqual([slotIndex(monday, 0), slotIndex(monday, 1)]);
      expect(isCleared(b, slotIndex(monday, 0))).toBe(true);
      expect(isCleared(b, slotIndex(0, 0))).toBe(false); // empty all along, so not marked
    }
    expect(before[0].slots[slotIndex(monday, 0)]).toBe('Waterfront'); // the input is not changed
  });

  it('matches a program area by what it counts toward: High and Low Ropes are both Ropes', () => {
    const after = applyClear(roster(), req({ area: 'Ropes' }));
    expect(after[0].slots[slotIndex(monday, 3)]).toBe('');
    expect(filled(after[0])).toBe(4);
  });

  it('clears one bunk for a day and leaves the others alone', () => {
    const before = roster();
    const after = applyClear(before, req({ who: { kind: 'bunk', id: before[1].id } }));
    expect(filled(after[1])).toBe(1); // only Tuesday is left
    expect(after[0]).toBe(before[0]);
    expect(after[2]).toBe(before[2]);
  });

  it("clears a village's day, or only its morning", () => {
    const day = applyClear(roster(), req({ who: { kind: 'village', village: 'O' } }));
    expect(day.map(filled)).toEqual([1, 1, 5]);
    const morning = applyClear(roster(), req({ who: { kind: 'village', village: 'O' }, periods: [0, 1] }));
    expect(morning.map(filled)).toEqual([3, 3, 5]);
  });

  it('clears an area for the whole week', () => {
    expect(clearSlots({ day: null, periods: ALL_DAY })).toHaveLength(24);
    const after = applyClear(roster(), req({ area: 'Athletics', day: null }));
    for (const b of after) expect(b.slots).not.toContain('Athletics');
    expect(after[0].cleared).toEqual([slotIndex(monday, 2), slotIndex(2, 0)]);
  });

  it('counts nothing when there is nothing there', () => {
    expect(countToClear(roster(), req({ area: 'Pool' }))).toBe(0);
    const before = roster();
    expect(applyClear(before, req({ area: 'Pool' }))).toEqual(before);
  });

  it('drops the mark once a period is filled again, and can drop them all', () => {
    const [b] = applyClear(roster(), req({ area: 'Waterfront' }));
    const refilled = pruneCleared({ ...b, slots: b.slots.map((l, s) => (s === slotIndex(monday, 0) ? 'Pool' : l)) });
    expect(refilled.cleared).toEqual([slotIndex(monday, 1)]);
    const both = pruneCleared({ ...refilled, slots: refilled.slots.map((l, s) => (s === slotIndex(monday, 1) ? 'Pool' : l)) });
    expect('cleared' in both).toBe(false);
    expect(pruneCleared(b)).toBe(b); // nothing to forget: the same bunk comes back
    expect(dropMarks([b])[0].cleared).toBeUndefined();
  });

  it('keeps the marks when the week is saved and loaded, but only on periods that are still empty', () => {
    const bunks = applyClear(roster(), req({ area: 'Waterfront' }));
    const loaded = normalize(JSON.parse(JSON.stringify({ bunks, days: [] })));
    expect(loaded?.bunks[0].cleared).toEqual([slotIndex(monday, 0), slotIndex(monday, 1)]);
    const stale = normalize({ bunks: [{ ...roster()[0], cleared: [slotIndex(monday, 0), 99, 'x'] }], days: [] });
    expect(stale?.bunks[0].cleared).toBeUndefined();
  });

  it('offers every program area, plus anything else that is on the grid', () => {
    const bunks = roster();
    bunks[0].slots[0] = 'Talent Show';
    const choices = clearChoices(bunks);
    expect(choices).toEqual(expect.arrayContaining(['Waterfront', 'Ropes', 'League', 'Talent Show']));
    expect(choices.filter((c) => c === 'Waterfront')).toHaveLength(1);
  });
});
