import { describe, expect, it } from 'vitest';
import { sampleSchedule } from '../sample';
import type { Schedule } from '../types';
import { generateRun, type RunOptions } from './session';
import { blankCopy, weekWithTrips } from './testUtil';
import { validateWeek } from './validate';

type Env = { AUTOGEN_RUNS?: string; AUTOGEN_FIRST?: string };
const env: Env = (globalThis as unknown as { process?: { env?: Env } }).process?.env ?? {};

/** A whole 4-week session of the default roster with its trips entered, every week to be generated. */
const sessionOptions = (seed: number): RunOptions => ({
  weeks: [1, 2, 3, 4].map((w) => weekWithTrips(sampleSchedule(), w)),
  steps: [0, 1, 2, 3].map((index) => ({ index, mode: 'fill-empty' as const })),
  roster: sampleSchedule().bunks,
  sessionWeeks: 4,
  keepTrips: true,
  useOtherWeeks: true,
  seed,
});

describe('a run only hands back weeks that are good', () => {
  it('generates a whole session with no rule break and nothing short, and leaves what it was given alone', async () => {
    const events: string[] = [];
    const opts: RunOptions = { ...sessionOptions(7), onProgress: (step) => events.push(`start ${step}`), onWeek: (step) => events.push(`done ${step}`) };
    const before = JSON.stringify(opts.weeks);
    const run = await generateRun(opts);
    expect(run?.good).toBe(true);
    // every week is announced when it is started and handed over as soon as it is good, in order
    expect(events.filter((e) => e.startsWith('done'))).toEqual(expect.arrayContaining(['done 0', 'done 1', 'done 2', 'done 3']));
    expect(events[0]).toBe('start 0');
    expect(events[events.length - 1]).toBe('done 3');
    expect(JSON.stringify(opts.weeks)).toBe(before);
    for (const r of run?.results ?? []) {
      expect(r.quality.hard).toEqual([]);
      expect(r.quality.major).toEqual([]);
    }
    const weeks = { current: 0, weeks: run?.weeks ?? [] };
    for (let w = 1; w <= 4; w++) expect(validateWeek(weeks, w, 4)).toEqual([]);
    expect(run?.tries).toBeGreaterThanOrEqual(4);
  }, 600_000);

  it('gives a week with no bunks the roster it was handed', async () => {
    const run = await generateRun({ ...sessionOptions(5), weeks: [null, null, null, null], steps: [{ index: 0, mode: 'replace-all' }] });
    expect((run?.weeks[0] as Schedule).bunks.map((b) => b.name)).toEqual(sampleSchedule().bunks.map((b) => b.name));
    expect(run?.weeks.slice(1)).toEqual([null, null, null]);
  }, 300_000);

  it('settles for its best only when it is out of time', async () => {
    // O1 is filled in completely by hand, so it can never get its Music: no try can come out good.
    const w1 = blankCopy(sampleSchedule());
    w1.bunks[0].slots.fill('Talent Show');
    const run = await generateRun({ ...sessionOptions(3), weeks: [w1, null, null, null], steps: [{ index: 0, mode: 'fill-empty' }], maxMsPerTry: 1, maxTotalMs: 30_000 });
    expect(run?.good).toBe(false);
    expect(run?.tries).toBeGreaterThanOrEqual(2); // it did try again before giving in
    expect(run?.results[0].quality.major).toContain('O1 has no Music this week.');
    expect((run?.weeks[0] as Schedule).bunks[0].slots.every((l) => l === 'Talent Show')).toBe(true);
  }, 120_000);

  it('stops and changes nothing when it is cancelled', async () => {
    const abort = new AbortController();
    abort.abort();
    expect(await generateRun({ ...sessionOptions(2), signal: abort.signal })).toBeNull();
  });
});

describe.skipIf(!env.AUTOGEN_RUNS)('how often and how fast a run comes out good (AUTOGEN_RUNS=100)', () => {
  it('prints the count of good sessions, the tries they took and the time', async () => {
    const first = Number(env.AUTOGEN_FIRST ?? 1);
    const count = Number(env.AUTOGEN_RUNS);
    const lines: string[] = [];
    const seconds: number[] = [];
    let good = 0;
    for (let seed = first; seed < first + count; seed++) {
      const t0 = performance.now();
      const run = await generateRun(sessionOptions(seed * 101));
      const s = (performance.now() - t0) / 1000;
      seconds.push(s);
      if (run?.good) good++;
      if (!run?.good || (run?.tries ?? 0) > 4) lines.push(`seed ${seed}: ${run?.good ? 'good' : 'NOT GOOD'} after ${run?.tries} tries, ${s.toFixed(0)} s`);
    }
    seconds.sort((a, b) => a - b);
    const at = (q: number): string => seconds[Math.min(seconds.length - 1, Math.floor(q * seconds.length))].toFixed(0);
    console.log(['', ...lines, `GOOD sessions: ${good} of ${count}. Seconds per session: median ${at(0.5)}, 9 in 10 under ${at(0.9)}, longest ${at(1)}.`].join('\n'));
    expect(good).toBe(count);
  }, 36_000_000);
});
