import * as XLSX from 'xlsx';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import SettingsView, { FIXED_RULES } from '../components/SettingsView';
import { buildAllWeeksWorkbook, buildWeekWorkbook, parseSettingsSheet, parseUploadedWorkbook } from '../excel';
import { ACTIVITIES, AREAS, OPTION_GROUPS, areaOf } from '../config';
import { sampleSchedule } from '../sample';
import { computeTracking } from '../tracking';
import { normalizeWeeksState } from '../storage';
import type { Schedule, WeeksState } from '../types';
import { DANCE_TARGETS, DAY_CAP, SESSION_FILLER_MAX, SESSION_HARD_MAX, SESSION_TARGETS, SLOT_CAP } from './config';
import { checkSettings } from './feasibility';
import { generateRun } from './session';
import { SETTING_AREAS, addArea, applySettings, cleanAreaName, defaultSettings, isDefaultSettings, normalizeSettings, removeArea, settingAreas, whyNotAdd, type Settings } from './settings';
import { TOKEN_AREAS } from './planner';
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
    // an area that does not come with the app is taken as one that was added, with the defaults for what it leaves out
    expect(Object.keys(s.areas)).toEqual([...SETTING_AREAS, 'Archery']);
    expect(s.custom).toEqual(['Archery']);
    expect(s.areas.Archery).toEqual({ min: 2, max: 2, atOnce: 1, villagePerDay: 2 });
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

describe('the arithmetic check on the settings', () => {
  const weeks = [sampleSchedule(), null, null, null];

  it('finds nothing wrong with the defaults, and has nothing to say before there are bunks', () => {
    expect(checkSettings(defaultSettings(), weeks)).toEqual([]);
    expect(checkSettings(withArea('Yoga', { min: 9, max: 9 }), [null, null])).toEqual([]);
  });

  it('flags settings that leave too many periods for Athletics and A&C, and says how many visits to add', () => {
    // Yoga cut to 1 and no third Ceramics: the configuration that did not generate in ten minutes when it was tried
    const s = withArea('Yoga', { min: 1, max: 1 });
    s.areas.Ceramics.max = 2;
    const [problem, ...rest] = checkSettings(s, weeks);
    expect(rest).toEqual([]);
    expect(problem.level).toBe('unlikely');
    expect(problem.text).toMatch(/^A schedule is unlikely with these settings: each village O bunk would have about 14 periods/);
    expect(problem.fix).toMatch(/^Try giving each bunk about 2 more visits a session: raise .*Ceramics, Yoga/);
    // with almost nothing scheduled the periods cannot be filled at all
    const bare = defaultSettings();
    for (const area of Object.keys(bare.areas)) Object.assign(bare.areas[area], { min: 0, max: 0, villages: bare.areas[area].villages ? {} : undefined });
    const none = checkSettings(bare, weeks).find((p) => p.text.startsWith('A schedule is not possible'));
    expect(none?.level).toBe('no');
  });

  it('flags an area that is asked for more visits than it has places', () => {
    // one bunk at a time, 22 bunks three times: 66 of the session's 74 periods, which did not generate when it was tried
    const tight = checkSettings(withArea('Yoga', { min: 3, max: 3 }), weeks);
    expect(tight.map((p) => p.level)).toEqual(['unlikely']);
    expect(tight[0].text).toContain('Yoga is set to 66 visits in the session out of 74 places');
    expect(tight[0].fix).toBe('Try at most 2 per bunk, or 2 bunks at once.');
    const over = checkSettings(withArea('Yoga', { min: 4, max: 4 }), weeks);
    expect(over.some((p) => p.level === 'no' && p.text.includes('there are only 74 places'))).toBe(true);
    // two at a time has the room
    expect(checkSettings(withArea('Yoga', { min: 3, max: 3, atOnce: 2, villagePerDay: 2 }), weeks)).toEqual([]);
  });

  it('flags a village that cannot send enough bunks in a day', () => {
    const s = withArea('Teva', { min: 5, max: 5, villagePerDay: 1 });
    const found = checkSettings(s, weeks).filter((p) => p.text.startsWith('Village O needs 25 Teva visits'));
    expect(found).toHaveLength(1);
    expect(found[0].fix).toBe('Try 2 bunks of one village in a day for Teva, or fewer visits.');
  });

  it('shows on the page what is wrong and what to try', () => {
    const s = withArea('Yoga', { min: 3, max: 3 });
    const html = renderToStaticMarkup(createElement(SettingsView, { settings: s, villages: ['O'], onChange: noop, onReset: noop, problems: checkSettings(s, weeks) }));
    expect(html).toContain('Unlikely to work.');
    expect(html).toContain('Try at most 2 per bunk, or 2 bunks at once.');
    const fine = renderToStaticMarkup(createElement(SettingsView, { settings: defaultSettings(), villages: ['O'], onChange: noop, onReset: noop, problems: [] }));
    expect(fine).toContain('These settings add up');
  });
});

