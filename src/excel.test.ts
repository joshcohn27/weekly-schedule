import { describe, expect, it } from 'vitest';
import { buildAllWeeksWorkbook, buildWeekWorkbook, parseUploadedWorkbook } from './excel';
import { emptySchedule, newBunk, sampleSchedule } from './sample';

describe('single-week download round trip', () => {
  it('exports and re-imports a week unchanged, tagged with its week number', () => {
    const original = sampleSchedule();
    const wb = buildWeekWorkbook(original, 3);
    const [upload] = parseUploadedWorkbook(wb);

    expect(upload.weekNumber).toBe(3);
    expect(upload.schedule.bunks.map((b) => b.name)).toEqual(original.bunks.map((b) => b.name));
    expect(upload.schedule.bunks.map((b) => b.slots)).toEqual(original.bunks.map((b) => b.slots));
    expect(upload.schedule.days).toEqual(original.days);
  });

  it('round-trips day info', () => {
    const s = sampleSchedule();
    s.days[0] = { ...s.days[0], rhLod: 'Alex', ts: 'Sam', notes: 'bring sunscreen' };
    const [upload] = parseUploadedWorkbook(buildWeekWorkbook(s, 1));
    expect(upload.schedule.days[0].rhLod).toBe('Alex');
    expect(upload.schedule.days[0].ts).toBe('Sam');
    expect(upload.schedule.days[0].notes).toBe('bring sunscreen');
  });

  it('round-trips an empty week', () => {
    const [upload] = parseUploadedWorkbook(buildWeekWorkbook(emptySchedule(), 1));
    expect(upload.schedule.bunks).toEqual([]);
    expect(upload.schedule.days).toHaveLength(6);
  });

  it('drops unknown activity labels on the way back in', () => {
    const s = emptySchedule();
    const bunk = newBunk('O1');
    bunk.slots[0] = 'Pool';
    bunk.slots[1] = 'Not A Real Activity';
    s.bunks.push(bunk);
    const [upload] = parseUploadedWorkbook(buildWeekWorkbook(s, 1));
    expect(upload.schedule.bunks[0].slots[0]).toBe('Pool');
    expect(upload.schedule.bunks[0].slots[1]).toBe('');
  });

  it('ignores the Tracking tab when reading a single-week file', () => {
    const uploads = parseUploadedWorkbook(buildWeekWorkbook(sampleSchedule(), 2));
    expect(uploads).toHaveLength(1);
    expect(uploads[0].weekNumber).toBe(2);
  });
});

describe('all-weeks download round trip', () => {
  it('puts each loaded week on its own tab and skips empty slots', () => {
    const week1 = sampleSchedule();
    const week3 = emptySchedule();
    week3.bunks.push(newBunk('X1'));
    const wb = buildAllWeeksWorkbook([week1, null, week3, null]);

    expect(wb.SheetNames).toEqual(['Week 1', 'Week 3', 'Whole Session Tracking']);

    const uploads = parseUploadedWorkbook(wb);
    expect(uploads.map((u) => u.weekNumber)).toEqual([1, 3]);
    expect(uploads[0].schedule.bunks.map((b) => b.name)).toEqual(week1.bunks.map((b) => b.name));
    expect(uploads[1].schedule.bunks.map((b) => b.name)).toEqual(['X1']);
  });

  it('a 4-week file uploads generically as 4 weeks', () => {
    const weeks = [sampleSchedule(), sampleSchedule(), sampleSchedule(), sampleSchedule()];
    const wb = buildAllWeeksWorkbook(weeks);
    const uploads = parseUploadedWorkbook(wb);
    expect(uploads.map((u) => u.weekNumber)).toEqual([1, 2, 3, 4]);
    for (const u of uploads) expect(u.schedule.bunks).toHaveLength(sampleSchedule().bunks.length);
  });
});
