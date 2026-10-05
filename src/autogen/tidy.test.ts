import { describe, expect, it } from 'vitest';
import { buildWeekWorkbook, parseSession, parseSettingsSheet } from '../excel';
import { newBunk, sampleSchedule } from '../sample';
import { pastDaysOf } from '../session';
import type { Schedule, WeeksState } from '../types';
import { slotAt } from './history';
import { generateRun } from './session';
import { SESSION_1, SESSION_2 } from './sessionCalendar';
import { defaultSettings, normalizeSettings } from './settings';
import { tidyWeek } from './tidy';
import { validateWeek } from './validate';

const notEmpty = (weeks: WeeksState, week: number, sessionWeeks: 3 | 4 = 4) => validateWeek(weeks, week, sessionWeeks).filter((v) => v.rule !== 'H1');

describe('a week that ran out of time comes back keeping the rules', () => {
  it('empties as few periods as it takes, marks them, and leaves what was there before alone', () => {
    const before = sampleSchedule();
    // entered by hand before generating: O1 at Ceramics on Monday period 1
    before.bunks[0].slots[slotAt(1, 0)] = 'Ceramics';
    const week: Schedule = { ...before, bunks: before.bunks.map((b) => ({ ...b, slots: [...b.slots] })) };
    const put = (name: string, slot: number, label: string) => (week.bunks.find((b) => b.name === name)!.slots[slot] = label);
    // three bunks at Ceramics in one period (one at a time), and Athletics twice in a day for C1
    put('O2', slotAt(1, 0), 'Ceramics');
    put('O3', slotAt(1, 0), 'Ceramics');
    put('C1', slotAt(2, 0), 'Athletics');
    put('C1', slotAt(2, 2), 'Athletics');
    // a village block on only part of the village, which has to go as a whole
    for (const name of ['S1', 'S2']) for (const s of [slotAt(3, 0), slotAt(3, 1)]) put(name, s, 'Waterfront');
    const state: WeeksState = { current: 0, weeks: [week, null, null, null] };
    expect(notEmpty(state, 1).length).toBeGreaterThan(0);

    const tidy = tidyWeek(week, before, state, 1, 4);
    // what is left is only what this hand-made week never had (hobbies, a swim, Shabbat Prep): nothing that is there breaks a rule
    const left = notEmpty({ current: 0, weeks: [tidy, null, null, null] }, 1);
    expect(left.filter((v) => !/missing|swims 0 times|should have Shabbat Prep/.test(v.message))).toEqual([]);
    const row = (name: string) => tidy.bunks.find((b) => b.name === name)!;
    expect(row('O1').slots[slotAt(1, 0)]).toBe('Ceramics'); // it was there before: never touched
    expect(row('O2').slots[slotAt(1, 0)]).toBe('');
    expect(row('O3').slots[slotAt(1, 0)]).toBe('');
    expect(row('O2').cleared).toContain(slotAt(1, 0)); // shown yellow, to be filled by hand
    expect(row('C1').slots.filter((l) => l === 'Athletics')).toHaveLength(1);
    expect(row('S1').slots.includes('Waterfront')).toBe(false); // the whole block, for everyone who had it
    expect(row('S2').slots.includes('Waterfront')).toBe(false);
    expect(week.bunks[1].slots[slotAt(1, 0)]).toBe('Ceramics'); // the week handed in is not changed
  });

  it('a run gives a week 45 seconds at the most, and what it hands back when time is up breaks no rule', async () => {
    const first: Schedule = { ...sampleSchedule(), bunks: SESSION_2.roster.map(([name, grades, count]) => newBunk(name, grades, count)) };
    const started = Date.now();
    // far too little time to find a good week: one short try, then it must settle
    const run = await generateRun({ weeks: [first, null, null, null], steps: [{ index: 0, mode: 'fill-empty' }], roster: first.bunks, sessionWeeks: 3, keepTrips: true, useOtherWeeks: true, seed: 3, calendar: true, maxMsPerTry: 60, maxWeekMs: 60 });
    expect(Date.now() - started).toBeLessThan(20_000);
    expect(run?.tries).toBe(1);
    const weeks: WeeksState = { current: 0, weeks: run?.weeks ?? [] };
    // nothing that is on the week breaks a rule (it may be short of something: a swim, a league period)
    expect(notEmpty(weeks, 1, 3).filter((v) => !/missing|swims 0 times|should have/.test(v.message))).toEqual([]);
  }, 60_000);
});

