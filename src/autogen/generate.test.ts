import { beforeAll, describe, expect, it } from 'vitest';
import { ACTIVITIES } from '../config';
import { sampleSchedule } from '../sample';
import { computeSessionTracking } from '../tracking';
import type { Schedule, WeeksState } from '../types';
import { DANCE_TARGETS } from './config';
import { blocksOf, slotAt } from './history';
import { generateWeek, isBad } from './index';
import { blankCopy, rosterOf, runSession, sessionBlocks, weekWithTrips, type SessionRun } from './testUtil';
import { validateWeek, type Rule } from './validate';

type Env = { AUTOGEN_SEEDS?: string; AUTOGEN_FIRST?: string; AUTOGEN_REPORT?: string };
const env: Env = (globalThis as unknown as { process?: { env?: Env } }).process?.env ?? {};

/** Full sessions generated and checked on the default roster. Set AUTOGEN_SEEDS=100 for the long run. */
const SESSIONS = Math.max(1, Number(env.AUTOGEN_SEEDS ?? 3));
/** The first seed, so a long run can be split into parts (AUTOGEN_FIRST=21 AUTOGEN_SEEDS=20 runs seeds 21 to 40). */
const FIRST = Math.max(1, Number(env.AUTOGEN_FIRST ?? 1));
const RULES: Rule[] = ['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'H7', 'H8', 'H9', 'H10', 'H11', 'H12', 'H13', 'H14', 'H15', 'H16', 'H17', 'H18'];
const KNOWN = new Set(ACTIVITIES.map((a) => a.label));
const TRIPS = ['Bike Trip', 'Tiyul'];

const weekOf = (run: SessionRun, week: number): Schedule => run.weeks.weeks[week - 1] as Schedule;
const row = (s: Schedule, name: string): string[] => (s.bunks.find((b) => b.name === name) as Schedule['bunks'][number]).slots;
const cell = (s: Schedule, name: string, day: number, period: number): string => row(s, name)[slotAt(day, period)];
const villageNames = (s: Schedule, letter: string): string[] => s.bunks.filter((b) => b.name.startsWith(letter)).map((b) => b.name);
const hardViolations = (run: SessionRun, sessionWeeks: 3 | 4 = 4) =>
  run.weeks.weeks.flatMap((_, i) => validateWeek(run.weeks, i + 1, sessionWeeks).map((v) => `week ${i + 1} ${v.rule}: ${v.message}`));

let sessions: SessionRun[] = [];
beforeAll(() => {
  sessions = Array.from({ length: SESSIONS }, (_, i) => runSession(sampleSchedule(), FIRST + i));
}, 3_600_000);

describe('hard rules', () => {
  it('generates weeks 1 to 4 in order, around the trips, with no rule breaks', () => {
    for (const run of sessions) expect(hardViolations(run)).toEqual([]);
  });

  it('checks each rule H1 to H18 on its own', () => {
    for (const rule of RULES) {
      const found = sessions.flatMap((run) => run.weeks.weeks.flatMap((_, i) => validateWeek(run.weeks, i + 1, 4).filter((v) => v.rule === rule)));
      expect(found, rule).toEqual([]);
    }
  });

  it('holds on other rosters: 2 bunks per village, and one grade throughout', () => {
    const rosters = [rosterOf({ O: 2, C: 2, S: 2, M: 2, T: 2 }), rosterOf({ O: 5, C: 4, S: 5, M: 4, T: 4 }, () => '5th')];
    for (const roster of rosters) for (let seed = 1; seed <= 3; seed++) expect(hardViolations(runSession(roster, seed))).toEqual([]);
  }, 900_000);

  it('holds for a 3-week session too', () => {
    for (let seed = 1; seed <= 2; seed++) expect(hardViolations(runSession(sampleSchedule(), seed, 3), 3)).toEqual([]);
  }, 600_000);

  it('says what a returned week is short on, in the console only', () => {
    // A report, not a pass or fail: the app keeps retrying until a week has none of these.
    const lines = sessions.flatMap((run, s) => run.results.flatMap((r, i) => r.quality.major.map((m) => `session ${FIRST + s} week ${i + 1}: ${m}`)));
    console.log(lines.length === 0 ? 'Every week came back with nothing short.' : ['Short after the time limit:', ...lines].join('\n'));
    for (const run of sessions) for (const r of run.results) expect(r.quality.hard).toEqual([]);
  });
});

describe('session totals', () => {
  it('gives every bunk two ropes, low first and then high', () => {
    for (const run of sessions) {
      for (const b of weekOf(run, 1).bunks) {
        const labels = run.weeks.weeks.flatMap((w) => blocksOf(row(w as Schedule, b.name)).filter((k) => k.area === 'Ropes').map((k) => [k.label, k.len]));
        expect(labels, b.name).toEqual([['Low Ropes', 2], ['High Ropes', 2]]);
      }
    }
  });

  it('keeps Dance at its target or one under: O 3, S 3, C 2, T 2, M 1', () => {
    for (const run of sessions) {
      for (const b of weekOf(run, 1).bunks) {
        const want = DANCE_TARGETS[b.name[0]];
        const got = sessionBlocks(run.weeks, b.name, 'Dance');
        expect(got, b.name).toBeLessThanOrEqual(want);
        expect(got, b.name).toBeGreaterThanOrEqual(want - 1);
      }
    }
  });

  it('never gives a bunk more than three Judaics, two Israel, or three Time with UH', () => {
    for (const run of sessions) {
      for (const b of weekOf(run, 1).bunks) {
        expect(sessionBlocks(run.weeks, b.name, 'Judaics')).toBeLessThanOrEqual(3);
        expect(sessionBlocks(run.weeks, b.name, 'Israel Education')).toBeLessThanOrEqual(2);
        expect(sessionBlocks(run.weeks, b.name, 'TW UH')).toBeLessThanOrEqual(3);
      }
    }
  });

  it('keeps the pool even: villages within one swim of each other, and no bunk more than two from another', () => {
    for (const run of sessions) {
      const bunks = weekOf(run, 1).bunks.map((b) => b.name);
      const swims = bunks.map((n) => sessionBlocks(run.weeks, n, 'Pool'));
      expect(Math.max(...swims) - Math.min(...swims)).toBeLessThanOrEqual(2);
      const most = ['O', 'C', 'S', 'M', 'T'].map((v) => Math.max(...bunks.filter((n) => n.startsWith(v)).map((n) => sessionBlocks(run.weeks, n, 'Pool'))));
      expect(Math.max(...most) - Math.min(...most), most.join(' ')).toBeLessThanOrEqual(1);
    }
  });

  it('gives every Mohawk bunk A&C, and Music twice instead of every week', () => {
    for (const run of sessions) {
      for (const n of villageNames(weekOf(run, 1), 'M')) {
        expect(sessionBlocks(run.weeks, n, 'A&C'), n).toBeGreaterThanOrEqual(1);
        expect(sessionBlocks(run.weeks, n, 'Music'), n).toBeLessThanOrEqual(2);
      }
    }
  });

  it('gives Teva, Yoga and Ceramics up to three times a session', () => {
    for (const run of sessions) {
      for (const b of weekOf(run, 1).bunks) for (const area of ['Teva', 'Yoga', 'Ceramics']) expect(sessionBlocks(run.weeks, b.name, area), `${b.name} ${area}`).toBeLessThanOrEqual(3);
    }
  });

  it('never has a bunk at the same kind of period two days in a row, and plays league two or three times a week', () => {
    for (const run of sessions) {
      run.weeks.weeks.forEach((w, i) => {
        const s = w as Schedule;
        for (const b of s.bunks) {
          const days = [0, 1, 2, 3, 4, 5].map((d) => new Set(blocksOf(b.slots).filter((k) => k.day === d && k.area && k.area !== 'Trips').map((k) => k.area)));
          for (let d = 0; d < 5; d++) for (const area of days[d]) expect(days[d + 1].has(area), `week ${i + 1} ${b.name} ${area} day ${d}`).toBe(false);
        }
        for (const v of ['O', 'C', 'S', 'M']) {
          const league = blocksOf(row(s, villageNames(s, v)[0])).filter((k) => k.area === 'League').length;
          expect(league, `week ${i + 1} village ${v}`).toBeGreaterThanOrEqual(2);
          expect(league).toBeLessThanOrEqual(3);
        }
      });
    }
  });

  it('sends Tusc to the pool together, and every O and C bunk once or twice a week', () => {
    for (const run of sessions) {
      run.weeks.weeks.forEach((w) => {
        const s = w as Schedule;
        const tusc = villageNames(s, 'T');
        for (let x = 0; x < 24; x++) {
          const there = tusc.filter((n) => row(s, n)[x] === 'Pool');
          expect([0, tusc.length]).toContain(there.length);
        }
        for (const n of [...villageNames(s, 'O'), ...villageNames(s, 'C')]) {
          const swims = blocksOf(row(s, n)).filter((k) => k.area === 'Pool').length;
          expect(swims, n).toBeGreaterThanOrEqual(1);
          expect(swims, n).toBeLessThanOrEqual(2);
        }
      });
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

  it('week 4: Monday morning hobbies, Culmination, Packing Time, Banquet Prep and an empty Friday, around the Tusc bike trip', () => {
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
        expect(b.slots).not.toContain('Shabbat Prep');
      }
    }
  });

  it('weeks 1 to 3 hobbies: Friday morning always, and Wednesday afternoon or Tuesday morning', () => {
    for (const run of sessions) {
      for (const week of [1, 2, 3]) {
        const w = weekOf(run, week);
        const on = (day: number, period: number, label: string): boolean => w.bunks.some((b) => cell(w, b.name, day, period) === label);
        expect(on(5, 0, 'AM Hobbies')).toBe(true);
        expect(on(3, 2, 'PM Hobbies') !== on(2, 0, 'AM Hobbies')).toBe(true);
        if (on(0, 0, 'AM Hobbies')) expect(week).toBeGreaterThan(1);
        // a bunk misses hobbies only when it is away on a trip
        for (const b of w.bunks) {
          for (const p of [0, 1]) expect(['AM Hobbies', ...TRIPS]).toContain(cell(w, b.name, 5, p));
        }
      }
    }
  });

  it('follows the Shabbat Prep rotation', () => {
    const rotation: Record<number, string[]> = { 1: ['M'], 2: ['O', 'C'], 3: ['S', 'T'] };
    for (const run of sessions) {
      for (const week of [1, 2, 3, 4]) {
        const w = weekOf(run, week);
        for (const v of ['O', 'C', 'S', 'M', 'T']) {
          for (const n of villageNames(w, v)) {
            const prep = blocksOf(row(w, n)).filter((k) => k.label === 'Shabbat Prep');
            if (rotation[week]?.includes(v)) expect(prep.map((k) => [k.day, k.len])).toContainEqual([5, 2]);
            else expect(prep).toHaveLength(0);
          }
        }
      }
    }
  });
});

describe('trips are entered by hand', () => {
  const tripCells = (s: Schedule): string[] => s.bunks.flatMap((b) => b.slots.map((l, x) => (TRIPS.includes(l) ? `${b.name}:${x}:${l}` : '')).filter(Boolean));

  it('never writes a Bike Trip or a Tiyul of its own', () => {
    for (const week of [2, 3, 4]) {
      const weeks: WeeksState = { current: 0, weeks: [null, null, null, null] };
      weeks.weeks[week - 1] = blankCopy(sampleSchedule());
      const out = generateWeek({ weeks, weekIndex: week, mode: 'replace-all', seed: 9, maxRounds: 1 });
      expect(tripCells(out.schedule), `week ${week}`).toEqual([]);
    }
  }, 120_000);

  it('builds around the trips that are there, and keeps them', () => {
    for (const run of sessions) {
      for (const week of [2, 3, 4]) expect(tripCells(weekOf(run, week))).toEqual(tripCells(weekWithTrips(sampleSchedule(), week)));
    }
  });

  it('replacing a week keeps its trips unless told not to', () => {
    const weeks: WeeksState = { current: 0, weeks: [null, weekWithTrips(sampleSchedule(), 2), null, null] };
    const before = tripCells(weeks.weeks[1] as Schedule);
    expect(before.length).toBeGreaterThan(0);
    const kept = generateWeek({ weeks, weekIndex: 2, mode: 'replace-all', seed: 4, maxRounds: 1 });
    expect(tripCells(kept.schedule)).toEqual(before);
    const wiped = generateWeek({ weeks, weekIndex: 2, mode: 'replace-all', keepTrips: false, seed: 4, maxRounds: 1 });
    expect(tripCells(wiped.schedule)).toEqual([]);
  }, 120_000);
});

describe('what the generator writes', () => {
  it('only ever emits activities from the list', () => {
    for (const run of sessions) for (const w of run.weeks.weeks) for (const b of (w as Schedule).bunks) for (const l of b.slots) if (l) expect(KNOWN.has(l), l).toBe(true);
  });

  it('leaves bunks and day details untouched', () => {
    const src = sampleSchedule();
    src.days[2] = { ...src.days[2], notes: 'keep me', birthdays: 'Sam' };
    const weeks: WeeksState = { current: 0, weeks: [src, null, null, null] };
    const out = generateWeek({ weeks, weekIndex: 1, mode: 'replace-all', seed: 3, maxRounds: 1 });
    expect(out.schedule.days).toEqual(src.days);
    expect(out.schedule.bunks.map((b) => [b.id, b.name, b.grades, b.count])).toEqual(src.bunks.map((b) => [b.id, b.name, b.grades, b.count]));
  });

  it('asks for bunks when the week has none', () => {
    const out = generateWeek({ weeks: { current: 0, weeks: [{ bunks: [], days: sampleSchedule().days }, null, null, null] }, weekIndex: 1, mode: 'replace-all', seed: 1 });
    expect(out.warnings[0]).toMatch(/Add bunks/);
  });

  it('is deterministic: the same seed and input give the same week, quality and number of rounds', () => {
    const weeks: WeeksState = { current: 0, weeks: [sampleSchedule(), null, null, null] };
    for (const seed of [42, 43]) {
      const a = generateWeek({ weeks, weekIndex: 1, mode: 'replace-all', seed, maxRounds: 3 });
      const b = generateWeek({ weeks, weekIndex: 1, mode: 'replace-all', seed, maxRounds: 3 });
      expect(b).toEqual(a);
    }
  }, 120_000);

  it('gives noticeably different weeks for different seeds', () => {
    const fixed = /Hobbies|Swim Test|Shabbat Prep/;
    const make = (seed: number) => generateWeek({ weeks: { current: 0, weeks: [sampleSchedule(), null, null, null] }, weekIndex: 1, mode: 'replace-all', seed, maxRounds: 3 }).schedule;
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
  }, 120_000);

  it('builds a week of the 22-bunk roster within the time limit', () => {
    for (const run of sessions) for (const ms of run.ms) expect(ms).toBeLessThan(25_000);
  });
});

describe('building around what is already there', () => {
  const setup = () => {
    const w1 = generateWeek({ weeks: { current: 0, weeks: [sampleSchedule(), null, null, null] }, weekIndex: 1, mode: 'replace-all', seed: 7, maxMs: 15_000 }).schedule;
    const w2 = blankCopy(sampleSchedule());
    for (const b of w2.bunks) for (const p of [0, 1]) b.slots[slotAt(4, p)] = 'All-Camp Event';
    row(w2, 'O1')[slotAt(1, 0)] = 'Talent Show';
    row(w2, 'O1')[slotAt(2, 0)] = 'Music';
    const weeks: WeeksState = { current: 1, weeks: [w1, w2, null, null] };
    return { weeks, w2 };
  };

  it('leaves everything already filled in exactly as it was, fills the rest, and counts it toward the quotas', () => {
    const { weeks, w2 } = setup();
    const before = w2.bunks.map((b) => [...b.slots]);
    // a week that does not come out good is generated again, as the app does
    let out = generateWeek({ weeks, weekIndex: 2, mode: 'fill-empty', seed: 5, maxMs: 15_000 });
    for (let k = 1; k < 8 && isBad(out.quality); k++) out = generateWeek({ weeks, weekIndex: 2, mode: 'fill-empty', seed: 5 + k * 104729, maxMs: 15_000 });
    out.schedule.bunks.forEach((b, i) => {
      before[i].forEach((label, s) => {
        if (label) expect(b.slots[s]).toBe(label);
        else expect(b.slots[s]).not.toBe('');
      });
    });
    const locked = before.map((r) => r.map((l) => l !== ''));
    const trial: WeeksState = { ...weeks, weeks: [weeks.weeks[0], out.schedule, null, null] };
    expect(validateWeek(trial, 2, 4, { locked })).toEqual([]);
    // the Music put in by hand is the week's own; one more may fill a period, never two
    const music = blocksOf(row(out.schedule, 'O1')).filter((k) => k.area === 'Music').length;
    expect(music).toBeGreaterThanOrEqual(1);
    expect(music).toBeLessThanOrEqual(2);
  }, 120_000);

  it('does not crash when a filled-in cell makes a planned block impossible', () => {
    const w1 = blankCopy(sampleSchedule());
    row(w1, 'M1')[slotAt(0, 3)] = 'Music'; // Mohawk's Sunday period 4 Athletics can no longer go in
    row(w1, 'O1')[slotAt(5, 0)] = 'Talent Show'; // and one bunk cannot have Friday hobbies
    const weeks: WeeksState = { current: 0, weeks: [w1, null, null, null] };
    let out = { warnings: [] as string[] };
    expect(() => (out = generateWeek({ weeks, weekIndex: 1, mode: 'fill-empty', seed: 2, maxRounds: 1 }))).not.toThrow();
    expect(out.warnings.some((w) => /Sunday period 4 Athletics for village M/.test(w))).toBe(true);
    expect(out.warnings.some((w) => /Hobbies on Friday morning could not be placed for O1/.test(w))).toBe(true);
  }, 120_000);

  it('gives up after the round limit and still returns the best week when no good week exists', () => {
    // O1 is completely filled in by hand, so it can never get its Music: no round can come back clean.
    const w1 = blankCopy(sampleSchedule());
    row(w1, 'O1').fill('Talent Show');
    const weeks: WeeksState = { current: 0, weeks: [w1, null, null, null] };
    // the time limit is set well out of the way, so it is the round limit that stops it
    const res = generateWeek({ weeks, weekIndex: 1, mode: 'fill-empty', seed: 3, maxRounds: 2, maxMs: 100_000 });
    expect(res.quality.major).toContain('O1 has no Music this week.');
    expect(res.rounds).toBe(2);
    expect(row(res.schedule, 'O1').every((l) => l === 'Talent Show')).toBe(true);
  }, 120_000);
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
