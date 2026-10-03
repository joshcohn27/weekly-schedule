import { beforeAll, describe, expect, it } from 'vitest';
import { ACTIVITIES } from '../config';
import { sampleSchedule } from '../sample';
import { computeSessionTracking } from '../tracking';
import type { Schedule, WeeksState } from '../types';
import { blocksOf, slotAt } from './history';
import { generateWeek } from './index';
import { blankCopy, rosterOf, runSession, sessionBlocks, sessionIssues, type SessionRun } from './testUtil';
import { validateWeek, type Rule } from './validate';

type Env = { AUTOGEN_SEEDS?: string; AUTOGEN_REPORT?: string };
const env: Env = (globalThis as unknown as { process?: { env?: Env } }).process?.env ?? {};

/** Full sessions generated and checked. Set AUTOGEN_SEEDS=100 for the long run of the hard-rule check. */
const SESSIONS = 25;
const HARD_RULE_SEEDS = Math.max(SESSIONS, Number(env.AUTOGEN_SEEDS ?? SESSIONS));
/** Sessions whose every returned week must be free of hard and major issues. */
const QUALITY_SESSIONS = 100;
const RULES: Rule[] = ['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'H7', 'H8', 'H9', 'H10', 'H11', 'H12'];
const KNOWN = new Set(ACTIVITIES.map((a) => a.label));

const weekOf = (run: SessionRun, week: number): Schedule => run.weeks.weeks[week - 1] as Schedule;
const row = (s: Schedule, name: string): string[] => (s.bunks.find((b) => b.name === name) as Schedule['bunks'][number]).slots;
const cell = (s: Schedule, name: string, day: number, period: number): string => row(s, name)[slotAt(day, period)];
const villageNames = (s: Schedule, letter: string): string[] => s.bunks.filter((b) => b.name.startsWith(letter)).map((b) => b.name);
const hardViolations = (run: SessionRun, sessionWeeks: 3 | 4 = 4) =>
  run.weeks.weeks.flatMap((_, i) => validateWeek(run.weeks, i + 1, sessionWeeks).map((v) => `week ${i + 1} ${v.rule}: ${v.message}`));

let sessions: SessionRun[] = [];
beforeAll(() => {
  sessions = Array.from({ length: SESSIONS }, (_, i) => runSession(sampleSchedule(), i + 1));
}, 600_000);

describe('hard rules', () => {
  it('generates weeks 1 to 4 in order with no rule breaks, for every session', () => {
    for (const run of sessions) expect(hardViolations(run)).toEqual([]);
  });

  it('checks each rule H1 to H12 on its own', () => {
    for (const rule of RULES) {
      const found = sessions.flatMap((run) => run.weeks.weeks.flatMap((_, i) => validateWeek(run.weeks, i + 1, 4).filter((v) => v.rule === rule)));
      expect(found, rule).toEqual([]);
    }
  });

  it('holds for more seeds when AUTOGEN_SEEDS asks for them', () => {
    for (let seed = SESSIONS + 1; seed <= HARD_RULE_SEEDS; seed++) expect(hardViolations(runSession(sampleSchedule(), seed))).toEqual([]);
  }, 1_800_000);

  it('holds on other rosters: 2 bunks per village, 6 in one village, and one grade throughout', () => {
    const rosters = [
      rosterOf({ O: 2, C: 2, S: 2, M: 2, T: 2 }),
      rosterOf({ O: 5, C: 4, S: 6, M: 4, T: 4 }),
      rosterOf({ O: 5, C: 4, S: 5, M: 4, T: 4 }, () => '5th'),
    ];
    for (const roster of rosters) for (let seed = 1; seed <= 3; seed++) expect(hardViolations(runSession(roster, seed))).toEqual([]);
  }, 300_000);

  it('holds for a 3-week session too', () => {
    for (let seed = 1; seed <= 4; seed++) expect(hardViolations(runSession(sampleSchedule(), seed, 3), 3)).toEqual([]);
  }, 300_000);
});

describe('session totals', () => {
  // Ropes, Waterfront, league, triathlon, pool, Music, Shabbat Prep and Tiyul must be exact for everyone, every time.
  const EXACT = ['Ropes', 'Waterfront', 'League', 'Tri', 'Pool', 'Music', 'Shabbat Prep', 'Tiyul', 'Missing warning'];

  it('hits the exact targets in every session: ropes, Waterfront, league, triathlon, pool, Music, Shabbat Prep, Tiyul', () => {
    for (const run of sessions) expect(sessionIssues(run.weeks, 4, run.warnings).filter((i) => EXACT.includes(i.kind))).toEqual([]);
  });

  it('returns only weeks with no rule breaks and nothing that is not acceptable', () => {
    for (const run of sessions) {
      run.results.forEach((r, i) => {
        expect(r.quality.hard, `week ${i + 1}`).toEqual([]);
        expect(r.quality.major, `week ${i + 1}`).toEqual([]);
      });
    }
  });

  it('returns no hard and no major issue for any week of 100 full sessions', () => {
    const problems: string[] = [];
    const judge = (run: SessionRun, seed: number) =>
      run.results.forEach((r, i) => {
        for (const m of [...r.quality.hard, ...r.quality.major]) problems.push(`session ${seed} week ${i + 1}: ${m}`);
      });
    sessions.forEach((run, i) => judge(run, i + 1));
    for (let seed = SESSIONS + 1; seed <= QUALITY_SESSIONS; seed++) judge(runSession(sampleSchedule(), seed), seed);
    expect(problems).toEqual([]);
  }, 1_800_000);

  it('gives every bunk two ropes, low first and then high', () => {
    for (const run of sessions) {
      for (const b of weekOf(run, 1).bunks) {
        expect(sessionBlocks(run.weeks, b.name, 'Ropes')).toBe(2);
        const labels = run.weeks.weeks.flatMap((w) => blocksOf((w as Schedule).bunks.find((x) => x.name === b.name)!.slots).filter((k) => k.area === 'Ropes').map((k) => [k.label, k.len]));
        expect(labels).toEqual([['Low Ropes', 2], ['High Ropes', 2]]);
      }
    }
  });

  it('keeps Judaics and Israel to one bunk at a time in nearly every period', () => {
    for (const area of ['Judaics', 'Israel Education']) {
      let periods = 0;
      let alone = 0;
      for (const run of sessions) {
        for (const w of run.weeks.weeks) {
          for (let s = 0; s < 24; s++) {
            const n = (w as Schedule).bunks.filter((b) => blocksOf(b.slots).some((k) => k.area === area && k.start === s)).length;
            if (n > 0) periods++;
            if (n === 1) alone++;
          }
        }
      }
      expect(alone / periods).toBeGreaterThanOrEqual(0.95);
    }
  });

  it('warns about every shortfall in the last week', () => {
    for (const run of sessions) {
      const last = run.results[3].warnings;
      for (const b of weekOf(run, 1).bunks) {
        for (const [area, want, name] of [['Yoga', 2, 'Yoga'], ['Ceramics', 2, 'Ceramics'], ['Teva', 2, 'Teva'], ['Judaics', 2, 'Judaics']] as const) {
          if (sessionBlocks(run.weeks, b.name, area) < want) expect(last.some((w) => w.includes(b.name) && w.includes(name) && w.includes('short'))).toBe(true);
        }
      }
    }
  });
});

describe('the fixed calendar', () => {
  it('week 1 Sunday: one swim test per village except Mohawk, who play Athletics in period 4; no hobbies', () => {
    for (const run of sessions) {
      const w = weekOf(run, 1);
      for (const v of ['O', 'C', 'S', 'T']) {
        const periods = [0, 1, 2, 3].filter((p) => villageNames(w, v).every((n) => cell(w, n, 0, p) === 'Swim Test'));
        expect(periods, v).toHaveLength(1);
        for (const n of villageNames(w, v)) expect(row(w, n).filter((l) => l === 'Swim Test')).toHaveLength(1);
      }
      for (const n of villageNames(w, 'M')) {
        expect(cell(w, n, 0, 3)).toBe('Athletics');
        expect(row(w, n)).not.toContain('Swim Test');
      }
      for (const b of w.bunks) for (let p = 0; p < 4; p++) expect(cell(w, b.name, 0, p)).not.toMatch(/Hobbies/);
    }
  });

  it('never uses Swim Test after week 1, and never Tusc Biking, All-Camp Event or Village Day', () => {
    for (const run of sessions) {
      run.weeks.weeks.forEach((w, i) => {
        for (const b of (w as Schedule).bunks) {
          if (i > 0) expect(b.slots).not.toContain('Swim Test');
          for (const banned of ['Tusc Biking', 'All-Camp Event', 'Village Day']) expect(b.slots).not.toContain(banned);
        }
      });
    }
  });

  it('week 2 Tusc mini bike trip: a double period near the end of the week', () => {
    for (const run of sessions) {
      const w = weekOf(run, 2);
      for (const n of villageNames(w, 'T')) {
        const trips = blocksOf(row(w, n)).filter((k) => k.label === 'Bike Trip');
        expect(trips).toHaveLength(1);
        expect(trips[0].len).toBe(2);
        expect([slotAt(4, 0), slotAt(4, 2), slotAt(5, 2)]).toContain(trips[0].start);
      }
    }
  });

  it('week 4: the Tusc bike trip, Monday morning hobbies, Culmination, Packing Time, Banquet Prep and an empty Friday', () => {
    for (const run of sessions) {
      const w = weekOf(run, 4);
      for (const b of w.bunks) {
        const isT = b.name.startsWith('T');
        for (let p = 0; p < 4; p++) {
          expect(cell(w, b.name, 5, p), `${b.name} Friday`).toBe('');
          if (isT) for (const d of [0, 1, 2]) expect(cell(w, b.name, d, p)).toBe('Bike Trip');
        }
        for (const p of [0, 1]) {
          expect(cell(w, b.name, 4, p)).toBe('Hobby Culmination');
          expect(cell(w, b.name, 1, p)).toBe(isT ? 'Bike Trip' : 'AM Hobbies');
        }
        for (const p of [2, 3]) expect(cell(w, b.name, 4, p)).toBe(isT ? 'Banquet Prep' : 'Packing Time');
        expect(b.slots.filter((l) => /Hobbies/.test(l))).toHaveLength(isT ? 0 : 2);
        expect(b.slots).not.toContain('Shabbat Prep');
      }
    }
  });

  it('weeks 1 to 3 hobbies: Friday morning always, Wednesday afternoon or Tuesday morning, Sunday morning only after week 1', () => {
    let sundays = 0;
    let wednesdays = 0;
    for (const run of sessions) {
      for (const week of [1, 2, 3]) {
        const w = weekOf(run, week);
        for (const b of w.bunks) {
          expect([cell(w, b.name, 5, 0), cell(w, b.name, 5, 1)]).toEqual(['AM Hobbies', 'AM Hobbies']);
          const wed = cell(w, b.name, 3, 2) === 'PM Hobbies';
          const tue = cell(w, b.name, 2, 0) === 'AM Hobbies';
          expect(wed !== tue).toBe(true);
          if (cell(w, b.name, 0, 0) === 'AM Hobbies') expect(week).toBeGreaterThan(1);
        }
        const b0 = w.bunks[0].name;
        if (cell(w, b0, 0, 0) === 'AM Hobbies') sundays++;
        if (cell(w, b0, 3, 2) === 'PM Hobbies') wednesdays++;
      }
    }
    expect(sundays).toBeLessThan(0.5 * SESSIONS * 2); // about 20 percent of weeks 2 and 3
    expect(wednesdays).toBeGreaterThan(0.4 * SESSIONS * 3); // about 65 percent
  });

  it('follows the Shabbat Prep rotation and gives every village one Tiyul', () => {
    const rotation: Record<number, string[]> = { 1: ['M'], 2: ['O', 'C'], 3: ['S', 'T'] };
    for (const run of sessions) {
      for (const week of [1, 2, 3, 4]) {
        const w = weekOf(run, week);
        for (const v of ['O', 'C', 'S', 'M', 'T']) {
          for (const n of villageNames(w, v)) {
            const prep = blocksOf(row(w, n)).filter((k) => k.label === 'Shabbat Prep');
            if (rotation[week]?.includes(v)) {
              expect(prep.map((k) => [k.day, k.len]).sort()).toContainEqual([5, 2]);
              const single = prep.find((k) => k.len === 1);
              expect(single && single.day >= 1 && single.day <= 4 && single.start % 4 < 2).toBe(true);
            } else expect(prep).toHaveLength(0);
          }
        }
      }
      for (const v of ['O', 'C', 'S', 'M']) {
        const weeksWith = [1, 2, 3, 4].filter((wk) => weekOf(run, wk).bunks.some((b) => b.name.startsWith(v) && b.slots.includes('Tiyul')));
        expect(weeksWith, v).toHaveLength(1);
        expect(v === 'O' || v === 'C' ? [2, 3] : [3, 4]).toContain(weeksWith[0]);
      }
    }
  });

  it('a 3-week session has no Culmination, Packing Time or Banquet Prep, MAL for Mohawk, and Tiyul in week 2', () => {
    for (let seed = 1; seed <= 4; seed++) {
      const run = runSession(sampleSchedule(), seed, 3);
      run.weeks.weeks.forEach((w, i) => {
        if (!w) return;
        for (const b of w.bunks) {
          for (const label of ['Hobby Culmination', 'Packing Time', 'Banquet Prep']) expect(b.slots).not.toContain(label);
          if (b.name.startsWith('M')) {
            expect(b.slots).not.toContain('MNL');
            expect(b.slots).toContain('MAL');
          }
          if (i === 2 && b.name.startsWith('T')) expect(blocksOf(b.slots).some((k) => k.label === 'Shabbat Prep')).toBe(true);
        }
      });
      for (const v of ['O', 'C', 'S', 'M']) {
        const wk = [1, 2, 3].filter((k) => weekOf(run, k).bunks.some((b) => b.name.startsWith(v) && b.slots.includes('Tiyul')));
        expect(wk, v).toEqual([2]);
      }
    }
  }, 300_000);
});

describe('what the generator writes', () => {
  it('only ever emits activities from the list', () => {
    for (const run of sessions) for (const w of run.weeks.weeks) for (const b of (w as Schedule).bunks) for (const l of b.slots) if (l) expect(KNOWN.has(l), l).toBe(true);
  });

  it('leaves bunks and day details untouched', () => {
    const src = sampleSchedule();
    src.days[2] = { ...src.days[2], notes: 'keep me', birthdays: 'Sam' };
    const weeks: WeeksState = { current: 0, weeks: [src, null, null, null] };
    const out = generateWeek({ weeks, weekIndex: 1, mode: 'replace-all', seed: 3 });
    expect(out.schedule.days).toEqual(src.days);
    expect(out.schedule.bunks.map((b) => [b.id, b.name, b.grades, b.count])).toEqual(src.bunks.map((b) => [b.id, b.name, b.grades, b.count]));
  });

  it('asks for bunks when the week has none', () => {
    const out = generateWeek({ weeks: { current: 0, weeks: [{ bunks: [], days: sampleSchedule().days }, null, null, null] }, weekIndex: 1, mode: 'replace-all', seed: 1 });
    expect(out.warnings[0]).toMatch(/Add bunks/);
  });

  it('is deterministic: the same seed and input give the same week, warnings, quality and number of rounds', () => {
    const weeks: WeeksState = { current: 0, weeks: [sampleSchedule(), null, null, null] };
    for (const seed of [42, 43, 44]) {
      const a = generateWeek({ weeks, weekIndex: 1, mode: 'replace-all', seed });
      const b = generateWeek({ weeks, weekIndex: 1, mode: 'replace-all', seed });
      expect(b).toEqual(a);
      expect(b.rounds).toBe(a.rounds);
      expect(b.quality).toEqual(a.quality);
    }
    const first = runSession(sampleSchedule(), 8);
    const again = runSession(sampleSchedule(), 8);
    expect(again.results.map((r) => r.rounds)).toEqual(first.results.map((r) => r.rounds));
    expect(again.results.map((r) => r.schedule.bunks.map((b) => b.slots))).toEqual(first.results.map((r) => r.schedule.bunks.map((b) => b.slots)));
  }, 60_000);

  it('gives noticeably different weeks for different seeds, both valid', () => {
    const fixed = /Hobbies|Swim Test|Shabbat Prep|Tiyul|Bike Trip/;
    const make = (seed: number) => {
      const weeks: WeeksState = { current: 0, weeks: [sampleSchedule(), null, null, null] };
      const out = generateWeek({ weeks, weekIndex: 1, mode: 'replace-all', seed });
      const trial: WeeksState = { ...weeks, weeks: [out.schedule, null, null, null] };
      expect(validateWeek(trial, 1, 4)).toEqual([]);
      return out.schedule;
    };
    const a = make(11);
    const b = make(12);
    let considered = 0;
    let different = 0;
    a.bunks.forEach((bk, i) => {
      bk.slots.forEach((label, s) => {
        const other = b.bunks[i].slots[s];
        if (fixed.test(label) && fixed.test(other)) return;
        considered++;
        if (label !== other) different++;
      });
    });
    expect(different / considered).toBeGreaterThanOrEqual(0.25);
  });

  it('runs in under a second for the 22-bunk roster', () => {
    const run = runSession(sampleSchedule(), 99);
    for (const ms of run.ms) expect(ms).toBeLessThan(1000);
  }, 60_000);
});

describe('equal ordinals', () => {
  it('never puts a bunk on its second time at an area next to a related bunk on its first', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const w1 = blankCopy(sampleSchedule());
      const c1 = w1.bunks.find((b) => b.name === 'C1')!;
      c1.slots[slotAt(0, 0)] = 'Judaics';
      c1.slots[slotAt(1, 2)] = 'Music';
      c1.slots[slotAt(2, 1)] = 'Athletics';
      const weeks: WeeksState = { current: 1, weeks: [w1, blankCopy(sampleSchedule()), null, null] };
      const out = generateWeek({ weeks, weekIndex: 2, mode: 'replace-all', seed });
      weeks.weeks[1] = out.schedule;
      expect(validateWeek(weeks, 2, 4).filter((v) => v.rule === 'H5')).toEqual([]);
      const r1 = row(out.schedule, 'C1');
      const r2 = row(out.schedule, 'C2');
      for (let s = 0; s < 24; s++) {
        if (r1[s] === r2[s] && ['Judaics', 'Music', 'Athletics'].includes(r1[s])) throw new Error(`C1 and C2 share ${r1[s]} in slot ${s} (seed ${seed})`);
      }
    }
  }, 120_000);
});

