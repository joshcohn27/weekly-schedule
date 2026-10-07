import { isGuest } from '../autofill';
import { emptySchedule, newBunk } from '../sample';
import type { Bunk, Schedule } from '../types';
import { APP_BACK_UP_AFTER, APP_MAX_MS, weekBudgetMs, type SessionWeeks } from './config';
import { tidyWeek } from './tidy';
import { isFilledWeek } from './history';
import { generateWeekAsync, isBad, type AutoGenOptions, type AutoGenResult } from './index';
import { compareQuality } from './quality';
import { applyCalendar, calendarFor, templateFor } from './sessionCalendar';
import { applySettings, isDefaultSettings, templateSettings, type Settings } from './settings';

export interface RunStep {
  /** 0-based week. */
  index: number;
  mode: 'fill-empty' | 'replace-all';
  /** Days of this week that have already happened, counted from Sunday: they are left exactly as they are. */
  pastDays?: number;
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
  /** True puts the session calendar on the weeks first. Off until the generator shares a week's numbers out over the days the calendar leaves it. */
  calendar?: boolean;
  signal?: AbortSignal;
  /**
   * Called each time a try at a week is started. `tries` counts the failed tries at it so far. A step lower than the last
   * one means that week is being redone. `time` says how long each week has been worked on and how long it may be.
   */
  onProgress?: (step: number, tries: number, time: RunTime) => void;
  /** Called as soon as a week is kept, so it can be shown while the later ones are still being worked on. */
  onWeek?: (step: number, schedule: Schedule) => void;
  /** How one week is generated. Left out, it is generated here; the page passes one that tries several seeds at once. */
  generate?: (options: AutoGenOptions) => Promise<AutoGenResult | null>;
  /** Longest one try at one week may take, and longest the whole run may take before it settles for its best (no limit when left out: the weeks have their own). */
  maxMsPerTry?: number;
  maxTotalMs?: number;
  /** Longest one week may be worked on in all before its best is handed over. Left out, it goes by the number of bunks. */
  maxWeekMs?: number;
}

/** Where a run stands on the clock: one entry for each step. */
export interface RunTime {
  /** Milliseconds each week has been worked on, counting every try that is over. */
  spent: number[];
  /** The longest each week may be worked on. */
  budgets: number[];
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
 * finished. A week that has used up its time limit is handed over as the best week found, and `good` is then false.
 * Resolves to null when the signal aborts it.
 */
export async function generateRun(opts: RunOptions): Promise<RunResult | null> {
  const { steps } = opts;
  // a session that has not been given numbers of its own starts from its template's (Session 2 has fewer Yoga and Dance)
  const settings = opts.calendar && isDefaultSettings(opts.settings) ? templateSettings(templateFor(opts.sessionWeeks)) : opts.settings;
  applySettings(settings);
  const started = performance.now();
  const maxTotalMs = opts.maxTotalMs ?? Infinity;
  const generated = new Set(steps.map((s) => s.index));
  // what each week holds before it is generated: a week that is redone starts from this again
  const blank = opts.weeks.map((w, i) =>
    // a week with no bunks yet takes the roster; Taste of CSL is in camp for week 1 only
    generated.has(i) && !isFilledWeek(w) ? { ...emptySchedule(), bunks: opts.roster.filter((b) => i === 0 || !isGuest(b.name)).map((b) => newBunk(b.name, b.grades, b.count)) } : w,
  );
  // the session calendar goes down first, on every week this run builds: trips, village days, Mass Program and the rest
  const input = opts.calendar ? applyCalendar(blank, calendarFor(opts.sessionWeeks), generated) : [...blank];
  // days that have already happened stay exactly as they are: the calendar does not write on them either
  steps.forEach(({ index, pastDays = 0 }) => {
    const from = blank[index];
    const to = input[index];
    if (pastDays <= 0 || !from || !to || from === to) return;
    input[index] = { ...to, bunks: to.bunks.map((b, k) => ({ ...b, slots: b.slots.map((l, s) => (s < pastDays * 4 ? (from.bunks[k]?.slots[s] ?? l) : l)) })) };
  });
  const working = [...input];
  const results: (AutoGenResult | null)[] = steps.map(() => null);
  const best: (AutoGenResult | null)[] = steps.map(() => null);
  /** The last good week each step made: a week that is redone and does not come out good again goes back to it. */
  const lastGood: (AutoGenResult | null)[] = steps.map(() => null);
  const fails = steps.map(() => 0);
  /** Time spent on each week so far, counting every try at it. */
  const spent = steps.map(() => 0);
  const backedUp = steps.map(() => false);
  // every week has a time limit, and a camp of more bunks is given longer
  const budgets = steps.map(({ index }) => opts.maxWeekMs ?? weekBudgetMs(input[index]?.bunks.length ?? opts.roster.length));
  let tries = 0;
  let n = 0;
  while (n < steps.length) {
    const { index, mode, pastDays } = steps[n];
    working[index] = input[index];
    opts.onProgress?.(n, fails[n], { spent: [...spent], budgets });
    // starting fresh: the weeks that are not part of this run are hidden from the generator
    const visible = opts.useOtherWeeks ? working : working.map((w, i) => (generated.has(i) ? w : null));
    const began = performance.now();
    const result = await (opts.generate ?? generateWeekAsync)({
      weeks: { current: index, weeks: visible },
      weekIndex: index + 1,
      mode,
      pastDays,
      sessionWeeks: opts.sessionWeeks,
      seed: (opts.seed + n * 7919 + tries * 104729) | 0,
      keepTrips: opts.keepTrips,
      signal: opts.signal,
      maxMs: Math.max(50, Math.min(opts.maxMsPerTry ?? APP_MAX_MS, budgets[n] - spent[n])),
    });
    spent[n] += performance.now() - began;
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
      lastGood[n] = result;
      keep(result);
      continue;
    }
    const soFar = best[n];
    if (!soFar || compareQuality(result.quality, soFar.quality) < 0) best[n] = result;
    fails[n]++;
    if (spent[n] >= budgets[n] || performance.now() - started >= maxTotalMs) {
      // out of time for this week. A good week it made earlier (before it was redone for the sake of the next one) comes
      // back; otherwise the best it got, with the periods that break a rule emptied so that it keeps the rules.
      const earlier = lastGood[n];
      if (earlier) {
        keep(earlier);
        continue;
      }
      const chosen = best[n] as AutoGenResult;
      const at = { current: index, weeks: visible.map((w, i) => (i === index ? chosen.schedule : w)) };
      const schedule = chosen.quality.hard.length > 0 ? tidyWeek(chosen.schedule, input[index], at, index + 1, opts.sessionWeeks) : chosen.schedule;
      keep({ ...chosen, schedule });
      continue;
    }
    if (fails[n] >= APP_BACK_UP_AFTER && n > 0 && !backedUp[n] && spent[n - 1] < budgets[n - 1]) {
      // this week will not come out with the week before it as it is: redo that one as well, once
      backedUp[n] = true;
      fails[n] = 0;
      best[n] = null;
      n--;
    }
  }
  const done = results as AutoGenResult[];
  return { weeks: working, results: done, good: done.every((r) => !isBad(r.quality)), tries };
}
