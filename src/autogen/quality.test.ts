import { describe, expect, it } from 'vitest';
import { sampleSchedule } from '../sample';
import type { WeeksState } from '../types';
import { SHABBAT_ROTATION } from './config';
import { slotAt, buildHistory } from './history';
import { compareQuality, isBad, weekQuality, type WeekQuality } from './quality';
import { buildRoster } from './roster';
import { blankCopy, runSession } from './testUtil';

const roster = buildRoster(sampleSchedule().bunks);
const at = (name: string): number => roster.names.indexOf(name);

/** Judge a grid that starts blank for every bunk. Only the messages a test asks about matter. */
function judge(weekIndex: number, edit: (grid: string[][]) => void = () => {}, extra: { carried?: { bunk: number; area: string }[]; sessionWeeks?: 3 | 4; stretch?: number } = {}): WeekQuality {
  const sessionWeeks = extra.sessionWeeks ?? 4;
  const grid = roster.names.map(() => Array<string>(24).fill(''));
  edit(grid);
  const weeks: WeeksState = { current: 0, weeks: [null, null, null, null] };
  weeks.weeks[weekIndex - 1] = { ...blankCopy(sampleSchedule()), bunks: sampleSchedule().bunks.map((b, i) => ({ ...b, slots: grid[i] })) };
  return weekQuality({
    weeks,
    weekIndex,
    sessionWeeks,
    roster,
    hist: buildHistory(weeks, weekIndex, roster.names),
    grid,
    carried: extra.carried,
    stretch: extra.stretch,
  });
}

