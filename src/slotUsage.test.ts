import { describe, expect, it } from 'vitest';
import { newBunk } from './sample';
import { slotUsage } from './slotUsage';
import type { Bunk } from './types';

const bunk = (name: string, fill: Record<number, string> = {}): Bunk => {
  const b = newBunk(name);
  for (const [i, label] of Object.entries(fill)) b.slots[Number(i)] = label;
  return b;
};

describe('slotUsage', () => {
  it('names the other bunks that have an activity in this period', () => {
    const bunks = [bunk('O1', { 0: 'Pool' }), bunk('O2'), bunk('O3'), bunk('S1')];
    expect(slotUsage(bunks, 0, bunks[1].id).get('Pool')).toBe('(O1)');
  });

  it('uses just the letter when a whole village has it', () => {
    const bunks = [bunk('O1', { 0: 'Pool' }), bunk('O2', { 0: 'Pool' }), bunk('S1'), bunk('S2'), bunk('M1')];
    expect(slotUsage(bunks, 0, bunks[2].id).get('Pool')).toBe('(O)');
  });

  it("counts the rest of the current bunk's own village as a whole village", () => {
    const bunks = [bunk('O1', { 0: 'Pool' }), bunk('O2', { 0: 'Pool' }), bunk('O3'), bunk('S1')];
    expect(slotUsage(bunks, 0, bunks[2].id).get('Pool')).toBe('(O)');
  });

  it('mixes letters and bunk names, and says all when every other bunk has it', () => {
    const bunks = [bunk('O1', { 0: 'Pool' }), bunk('O2', { 0: 'Pool' }), bunk('S1', { 0: 'Pool' }), bunk('S2'), bunk('M1')];
    expect(slotUsage(bunks, 0, bunks[4].id).get('Pool')).toBe('(O, S1)');

    const everyone = [bunk('O1', { 0: 'AM Hobbies' }), bunk('S1', { 0: 'AM Hobbies' }), bunk('M1')];
    expect(slotUsage(everyone, 0, everyone[2].id).get('AM Hobbies')).toBe('(all)');
  });

  it('ignores the current bunk, other periods, and empty cells', () => {
    const bunks = [bunk('O1', { 0: 'Pool', 1: 'Music' }), bunk('O2', { 0: 'Pool' }), bunk('O3'), bunk('S1')];
    const usage = slotUsage(bunks, 0, bunks[0].id);
    expect(usage.get('Pool')).toBe('(O2)');
    expect(usage.has('Music')).toBe(false);
    expect(usage.has('')).toBe(false);
  });
});
