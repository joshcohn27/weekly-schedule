import * as XLSX from 'xlsx';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import SettingsView, { FIXED_RULES } from '../components/SettingsView';
import SharingSettings from '../components/SharingSettings';
import { buildAllWeeksWorkbook, buildWeekWorkbook, parseSettingsSheet, parseUploadedWorkbook } from '../excel';
import { ACTIVITIES, AREAS, OPTION_GROUPS, areaOf } from '../config';
import { sampleSchedule } from '../sample';
import { computeTracking } from '../tracking';
import { normalizeWeeksState } from '../storage';
import type { Schedule, WeeksState } from '../types';
import { planCalendar } from './calendar';
import { blocksOf } from './history';
import { CALENDAR, leagueFor, leagueMinFor, triathlonPeriodsAWeek, DANCE_TARGETS, DAY_CAP, POOL_LESSONS, POOL_MAX_CAMPERS, POOL_TARGETS, SESSION_FILLER_MAX, SESSION_HARD_MAX, SESSION_TARGETS, SLOT_CAP, WEEK_BLOCK_MAX, setVisitWeek, shabbatPrepPeriods, weekly, type Sharing } from './config';
import { mulberry32 } from './rng';
import { checkSettings } from './feasibility';
import { generateRun } from './session';
import { SETTING_AREAS, addArea, applySettings, cleanAreaName, defaultSettings, defaultSharing, isDefaultSettings, normalizeSettings, normalizeSharing, removeArea, settingAreas, whyNotAdd, withPair, withSharing, coreOf, defaultCore, defaultVisits, leagueOf, sameVisitIn, visitsOf, withCore, withSameVisit, withVisits, type Settings } from './settings';
import { TOKEN_AREAS } from './planner';
import { buildRoster, isSameAgeGroup, pairKey, shareLevel, sharingLevel } from './roster';
import { groupBreaks, slotGroupProblems } from './share';
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
      expect(reread.SheetNames.slice(-3)).toEqual(['Settings', 'Main areas', 'Sharing']);
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
    // one table for every program area, the ones entered by hand among them
    expect((html.match(/<table/g) ?? []).length).toBe(1);
    for (const name of ['Hobbies', 'Waterfront', 'League', 'Pool', 'Ropes', 'Shabbat Prep', 'Trips', 'Athletics', 'A&amp;C', 'Music', 'Time with UH']) expect(html, name).toContain(`>${name}</th>`);
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