describe('weekQuality', () => {
  it('counts a bunk with no Music this week as major', () => {
    expect(judge(1).major).toContain('O1 has no Music this week.');
    expect(judge(1, (g) => (g[at('O1')][1] = 'Music')).major).not.toContain('O1 has no Music this week.');
  });

  it('counts a rare area short by 1 for Mohawk or Tusc as minor, and by 2 as major', () => {
    const q = judge(1, () => {}, { carried: [{ bunk: at('M1'), area: 'Yoga' }] });
    expect(q.minor).toContain('M1 is short 1 on Yoga.');
    expect(q.major.filter((m) => m.startsWith('M1 is short'))).toEqual([]);
    const two = judge(1, () => {}, { carried: [{ bunk: at('O1'), area: 'Yoga' }, { bunk: at('O1'), area: 'Yoga' }] });
    expect(two.major).toContain('O1 is short 2 on Yoga.');
  });

  it('treats a block put off before the last week as a delay, never as major', () => {
    const carried = (names: string[]) => names.map((n) => ({ bunk: at(n), area: 'Teva' }));
    const three = judge(1, () => {}, { carried: carried(['O1', 'C1', 'S1']) });
    expect(three.minor).toEqual(expect.arrayContaining(['O1 is short 1 on Teva.', 'C1 is short 1 on Teva.', 'S1 is short 1 on Teva.']));
    expect(three.major.filter((m) => m.includes('rare area'))).toEqual([]);
    const tusc = judge(1, () => {}, { carried: [{ bunk: at('T1'), area: 'Yoga' }, { bunk: at('T1'), area: 'Israel Education' }] });
    expect(tusc.major).not.toContain('T1 is short on several rare areas.');
    expect(tusc.minor).toEqual(expect.arrayContaining(['T1 is short 1 on Yoga.', 'T1 is short 1 on Israel.']));
  });

  it('holds the shortfall limits at the end of the session', () => {
    const end = judge(4); // nobody has anything: everyone is short
    expect(end.major.some((m) => /bunks in O, C and S are short on a rare area/.test(m))).toBe(true);
    expect(end.major).toContain('T1 is short on several rare areas.');
    // one block short on two areas is still fine for Mohawk and Tusc: they are over-subscribed by design
  });

  it('judges Athletics against A&C: fine within the limit, minor at it, major beyond it', () => {
    const put = (name: string, labels: string[]) => (g: string[][]) => labels.forEach((l, i) => (g[at(name)][slotAt(i, 0)] = l));
    const gapMessage = (q: WeekQuality, list: 'major' | 'minor', name: string) => q[list].some((m) => m.startsWith(`${name} has Athletics and A&C`));
    // last week of the session: O may be 1 apart, M may be 2 apart
    const o1 = judge(4, put('O1', ['Athletics']));
    expect(gapMessage(o1, 'minor', 'O1')).toBe(true);
    expect(gapMessage(o1, 'major', 'O1')).toBe(false);
    expect(gapMessage(judge(4, put('O1', ['Athletics', 'Athletics'])), 'major', 'O1')).toBe(true);
    expect(gapMessage(judge(4, put('O1', ['Athletics', 'A&C'])), 'minor', 'O1')).toBe(false);
    const m2 = judge(4, put('M1', ['Athletics', 'Athletics']));
    expect(gapMessage(m2, 'minor', 'M1')).toBe(true);
    expect(gapMessage(m2, 'major', 'M1')).toBe(false);
    expect(gapMessage(judge(4, put('M1', ['Athletics', 'Athletics', 'Athletics'])), 'major', 'M1')).toBe(true);
    // a week built around periods filled in by hand may go one further
    expect(gapMessage(judge(4, put('O1', ['Athletics', 'Athletics']), { stretch: 1 }), 'major', 'O1')).toBe(false);
    expect(gapMessage(judge(4, put('O1', ['Athletics', 'Athletics', 'Athletics']), { stretch: 1 }), 'major', 'O1')).toBe(true);
    // the same limits apply in every week (GAP_SLACK_BEFORE_LAST_WEEK is 0)
    expect(gapMessage(judge(1, put('O1', ['Athletics'])), 'major', 'O1')).toBe(false);
    expect(gapMessage(judge(1, put('O1', ['Athletics', 'Athletics'])), 'major', 'O1')).toBe(true);
  });

  it('never counts or mentions the triathlon in the last week of a 4-week session', () => {
    const say = (q: WeekQuality) => [...q.hard, ...q.major, ...q.minor].filter((m) => /triathlon/i.test(m));
    expect(say(judge(4))).toEqual([]);
    expect(say(judge(3))).toEqual(['Village T is short on triathlon training this week.']);
    // a 3-week session has no skipped triathlon week
    expect(say(judge(3, () => {}, { sessionWeeks: 3 }))).toEqual(['Village T is short on triathlon training this week.']);
  });

  it('counts a missing extra Shabbat Prep period as major', () => {
    const week = [1, 2, 3, 4].find((w) => (SHABBAT_ROTATION[4][w] ?? []).some((v) => roster.byVillage[v])) as number;
    const v = SHABBAT_ROTATION[4][week].find((x) => roster.byVillage[x]) as string;
    const message = `Village ${v} is missing its extra Shabbat Prep period.`;
    expect(judge(week).major).toContain(message);
    expect(judge(week, (g) => (g[roster.byVillage[v][0]][slotAt(0, 0)] = 'Shabbat Prep')).major).not.toContain(message);
  });

  it('never asks for a Tiyul: trips are entered by hand', () => {
    expect(judge(2).major.some((m) => /Tiyul/.test(m))).toBe(false);
    expect(judge(3).major.some((m) => /Tiyul/.test(m))).toBe(false);
  });

  it('is bad only with a hard or major issue, and orders hard before major before minor', () => {
    const q = (hard: number, major: number, minor: number): WeekQuality => ({ hard: Array(hard).fill('h'), major: Array(major).fill('m'), minor: Array(minor).fill('n') });
    expect(isBad(q(0, 0, 5))).toBe(false);
    expect(isBad(q(0, 1, 0))).toBe(true);
    expect(isBad(q(1, 0, 0))).toBe(true);
    expect(compareQuality(q(0, 5, 9), q(1, 0, 0))).toBeLessThan(0);
    expect(compareQuality(q(0, 1, 9), q(0, 2, 0))).toBeLessThan(0);
    expect(compareQuality(q(0, 0, 1), q(0, 0, 2))).toBeLessThan(0);
    expect(compareQuality(q(0, 0, 2), q(0, 0, 2))).toBe(0);
  });

  it('never mentions the triathlon in a real week 4, in its quality or its warnings', () => {
    const run = runSession(sampleSchedule(), 1);
    const last = run.results[3];
    expect([...last.quality.hard, ...last.quality.major, ...last.quality.minor, ...last.warnings].filter((m) => /triathlon|Tusc got fewer/i.test(m))).toEqual([]);
  }, 60_000);
});
