import { describe, expect, it } from 'vitest';
import { sampleSchedule } from '../sample';
import type { Schedule, WeeksState } from '../types';
import { slotAt } from './history';
import { validateWeek, type Rule } from './validate';

const put = (s: Schedule, names: string[], slots: number[], label: string) => {
  for (const b of s.bunks) if (names.includes(b.name)) for (const t of slots) b.slots[t] = label;
};
const village = (s: Schedule, letter: string): string[] => s.bunks.filter((b) => b.name.startsWith(letter)).map((b) => b.name);
const everyone = (s: Schedule): string[] => s.bunks.map((b) => b.name);
const state = (...weeks: (Schedule | null)[]): WeeksState => ({ current: 0, weeks: [...weeks, null, null, null].slice(0, 4) });
const rules = (w: WeeksState, week: number, sessionWeeks: 3 | 4 = 4, locked?: boolean[][]): Rule[] =>
  validateWeek(w, week, sessionWeeks, { locked }).map((v) => v.rule);
const has = (w: WeeksState, week: number, rule: Rule, sessionWeeks: 3 | 4 = 4) => rules(w, week, sessionWeeks).includes(rule);
const S = slotAt;

describe('validateWeek', () => {
  it('returns nothing for an empty week or a missing week', () => {
    expect(validateWeek(state(null), 1, 4)).toEqual([]);
    expect(validateWeek({ current: 0, weeks: [{ bunks: [], days: sampleSchedule().days }, null, null, null] }, 1, 4)).toEqual([]);
  });

  it('H1: flags empty periods, except Friday of the last week of a 4-week session', () => {
    const w1 = state(sampleSchedule());
    expect(has(w1, 1, 'H1')).toBe(true);
    const fridayOnly = validateWeek(state(null, null, null, sampleSchedule()), 4, 4).filter((v) => v.rule === 'H1' && v.slot !== undefined && v.slot >= S(5, 0));
    expect(fridayOnly).toEqual([]);
    const friday3 = validateWeek(state(sampleSchedule(), sampleSchedule(), sampleSchedule()), 3, 3).filter((v) => v.rule === 'H1' && v.slot !== undefined && v.slot >= S(5, 0));
    expect(friday3.length).toBeGreaterThan(0);
  });

  it('H2: a program area twice on one day', () => {
    const s = sampleSchedule();
    put(s, ['O1'], [S(1, 0), S(1, 2)], 'Athletics');
    expect(has(state(s), 1, 'H2')).toBe(true);
    const ok = sampleSchedule();
    put(ok, ['O1'], [S(1, 0), S(2, 0)], 'Athletics');
    expect(has(state(ok), 1, 'H2')).toBe(false);
  });

  it('H2: a double period is one block, and Bike Trip days are exempt', () => {
    const s = sampleSchedule();
    put(s, ['O1'], [S(1, 0), S(1, 1)], 'Athletics');
    expect(has(state(s), 1, 'H2')).toBe(false);
    put(s, ['T1'], [S(1, 0), S(1, 1), S(1, 2)], 'Bike Trip');
    put(s, ['T1'], [S(1, 3)], 'Tiyul');
    expect(has(state(s), 1, 'H2')).toBe(false);
  });

  it('H3: a village-level block must cover the whole village', () => {
    const s = sampleSchedule();
    put(s, ['O1'], [S(1, 0), S(1, 1)], 'Waterfront');
    expect(has(state(s), 1, 'H3')).toBe(true);
    const ok = sampleSchedule();
    put(ok, village(ok, 'O'), [S(1, 0), S(1, 1)], 'Waterfront');
    expect(has(state(ok), 1, 'H3')).toBe(false);
  });

  it('H4: Waterfront must be aligned and one village per half-day', () => {
    const misaligned = sampleSchedule();
    put(misaligned, village(misaligned, 'O'), [S(1, 1), S(1, 2)], 'Waterfront');
    expect(has(state(misaligned), 1, 'H4')).toBe(true);
    const two = sampleSchedule();
    put(two, village(two, 'O'), [S(1, 0), S(1, 1)], 'Waterfront');
    put(two, village(two, 'C'), [S(1, 0), S(1, 1)], 'Waterfront');
    expect(has(state(two), 1, 'H4')).toBe(true);
    const ok = sampleSchedule();
    put(ok, village(ok, 'O'), [S(1, 0), S(1, 1)], 'Waterfront');
    put(ok, village(ok, 'C'), [S(1, 2), S(1, 3)], 'Waterfront');
    expect(has(state(ok), 1, 'H4')).toBe(false);
  });

  it('H4: no Waterfront before the swim test in week 1', () => {
    const early = (w: WeeksState, week = 1): string[] => validateWeek(w, week, 4).filter((v) => v.message.includes('before the swim test')).map((v) => v.bunk ?? '');
    // Sunday morning is too early for anyone, with or without a swim test
    const morning = sampleSchedule();
    put(morning, village(morning, 'M'), [S(0, 0), S(0, 1)], 'Waterfront');
    expect(early(state(morning))).toEqual(village(morning, 'M'));
    // Mohawk swims its test during General Swim, after period 4: no Waterfront for it at all on the first day, and fine on the second
    const mohawk = sampleSchedule();
    put(mohawk, village(mohawk, 'M'), [S(0, 2), S(0, 3)], 'Waterfront');
    expect(early(state(mohawk))).toEqual(village(mohawk, 'M'));
    const monday = sampleSchedule();
    put(monday, village(monday, 'M'), [S(1, 0), S(1, 1)], 'Waterfront');
    expect(early(state(monday))).toEqual([]);
    // Sunday afternoon is fine once the village's own swim test is behind it, and not before
    const after = sampleSchedule();
    put(after, village(after, 'O'), [S(0, 1)], 'Swim Test');
    put(after, village(after, 'O'), [S(0, 2), S(0, 3)], 'Waterfront');
    expect(early(state(after))).toEqual([]);
    const before = sampleSchedule();
    put(before, village(before, 'O'), [S(1, 0)], 'Swim Test'); // a test on Monday morning
    put(before, village(before, 'O'), [S(0, 2), S(0, 3)], 'Waterfront');
    expect(early(state(before))).toEqual(village(before, 'O'));
    // it is a week 1 rule: the same Sunday morning in week 2 is fine
    expect(early(state(sampleSchedule(), morning), 2)).toEqual([]);
  });

  it('H5: two related bunks in the same area at the same slot must be on the same ordinal', () => {
    const week1 = sampleSchedule();
    put(week1, ['C1'], [S(0, 0)], 'A&C'); // C1 has done A&C once
    const week2 = sampleSchedule();
    put(week2, ['C1', 'C2'], [S(1, 0)], 'A&C'); // C1 second time, C2 first time
    expect(has(state(week1, week2), 2, 'H5')).toBe(true);
    const fine = sampleSchedule();
    put(fine, ['C1', 'C2'], [S(1, 0)], 'A&C');
    expect(has(state(sampleSchedule(), fine), 2, 'H5')).toBe(false);
    // at Athletics the same visit is only preferred
    const athWeek1 = sampleSchedule();
    put(athWeek1, ['C1'], [S(0, 0)], 'Athletics');
    const athWeek2 = sampleSchedule();
    put(athWeek2, ['C1', 'C2'], [S(1, 0)], 'Athletics');
    expect(has(state(athWeek1, athWeek2), 2, 'H5')).toBe(false);
    const cross = sampleSchedule();
    put(cross, ['S1', 'M1'], [S(1, 0)], 'Music'); // S with M is checked
    const crossWeek1 = sampleSchedule();
    put(crossWeek1, ['S1'], [S(0, 0)], 'Music');
    expect(has(state(crossWeek1, cross), 2, 'H5')).toBe(true);
    const unrelated = sampleSchedule();
    put(unrelated, ['O1', 'C1'], [S(1, 0)], 'Music'); // different villages are not compared
    expect(has(state(crossWeek1, unrelated), 2, 'H5')).toBe(false);
  });

  it('H5: village-level and hobbies blocks are exempt', () => {
    const s = sampleSchedule();
    put(s, village(s, 'O'), [S(1, 0), S(1, 1)], 'Waterfront');
    expect(has(state(s), 1, 'H5')).toBe(false);
  });

  it('H6: ropes are doubles, low first then high, at most two per session', () => {
    const w1 = sampleSchedule();
    put(w1, ['O1'], [S(1, 0), S(1, 1)], 'Low Ropes');
    const wrong = sampleSchedule();
    put(wrong, ['O1'], [S(1, 0), S(1, 1)], 'Low Ropes'); // second time must be High
    expect(has(state(w1, wrong), 2, 'H6')).toBe(true);
    const right = sampleSchedule();
    put(right, ['O1'], [S(1, 0), S(1, 1)], 'High Ropes');
    expect(has(state(w1, right), 2, 'H6')).toBe(false);
    const single = sampleSchedule();
    put(single, ['O1'], [S(1, 0)], 'Low Ropes');
    expect(has(state(single), 1, 'H6')).toBe(true);
    const third = sampleSchedule();
    put(third, ['O1'], [S(2, 0), S(2, 1)], 'High Ropes');
    expect(has(state(w1, right, third), 3, 'H6')).toBe(true);
  });

  it('H7: Judaics at most three times and Israel at most twice per bunk per session', () => {
    const mk = (label: string) => () => {
      const s = sampleSchedule();
      put(s, ['O1'], [S(1, 0)], label);
      return s;
    };
    const judaics = mk('Judaics');
    expect(has(state(judaics(), judaics(), judaics()), 3, 'H7')).toBe(false);
    expect(has(state(judaics(), judaics(), judaics(), judaics()), 4, 'H7')).toBe(true);
    const israel = mk('Israel');
    expect(has(state(israel(), israel()), 2, 'H7')).toBe(false);
    expect(has(state(israel(), israel(), israel()), 3, 'H7')).toBe(true);
  });

  it('H19: no Music or Judaics while a village is at Shabbat Prep', () => {
    const messages = (s: Schedule, locked?: boolean[][]): string[] => validateWeek(state(sampleSchedule(), s), 2, 4, { locked }).filter((v) => v.rule === 'H19').map((v) => v.message);
    const w = sampleSchedule();
    for (const b of w.bunks) for (let s = 0; s < 24; s++) if (b.slots[s] === 'Music' || b.slots[s] === 'Judaics') b.slots[s] = 'Athletics';
    put(w, village(w, 'O'), [S(2, 0)], 'Shabbat Prep');
    expect(messages(w)).toEqual([]);
    const s1 = village(w, 'S')[0];
    put(w, [s1], [S(2, 0)], 'Music');
    put(w, [village(w, 'M')[0]], [S(2, 0)], 'Judaics');
    put(w, [village(w, 'S')[1]], [S(2, 1)], 'Music'); // the next period is fine
    expect(messages(w)).toHaveLength(2);
    expect(messages(w)[0]).toContain(`${s1} has Music on Tuesday period 1, during Shabbat Prep.`);
    // filled in by hand: left alone
    expect(messages(w, w.bunks.map(() => Array<boolean>(24).fill(true)))).toEqual([]);
  });

  it('H8: Shabbat Prep follows the calendar; Tiyul is entered by hand and never checked', () => {
    const shabbat = (s: Schedule, names: string[]) => put(s, names, [S(5, 2), S(5, 3)], 'Shabbat Prep');
    const w2 = sampleSchedule();
    shabbat(w2, [...village(w2, 'O'), ...village(w2, 'C')]);
    expect(has(state(sampleSchedule(), w2), 2, 'H8')).toBe(false); // rotation week 2 is O and C
    const wrongVillage = sampleSchedule();
    shabbat(wrongVillage, village(wrongVillage, 'S'));
    expect(has(state(sampleSchedule(), wrongVillage), 2, 'H8')).toBe(true);
    const tiyul = sampleSchedule();
    put(tiyul, village(tiyul, 'O'), [S(1, 2), S(1, 3)], 'Tiyul');
    // twice, and in a week that was never on the old calendar: both are the user's call
    expect(validateWeek(state(tiyul, tiyul), 1, 4).filter((v) => v.message.includes('Tiyul'))).toEqual([]);
  });

  it('H9: triathlon training needs the pool to itself', () => {
    const s = sampleSchedule();
    put(s, village(s, 'T'), [S(1, 0)], 'Tusc Triathlon Training');
    put(s, ['O1'], [S(1, 0)], 'Pool');
    expect(has(state(s), 1, 'H9')).toBe(true);
    const ok = sampleSchedule();
    put(ok, village(ok, 'T'), [S(1, 0)], 'Tusc Triathlon Training');
    expect(has(state(ok), 1, 'H9')).toBe(false);
  });

  it('H10: at most 80 campers at the pool, except a whole village', () => {
    const big = sampleSchedule();
    put(big, ['O1', 'O2', 'C1', 'S1', 'S2', 'M1', 'M2', 'T1'], [S(1, 0)], 'Pool');
    expect(has(state(big), 1, 'H10')).toBe(true); // 11+12+12+10+14+11+13+14 = 97
    const single = sampleSchedule();
    put(single, ['S2'], [S(1, 0)], 'Pool');
    expect(has(state(single), 1, 'H10')).toBe(false);
    const swim = sampleSchedule();
    put(swim, village(swim, 'S'), [S(0, 0)], 'Swim Test'); // a whole village is the unit
    expect(has(state(swim), 1, 'H10')).toBe(false);
  });

  it('H16: one group at the pool, lessons alone, O and C apart, Tusc together, one or two swims a week', () => {
    const lesson = sampleSchedule();
    put(lesson, ['O1', 'O2'], [S(1, 0)], 'Pool'); // both on a lesson: a lesson is one bunk alone
    expect(has(state(lesson), 1, 'H16')).toBe(true);
    const mixed = sampleSchedule();
    put(mixed, ['O1', 'C1'], [S(1, 0)], 'Pool');
    expect(validateWeek(state(mixed), 1, 4).some((v) => v.rule === 'H16' && v.message.includes('never share the pool'))).toBe(true);
    const tusc = sampleSchedule();
    put(tusc, ['T1', 'T2'], [S(1, 0)], 'Pool');
    expect(validateWeek(state(tusc), 1, 4).some((v) => v.rule === 'H16' && v.message.includes('every Tusc bunk'))).toBe(true);
    const allTusc = sampleSchedule();
    put(allTusc, village(allTusc, 'T'), [S(1, 0)], 'Pool');
    expect(validateWeek(state(allTusc), 1, 4).some((v) => v.rule === 'H16' && v.message.includes('Tusc'))).toBe(false);
    const swims = (count: number) => {
      const s = sampleSchedule();
      for (let day = 0; day < count; day++) put(s, ['O1'], [S(day, 0)], 'Pool');
      return validateWeek(state(s), 1, 4).some((v) => v.rule === 'H16' && v.bunk === 'O1' && v.message.includes('swims'));
    };
    expect(swims(0)).toBe(true);
    expect(swims(1)).toBe(false);
    expect(swims(2)).toBe(false); // a second swim in a week is always allowed
    expect(swims(3)).toBe(true);
  });

  it('H14 and H15: slot caps, village day caps and the weekly Athletics and A&C limit', () => {
    const judaics = sampleSchedule();
    put(judaics, ['O1', 'O2', 'O3'], [S(1, 0)], 'Judaics'); // two of one village at the most
    expect(has(state(judaics), 1, 'H14')).toBe(true);
    const both = sampleSchedule();
    put(both, ['O1'], [S(1, 0)], 'Judaics');
    put(both, ['S1'], [S(1, 0)], 'Israel'); // Judaics and Israel may run in the same period
    expect(has(state(both), 1, 'H14')).toBe(false);
    expect(has(state(both), 1, 'H13')).toBe(false);
    const four = sampleSchedule();
    put(four, ['O1', 'C1', 'S1', 'M1', 'T1'], [S(1, 0)], 'Athletics'); // four at the most
    expect(has(state(four), 1, 'H14')).toBe(true);
    const three = sampleSchedule();
    put(three, ['O1', 'C1', 'S1'], [S(1, 0)], 'Athletics'); // any three bunks may be at Athletics
    expect(has(state(three), 1, 'H14')).toBe(false);
    expect(has(state(three), 1, 'H13')).toBe(false);
    const day = sampleSchedule();
    ['O1', 'O2', 'O3', 'O4'].forEach((name, k) => put(day, [name], [S(1, k)], 'Teva')); // four O bunks at Teva in one day, and the most is 3
    expect(has(state(day), 1, 'H15')).toBe(true);
    const uh = sampleSchedule();
    for (const d of [0, 1, 2, 3]) put(uh, ['O1'], [S(d, 0)], 'Time with UH');
    expect(validateWeek(state(uh), 1, 4).some((v) => v.rule === 'H15' && v.message.includes('Time with UH 4 times'))).toBe(true);
    const week = sampleSchedule();
    for (const d of [0, 1, 2]) put(week, ['O1'], [S(d, 0)], 'A&C');
    expect(has(state(week), 1, 'H15')).toBe(false); // three single periods a week is the most
    put(week, ['O1'], [S(3, 0)], 'A&C');
    expect(validateWeek(state(week), 1, 4).some((v) => v.rule === 'H15' && v.message.includes('4 A&C blocks'))).toBe(true);
  });

  it('H17: nothing back to back', () => {
    const double = sampleSchedule();
    put(double, ['O1'], [S(1, 0), S(1, 1)], 'Athletics');
    expect(validateWeek(state(double), 1, 4).some((v) => v.rule === 'H17' && v.message.includes('double period of Athletics'))).toBe(true);
    const across = sampleSchedule();
    put(across, ['O1'], [S(1, 3), S(2, 0)], 'Music'); // Monday period 4, then Tuesday period 1
    expect(has(state(across), 1, 'H17')).toBe(true);
    const apart = sampleSchedule();
    put(apart, ['O1'], [S(1, 3), S(2, 1)], 'Music');
    expect(has(state(apart), 1, 'H17')).toBe(false);
    const trip = sampleSchedule();
    put(trip, village(trip, 'S'), [S(1, 2), S(1, 3), S(2, 0), S(2, 1)], 'Tiyul'); // an overnight trip is not back to back
    expect(has(state(trip), 1, 'H17')).toBe(false);
  });

  it('H18: nothing two days in a row', () => {
    const message = (s: Schedule, locked?: boolean[][]): string[] => validateWeek(state(s), 1, 4, { locked }).filter((v) => v.rule === 'H18').map((v) => v.message);
    const next = sampleSchedule();
    put(next, ['O1'], [S(1, 1), S(2, 2)], 'Athletics'); // Monday and Tuesday, different periods
    expect(message(next)).toEqual(['O1 has Athletics on Monday and again on Tuesday.']);
    const skip = sampleSchedule();
    put(skip, ['O1'], [S(1, 1), S(3, 2)], 'Athletics'); // Monday and Wednesday
    expect(message(skip)).toEqual([]);
    // it goes by program area: Low Ropes and then High Ropes the next day is Ropes twice, and league counts for the whole village
    const ropes = sampleSchedule();
    put(ropes, ['O1'], [S(1, 0), S(1, 1)], 'Low Ropes');
    put(ropes, ['O1'], [S(2, 0), S(2, 1)], 'High Ropes');
    expect(message(ropes)).toEqual(['O1 has Ropes on Monday and again on Tuesday.']);
    const league = sampleSchedule();
    put(league, village(league, 'C'), [S(3, 0)], 'CHL');
    put(league, village(league, 'C'), [S(4, 3)], 'CHL');
    expect(message(league)).toHaveLength(village(league, 'C').length);
    // Friday into Sunday does not count (they are the two ends of the week), and trips are exempt
    const ends = sampleSchedule();
    put(ends, ['O1'], [S(0, 0), S(5, 3)], 'Music');
    expect(message(ends)).toEqual([]);
    const trip = sampleSchedule();
    put(trip, village(trip, 'S'), [S(1, 2), S(1, 3), S(2, 0), S(2, 1)], 'Tiyul');
    expect(message(trip)).toEqual([]);
    // two days that were both filled in by hand are left alone; one of them is enough to flag it
    const o1 = next.bunks.findIndex((b) => b.name === 'O1');
    const lock = (slots: number[]): boolean[][] => next.bunks.map((_, b) => Array.from({ length: 24 }, (_x, s) => b === o1 && slots.includes(s)));
    expect(message(next, lock([S(1, 1), S(2, 2)]))).toEqual([]);
    expect(message(next, lock([S(1, 1)]))).toHaveLength(1);
  });

  it('H11: hobbies must be camp-wide, on the right periods, and follow the calendar', () => {
    const partial = sampleSchedule();
    put(partial, ['O1'], [S(3, 2), S(3, 3)], 'PM Hobbies');
    expect(has(state(partial), 1, 'H11')).toBe(true);
    const firstSunday = sampleSchedule();
    put(firstSunday, everyone(firstSunday), [S(0, 0), S(0, 1)], 'AM Hobbies');
    expect(validateWeek(state(firstSunday), 1, 4).some((v) => v.rule === 'H11' && v.message.includes('first Sunday'))).toBe(true);
    const wrongPeriods = sampleSchedule();
    put(wrongPeriods, everyone(wrongPeriods), [S(5, 1), S(5, 2)], 'AM Hobbies');
    expect(has(state(wrongPeriods), 1, 'H11')).toBe(true);
    const good = sampleSchedule();
    put(good, everyone(good), [S(5, 0), S(5, 1)], 'AM Hobbies');
    put(good, everyone(good), [S(3, 2), S(3, 3)], 'PM Hobbies');
    expect(validateWeek(state(good), 1, 4).filter((v) => v.rule === 'H11')).toEqual([]);
  });

  it('H11: the last week of a 4-week session has its own calendar', () => {
    const w = sampleSchedule();
    const notT = w.bunks.filter((b) => !b.name.startsWith('T')).map((b) => b.name);
    put(w, notT, [S(1, 0), S(1, 1)], 'AM Hobbies');
    put(w, village(w, 'T'), [S(1, 0), S(1, 1), S(1, 2), S(1, 3)], 'Bike Trip');
    put(w, everyone(w), [S(4, 0), S(4, 1)], 'Hobby Culmination');
    put(w, notT, [S(4, 2), S(4, 3)], 'Packing Time');
    put(w, village(w, 'T'), [S(4, 2), S(4, 3)], 'Banquet Prep');
    expect(validateWeek(state(null, null, null, w), 4, 4).filter((v) => v.rule === 'H11')).toEqual([]);
    put(w, ['O1'], [S(5, 0)], 'Music');
    expect(has(state(null, null, null, w), 4, 'H11')).toBe(true);
  });

  it('H12: unknown labels are flagged', () => {
    const s = sampleSchedule();
    put(s, ['O1'], [S(1, 0)], 'Not A Real Activity');
    expect(has(state(s), 1, 'H12')).toBe(true);
  });

  it('leaves locked cells alone', () => {
    const s = sampleSchedule();
    put(s, ['O1'], [S(1, 0)], 'Not A Real Activity');
    const locked = s.bunks.map(() => Array<boolean>(24).fill(false));
    locked[0][S(1, 0)] = true;
    expect(rules(state(s), 1, 4, locked)).not.toContain('H12');
  });
});