describe('who may share a period', () => {
  const roster = buildRoster(sampleSchedule().bunks);
  const at = (name: string): number => roster.names.indexOf(name);
  const level = (x: string, y: string, sharing: Sharing, area = 'Music'): number => sharingLevel(roster, at(x), at(y), area, sharing);
  const base = defaultSharing();

  it('starts as the rules the generator has always had', () => {
    expect(base).toEqual({ within: 'next', across: true, grades: 'one', pairs: {} });
    expect(level('O1', 'O2', base)).toBeGreaterThan(0); // next to each other
    expect(level('O1', 'O3', base)).toBe(0); // not next to each other
    expect(level('O1', 'C1', base)).toBeGreaterThan(0); // the paired villages, the same grade
    expect(level('O1', 'S1', base)).toBe(0);
    expect(level('T1', 'T4', base)).toBe(2); // Tusc always shares with Tusc
  });

  it('follows the three basic choices', () => {
    expect(level('O1', 'O3', { ...base, within: 'village' })).toBeGreaterThan(0); // 4th with 5th, one grade apart
    expect(level('O1', 'O5', { ...base, within: 'village' })).toBe(0); // 4th with 6th is two apart
    expect(level('O1', 'O5', { ...base, within: 'village', grades: 'any' })).toBeGreaterThan(0);
    expect(level('O1', 'O3', { ...base, within: 'village', grades: 'same' })).toBe(0);
    expect(level('O1', 'O2', { ...base, grades: 'same' })).toBeGreaterThan(0); // 4th with 4th/5th counts as the same
    expect(level('O1', 'C1', { ...base, across: false })).toBe(0);
  });

  it('lets a pair set on the grid win over the basic choices, either way', () => {
    expect(level('O1', 'O4', { ...base, pairs: { 'O1|O4': true } })).toBeGreaterThan(0);
    expect(level('O1', 'S1', { ...base, pairs: { 'O1|S1': true } })).toBeGreaterThan(0);
    expect(level('O1', 'O2', { ...base, pairs: { 'O1|O2': false } })).toBe(0);
    expect(level('T1', 'T2', { ...base, pairs: { 'T1|T2': false } })).toBe(0);
    expect(pairKey('O2', 'O1')).toBe('O1|O2');
  });

  it('keeps a pair that was set apart by hand out of a group of three at A&C too', () => {
    const trio = [at('O1'), at('O2'), at('C1')]; // all about the same age: allowed as three by default
    expect(isSameAgeGroup(roster, trio)).toBe(true);
    applySettings(withPair(defaultSettings(), 'O1', 'O2', false, true));
    expect(isSameAgeGroup(roster, trio)).toBe(false);
    expect(slotGroupProblems(roster, 'A&C', trio, () => 1).length).toBeGreaterThan(0);
    applySettings();
    expect(isSameAgeGroup(roster, trio)).toBe(true);
  });

  it('never changes the pool', () => {
    const wide: Sharing = { within: 'village', across: false, grades: 'any', pairs: { 'O1|O2': false, 'O1|O4': true, 'S1|M3': true } };
    applySettings(withSharing(defaultSettings(), wide));
    expect(shareLevel(roster, at('O1'), at('O2'), 'Music')).toBe(0); // the settings are in force for Music
    expect(shareLevel(roster, at('O1'), at('O4'), 'Music')).toBeGreaterThan(0);
    expect(shareLevel(roster, at('O1'), at('O2'), 'Pool')).toBeGreaterThan(0); // and not for the pool
    expect(shareLevel(roster, at('O1'), at('O4'), 'Pool')).toBe(0);
    expect(shareLevel(roster, at('S1'), at('M1'), 'Pool')).toBeGreaterThan(0); // S with M at the same age, as always
    expect(shareLevel(roster, at('S1'), at('M3'), 'Pool')).toBe(0);
    applySettings();
    expect(shareLevel(roster, at('O1'), at('O2'), 'Music')).toBeGreaterThan(0);
  });

  it('keeps only what differs from the default, and a grid change only while it differs from the basic choices', () => {
    expect(withSharing(defaultSettings(), base).sharing).toBeUndefined();
    expect(isDefaultSettings(withSharing(defaultSettings(), base))).toBe(true);
    const off = withPair(defaultSettings(), 'O2', 'O1', false, true);
    expect(off.sharing?.pairs).toEqual({ 'O1|O2': false });
    expect(isDefaultSettings(off)).toBe(false);
    expect(withPair(off, 'O1', 'O2', true, true).sharing).toBeUndefined(); // back to what the basic choices give
    // adding a program area keeps the sharing
    expect(addArea(off, 'Archery').sharing?.pairs).toEqual({ 'O1|O2': false });
    expect(normalizeSharing({ within: 'everyone', across: 'no', grades: 3, pairs: { 'O1|O1': true, O1: true, ' O2 | O1 ': false } })).toEqual({ ...base, pairs: { 'O1|O2': false } });
    expect(normalizeSharing(null)).toBeNull();
  });

  it('goes into the Excel file on its own tab and comes back', () => {
    const s = withSharing(addArea(defaultSettings(), 'Archery'), { within: 'village', across: false, grades: 'any', pairs: { 'O1|O4': true, 'S1|S2': false } });
    const wb = XLSX.read(XLSX.write(buildWeekWorkbook(sampleSchedule(), 1, s), { type: 'array', bookType: 'xlsx' }), { type: 'array' });
    expect(parseSettingsSheet(wb)).toEqual(s);
    const plain = XLSX.read(XLSX.write(buildWeekWorkbook(sampleSchedule(), 1), { type: 'array', bookType: 'xlsx' }), { type: 'array' });
    expect(parseSettingsSheet(plain)).toEqual(defaultSettings());
  });

  it('shows the three choices, and behind Advanced a box for every pair with the changed ones marked', () => {
    const bunks = sampleSchedule().bunks;
    const s = withPair(defaultSettings(), 'O1', 'O4', true, false);
    const closed = renderToStaticMarkup(createElement(SettingsView, { settings: s, villages: ['O'], onChange: noop, onReset: noop, bunks }));
    for (const label of ['Sharing inside a village', 'Sharing across villages', 'Sharing grades']) expect(closed).toContain(`aria-label="${label}"`);
    expect(closed).toContain('Advanced: customize sharing');
    expect(closed).toContain('1 pair changed by hand.');
    expect(closed).not.toContain('sharing-grid');
    const open = renderToStaticMarkup(createElement(SharingSettings, { settings: s, bunks, onChange: noop, open: true }));
    expect((open.match(/type="checkbox"/g) ?? []).length).toBe((22 * 21) / 2);
    expect((open.match(/class="changed"/g) ?? []).length).toBe(1);
    expect(open).toMatch(/<input[^>]*aria-label="O1 with O4"[^>]*checked|<input[^>]*checked[^>]*aria-label="O1 with O4"/);
    expect(open).not.toMatch(/<input[^>]*aria-label="O1 with O3"[^>]*checked|<input[^>]*checked[^>]*aria-label="O1 with O3"/);
  });

  it('generates a session that keeps a pair apart when the grid says so, and still passes every rule', async () => {
    const settings = withPair(defaultSettings(), 'O1', 'O2', false, true);
    const run = await generateRun({
      weeks: [1, 2, 3, 4].map((w) => weekWithTrips(sampleSchedule(), w)),
      steps: [0, 1, 2, 3].map((index) => ({ index, mode: 'fill-empty' as const })),
      roster: sampleSchedule().bunks,
      sessionWeeks: 4,
      keepTrips: true,
      useOtherWeeks: true,
      seed: 41,
      settings,
    });
    expect(run?.good).toBe(true);
    const together: string[] = [];
    (run?.weeks ?? []).forEach((w, i) => {
      const s = w as Schedule;
      const o1 = s.bunks.find((b) => b.name === 'O1')!.slots;
      const o2 = s.bunks.find((b) => b.name === 'O2')!.slots;
      o1.forEach((label, slot) => {
        if (label === o2[slot] && ['A&C', 'Music', 'Teva', 'Dance', 'Israel'].includes(label)) together.push(`week ${i + 1} slot ${slot} ${label}`);
      });
    });
    expect(together).toEqual([]);
    const weeks: WeeksState = { current: 0, weeks: run?.weeks ?? [] };
    for (let w = 1; w <= 4; w++) expect(validateWeek(weeks, w, 4)).toEqual([]);
  }, 900_000);
});