describe('adding and removing program areas', () => {
  const archery = { min: 2, max: 2, atOnce: 2, villagePerDay: 2 };

  it('adds an area with the numbers chosen for it, and removes it again', () => {
    const added = addArea(defaultSettings(), '  Archery ', archery);
    expect(added.custom).toEqual(['Archery']);
    expect(added.areas.Archery).toEqual(archery);
    expect(settingAreas(added)).toEqual([...SETTING_AREAS, 'Archery']);
    expect(isDefaultSettings(added)).toBe(false);
    const two = addArea(added, 'Martial Arts');
    expect(two.custom).toEqual(['Archery', 'Martial Arts']);
    expect(two.areas['Martial Arts']).toEqual({ min: 2, max: 2, atOnce: 1, villagePerDay: 2 });
    expect(removeArea(two, 'Archery').custom).toEqual(['Martial Arts']);
    expect(isDefaultSettings(removeArea(added, 'Archery'))).toBe(true);
  });

  it('refuses a name that is empty, taken, already added, or one too many', () => {
    const s = addArea(defaultSettings(), 'Archery', archery);
    expect(whyNotAdd(s, '   ')).toBe('Give the program area a name.');
    expect(whyNotAdd(s, 'yoga')).toBe('"yoga" is already an activity.');
    expect(whyNotAdd(s, 'Ropes')).toBe('"Ropes" is already an activity.'); // a program area that comes with the app
    expect(whyNotAdd(s, 'ARCHERY')).toBe('"ARCHERY" has already been added.');
    expect(whyNotAdd(s, 'Fencing')).toBeNull();
    expect(addArea(s, 'Yoga')).toBe(s);
    let full = defaultSettings();
    for (const n of ['A1', 'A2', 'A3', 'A4', 'A5', 'A6']) full = addArea(full, n);
    expect(whyNotAdd(full, 'A7')).toBe('No more than 6 program areas can be added.');
    expect(cleanAreaName('  Rock/Climbing:  wall ')).toBe('Rock Climbing wall');
  });

  it('makes an added area a real activity while its settings are in force, and takes it away again', () => {
    applySettings(addArea(defaultSettings(), 'Archery', archery));
    expect(areaOf('Archery')).toBe('Archery');
    expect(AREAS).toContain('Archery');
    expect(ACTIVITIES.some((a) => a.label === 'Archery')).toBe(true);
    expect(OPTION_GROUPS.some((g) => g.items.some((a) => a.label === 'Archery'))).toBe(true);
    expect(OPTION_GROUPS[OPTION_GROUPS.length - 1].group).toBe('Not counted in tracking'); // still the last group
    expect(TOKEN_AREAS).toContain('Archery');
    expect([SESSION_TARGETS.Archery, SLOT_CAP.Archery, DAY_CAP.Archery, SESSION_HARD_MAX.Archery]).toEqual([2, 2, 2, 2]);
    expect(computeTracking([{ ...sampleSchedule().bunks[0], slots: ['Archery', ...Array<string>(23).fill('')] }]).areas).toContain('Archery');
    // the rule checker accepts it as a known activity
    const week = sampleSchedule();
    week.bunks[0].slots[0] = 'Archery';
    expect(validateWeek({ current: 0, weeks: [week] }, 1, 4).filter((v) => v.rule === 'H12')).toEqual([]);
    applySettings();
    expect(areaOf('Archery')).toBeNull();
    expect(AREAS).not.toContain('Archery');
    expect(TOKEN_AREAS).not.toContain('Archery');
    expect(SLOT_CAP.Archery).toBeUndefined();
    expect(validateWeek({ current: 0, weeks: [week] }, 1, 4).filter((v) => v.rule === 'H12')).toHaveLength(1);
  });

  it('keeps added areas when saved, and in the Excel file', () => {
    const s = addArea(addArea(defaultSettings(), 'Archery', archery), 'Martial Arts', { min: 1, max: 2, atOnce: 1, villagePerDay: 1 });
    expect(normalizeSettings(JSON.parse(JSON.stringify(s)))).toEqual(s);
    const wb = XLSX.read(XLSX.write(buildWeekWorkbook(sampleSchedule(), 1, s), { type: 'array', bookType: 'xlsx' }), { type: 'array' });
    expect(parseSettingsSheet(wb)).toEqual(s);
    // nonsense in a saved copy is dropped, not kept
    expect(normalizeSettings({ areas: { ...s.areas, Yoga2: 'x' }, custom: ['Archery', 'Yoga', 'Yoga2', 'Archery'] }).custom).toEqual(['Archery']);
  });

  it('counts an added area in the arithmetic check', () => {
    const weeks = [sampleSchedule(), null, null, null];
    // one bunk at a time, four times each: 88 visits and only 74 periods
    const s = addArea(defaultSettings(), 'Archery', { min: 4, max: 4, atOnce: 1, villagePerDay: 2 });
    expect(checkSettings(s, weeks).some((p) => p.level === 'no' && p.text.startsWith('Archery is set to 88 visits'))).toBe(true);
    expect(checkSettings(addArea(defaultSettings(), 'Archery', archery), weeks)).toEqual([]);
  });

  it('shows the added area on the page with a Remove button, and the row for adding another', () => {
    const s = addArea(defaultSettings(), 'Archery', archery);
    const html = renderToStaticMarkup(createElement(SettingsView, { settings: s, villages: ['O'], onChange: noop, onReset: noop }));
    expect(html).toContain('aria-label="Remove Archery"');
    expect(html).toContain('aria-label="Archery at least"');
    expect(html).not.toContain('aria-label="Remove Yoga"');
    expect(html).toContain('aria-label="New program area name"');
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Add<\/button>/); // nothing typed yet
  });

  it('generates a session that gives every bunk the added area, with every rule kept', async () => {
    const settings = addArea(defaultSettings(), 'Archery', archery);
    const run = await generateRun({
      weeks: [1, 2, 3, 4].map((w) => weekWithTrips(sampleSchedule(), w)),
      steps: [0, 1, 2, 3].map((index) => ({ index, mode: 'fill-empty' as const })),
      roster: sampleSchedule().bunks,
      sessionWeeks: 4,
      keepTrips: true,
      useOtherWeeks: true,
      seed: 31,
      settings,
    });
    expect(run?.good).toBe(true);
    const weeks: WeeksState = { current: 0, weeks: run?.weeks ?? [] };
    const counts = (weeks.weeks[0] as Schedule).bunks.map((b) => sessionBlocks(weeks, b.name, 'Archery'));
    expect(Math.max(...counts)).toBeLessThanOrEqual(2);
    expect(counts.filter((n) => n === 2).length).toBeGreaterThanOrEqual(18); // a Mohawk or Tusc bunk may end one short
    expect(Math.min(...counts)).toBeGreaterThanOrEqual(1);
    for (let w = 1; w <= 4; w++) expect(validateWeek(weeks, w, 4)).toEqual([]);
  }, 900_000);
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
