import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { isGuest } from './autofill';
import { SESSION_1, SESSION_2 } from './autogen/sessionCalendar';
import { defaultSettings, normalizeSettings, templateSettings } from './autogen/settings';
import CalendarSettings from './components/CalendarSettings';
import SettingsView from './components/SettingsView';
import { checkSettings } from './autogen/feasibility';
import { applySettings } from './autogen/settings';
import { newBunk } from './sample';
import { datesOf, dayLabels, startSession, templateOf, weekDates, withCalendar } from './session';
import { normalizeWeeksState } from './storage';
import type { Schedule } from './types';

const noop = () => {};

describe('starting a session from its template', () => {
  it('Session 1: four weeks of its bunks, the 2027 dates, and the calendar already on the schedule', () => {
    const s = startSession(SESSION_1);
    expect(s.session).toBe('session1');
    expect(s.weeks.map((w) => w?.bunks.length ?? 0)).toEqual([22, 22, 22, 22]);
    expect(s.settings).toBeUndefined(); // Session 1 has the app's own numbers
    expect((s.weeks[0] as Schedule).bunks[0].slots.slice(0, 5)).toEqual(['Opening Day', 'Opening Day', 'Opening Day', 'Opening Day', '']);
    expect((s.weeks[3] as Schedule).bunks.find((b) => b.name === 'S1')!.slots[0]).toBe('S-Day');
    expect(datesOf(SESSION_1)).toBe('June 27 to July 23, 2027');
    expect(dayLabels(SESSION_1, 1)).toEqual(['Sunday 6.27', 'Monday 6.28', 'Tuesday 6.29', 'Wednesday 6.30', 'Thursday 7.1', 'Friday 7.2']);
    expect(weekDates(SESSION_1, 4)).toBe('7.18 to 7.23');
  });

  it('Session 2: three weeks, Taste of CSL in week 1 only, its own numbers, and it survives being saved', () => {
    const s = startSession(SESSION_2);
    expect(s.weeks.map((w) => w?.bunks.length ?? 0)).toEqual([26, 22, 22, 0]);
    expect((s.weeks[0] as Schedule).bunks.filter((b) => isGuest(b.name)).map((b) => b.name)).toEqual(['TC1', 'TC2', 'TC3', 'TC4']);
    expect((s.weeks[1] as Schedule).bunks.some((b) => isGuest(b.name))).toBe(false);
    expect(s.settings?.areas.Yoga).toMatchObject({ min: 1, max: 2 });
    // opening day is Monday July 26: the Sunday before it has no periods
    expect(dayLabels(SESSION_2, 1).slice(0, 3)).toEqual(['Sunday 7.25', 'Monday 7.26', 'Tuesday 7.27']);
    expect((s.weeks[2] as Schedule).bunks[0].slots[4]).toBe('Color War');
    const back = normalizeWeeksState(JSON.parse(JSON.stringify(s)));
    expect(back?.session).toBe('session2');
    expect(back?.settings).toEqual(templateSettings(SESSION_2));
    expect(templateOf(undefined)).toBe(SESSION_1); // a schedule from before sessions were told apart
  });

  it('the settings check knows the calendar: Session 1 adds up, Session 2 is told it will come up short, never that it is impossible', () => {
    const one = startSession(SESSION_1);
    applySettings(templateSettings(SESSION_1));
    expect(checkSettings(templateSettings(SESSION_1), one.weeks, 4, SESSION_1.events)).toEqual([]);
    const two = startSession(SESSION_2);
    applySettings(templateSettings(SESSION_2));
    const found = checkSettings(templateSettings(SESSION_2), two.weeks, 3, SESSION_2.events);
    expect(found.length).toBeGreaterThan(0);
    expect(found.every((p) => p.level === 'short')).toBe(true);
    const html = renderToStaticMarkup(createElement(SettingsView, { settings: templateSettings(SESSION_2), villages: ['O'], onChange: noop, onReset: noop, problems: found }));
    expect(html).toContain('Will come up short.');
    expect(html).not.toContain('Not possible.');
    applySettings();
  });

  it('offers suggested settings when a village has six bunks, and never applies them by itself', () => {
    const six = ['O1', 'O2', 'O3', 'O4', 'O5', 'O6'].map((n) => newBunk(n, '5th', '10'));
    let next: ReturnType<typeof defaultSettings> | null = null;
    const html = renderToStaticMarkup(createElement(SettingsView, { settings: defaultSettings(), villages: ['O'], onChange: (s) => (next = s), onReset: noop, bunks: six }));
    expect(html).toContain('Use the suggested settings');
    expect(next).toBeNull();
    expect(renderToStaticMarkup(createElement(SettingsView, { settings: defaultSettings(), villages: ['O'], onChange: noop, onReset: noop, bunks: six.slice(0, 5) }))).not.toContain('suggested settings');
  });

  it('a calendar line that was moved on the Settings tab goes on the schedule where it was put', () => {
    const s = startSession(SESSION_1);
    // clear week 3 and move Mass Program to all of Tuesday in week 3 only
    const cleared = { ...s, weeks: s.weeks.map((w, i) => (i === 2 && w ? { ...w, bunks: w.bunks.map((b) => ({ ...b, slots: b.slots.map(() => '') })) } : w)) };
    const calendar = [{ label: 'Mass Program', who: 'camp', week: 3, day: 2, periods: [0, 1, 2, 3] }];
    const settings = normalizeSettings({ ...defaultSettings(), calendar });
    expect(settings.calendar).toEqual(calendar);
    const html = renderToStaticMarkup(createElement(CalendarSettings, { settings, template: SESSION_1, villages: ['O', 'T'], onChange: noop, onApply: noop }));
    expect(html).toContain('Session calendar');
    expect(html).toContain('Tuesday 7.13');
    expect(html).toContain('Whole camp');
    expect(html).toContain('Put the calendar on the schedule now');
    // with nothing changed it shows the template: Visitor Day is on it
    expect(renderToStaticMarkup(createElement(CalendarSettings, { settings: defaultSettings(), template: SESSION_1, villages: ['O'], onChange: noop, onApply: noop }))).toContain('Visitor&#x27;s Day');
    expect(withCalendar(cleared).weeks[2]?.bunks[0].slots[0]).toBe('All Camp Clean Up'); // the template, while nothing is in force
  });
});