describe('the main areas and the visit numbers', () => {
  const roster = buildRoster(sampleSchedule().bunks);
  const at = (name: string): number => roster.names.indexOf(name);
  /** The problems two bunks on these visits have sharing a period in this area. */
  const sharing = (area: string, x: string, y: string, visits: [number, number]): string[] =>
    slotGroupProblems(roster, area, [at(x), at(y)], (b) => (b === at(x) ? visits[0] : visits[1])).map((p) => p.rule);
  const breaks = (area: string, x: string, y: string, visits: [number, number]): number =>
    groupBreaks(roster, area, [at(x), at(y)], (b) => (b === at(x) ? visits[0] : visits[1]), { trio: true });

  it('start as the numbers the generator has always used', () => {
    expect(coreOf(defaultSettings())).toEqual({
      hobbyHalfDays: 2,
      hobbySundayPercent: 20,
      shabbatPrep: true,
      shabbatPrepExtra: true,
      ropesPerSession: 2,
      poolPerWeek: 1,
      poolLessons: 2,
      poolMaxCampers: 80,
      waterfrontPerWeek: 2,
      leaguePerWeek: 3,
      leagueByVillage: {},
      poolMaxPerWeek: 2,
      musicPerWeek: 1,
      uhMin: 1,
      uhMax: 3,
      athletics: { atOnce: 3, villagePerDay: 2, maxPerWeek: 3 },
      ac: { atOnce: 3, villagePerDay: 2, maxPerWeek: 3 },
      music: { atOnce: 2, villagePerDay: 2, maxPerWeek: 2 },
      uh: { atOnce: 2, villagePerDay: 2, maxPerWeek: 0 },
    });
    expect(visitsOf(defaultSettings())).toEqual({ free: ['Athletics', 'TW UH'], lastWeekSlack: false });
    expect(sameVisitIn(defaultSettings(), 'A&C')).toBe(true);
    expect(sameVisitIn(defaultSettings(), 'Athletics')).toBe(false);
  });

  it('reach the numbers the generator reads, are kept inside their ranges, and go back to the defaults', () => {
    const core = { ...defaultCore(), waterfrontPerWeek: 1, leaguePerWeek: 2, poolMaxPerWeek: 1, musicPerWeek: 0, uhMin: 2, uhMax: 1, athletics: { atOnce: 9, villagePerDay: 3, maxPerWeek: 2 } };
    const s = withCore(defaultSettings(), core);
    expect(s.core?.uhMax).toBe(2); // never under the least
    expect(s.core?.athletics.atOnce).toBe(4); // the most Athletics takes
    applySettings(s);
    expect(weekly()).toEqual({ waterfront: 1, league: 2, music: 0, poolMax: 1, uhMax: 2 });
    expect([SLOT_CAP.Athletics, DAY_CAP.Athletics, WEEK_BLOCK_MAX.Athletics, SESSION_TARGETS['TW UH']]).toEqual([4, 3, 2, 2]);
    applySettings();
    expect(weekly()).toEqual({ waterfront: 2, league: 3, music: 1, poolMax: 2, uhMax: 3 });
    expect([SLOT_CAP.Athletics, DAY_CAP.Athletics, WEEK_BLOCK_MAX.Athletics, SESSION_TARGETS['TW UH']]).toEqual([3, 2, 3, 1]);
    expect(withCore(defaultSettings(), defaultCore()).core).toBeUndefined();
    expect(isDefaultSettings(withCore(defaultSettings(), defaultCore()))).toBe(true);
  });

  it('has hobbies, Shabbat Prep, ropes and the pool as settings too, and puts them back', () => {
    const calendarFor = (week: number) => planCalendar({ weekIndex: week, sessionWeeks: 4, lastWeek: week === 4 }, mulberry32(7)).hobbies;
    expect(calendarFor(2).some(([d, h]) => d === 5 && h === 0)).toBe(true); // Friday morning
    expect(calendarFor(2).length).toBeGreaterThanOrEqual(2);
    applySettings(withCore(defaultSettings(), { ...defaultCore(), hobbyHalfDays: 1, shabbatPrep: false, ropesPerSession: 1, poolPerWeek: 0, poolLessons: 0, poolMaxCampers: 120 }));
    expect(calendarFor(2)).toEqual([[5, 0]]); // Friday morning only
    expect(calendarFor(4)).toEqual([[1, 0]]); // the last week keeps its Monday morning
    expect([CALENDAR.shabbatPrep, shabbatPrepPeriods(), SESSION_TARGETS.Ropes, POOL_LESSONS, POOL_MAX_CAMPERS]).toEqual([false, 0, 1, 0, 120]);
    expect(POOL_TARGETS.O).toEqual({ perWeek: 0 });
    expect(POOL_TARGETS.S).toEqual({ perSession: 0 });
    applySettings(withCore(defaultSettings(), { ...defaultCore(), hobbyHalfDays: 0 }));
    expect(calendarFor(2)).toEqual([]);
    expect(calendarFor(4)).toEqual([]);
    applySettings();
    expect([CALENDAR.hobbyHalfDays, CALENDAR.shabbatPrep, shabbatPrepPeriods(), SESSION_TARGETS.Ropes, POOL_LESSONS, POOL_MAX_CAMPERS]).toEqual([2, true, 3, 2, 2, 80]);
    expect(POOL_TARGETS.O).toEqual({ perWeek: 1 });
    expect(POOL_TARGETS.S).toEqual({ perSession: 4 });
  });

  it('checks a week by the settings in force: fewer hobbies, no Shabbat Prep, no weekly swim', () => {
    const rulesOf = (w: Schedule, week: number): string[] => validateWeek({ current: 0, weeks: week === 1 ? [w] : [sampleSchedule(), w] }, week, 4).map((v) => v.message);
    // week 2 with Friday morning hobbies and nothing else: by default the midweek half-day, O and C's Shabbat Prep and swim are missed
    const week = sampleSchedule();
    for (const b of week.bunks) for (const p of [0, 1]) b.slots[5 * 4 + p] = 'AM Hobbies';
    const missed = (messages: string[]) => ({
      hobbies: messages.some((m) => m.includes('second weekly hobbies half-day')),
      prep: messages.some((m) => m.includes('should have Shabbat Prep on Friday afternoon')),
      swim: messages.some((m) => m.includes('swims 0 times this week')),
    });
    expect(missed(rulesOf(week, 2))).toEqual({ hobbies: true, prep: true, swim: true });
    applySettings(withCore(defaultSettings(), { ...defaultCore(), hobbyHalfDays: 1, shabbatPrep: false, poolPerWeek: 0 }));
    expect(missed(rulesOf(week, 2))).toEqual({ hobbies: false, prep: false, swim: false });
  });

  it('sets league village by village, and keeps only the villages that differ from the usual number', () => {
    const s = withCore(defaultSettings(), { ...defaultCore(), leagueByVillage: { m: 2, O: 3, C: 9, ' ': 1 } });
    expect(s.core?.leagueByVillage).toEqual({ M: 2 }); // O is on the usual three, and C's nine is cut back to three
    expect(leagueOf(s, 'M')).toBe(2);
    expect(leagueOf(s, 'S')).toBe(3);
    applySettings(s);
    expect([leagueFor('M'), leagueFor('O'), leagueMinFor('M'), leagueMinFor('O')]).toEqual([2, 3, 2, 2]);
    applySettings(withCore(defaultSettings(), { ...defaultCore(), leagueByVillage: { T: 2, S: 1 } }));
    expect([leagueFor('T'), triathlonPeriodsAWeek(), leagueFor('S'), leagueMinFor('S')]).toEqual([2, 3, 1, 1]); // Tusc: a double and a single
    applySettings();
    expect([leagueFor('M'), leagueFor('T'), triathlonPeriodsAWeek()]).toEqual([3, 3, 4]);
    // it travels in the Excel file
    const wb = XLSX.read(XLSX.write(buildWeekWorkbook(sampleSchedule(), 1, s), { type: 'array', bookType: 'xlsx' }), { type: 'array' });
    expect(parseSettingsSheet(wb)).toEqual(s);
  });

  it('generates a session with Mohawk on two league periods a week, and every rule kept', async () => {
    const settings = withCore(defaultSettings(), { ...defaultCore(), leagueByVillage: { M: 2 } });
    const run = await generateRun({
      weeks: [1, 2, 3, 4].map((w) => weekWithTrips(sampleSchedule(), w)),
      steps: [0, 1, 2, 3].map((index) => ({ index, mode: 'fill-empty' as const })),
      roster: sampleSchedule().bunks,
      sessionWeeks: 4,
      keepTrips: true,
      useOtherWeeks: true,
      seed: 61,
      settings,
    });
    expect(run?.good).toBe(true);
    const weeks: WeeksState = { current: 0, weeks: run?.weeks ?? [] };
    for (let w = 1; w <= 4; w++) expect(validateWeek(weeks, w, 4)).toEqual([]);
    for (const w of weeks.weeks) {
      const league = (name: string): number => blocksOf((w as Schedule).bunks.find((b) => b.name === name)!.slots).filter((k) => k.area === 'League').length;
      expect(league('M1')).toBeLessThanOrEqual(2);
      expect(league('M1')).toBeGreaterThanOrEqual(1);
      expect(league('O1')).toBeGreaterThanOrEqual(2); // the others are as they were
    }
  }, 900_000);

  it('asks for the same visit number only where the settings say so, and the search counts it the same way', () => {
    // Music asks for it to start with; Athletics does not
    expect(sharing('Music', 'O1', 'O2', [1, 2])).toEqual(['H5']);
    expect(breaks('Music', 'O1', 'O2', [1, 2])).toBe(1);
    expect(sharing('Athletics', 'O1', 'S1', [1, 3])).toEqual([]);
    expect(breaks('Athletics', 'O1', 'S1', [1, 3])).toBe(0);
    const s = withSameVisit(withSameVisit(defaultSettings(), 'Music', false), 'Athletics', true);
    expect(visitsOf(s).free).toEqual(['Music', 'TW UH']);
    applySettings(s);
    expect(sharing('Music', 'O1', 'O2', [1, 2])).toEqual([]);
    expect(breaks('Music', 'O1', 'O2', [1, 2])).toBe(0);
    expect(sharing('Athletics', 'O1', 'S1', [1, 3])).toEqual(['H5']);
    expect(breaks('Athletics', 'O1', 'S1', [1, 3])).toBe(1);
    expect(sharing('Athletics', 'O1', 'S1', [2, 2])).toEqual([]);
    // putting it back to what it was leaves nothing to save
    expect(withSameVisit(withSameVisit(s, 'Music', true), 'Athletics', false).visits).toBeUndefined();
  });

  it('lets bunks be one visit apart in the last week only when that is switched on, and never two', () => {
    applySettings(withVisits(defaultSettings(), { ...defaultVisits(), lastWeekSlack: true }));
    setVisitWeek(false); // an earlier week
    expect(sharing('A&C', 'O1', 'O2', [3, 4])).toEqual(['H5']);
    setVisitWeek(true); // the last week of the session
    expect(sharing('A&C', 'O1', 'O2', [3, 4])).toEqual([]);
    expect(breaks('A&C', 'O1', 'O2', [3, 4])).toBe(0);
    expect(sharing('A&C', 'O1', 'O2', [2, 4])).toEqual(['H5']);
    expect(breaks('A&C', 'O1', 'O2', [2, 4])).toBe(1);
    applySettings(); // switched off again: the last week is as strict as any other
    setVisitWeek(true);
    expect(sharing('A&C', 'O1', 'O2', [3, 4])).toEqual(['H5']);
    setVisitWeek(false);
  });

  it('go into the Excel file on the Main areas tab and come back', () => {
    const s = withVisits(withCore(defaultSettings(), { ...defaultCore(), waterfrontPerWeek: 1, uhMax: 4, ac: { atOnce: 2, villagePerDay: 3, maxPerWeek: 2 } }), { free: ['Music'], lastWeekSlack: true });
    const wb = XLSX.read(XLSX.write(buildWeekWorkbook(sampleSchedule(), 1, s), { type: 'array', bookType: 'xlsx' }), { type: 'array' });
    expect(wb.SheetNames).toContain('Main areas');
    expect(parseSettingsSheet(wb)).toEqual(s);
  });

  it('shows on the page: a row for each main area with its own numbers, the same-visit boxes and the last-week switch', () => {
    const html = renderToStaticMarkup(createElement(SettingsView, { settings: defaultSettings(), villages: ['O'], onChange: noop, onReset: noop }));
    for (const label of [
      'Waterfront times a week',
      'League times a week for village O',
      'Pool times a week',
      'Pool at most a week',
      'Pool lessons alone',
      'Pool most campers at once',
      'Ropes times a session',
      'Hobbies half-days a week',
      'Hobbies Sunday chance in percent',
      'Shabbat Prep on Friday afternoon',
      'Shabbat Prep extra period',
      'Athletics at most a week',
      'A&amp;C at most a week',
      'Music times a week',
      'Music at most a week',
      'Time with UH at least a session',
      'Time with UH at most a session',
      'Athletics bunks at once',
      'A&amp;C bunks of one village in a day',
      'One visit apart in the last week',
    ]) {
      expect(html, label).toContain(`aria-label="${label}"`);
    }
    const ticked = (label: string): boolean => new RegExp(`<input[^>]*aria-label="${label}"[^>]*checked|<input[^>]*checked[^>]*aria-label="${label}"`).test(html);
    expect(ticked('A&amp;C same visit number')).toBe(true);
    expect(ticked('Yoga same visit number')).toBe(true);
    expect(ticked('Athletics same visit number')).toBe(false);
    expect(ticked('Time with UH same visit number')).toBe(false);
    expect(ticked('One visit apart in the last week')).toBe(false);
  });

  it('is told by the arithmetic check when a main number leaves too much for Athletics and A&C', () => {
    const weeks = [sampleSchedule(), null, null, null];
    // Waterfront once a week instead of twice: two more periods a week for every bunk. It did not generate when it was tried.
    const less = checkSettings(withCore(defaultSettings(), { ...defaultCore(), waterfrontPerWeek: 1 }), weeks);
    expect(less.map((p) => p.level)).toEqual(['unlikely']);
    expect(less[0].fix).toContain('or more Waterfront or league a week');
    expect(checkSettings(withCore(defaultSettings(), { ...defaultCore(), leaguePerWeek: 1 }), weeks).length).toBeGreaterThan(0);
    // more room for Athletics and A&C is never a problem
    const room = { ...defaultCore(), athletics: { atOnce: 4, villagePerDay: 3, maxPerWeek: 3 }, ac: { atOnce: 3, villagePerDay: 3, maxPerWeek: 3 } };
    expect(checkSettings(withCore(defaultSettings(), room), weeks)).toEqual([]);
  });

  it('generates a session with the main numbers changed, and every rule kept', async () => {
    // three bunks of a village a day at Athletics and at A&C, any visit at Music, a visit apart in the last week
    const core = { ...defaultCore(), athletics: { atOnce: 3, villagePerDay: 3, maxPerWeek: 3 }, ac: { atOnce: 3, villagePerDay: 3, maxPerWeek: 3 } };
    const settings = withVisits(withCore(defaultSettings(), core), { free: ['Athletics', 'Music', 'TW UH'], lastWeekSlack: true });
    const run = await generateRun({
      weeks: [1, 2, 3, 4].map((w) => weekWithTrips(sampleSchedule(), w)),
      steps: [0, 1, 2, 3].map((index) => ({ index, mode: 'fill-empty' as const })),
      roster: sampleSchedule().bunks,
      sessionWeeks: 4,
      keepTrips: true,
      useOtherWeeks: true,
      seed: 51,
      settings,
    });
    expect(run?.good).toBe(true);
    const weeks: WeeksState = { current: 0, weeks: run?.weeks ?? [] };
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
