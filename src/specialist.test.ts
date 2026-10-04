import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import { buildSpecialistWorkbook, parseUploadedWorkbook } from './excel';
import { emptySchedule, newBunk, slotIndex } from './sample';
import { bunksText, ordinal, periodText, specialistRows, specialistSchedules, specialistSheetName, visitText } from './specialist';
import type { Schedule } from './types';

/** O1 and O2 (a whole village of two) and C1, with counts. */
function week(fill: (set: (name: string, day: number, period: number, label: string) => void) => void): Schedule {
  const s = emptySchedule();
  s.bunks = [newBunk('O1', '4th', '10'), newBunk('O2', '5th', '12'), newBunk('C1', '4th', '9')];
  fill((name, day, period, label) => {
    (s.bunks.find((b) => b.name === name) as Schedule['bunks'][number]).slots[slotIndex(day, period)] = label;
  });
  return s;
}

const w1 = week((set) => {
  set('O1', 0, 0, 'A&C');
  set('O2', 0, 0, 'A&C'); // together, both on their first
  set('O1', 2, 1, 'A&C'); // O1's second
  for (const n of ['O1', 'O2']) for (const p of [2, 3]) set(n, 1, p, 'Waterfront'); // a double, the whole village
  set('C1', 1, 0, 'Low Ropes');
  set('C1', 1, 1, 'Low Ropes');
  set('O1', 5, 0, 'AM Hobbies');
  set('O1', 4, 0, 'Tiyul');
  set('C1', 3, 0, 'Talent Show'); // a write-in: no program area
});
const w2 = week((set) => {
  set('O1', 1, 0, 'A&C'); // O1's third
  set('O2', 1, 0, 'A&C'); // O2's second
  set('C1', 0, 2, 'High Ropes');
  set('C1', 0, 3, 'High Ropes');
});
const weeks = [w1, w2, null, null];
const of = (area: string) => specialistSchedules(weeks).find((s) => s.area === area);

describe('specialist schedules', () => {
  it('lists each area in turn, leaving out hobbies, trips, write-ins and areas with nothing', () => {
    expect(specialistSchedules(weeks).map((s) => s.area)).toEqual(['Waterfront', 'Ropes', 'A&C']);
    expect(specialistSchedules([null, null])).toEqual([]);
  });

  it('puts the bunks that share a period in one block, in time order, with each bunk’s own visit number', () => {
    const blocks = of('A&C')?.blocks ?? [];
    expect(blocks.map((b) => [b.week, b.day, b.period, b.bunks.map((x) => `${x.name}:${x.visit}`).join(' ')])).toEqual([
      [1, 0, 0, 'O1:1 O2:1'],
      [1, 2, 1, 'O1:2'],
      [2, 1, 0, 'O1:3 O2:2'], // the count carries over from week 1
    ]);
  });

  it('counts a double period as one block and one visit, and several labels as one area', () => {
    const ropes = of('Ropes')?.blocks ?? [];
    expect(ropes.map((b) => [b.label, b.length, b.bunks[0].visit])).toEqual([['Low Ropes', 2, 1], ['High Ropes', 2, 2]]);
    expect(of('Waterfront')?.blocks).toHaveLength(1);
  });

  it('writes the rows a specialist reads', () => {
    expect(specialistRows(of('A&C')!, weeks)).toEqual([
      ['Week 1', 'Sunday', 'Period 1', 'A&C', 'O village', '1st', 22],
      ['Week 1', 'Tuesday', 'Period 2', 'A&C', 'O1', '2nd', 10],
      ['Week 2', 'Monday', 'Period 1', 'A&C', 'O village', 'O1 3rd, O2 2nd', 22],
    ]);
    expect(specialistRows(of('Waterfront')!, weeks)).toEqual([['Week 1', 'Monday', 'Periods 3-4', 'Waterfront', 'O village', '1st', 22]]);
    expect(specialistRows(of('Ropes')!, weeks)[1]).toEqual(['Week 2', 'Sunday', 'Periods 3-4', 'High Ropes', 'C1', '2nd', 9]);
  });

  it('words the small things plainly', () => {
    expect([1, 2, 3, 4, 11].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th']);
    expect(periodText({ period: 3, length: 1 })).toBe('Period 4');
    const block = { week: 1, day: 0, period: 0, length: 1, label: 'Music', bunks: [{ name: 'C1', visit: 1, campers: null }] };
    expect(bunksText(block, ['C1'])).toBe('C1'); // a village of one is just the bunk
    expect(visitText(block)).toBe('1st');
    expect(specialistRows({ area: 'Music', blocks: [block] }, weeks)[0][6]).toBe(''); // no camper count to add up
    expect(specialistSheetName('TW UH')).toBe('Time with UH');
    expect(specialistSheetName('A/B: [x]')).toBe('A B   x ');
  });

  it('builds a workbook with one tab per area that survives being written and read, and that an upload ignores', () => {
    const wb = XLSX.read(XLSX.write(buildSpecialistWorkbook(weeks), { type: 'array', bookType: 'xlsx' }), { type: 'array' });
    expect(wb.SheetNames).toEqual(['Waterfront', 'Ropes', 'A&C']);
    const rows: unknown[][] = XLSX.utils.sheet_to_json(wb.Sheets['A&C'], { header: 1 });
    expect(rows[0]).toEqual(['Week', 'Day', 'Period', 'Activity', 'Bunks', 'Visit', 'Campers']);
    expect(rows[3]).toEqual(['Week 2', 'Monday', 'Period 1', 'A&C', 'O village', 'O1 3rd, O2 2nd', 22]);
    expect(parseUploadedWorkbook(wb)).toEqual([]);
    expect(buildSpecialistWorkbook([null]).SheetNames).toEqual(['Specialists']);
  });
});
