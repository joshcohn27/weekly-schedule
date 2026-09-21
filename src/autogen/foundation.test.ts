import { describe, expect, it } from 'vitest';
import { ACTIVITIES } from '../config';
import { emptySchedule, newBunk, sampleSchedule } from '../sample';
import type { WeeksState } from '../types';
import { blocksOf, buildHistory, villageWeeksWithLabel } from './history';
import { mulberry32, shuffle, weightedSample } from './rng';
import { buildRoster, pairable, parseAge, related } from './roster';

describe('rng', () => {
  it('is deterministic per seed and differs between seeds', () => {
    const a = mulberry32(7);
    const b = mulberry32(7);
    const c = mulberry32(8);
    const seqA = [a(), a(), a()];
    expect(seqA).toEqual([b(), b(), b()]);
    expect(seqA).not.toEqual([c(), c(), c()]);
    expect(seqA.every((x) => x >= 0 && x < 1)).toBe(true);
  });

  it('shuffles without losing items and samples without repeats', () => {
    const r = mulberry32(1);
    expect(shuffle(r, [1, 2, 3, 4, 5]).sort()).toEqual([1, 2, 3, 4, 5]);
    const picked = weightedSample(r, [{ item: 'a', weight: 1 }, { item: 'b', weight: 5 }, { item: 'c', weight: 0 }], 3);
    expect([...picked].sort()).toEqual(['a', 'b', 'c']);
  });
});

describe('roster', () => {
  it('reads age rank from the numbers in Grades, falling back to position in the village', () => {
    expect(parseAge('4th/5th', 1)).toBe(4.5);
    expect(parseAge('10th', 1)).toBe(10);
    expect(parseAge('', 3)).toBe(3);
  });

  it('builds villages, ages and the youngest/oldest sets for the default roster', () => {
    const r = buildRoster(sampleSchedule().bunks);
    expect(r.n).toBe(22);
    expect(r.villages).toEqual(['O', 'C', 'S', 'M', 'T']);
    expect(r.byVillage.O).toHaveLength(5);
    expect(r.byVillage.T).toHaveLength(4);
    expect(r.age[0]).toBe(4);
    expect(r.campers[0]).toBe(11);
    const names = (flags: boolean[]) => r.names.filter((_, i) => flags[i]);
    expect(names(r.young)).toEqual(['O1', 'O2', 'C1', 'C2']);
    expect(names(r.old)).toEqual(['T1', 'T2', 'T3', 'T4']);
  });

  it('splits a village where every bunk is the same grade into younger and older halves', () => {
    const bunks = ['O1', 'O2', 'O3', 'O4'].map((n) => newBunk(n, '5th', '10'));
    const r = buildRoster(bunks);
    expect(r.young).toEqual([true, true, false, false]);
    expect(r.old).toEqual([false, false, true, true]);
  });

  it('relates same-village bunks and S with M, and pairs only within a year of age', () => {
    const r = buildRoster([newBunk('S1', '7th'), newBunk('M1', '7th'), newBunk('S2', '9th'), newBunk('O1', '4th')]);
    expect(related(r, 0, 1)).toBe(true);
    expect(related(r, 0, 3)).toBe(false);
    expect(pairable(r, 0, 1)).toBe(true);
    expect(pairable(r, 0, 2)).toBe(false);
  });
});

describe('blocksOf', () => {
  it('counts a double period once and never merges across days', () => {
    const s = newBunk('O1');
    s.slots[0] = 'Pool';
    s.slots[1] = 'Pool';
    s.slots[3] = 'Pool';
    s.slots[4] = 'Pool';
    const blocks = blocksOf(s.slots);
    expect(blocks.map((b) => [b.start, b.len])).toEqual([[0, 2], [3, 1], [4, 1]]);
    expect(blocks[0].area).toBe('Pool');
  });
});

describe('history', () => {
  const weekWith = (fill: (slots: string[]) => void) => {
    const s = emptySchedule();
    const b = newBunk('O1');
    fill(b.slots);
    s.bunks.push(b);
    return s;
  };

  it('splits other weeks into earlier and later by week number, matching bunks by name', () => {
    const state: WeeksState = {
      current: 1,
      weeks: [
        weekWith((s) => { s[0] = 'Pool'; s[8] = 'Swim Test'; }),
        weekWith((s) => { s[0] = 'Music'; }),
        weekWith((s) => { s[0] = 'Pool'; }),
        null,
      ],
    };
    const [h] = buildHistory(state, 2, ['O1']);
    expect(h.earlier).toEqual({ Pool: 2 });
    expect(h.later).toEqual({ Pool: 1 });
  });

  it('finds which villages already had a label in another week', () => {
    const state: WeeksState = {
      current: 0,
      weeks: [weekWith((s) => { s[10] = 'Tiyul'; }), weekWith(() => {}), null, null],
    };
    expect(villageWeeksWithLabel(state, 2, 'Tiyul')).toEqual({ O: 1 });
    expect(villageWeeksWithLabel(state, 1, 'Tiyul')).toEqual({});
  });
});

describe('activities', () => {
  it('has the three week-4 labels, all uncounted in tracking', () => {
    for (const label of ['Hobby Culmination', 'Packing Time', 'Banquet Prep']) {
      expect(ACTIVITIES.find((a) => a.label === label)?.area).toBeNull();
    }
  });
});