describe('fill-empty mode', () => {
  const setup = () => {
    const w1 = generateWeek({ weeks: { current: 0, weeks: [sampleSchedule(), null, null, null] }, weekIndex: 1, mode: 'replace-all', seed: 7 }).schedule;
    const w2 = blankCopy(sampleSchedule());
    for (const b of w2.bunks) for (const p of [0, 1]) b.slots[slotAt(4, p)] = 'All-Camp Event';
    row(w2, 'O1')[slotAt(1, 0)] = 'Talent Show';
    row(w2, 'O1')[slotAt(2, 0)] = 'Music';
    const weeks: WeeksState = { current: 1, weeks: [w1, w2, null, null] };
    return { weeks, w2 };
  };

  it('leaves everything already filled in exactly as it was, and fills the rest', () => {
    const { weeks, w2 } = setup();
    const before = w2.bunks.map((b) => [...b.slots]);
    const out = generateWeek({ weeks, weekIndex: 2, mode: 'fill-empty', seed: 5 });
    out.schedule.bunks.forEach((b, i) => {
      before[i].forEach((label, s) => {
        if (label) expect(b.slots[s]).toBe(label);
        else expect(b.slots[s]).not.toBe('');
      });
    });
    const locked = before.map((r) => r.map((l) => l !== ''));
    const trial: WeeksState = { ...weeks, weeks: [weeks.weeks[0], out.schedule, null, null] };
    expect(validateWeek(trial, 2, 4, { locked })).toEqual([]);
  });

  it('counts what is already filled in toward the quotas', () => {
    const { weeks } = setup();
    const out = generateWeek({ weeks, weekIndex: 2, mode: 'fill-empty', seed: 5 });
    const music = blocksOf(row(out.schedule, 'O1')).filter((k) => k.area === 'Music');
    expect(music).toHaveLength(1); // the locked Music counts as the week's one
  });

  it('warns instead of crashing when a filled-in cell makes a planned block impossible', () => {
    const w1 = blankCopy(sampleSchedule());
    row(w1, 'M1')[slotAt(0, 3)] = 'Music'; // Mohawk's Sunday period 4 Athletics can no longer go in
    row(w1, 'O1')[slotAt(5, 0)] = 'Talent Show'; // and one bunk cannot have Friday hobbies
    const weeks: WeeksState = { current: 0, weeks: [w1, null, null, null] };
    let out = { warnings: [] as string[] };
    expect(() => (out = generateWeek({ weeks, weekIndex: 1, mode: 'fill-empty', seed: 2 }))).not.toThrow();
    expect(out.warnings.some((w) => /Sunday period 4 Athletics for village M/.test(w))).toBe(true);
    expect(out.warnings.some((w) => /Hobbies on Friday morning could not be placed for O1/.test(w))).toBe(true);
  });
});

