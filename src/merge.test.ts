import { describe, expect, it } from 'vitest';
import { PERIODS_PER_DAY, SLOT_COUNT } from './config';
import { blocksByRow, computeBlocks } from './merge';
import { newBunk, sampleSchedule, slotIndex } from './sample';
import type { Bunk } from './types';

const bunk = (name: string, fill: Record<number, string> = {}): Bunk => {
  const b = newBunk(name);
  for (const [i, label] of Object.entries(fill)) b.slots[Number(i)] = label;
  return b;
};

describe('computeBlocks', () => {
  it('merges a double period into one block', () => {
    const blocks = computeBlocks([bunk('O1', { 0: 'Pool', 1: 'Pool' })]);
    const pool = blocks.filter((b) => b.label === 'Pool');
    expect(pool).toHaveLength(1);
    expect(pool[0]).toMatchObject({ row: 0, col: 0, rowSpan: 1, colSpan: 2 });
  });

  it('never merges across a day boundary', () => {
    // period 4 of Sunday and period 1 of Monday are neighbors in the array
    const blocks = computeBlocks([bunk('O1', { 3: 'Pool', 4: 'Pool' })]);
    expect(blocks.filter((b) => b.label === 'Pool')).toHaveLength(2);
  });

  it('merges a block shared by several bunks', () => {
    const blocks = computeBlocks([
      bunk('O1', { 2: 'Waterfront' }),
      bunk('O2', { 2: 'Waterfront' }),
      bunk('O3', { 2: 'Waterfront' }),
    ]);
    const wf = blocks.filter((b) => b.label === 'Waterfront');
    expect(wf).toHaveLength(1);
    expect(wf[0]).toMatchObject({ row: 0, col: 2, rowSpan: 3, colSpan: 1 });
  });

  it('merges a rectangle: shared by bunks AND a double period', () => {
    const fill = { 0: 'Yoga', 1: 'Yoga' };
    const blocks = computeBlocks([bunk('S1', fill), bunk('S2', fill)]);
    const yoga = blocks.filter((b) => b.label === 'Yoga');
    expect(yoga).toHaveLength(1);
    expect(yoga[0]).toMatchObject({ rowSpan: 2, colSpan: 2 });
  });

  it('does not merge different activities or empty cells', () => {
    const blocks = computeBlocks([bunk('O1', { 0: 'Pool', 1: 'Music' }), bunk('O2', { 0: 'Music', 1: 'Pool' })]);
    expect(blocks.filter((b) => b.label).every((b) => b.rowSpan === 1 && b.colSpan === 1)).toBe(true);
    const empties = blocks.filter((b) => b.label === '');
    expect(empties.every((b) => b.rowSpan === 1 && b.colSpan === 1)).toBe(true);
  });

  it('is not fooled by a gap between bunks', () => {
    const blocks = computeBlocks([bunk('O1', { 0: 'Pool' }), bunk('O2'), bunk('O3', { 0: 'Pool' })]);
    expect(blocks.filter((b) => b.label === 'Pool')).toHaveLength(2);
  });

  it('covers every cell exactly once, in any schedule', () => {
    const { bunks } = sampleSchedule();
    const seen = new Set<string>();
    for (const b of computeBlocks(bunks)) {
      const startDay = Math.floor(b.col / PERIODS_PER_DAY);
      expect(Math.floor((b.col + b.colSpan - 1) / PERIODS_PER_DAY)).toBe(startDay);
      for (let r = b.row; r < b.row + b.rowSpan; r++) {
        for (let c = b.col; c < b.col + b.colSpan; c++) {
          const key = `${r},${c}`;
          expect(seen.has(key)).toBe(false);
          seen.add(key);
        }
      }
    }
    expect(seen.size).toBe(bunks.length * SLOT_COUNT);
  });

  it('groups blocks by row, left to right', () => {
    const bunks = [bunk('O1', { 0: 'Pool', 1: 'Pool' }), bunk('O2', { 0: 'Music' })];
    const rows = blocksByRow(computeBlocks(bunks), 2);
    for (const row of rows) expect(row.map((b) => b.col)).toEqual([...row.map((b) => b.col)].sort((x, y) => x - y));
    // widths across each row plus cells hanging down from above always add up to a full row
    expect(rows[0].reduce((n, b) => n + b.colSpan, 0)).toBe(SLOT_COUNT);
  });

  it('slotIndex maps day + period to the flat slot', () => {
    expect(slotIndex(0, 0)).toBe(0);
    expect(slotIndex(1, 2)).toBe(6);
    expect(slotIndex(5, 3)).toBe(SLOT_COUNT - 1);
  });
});
