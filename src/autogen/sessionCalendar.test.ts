import { describe, expect, it } from 'vitest';
import { areaOf } from '../config';
import { isGuest, villageOf } from '../autofill';
import { newBunk, sampleSchedule } from '../sample';
import { generateRun } from './session';
import { validateWeek } from './validate';
import type { Schedule } from '../types';
import { TRIP_LABELS } from './config';
import { halfSlots, slotAt } from './history';
import { SESSION_1, SESSION_2, SESSION_CALENDAR, SESSION_TEMPLATES, applyCalendar, calendarFor, normalizeCalendar, templateFor } from './sessionCalendar';
import { applySettings, defaultSettings, normalizeSettings, templateSettings } from './settings';

const blankWeeks = (n: number): (Schedule | null)[] => Array.from({ length: 4 }, (_, i) => (i < n ? sampleSchedule() : null));
const at = (weeks: (Schedule | null)[], week: number, bunk: string, day: number, period: number): string =>
  (weeks[week - 1] as Schedule).bunks.find((b) => b.name === bunk)!.slots[slotAt(day, period)];

describe('the session calendar', () => {
  it('knows every label it uses, and the generator leaves them all alone', () => {
    for (const t of SESSION_TEMPLATES) {
      for (const e of t.events) {
        expect(e.week).toBeLessThanOrEqual(t.weeks);
        if (e.who.startsWith('TC')) continue; // Taste of CSL has ordinary activities on its set week
        expect(TRIP_LABELS, e.label).toContain(e.label);
        expect(e.week).toBeLessThanOrEqual(t.weeks);
        expect(areaOf(e.label) === null || areaOf(e.label) === 'Trips', e.label).toBe(true);
      }
    }
    expect(templateFor(4)).toBe(SESSION_1);
    expect(templateFor(3)).toBe(SESSION_2);
  });

  it('Session 1 is 2026: Visitor Day and Mass Program in week 3, village day and the bike trip in week 4', () => {
    const weeks = applyCalendar(blankWeeks(4), SESSION_1.events);
    // week 1: opening day is the Sunday and has no periods; nothing else
    expect((weeks[0] as Schedule).bunks.every((b) => b.slots.every((l, s) => l === (s < 4 ? 'Opening Day' : '')))).toBe(true);
    expect(at(weeks, 2, 'O1', 2, 2)).toBe('Tiyul');
    expect(at(weeks, 2, 'C1', 4, 3)).toBe('Tiyul');
    expect(at(weeks, 2, 'T1', 3, 2)).toBe('Bike Trip'); // the mini bike trip
    expect(at(weeks, 3, 'S1', 0, 0)).toBe('All Camp Clean Up');
    expect(at(weeks, 3, 'S1', 0, 3)).toBe("Visitor's Day");
    expect(at(weeks, 3, 'M2', 3, 1)).toBe('');
    expect(at(weeks, 3, 'M2', 3, 2)).toBe('Mass Program');
    for (const p of [0, 1, 2, 3]) expect(at(weeks, 3, 'T1', 4, p)).toBe('Mass Program');
    for (const v of ['O', 'C', 'S', 'M']) expect(at(weeks, 4, `${v}1`, 0, 0)).toBe(`${v}-Day`);
    // Tusc has no village day in session 1: it is on the bike trip Sunday to Tuesday
    for (const day of [0, 1, 2]) expect(at(weeks, 4, 'T1', day, 3)).toBe('Bike Trip');
    expect(at(weeks, 4, 'T1', 3, 0)).toBe('');
    expect([at(weeks, 4, 'S1', 1, 2), at(weeks, 4, 'S1', 2, 1), at(weeks, 4, 'S1', 2, 2)]).toEqual(['Tiyul', 'Tiyul', '']);
    expect([at(weeks, 4, 'M1', 2, 2), at(weeks, 4, 'M1', 3, 1), at(weeks, 4, 'M1', 3, 2)]).toEqual(['Tiyul', 'Tiyul', '']);
  });

  it('Session 2 is 2026: periods from Tuesday, village day for everyone (Tusc too), Color War in week 3', () => {
    const weeks = applyCalendar(blankWeeks(3), SESSION_2.events);
    expect(at(weeks, 1, 'O1', 0, 0)).toBe('No Periods');
    expect(at(weeks, 1, 'O1', 1, 3)).toBe('Opening Day');
    expect(at(weeks, 1, 'O1', 2, 0)).toBe('');
    expect(at(weeks, 1, 'T1', 2, 0)).toBe('Trip');
    expect(at(weeks, 2, 'O1', 0, 2)).toBe('Tiyul');
    expect(at(weeks, 2, 'C1', 0, 3)).toBe('Tiyul');
    // Seneca goes on its Tiyul the day before Mohawk, and neither is on village day
    expect([at(weeks, 2, 'S1', 1, 2), at(weeks, 2, 'S1', 2, 0)]).toEqual(['Tiyul', 'Tiyul']);
    expect([at(weeks, 2, 'M1', 2, 2), at(weeks, 2, 'M1', 3, 0)]).toEqual(['Tiyul', 'Tiyul']);
    for (const v of ['O', 'C', 'S', 'M', 'T']) for (const p of [0, 1, 2, 3]) expect(at(weeks, 2, `${v}1`, 4, p)).toBe(`${v}-Day`);
    expect(at(weeks, 3, 'M1', 0, 2)).toBe('All Camp Clean Up');
    for (const day of [1, 2]) expect(at(weeks, 3, 'M1', day, 0)).toBe('Color War');
    expect(at(weeks, 3, 'O1', 4, 2)).toBe('Tusc Triathlon');
  });

  it('Taste of CSL: TC bunks are a village of their own with a set week 1, copied from 2026, and are left out of generating', async () => {
    expect(isGuest('TC1')).toBe(true);
    expect(isGuest(' tc 3')).toBe(true);
    expect(isGuest('T1')).toBe(false);
    expect(villageOf('TC2')).toBe('TC'); // not Tusc
    expect(villageOf('T2')).toBe('T');
    const first: Schedule = { ...sampleSchedule(), bunks: SESSION_2.roster.map(([name, grades, count]) => newBunk(name, grades, count)) };
    const weeks = applyCalendar([first, null, null, null], SESSION_2.events);
    const week = (name: string): string[] => (weeks[0] as Schedule).bunks.find((b) => b.name === name)!.slots;
    // Sunday nothing, Monday opening day, then Tuesday to Friday as "TC 1" had it in 2026
    expect(week('TC1')).toEqual([
      ...Array(4).fill('No Periods'),
      ...Array(4).fill('Opening Day'),
      'Swim Test', 'Pool', 'A&C', 'Low Ropes',
      'Waterfront', 'Waterfront', 'PM Hobbies', 'PM Hobbies',
      'Athletics', 'Music', 'Pool', 'Teva',
      'AM Hobbies', 'AM Hobbies', 'A&C', 'Dance',
    ]);
    expect(week('TC2')).toEqual(week('TC1'));
    // TC3 and TC4 do what "TC 2" did: ropes and A&C the other way round on Tuesday
    expect(week('TC3').slice(8, 12)).toEqual(['Swim Test', 'Pool', 'Low Ropes', 'A&C']);
    expect(week('TC4')).toEqual(week('TC3'));
    expect(week('T1').slice(8, 12)).toEqual(['Trip', 'Trip', 'Trip', 'Trip']); // Tusc is not Taste of CSL

    // generating: the TC weeks come back untouched, nobody else is at the pool or the Waterfront with them, and they are
    // only in week 1
    const run = await generateRun({ weeks: [first, null, null, null], steps: [0, 1].map((index) => ({ index, mode: 'fill-empty' as const })), roster: first.bunks, sessionWeeks: 3, keepTrips: true, useOtherWeeks: true, seed: 12, calendar: true, maxTotalMs: 60_000 });
    const made = run?.weeks[0] as Schedule;
    const row = (name: string): string[] => made.bunks.find((b) => b.name === name)!.slots;
    expect(row('TC1')).toEqual(week('TC1'));
    expect(row('TC4')).toEqual(week('TC4'));
    // Taste of CSL has an area to itself: nobody else is at A&C, ropes, Athletics, Music, Teva or Dance when it is
    for (const b of made.bunks) {
      if (isGuest(b.name)) continue;
      for (let s = 8; s < 24; s++) {
        const theirs = [areaOf(row('TC1')[s]), areaOf(row('TC4')[s])];
        if (areaOf(b.slots[s]) && areaOf(b.slots[s]) !== 'Hobbies') expect(theirs, `${b.name} period ${s}`).not.toContain(areaOf(b.slots[s]));
      }
    }
    for (const b of made.bunks) {
      if (isGuest(b.name)) continue;
      for (const s of [8, 9, 18]) expect(['Pool', 'Swim Test', 'Tusc Triathlon Training'], `${b.name} ${s}`).not.toContain(b.slots[s]);
      for (const s of [12, 13]) expect(b.slots[s], b.name).not.toBe('Waterfront');
      expect(b.slots.slice(14, 16)).toEqual(['PM Hobbies', 'PM Hobbies']); // hobbies with Taste of CSL, Wednesday afternoon
    }
    expect((run?.weeks[1] as Schedule).bunks.some((b) => isGuest(b.name))).toBe(false);
    // however many Taste bunks there are, the first half does what "TC 1" did and the rest what "TC 2" did
    const six: Schedule = { ...sampleSchedule(), bunks: ['TC1', 'TC2', 'TC3', 'TC4', 'TC5', 'TC6', 'O1'].map((n) => newBunk(n, '3rd', '10')) };
    const filled = applyCalendar([six, null, null, null], SESSION_2.events)[0] as Schedule;
    expect(filled.bunks.map((b) => b.slots[10])).toEqual(['A&C', 'A&C', 'A&C', 'Low Ropes', 'Low Ropes', 'Low Ropes', '']);
    // Session 2 starts with fewer Yoga and Dance than Session 1, and is otherwise the same
    const two = templateSettings(SESSION_2);
    expect(two.areas.Yoga).toMatchObject({ min: 1, max: 2 });
    expect(two.areas.Dance.villages).toEqual({ O: 2, S: 2, C: 1, T: 1, M: 1 });
    expect(two.areas.Teva).toEqual(defaultSettings().areas.Teva);
    expect(templateSettings(SESSION_1)).toEqual(defaultSettings());
    expect(validateWeek({ current: 0, weeks: run?.weeks ?? [] }, 1, 3).filter((v) => v.bunk && isGuest(v.bunk))).toEqual([]);
  }, 120_000);

  it('only fills empty periods, leaves a trip entered by hand on another day alone, and can be limited to some weeks', () => {
    const weeks = blankWeeks(4);
    // by hand: a Tiyul for O on Wednesday afternoon of week 3, and something in the way of Visitor Day for one bunk
    for (const b of (weeks[2] as Schedule).bunks) if (b.name.startsWith('O')) for (const s of halfSlots(3, 1)) b.slots[s] = 'Tiyul';
    (weeks[2] as Schedule).bunks[5].slots[slotAt(0, 3)] = 'Music';
    const out = applyCalendar(weeks, SESSION_1.events);
    expect(at(out, 2, 'O1', 2, 2)).toBe(''); // not a second Tiyul in week 2
    expect(at(out, 3, 'O1', 3, 2)).toBe('Tiyul'); // theirs stays (Mass Program does not write over it)
    expect(at(out, 2, 'C1', 4, 2)).toBe('Tiyul'); // the other villages still get theirs
    expect(at(out, 3, 'C1', 0, 3)).toBe('Music');
    expect(at(out, 3, 'C1', 0, 2)).toBe("Visitor's Day");
    expect(at(weeks, 3, 'C1', 0, 2)).toBe(''); // the weeks handed in are not changed
    const onlyFour = applyCalendar(blankWeeks(4), SESSION_1.events, new Set([3]));
    expect(at(onlyFour, 3, 'S1', 0, 0)).toBe('');
    expect(at(onlyFour, 4, 'S1', 0, 0)).toBe('S-Day');
    // putting it on twice changes nothing
    expect(applyCalendar(out, SESSION_1.events)).toEqual(out);
  });

  it('is kept with the settings when it has been changed, and falls back to the template otherwise', () => {
    expect(calendarFor(4)).toBe(SESSION_1.events);
    const mine = [
      { label: 'Mass Program', who: 'camp', week: 2, day: 4, periods: [3, 2, 2] },
      { label: '', who: 'O', week: 1, day: 0, periods: [0] },
      { label: 'Tiyul', who: 'onondaga', week: 9, day: 0, periods: [0] },
    ];
    expect(normalizeCalendar(mine)).toEqual([{ label: 'Mass Program', who: 'camp', week: 2, day: 4, periods: [2, 3] }]);
    expect(normalizeCalendar('x')).toBeNull();
    const s = normalizeSettings({ ...defaultSettings(), calendar: mine });
    applySettings(s);
    expect(calendarFor(4)).toEqual([{ label: 'Mass Program', who: 'camp', week: 2, day: 4, periods: [2, 3] }]);
    applySettings();
    expect(SESSION_CALENDAR.events).toBeNull();
  });
});