describe('days that have already happened', () => {
  it('count from the session dates, today included', () => {
    expect(pastDaysOf(SESSION_1, 1, new Date(2027, 5, 26))).toBe(0); // the day before opening day
    expect(pastDaysOf(SESSION_1, 1, new Date(2027, 5, 27))).toBe(1); // opening day itself
    expect(pastDaysOf(SESSION_1, 1, new Date(2027, 5, 30))).toBe(4);
    expect(pastDaysOf(SESSION_1, 2, new Date(2027, 5, 30))).toBe(0);
    expect(pastDaysOf(SESSION_1, 1, new Date(2027, 6, 20))).toBe(6);
    expect(pastDaysOf(SESSION_2, 1, new Date(2027, 6, 27))).toBe(3); // Sunday, opening Monday, and Tuesday
  });

  it('are left exactly as they are when the week is generated again, empty periods and all', async () => {
    const week = sampleSchedule();
    week.bunks.forEach((b, i) => {
      b.slots[slotAt(0, 0)] = i % 2 ? 'Music' : 'Yoga'; // nonsense that no generator would write, to prove it is kept
      b.slots[slotAt(1, 3)] = 'Dance';
      b.slots[slotAt(3, 0)] = 'Teva'; // Wednesday: not past, so a "replace" clears it
    });
    const run = await generateRun({ weeks: [week, null, null, null], steps: [{ index: 0, mode: 'replace-all', pastDays: 2 }], roster: week.bunks, sessionWeeks: 4, keepTrips: true, useOtherWeeks: true, seed: 8, maxMsPerTry: 3000, maxWeekMs: 3000 });
    const made = run?.weeks[0] as Schedule;
    made.bunks.forEach((b, i) => {
      expect(b.slots.slice(0, 8)).toEqual(week.bunks[i].slots.slice(0, 8)); // Sunday and Monday, the empty periods too
      expect(b.slots.slice(8).some((l) => l !== '')).toBe(true); // the rest of the week was built
    });
    expect(made.bunks.every((b) => b.slots.includes('No Periods') === false)).toBe(true);
  }, 60_000);
});

describe('the session and its calendar in the Excel file', () => {
  it('come back from a download', () => {
    const calendar = [
      { label: 'Mass Program', who: 'camp', week: 2, day: 4, periods: [0, 1, 2, 3] },
      { label: 'Tiyul', who: 'S', week: 2, day: 1, periods: [2, 3] },
    ];
    const settings = normalizeSettings({ ...defaultSettings(), calendar });
    const wb = buildWeekWorkbook(sampleSchedule(), 1, settings, 'session2');
    expect(wb.SheetNames).toContain('Calendar');
    expect(parseSession(wb)).toBe('session2');
    expect(parseSettingsSheet(wb)?.calendar).toEqual(calendar);
    // an untouched calendar is the session's own: no tab, and it comes back as that
    const plain = buildWeekWorkbook(sampleSchedule(), 1, defaultSettings(), 'session1');
    expect(plain.SheetNames).not.toContain('Calendar');
    expect(parseSession(plain)).toBe('session1');
    expect(parseSettingsSheet(plain)?.calendar).toBeUndefined();
    expect(parseSession(buildWeekWorkbook(sampleSchedule(), 1))).toBeNull(); // a file from before sessions were told apart
  });
});
