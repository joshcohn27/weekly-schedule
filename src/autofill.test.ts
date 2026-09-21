import { describe, expect, it } from 'vitest';
import { bunkIdsForLabel, periodsForChoice, periodsForLabel, slotsForLabel, villageOf } from './autofill';
import { newBunk } from './sample';

describe('villageOf', () => {
  it('takes the first letter of the bunk name, uppercased', () => {
    expect(villageOf('m3')).toBe('M');
    expect(villageOf('  s1')).toBe('S');
  });
});

describe('periodsForLabel', () => {
  it('locks AM/PM Hobbies to their half of the day regardless of which period was clicked', () => {
    expect(periodsForLabel('AM Hobbies', 3)).toEqual([0, 1]);
    expect(periodsForLabel('PM Hobbies', 0)).toEqual([2, 3]);
  });

  it('fills whichever half contains the clicked period for Ropes/Waterfront/MNL/MAL', () => {
    for (const label of ['Low Ropes', 'High Ropes', 'Waterfront', 'MNL', 'MAL']) {
      expect(periodsForLabel(label, 0)).toEqual([0, 1]);
      expect(periodsForLabel(label, 1)).toEqual([0, 1]);
      expect(periodsForLabel(label, 2)).toEqual([2, 3]);
      expect(periodsForLabel(label, 3)).toEqual([2, 3]);
    }
  });

  it('is a single period for anything else, including other leagues', () => {
    expect(periodsForLabel('Pool', 2)).toEqual([2]);
    expect(periodsForLabel('SSL', 1)).toEqual([1]);
    expect(periodsForLabel('League', 3)).toEqual([3]);
  });
});

describe('bunkIdsForLabel', () => {
  const bunks = [newBunk('O1'), newBunk('O2'), newBunk('S1'), newBunk('S2'), newBunk('M1')];

  it('is the whole camp for hobbies', () => {
    expect(bunkIdsForLabel('AM Hobbies', bunks[2].id, bunks)).toEqual(new Set(bunks.map((b) => b.id)));
  });

  it('is the clicked bunk\'s whole village for any league', () => {
    expect(bunkIdsForLabel('SSL', bunks[2].id, bunks)).toEqual(new Set([bunks[2].id, bunks[3].id]));
    expect(bunkIdsForLabel('MNL', bunks[4].id, bunks)).toEqual(new Set([bunks[4].id]));
  });

  it('is just the clicked bunk for anything else, including double-period Ropes/Waterfront', () => {
    expect(bunkIdsForLabel('Pool', bunks[0].id, bunks)).toEqual(new Set([bunks[0].id]));
    expect(bunkIdsForLabel('Waterfront', bunks[0].id, bunks)).toEqual(new Set([bunks[0].id]));
    expect(bunkIdsForLabel('Low Ropes', bunks[0].id, bunks)).toEqual(new Set([bunks[0].id]));
  });
});

describe('slotsForLabel', () => {
  it('combines the picked day with the periods the label should fill', () => {
    // Tuesday (day 2) period 2 (index 1) -> slot 2*4+1 = 9
    expect(slotsForLabel('AM Hobbies', 9)).toEqual([8, 9]); // Tuesday periods 1-2
    expect(slotsForLabel('Pool', 9)).toEqual([9]);
  });
});

describe('periodsForChoice', () => {
  it('maps single periods and the AM/PM double-period choices', () => {
    expect(periodsForChoice('0')).toEqual([0]);
    expect(periodsForChoice('3')).toEqual([3]);
    expect(periodsForChoice('AM')).toEqual([0, 1]);
    expect(periodsForChoice('PM')).toEqual([2, 3]);
  });
});