describe('when no good week exists', () => {
  it('gives up after the round cap and still returns the best week without throwing', () => {
    // O1 is completely filled in by hand, so it can never get its Music: no round can come back clean.
    const w1 = blankCopy(sampleSchedule());
    row(w1, 'O1').fill('Talent Show');
    const weeks: WeeksState = { current: 0, weeks: [w1, null, null, null] };
    let out: ReturnType<typeof generateWeek> | undefined;
    const t0 = performance.now();
    expect(() => (out = generateWeek({ weeks, weekIndex: 1, mode: 'fill-empty', seed: 3, maxRounds: 2 }))).not.toThrow();
    const ms = performance.now() - t0;
    const res = out as ReturnType<typeof generateWeek>;
    expect(res.quality.major).toContain('O1 has no Music this week.');
    expect(res.rounds).toBe(2);
    expect(ms).toBeLessThan(15_000);
    expect(row(res.schedule, 'O1').every((l) => l === 'Talent Show')).toBe(true);
    for (const b of res.schedule.bunks) if (b.name !== 'O1') expect(b.slots.every((l) => l !== '')).toBe(true);
  }, 60_000);
});

describe.skipIf(!env.AUTOGEN_REPORT)('fairness report (AUTOGEN_REPORT=1)', () => {
  it('prints each bunk\'s tracking totals for a simulated 4-week session', () => {
    const run = runSession(sampleSchedule(), 5);
    const t = computeSessionTracking(run.weeks.weeks.filter((w): w is Schedule => w !== null));
    const header = ['Bunk', ...t.areas.map((a) => a.slice(0, 5)), 'Total'].map((x) => x.padEnd(6)).join('');
    const lines = t.rows.map((r) => [r.bunk.name, ...r.counts, r.total].map((x) => String(x).padEnd(6)).join(''));
    console.log(['', header, ...lines, '', ...run.warnings].join('\n'));
    expect(t.rows.length).toBe(22);
  });
});
