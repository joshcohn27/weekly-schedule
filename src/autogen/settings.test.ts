import * as XLSX from 'xlsx';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import SettingsView, { FIXED_RULES } from '../components/SettingsView';
import { buildAllWeeksWorkbook, buildWeekWorkbook, parseSettingsSheet, parseUploadedWorkbook } from '../excel';
import { sampleSchedule } from '../sample';
import { normalizeWeeksState } from '../storage';
import type { Schedule, WeeksState } from '../types';
import { DANCE_TARGETS, DAY_CAP, SESSION_FILLER_MAX, SESSION_HARD_MAX, SESSION_TARGETS, SLOT_CAP } from './config';
import { generateRun } from './session';
import { SETTING_AREAS, applySettings, defaultSettings, isDefaultSettings, normalizeSettings, type Settings } from './settings';
import { sessionBlocks, weekWithTrips } from './testUtil';
import { validateWeek } from './validate';

const noop = () => {};
/** The defaults with one area changed. */
const withArea = (area: string, patch: object): Settings => {
  const s = defaultSettings();
  Object.assign(s.areas[area], patch);
  return s;
};

afterEach(() => applySettings()); // the numbers are shared: put the defaults back

describe('settings', () => {
  it('start as the numbers the generator has always used', () => {
    const s = defaultSettings();
    expect(Object.keys(s.areas)).toEqual(SETTING_AREAS);
    expect(s.areas.Judaics).toEqual({ min: 2, max: 3, atOnce: 1, villagePerDay: 1 });
    expect(s.areas.Yoga).toEqual({ min: 2, max: 3, atOnce: 1, villagePerDay: 1 });
    expect(s.areas['Israel Education']).toEqual({ min: 2, max: 2, atOnce: 2, villagePerDay: 2 });
    expect(s.areas.Teva).toEqual({ min: 3, max: 3, atOnce: 2, villagePerDay: 2 });
    expect(s.areas.Dance.villages).toEqual({ O: 3, S: 3, C: 2, T: 2, M: 1 });
    expect(isDefaultSettings(s)).toBe(true);
    expect(isDefaultSettings(null)).toBe(true);
  });

  it('applying the defaults changes nothing', () => {
    const before = JSON.stringify([SESSION_TARGETS, DANCE_TARGETS, SESSION_FILLER_MAX, SESSION_HARD_MAX, SLOT_CAP, DAY_CAP]);
    applySettings(defaultSettings());
    expect(JSON.stringify([SESSION_TARGETS, DANCE_TARGETS, SESSION_FILLER_MAX, SESSION_HARD_MAX, SLOT_CAP, DAY_CAP])).toBe(before);
  });

  it('applying a change reaches the numbers the generator reads, and applying nothing puts the defaults back', () => {
    const s = withArea('Yoga', { min: 1, max: 1, atOnce: 2, villagePerDay: 3 });
    s.areas.Teva = { min: 2, max: 4, atOnce: 2, villagePerDay: 2 };
    s.areas.Dance.villages = { O: 1, M: 2 };
    applySettings(s);
    expect(SESSION_TARGETS.Yoga).toBe(1);
    expect(SESSION_FILLER_MAX.Yoga).toBeUndefined(); // no room above the minimum: it never fills a period
    expect(SESSION_HARD_MAX.Yoga).toBe(1);
    expect(SLOT_CAP.Yoga).toBe(2);
    expect(DAY_CAP.Yoga).toBe(3);
    expect(SESSION_TARGETS.Teva).toBe(2);
    expect(SESSION_FILLER_MAX.Teva).toBe(4);
    expect(DANCE_TARGETS).toEqual({ O: 1, M: 2, '*': 2 });
    applySettings();
    expect(SESSION_TARGETS.Yoga).toBe(2);
    expect(SESSION_FILLER_MAX).toEqual({ Yoga: 3, Ceramics: 3, Judaics: 3 });
    expect(DANCE_TARGETS.O).toBe(3);
  });

  it('repairs whatever it is given: missing areas, text, numbers out of range, a maximum under the minimum', () => {
    expect(isDefaultSettings(normalizeSettings('nonsense'))).toBe(true);
    const s = normalizeSettings({ areas: { Yoga: { min: '4', max: 1, atOnce: 9, villagePerDay: 'x' }, Archery: { min: 2 }, Dance: { villages: { o: '5', '': 2 } } } });
    expect(s.areas.Yoga).toEqual({ min: 4, max: 4, atOnce: 2, villagePerDay: 1 });
    expect(Object.keys(s.areas)).toEqual(SETTING_AREAS);
    expect(s.areas.Dance.villages).toEqual({ O: 5 });
    expect(s.areas.Judaics).toEqual(defaultSettings().areas.Judaics);
  });

  it('are saved with the schedule only when they are not the defaults', () => {
    const state = { weeks: [sampleSchedule(), null, null, null], current: 0 };
    expect(normalizeWeeksState(state)?.settings).toBeUndefined();
    expect(normalizeWeeksState({ ...state, settings: defaultSettings() })?.settings).toBeUndefined();
    const changed = withArea('Yoga', { min: 1, max: 1 });
    expect(normalizeWeeksState(JSON.parse(JSON.stringify({ ...state, settings: changed })))?.settings).toEqual(changed);
  });

  it('go into the Excel file on their own tab, come back on upload, and never read as a week', () => {
    const changed = withArea('Ceramics', { min: 1, max: 2, atOnce: 2, villagePerDay: 2 });
    changed.areas.Dance.villages = { O: 2, C: 2, S: 2, M: 2, T: 2 };
    for (const wb of [buildWeekWorkbook(sampleSchedule(), 2, changed), buildAllWeeksWorkbook([sampleSchedule(), null], changed)]) {
      const reread = XLSX.read(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }), { type: 'array' });
      expect(reread.SheetNames[reread.SheetNames.length - 1]).toBe('Settings');
      expect(parseSettingsSheet(reread)).toEqual(changed);
      expect(parseUploadedWorkbook(reread)).toHaveLength(1);
    }
    expect(parseSettingsSheet(buildWeekWorkbook(sampleSchedule(), 1))).toEqual(defaultSettings());
    expect(parseSettingsSheet(XLSX.utils.book_new())).toBeNull(); // an older file has no Settings tab
  });

  it('shows the page: a row per area, Dance by village, Reset, and the rules that are always kept', () => {
    const html = renderToStaticMarkup(createElement(SettingsView, { settings: defaultSettings(), villages: ['O', 'C', 'S', 'M', 'T'], onChange: noop, onReset: noop }));
    for (const name of ['Judaics', 'Israel', 'Teva', 'Ceramics', 'Yoga', 'Dance']) expect(html).toContain(`>${name}</th>`);
    expect(html).toContain('aria-label="Yoga at least"');
    expect(html).toContain('aria-label="Yoga at most"');
    expect(html).toContain('aria-label="Dance times for village M"');
    expect(html).not.toContain('aria-label="Dance at least"');
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Reset to the default settings/); // nothing to reset yet
    for (const rule of FIXED_RULES) expect(html).toContain(rule.replace(/&/g, '&amp;'));
    const changed = renderToStaticMarkup(createElement(SettingsView, { settings: withArea('Yoga', { min: 1, max: 1 }), villages: ['O'], onChange: noop, onReset: noop }));
    expect(changed).not.toMatch(/<button[^>]*disabled[^>]*>Reset to the default settings/);
  });
});

describe('the generator follows the settings', () => {
  it('never gives a third Yoga when the most is set to two', async () => {
    const settings = withArea('Yoga', { min: 2, max: 2 });
    const run = await generateRun({
      weeks: [1, 2, 3, 4].map((w) => weekWithTrips(sampleSchedule(), w)),
      steps: [0, 1, 2, 3].map((index) => ({ index, mode: 'fill-empty' as const })),
      roster: sampleSchedule().bunks,
      sessionWeeks: 4,
      keepTrips: true,
      useOtherWeeks: true,
      seed: 21,
      settings,
    });
    expect(run?.good).toBe(true);
    const weeks: WeeksState = { current: 0, weeks: run?.weeks ?? [] };
    for (const b of (weeks.weeks[0] as Schedule).bunks) {
      expect(sessionBlocks(weeks, b.name, 'Yoga'), b.name).toBeLessThanOrEqual(2);
    }
    // the rule checker reads the same settings: a third Yoga would now be one too many
    for (let w = 1; w <= 4; w++) expect(validateWeek(weeks, w, 4)).toEqual([]);
  }, 900_000);
});
