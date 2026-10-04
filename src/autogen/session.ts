import { emptySchedule, newBunk } from '../sample';
import type { Bunk, Schedule } from '../types';
import { APP_BACK_UP_AFTER, APP_MAX_MS, APP_TOTAL_MAX_MS, type SessionWeeks } from './config';
import { isFilledWeek } from './history';
import { generateWeekAsync, isBad, type AutoGenOptions, type AutoGenResult } from './index';
import { compareQuality } from './quality';
import { applySettings, type Settings } from './settings';

export interface RunStep {
  /** 0-based week. */
  index: number;
  mode: 'fill-empty' | 'replace-all';
}

export interface RunOptions {
  /** Every week slot as it stands. Never changed: the result is a new list. */
  weeks: (Schedule | null)[];
  /** The weeks to generate, in order. */
  steps: RunStep[];
  /** A week with no bunks yet takes these. */
  roster: Bunk[];
  sessionWeeks: SessionWeeks;
  keepTrips: boolean;
  /** Take the weeks that are not being generated into account. */
  useOtherWeeks: boolean;
  seed: number;
  /** The numbers to generate with; the defaults when left out. */
  settings?: Settings;
  signal?: AbortSignal;
  /** Called each time a week is started. `tries` counts the failed tries at it so far. A step lower than the last one means that week is being redone. */
  onProgress?: (step: number, tries: number) => void;
  /** Called as soon as a week is kept, so it can be shown while the later ones are still being worked on. */
  onWeek?: (step: number, schedule: Schedule) => void;
  /** How one week is generated. Left out, it is generated here; the page passes one that tries several seeds at once. */
  generate?: (options: AutoGenOptions) => Promise<AutoGenResult | null>;
  /** Longest one try at one week may take, and longest the whole run may take before it settles for its best. */
  maxMsPerTry?: number;
  maxTotalMs?: number;
}

export interface RunResult {
  weeks: (Schedule | null)[];
  /** One per step, in order. */
  results: AutoGenResult[];
  /** Did every week come out with no rule break and nothing short? */
  good: boolean;
  /** How many times a week was generated, counting the ones thrown away. */
  tries: number;
}

/**
 * Generate the weeks one after another, and only keep a week that is good: no rule break and nothing short. A week that is
 * not good is thrown away and generated again with a new seed. When it keeps failing, the week before it (if this run made
 * it) is thrown away and generated again too, because what an earlier week used up is the usual reason a later one cannot be
 * finished. Only when the whole run has gone on longer than maxTotalMs does it settle for the best week it found.
 * Resolves to null when the signal aborts it.
 */
export async function generateRun(opts: RunOptions): Promise<RunResult | null> {
  const { steps } = opts;
  applySettings(opts.settings);
  const started = performance.now();
  const maxTotalMs = opts.maxTotalMs ?? APP_TOTAL_MAX_MS;
  const generated = new Set(steps.map((s) => s.index));
  // what each week holds before it is generated: a week that is redone starts from this again
  const input = opts.weeks.map((w, i) =>
    generated.has(i) && !isFilledWeek(w) ? { ...emptySchedule(), bunks: opts.roster.map((b) => newBunk(b.name, b.grades, b.count)) } : w,
  );
  const working = [...input];
  const results: (AutoGenResult | null)[] = steps.map(() => null);
  const best: (AutoGenResult | null)[] = steps.map(() => null);
  const fails = steps.map(() => 0);
  let tries = 0;
  let n = 0;
  while (n < steps.length) {
    const { index, mode } = steps[n];
    working[index] = input[index];
    opts.onProgress?.(n, fails[n]);
    // starting fresh: the weeks that are not part of this run are hidden from the generator
    const visible = opts.useOtherWeeks ? working : working.map((w, i) => (generated.has(i) ? w : null));
    const result = await (opts.generate ?? generateWeekAsync)({
      weeks: { current: index, weeks: visible },
      weekIndex: index + 1,
      mode,
      sessionWeeks: opts.sessionWeeks,
      seed: (opts.seed + n * 7919 + tries * 104729) | 0,
      keepTrips: opts.keepTrips,
      signal: opts.signal,
      maxMs: opts.maxMsPerTry ?? APP_MAX_MS,
    });
    tries++;
    if (!result) return null;
    const keep = (r: AutoGenResult) => {
      results[n] = r;
      working[index] = r.schedule;
      opts.onWeek?.(n, r.schedule);
      best[n] = null;
      fails[n] = 0;
      n++;
    };
    if (!isBad(result.quality)) {
      keep(result);
      continue;
    }
    const soFar = best[n];
    if (!soFar || compareQuality(result.quality, soFar.quality) < 0) best[n] = result;
    fails[n]++;
    if (performance.now() - started >= maxTotalMs) {
      keep(best[n] as AutoGenResult); // out of time: the best this week got
      continue;
    }
    if (fails[n] >= APP_BACK_UP_AFTER && n > 0) {
      // this week will not come out with the week before it as it is: redo that one as well
      fails[n] = 0;
      best[n] = null;
      n--;
    }
  }
  const done = results as AutoGenResult[];
  return { weeks: working, results: done, good: done.every((r) => !isBad(r.quality)), tries };
}
