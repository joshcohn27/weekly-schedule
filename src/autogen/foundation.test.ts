import { describe, expect, it } from 'vitest';
import { ACTIVITIES } from '../config';
import { emptySchedule, newBunk, sampleSchedule } from '../sample';
import type { WeeksState } from '../types';
import { CAMPER_CAP } from './config';
import { blocksOf, buildHistory, villageWeeksWithLabel } from './history';
import { mulberry32, shuffle, weightedSample } from './rng';
import { buildRoster, isSameAgeGroup, parseAge, shareLevel } from './roster';
import { ropeGroups } from './groups';
import { applySettings, defaultCore, defaultSettings, withCore } from './settings';
import { OPEN, STRICT, groupBreaks, slotGroupProblems } from './share';

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

  it('lets neighbours in a village share, and S with M of the same age, but never bunks further apart', () => {
    const r = buildRoster([newBunk('S1', '7th'), newBunk('S2', '7th/8th'), newBunk('S3', '9th'), newBunk('M1', '7th'), newBunk('O1', '4th')]);
    expect(shareLevel(r, 0, 1, 'Athletics')).toBe(2); // next to each other, half a grade apart
    expect(shareLevel(r, 0, 2, 'Athletics')).toBe(0); // S1 and S3 are not next to each other
    expect(shareLevel(r, 0, 3, 'Athletics')).toBe(2); // S with M, same age
    expect(shareLevel(r, 0, 3, 'Ropes')).toBe(0); // never across villages at Ropes
    expect(shareLevel(r, 0, 4, 'Athletics')).toBe(0); // S never with O
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

describe('who may share a period and an area', () => {
  const grades: [string, string][] = [
    ['O1', '4th'], ['O2', '4th/5th'], ['O3', '5th'], ['O4', '5th/6th'],
    ['C1', '4th'], ['C2', '5th'], ['C3', '5th'],
    ['S1', '7th'], ['S2', '7th/8th'], ['S3', '8th/9th'],
    ['M1', '7th/8th'], ['M2', '8th'], ['M3', '8th/9th'],
    ['T1', '10th'], ['T2', '10th'], ['T3', '10th'],
  ];
  const r = buildRoster(grades.map(([name, grade]) => newBunk(name, grade, '12')));
  const i = (name: string): number => r.names.indexOf(name);
  const level = (a: string, b: string, area: string) => shareLevel(r, i(a), i(b), area);
  const problems = (area: string, names: string[], ordinals: number[] = names.map(() => 1), relax = OPEN) =>
    slotGroupProblems(r, area, names.map(i), (b) => ordinals[names.map(i).indexOf(b)], relax).map((p) => p.rule);

  it('only lets neighbours in a village share', () => {
    for (const area of ['Athletics', 'A&C', 'Music', 'Teva', 'Dance', 'Ropes', 'Pool']) {
      expect(level('O1', 'O4', area), area).toBe(0);
      expect(level('O4', 'M2', area), area).toBe(0);
      expect(level('C2', 'C3', area), area).toBe(2);
    }
  });

  it('lets O share with C and S with M only within the grade rule, never at Ropes, and O with C never at the pool', () => {
    expect(level('O1', 'C1', 'Music')).toBe(2);
    expect(level('O1', 'C2', 'Music')).toBe(1); // a grade apart: allowed, not preferred
    expect(level('O1', 'C1', 'Ropes')).toBe(0);
    expect(level('O1', 'C1', 'Pool')).toBe(0);
    expect(level('O1', 'C1', 'Yoga')).toBe(0);
    expect(level('O1', 'S1', 'Athletics')).toBe(0);
    expect(level('S1', 'M2', 'Athletics')).toBe(1);
    expect(level('S1', 'M3', 'Athletics')).toBe(0);
  });

  it('lets S and M share the pool only at the same age', () => {
    expect(level('S1', 'M1', 'Pool')).toBeGreaterThan(0); // 7th with 7th/8th
    expect(level('S1', 'M2', 'Pool')).toBe(0); // 7th with 8th
    expect(level('S2', 'M3', 'Pool')).toBe(0); // 7th/8th with 8th/9th
  });

  it('lets any Tusc bunks share, and Tusc with nobody else', () => {
    expect(level('T1', 'T3', 'Music')).toBe(2);
    expect(level('T1', 'S3', 'Athletics')).toBe(0);
  });

  it('Athletics: any two or three bunks on any visit, never four', () => {
    expect(problems('Athletics', ['O1', 'S1', 'T1'])).toEqual([]);
    expect(problems('Athletics', ['C2', 'C3'], [1, 2])).toEqual([]);
    expect(problems('Athletics', ['O1', 'O2', 'S1', 'T1'])).toEqual(['H14']);
  });

  it('A&C: a pair that may share or three of the same age, always on the same visit', () => {
    expect(problems('A&C', ['C2', 'C3'])).toEqual([]);
    expect(problems('A&C', ['C2', 'C3'], [1, 2])).toEqual(['H5']);
    expect(problems('A&C', ['O1', 'O4'])).toEqual(['H13']);
    expect(isSameAgeGroup(r, ['O2', 'O3', 'C2'].map(i))).toBe(true);
    expect(problems('A&C', ['O2', 'O3', 'C2'])).toEqual([]);
    expect(problems('A&C', ['O2', 'O3', 'C2'], [2, 2, 3])).toEqual(['H5']);
    expect(problems('A&C', ['O1', 'O3', 'C2'])).toEqual(['H13']); // 4th with 5th is not the same age
    expect(problems('A&C', ['O2', 'O3', 'C2', 'C3'])).toEqual(['H14']);
  });

  it('one bunk at a time at Ceramics; two of one village at Judaics; two small bunks at Yoga; two similar bunks at Israel; two of one village at Time with UH', () => {
    expect(problems('Ceramics', ['C2', 'C3'])).toEqual(['H14']);
    // Judaics: two bunks of one village, on the same visit
    expect(problems('Judaics', ['C2', 'C3'])).toEqual([]);
    expect(problems('Judaics', ['C2', 'C3'], [1, 2])).toEqual(['H5']);
    expect(problems('Judaics', ['O1', 'C1'])).toEqual(['H13']);
    expect(problems('Judaics', ['C1', 'C2', 'C3'])).toEqual(['H14']);
    // Yoga goes by campers: every bunk in this roster has 12, and the most together is 20
    expect(problems('Yoga', ['C2', 'C3'])).toEqual(['H14']);
    CAMPER_CAP.Yoga = 24;
    expect(problems('Yoga', ['C2', 'C3'])).toEqual([]);
    expect(problems('Yoga', ['C1', 'C2', 'C3'])).toEqual(['H14']);
    CAMPER_CAP.Yoga = 20;
    expect(problems('Israel Education', ['C2', 'C3'])).toEqual([]);
    expect(problems('Israel Education', ['O1', 'C1'])).toEqual([]); // the same age across O and C
    expect(problems('Israel Education', ['O1', 'O4'])).toEqual(['H13']);
    expect(problems('Israel Education', ['C1', 'C2', 'C3'])).toEqual(['H14']);
    expect(problems('TW UH', ['O1', 'O4'])).toEqual([]);
    expect(problems('TW UH', ['O1', 'C1'])).toEqual(['H13']);
    expect(problems('TW UH', ['O1', 'O2', 'O3'])).toEqual(['H14']);
  });

  it('Ropes goes by people: neighbours of one village, with no more campers than the limit', () => {
    // the limit starts at 30 campers, and every bunk in this roster has 12
    expect(problems('Ropes', ['O1', 'O2'])).toEqual([]); // 24 campers
    expect(problems('Ropes', ['O1', 'C1'])).toEqual(['H13']); // two villages
    expect(problems('Ropes', ['O1', 'O5'])).toEqual(['H13']); // two grades apart: they may not share
    expect(problems('Ropes', ['O1', 'O2', 'O3'], [1, 1, 1])).toEqual(['H14']); // 36 campers
    expect(problems('Ropes', ['O1', 'O2'], [1, 2])).toEqual(['H5']); // still on the same visit
    // it is the number of campers that counts, not the number of bunks
    applySettings(withCore(defaultSettings(), { ...defaultCore(), ropesMaxCampers: 40 }));
    expect(problems('Ropes', ['O1', 'O2', 'O3'], [1, 1, 1])).toEqual([]);
    expect(problems('Ropes', ['O1', 'O2', 'O3', 'O4'], [1, 1, 1, 1])).toEqual(['H14']); // 48 campers
    applySettings(withCore(defaultSettings(), { ...defaultCore(), ropesMaxCampers: 20 }));
    expect(problems('Ropes', ['O1', 'O2'])).toEqual(['H14']);
    applySettings();
  });

  it('puts bunks into ropes groups by campers, and leaves a bunk that is too big on its own', () => {
    const names = (groups: number[][]): string[] => groups.map((g) => g.map((b) => r.names[b]).join('+'));
    const onondaga = r.byVillage.O; // four bunks of 12 campers
    const first = () => 0;
    const last = () => 1;
    expect(names(ropeGroups(r, onondaga, () => 0, first))).toEqual(['O1+O2', 'O3+O4']); // 24 each, under 30
    applySettings(withCore(defaultSettings(), { ...defaultCore(), ropesMaxCampers: 45 }));
    expect(names(ropeGroups(r, onondaga, () => 0, first))).toEqual(['O1+O2+O3', 'O4']); // three bunks is 36
    expect(names(ropeGroups(r, onondaga, () => 0, last))).toEqual(['O1', 'O2+O3+O4']); // packed from the other end
    applySettings(withCore(defaultSettings(), { ...defaultCore(), ropesMaxCampers: 10 }));
    expect(names(ropeGroups(r, onondaga, () => 0, first))).toEqual(['O1', 'O2', 'O3', 'O4']); // too big to pair: every bunk goes alone
    applySettings();
    // bunks on different visits are never grouped
    expect(names(ropeGroups(r, onondaga, (b) => (b === onondaga[1] ? 1 : 0), first))).toEqual(['O1', 'O2', 'O3+O4']);
  });

  it('counts breaks the same way the search does', () => {
    const rng = mulberry32(5);
    for (let k = 0; k < 4000; k++) {
      const area = ['Athletics', 'A&C', 'Music', 'Teva', 'Dance', 'Yoga', 'Judaics', 'TW UH', 'Ropes'][Math.floor(rng() * 9)];
      const size = 2 + Math.floor(rng() * 3);
      const group: number[] = [];
      while (group.length < size) {
        const b = Math.floor(rng() * r.n);
        if (!group.includes(b)) group.push(b);
      }
      const ord = group.map(() => 1 + Math.floor(rng() * 2));
      const ordinal = (b: number): number => ord[group.indexOf(b)];
      for (const relax of [OPEN, STRICT]) {
        expect(groupBreaks(r, area, group, ordinal, relax), `${area} ${group.join(',')} ${ord.join(',')}`).toBe(slotGroupProblems(r, area, group, ordinal, relax).length);
      }
    }
  });
});
