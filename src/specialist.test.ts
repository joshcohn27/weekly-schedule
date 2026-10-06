import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import { buildSpecialistWorkbook, parseUploadedWorkbook } from './excel';
import { emptySchedule, newBunk, slotIndex } from './sample';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import SpecialistView from './components/SpecialistView';
import { bunksText, cellText, ordinal, periodText, specialistRows, specialistSchedules, specialistSheetName, specialistWeeks, visitText } from './specialist';
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

  const DAY_ROW = ['', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const period = (n: number, cells: Record<number, string> = {}): string[] => [`Period ${n}`, ...[0, 1, 2, 3, 4, 5].map((d) => cells[d] ?? '')];

  it('lays each week out as a grid, days across and periods down, saying who comes, which visit and how many campers', () => {
    const grids = specialistWeeks(of('A&C')!, weeks);
    expect(grids.map((g) => g.week)).toEqual([1, 2]);
    expect(grids[0].cells).toHaveLength(4);
    expect(grids[0].cells[0]).toHaveLength(6);
    expect(grids[0].cells[0][0]).toEqual([{ who: 'Onondaga', detail: '1st visit, 22 campers' }]); // Sunday period 1
    expect(grids[0].cells[1][2]).toEqual([{ who: 'O1', detail: '2nd visit, 10 campers' }]); // Tuesday period 2
    expect(grids[0].cells[0][1]).toEqual([]);
    expect(grids[1].cells[0][1]).toEqual([{ who: 'Onondaga', detail: 'O1 3rd, O2 2nd, 22 campers' }]); // on different visits
    // a double period is written in both of its periods, with the activity named when it is not the area's own name
    const ropes = specialistWeeks(of('Ropes')!, weeks);
    expect(ropes[0].cells[0][1]).toEqual([{ who: 'Low Ropes: C1', detail: '1st visit, 9 campers' }]);
    expect(ropes[0].cells[1][1]).toEqual(ropes[0].cells[0][1]);
    expect(ropes[1].cells[2][0]).toEqual([{ who: 'High Ropes: C1', detail: '2nd visit, 9 campers' }]);
    expect(cellText([...ropes[0].cells[0][1], ...ropes[1].cells[2][0]])).toBe('Low Ropes: C1 (1st visit, 9 campers); High Ropes: C1 (2nd visit, 9 campers)');
  });

  it('writes the same grids as spreadsheet rows, one week under another', () => {
    expect(specialistRows(of('A&C')!, weeks)).toEqual([
      ['Week 1'],
      DAY_ROW,
      period(1, { 0: 'Onondaga (1st visit, 22 campers)' }),
      period(2, { 2: 'O1 (2nd visit, 10 campers)' }),
      period(3),
      period(4),
      [],
      ['Week 2'],
      DAY_ROW,
      period(1, { 1: 'Onondaga (O1 3rd, O2 2nd, 22 campers)' }),
      period(2),
      period(3),
      period(4),
    ]);
    expect(specialistRows(of('Waterfront')!, weeks)).toEqual([
      ['Week 1'],
      DAY_ROW,
      period(1),
      period(2),
      period(3, { 1: 'Onondaga (1st visit, 22 campers)' }),
      period(4, { 1: 'Onondaga (1st visit, 22 campers)' }),
    ]);
  });

  it('words the small things plainly', () => {
    expect([1, 2, 3, 4, 11].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th']);
    expect(periodText({ period: 3, length: 1 })).toBe('Period 4');
    const block = { week: 1, day: 0, period: 0, length: 1, label: 'Music', bunks: [{ name: 'C1', visit: 1, campers: null }] };
    expect(bunksText(block, ['C1'])).toBe('C1'); // a village of one is just the bunk
    expect(visitText(block)).toBe('1st');
    expect(specialistWeeks({ area: 'Music', blocks: [block] }, weeks)[0].cells[0][0]).toEqual([{ who: 'C1', detail: '1st visit' }]); // no camper count to add up
    expect(specialistSheetName('TW UH')).toBe('Time with UH');
    expect(specialistSheetName('A/B: [x]')).toBe('A B   x ');
  });

  it('builds a workbook with one tab per area that survives being written and read, and that an upload ignores', () => {
    const wb = XLSX.read(XLSX.write(buildSpecialistWorkbook(weeks), { type: 'array', bookType: 'xlsx' }), { type: 'array' });
    expect(wb.SheetNames).toEqual(['Waterfront', 'Ropes', 'A&C']);
    const rows: unknown[][] = XLSX.utils.sheet_to_json(wb.Sheets['A&C'], { header: 1 });
    expect(rows[0]).toEqual(['Week 1']);
    expect(rows[1].slice(1)).toEqual(['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']);
    expect(rows[2].slice(0, 2)).toEqual(['Period 1', 'Onondaga (1st visit, 22 campers)']);
    expect(rows[9][2]).toBe('Onondaga (O1 3rd, O2 2nd, 22 campers)'); // week 2, Monday period 1
    expect(parseUploadedWorkbook(wb)).toEqual([]);
    expect(buildSpecialistWorkbook([null]).SheetNames).toEqual(['Specialists']);
  });

  it('shows on the Specialists tab: a program area to pick, a grid for each week, Print and Download', () => {
    const html = renderToStaticMarkup(createElement(SpecialistView, { weeks, onDownload: () => {} }));
    expect(html).toContain('aria-label="Program area"');
    for (const area of ['Waterfront', 'Ropes', 'A&amp;C']) expect(html).toContain(`>${area}</option>`);
    // the first area with anything is shown to start with: Waterfront, one week, a double period in two boxes
    expect(html).toContain('Waterfront, Week 1');
    expect((html.match(/<table/g) ?? []).length).toBe(1);
    expect((html.match(/<strong>Onondaga<\/strong><span>1st visit, 22 campers<\/span>/g) ?? []).length).toBe(2);
    expect(html).toContain('>Print</button>');
    expect(html).toContain('Download all areas (.xlsx)');
    expect(renderToStaticMarkup(createElement(SpecialistView, { weeks: [null], onDownload: () => {} }))).toContain('Nothing is scheduled yet.');
  });
});
