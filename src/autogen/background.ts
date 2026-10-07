import type { Schedule } from '../types';
import { APP_MAX_WORKERS } from './config';
import { isBad, type AutoGenOptions, type AutoGenResult } from './index';
import { compareQuality } from './quality';
import { generateRun, type RunOptions, type RunResult, type RunTime } from './session';
import type { Settings } from './settings';

/** What a run is asked to do: everything in RunOptions that the page decides. */
export type RunRequest = Omit<RunOptions, 'signal' | 'onProgress' | 'onWeek' | 'generate'>;

/** One attempt at one week, as it is handed to a worker, and what comes back. */
export interface WeekJob {
  options: Omit<AutoGenOptions, 'signal'>;
  settings?: Settings;
}
export interface WeekJobResult {
  result: AutoGenResult | null;
}

export interface RunHandlers {
  /** A try at a week was started. `tries` counts its failed tries so far; a step lower than before means that week is being redone. `time` is how long each week has had and may have. */
  onProgress: (step: number, tries: number, time: RunTime) => void;
  /** A week is finished and kept. */
  onWeek: (step: number, schedule: Schedule) => void;
  /** The run is over. Not called after stop(). */
  onDone: (run: RunResult | null) => void;
}

/** How many attempts to run at once: one for each processor core but one, so the page stays quick. */
export function workerCount(): number {
  const cores = typeof navigator !== 'undefined' && navigator.hardwareConcurrency ? navigator.hardwareConcurrency : 4;
  return Math.max(1, Math.min(APP_MAX_WORKERS, cores - 1));
}

/**
 * Start an Auto generate run in the background and report as it goes. The page stays usable meanwhile. Each week is tried
 * by several workers at once, every one with its own seed; the first good week is kept and the others are ended. Returns a
 * way to stop the run; after stopping nothing more is reported. Where there are no workers (tests, a very old browser) it
 * runs on the page's own thread instead, one attempt at a time, pausing between rounds.
 */
export function startRun(request: RunRequest, handlers: RunHandlers): { stop: () => void } {
  const abort = new AbortController();
  const live = new Set<Worker>();
  const end = (worker: Worker) => {
    worker.terminate();
    live.delete(worker);
  };

  /** Several attempts at one week at once. Resolves to the first good week, or to the best of them when none is good. */
  const race = (options: AutoGenOptions): Promise<AutoGenResult | null> =>
    new Promise((resolve) => {
      const count = workerCount();
      const mine: Worker[] = [];
      let best: AutoGenResult | null = null;
      let left = count;
      let settled = false;
      const settle = (result: AutoGenResult | null) => {
        if (settled) return;
        settled = true;
        mine.forEach(end);
        resolve(result);
      };
      abort.signal.addEventListener('abort', () => settle(null), { once: true });
      const finished = (result: AutoGenResult | null) => {
        if (result && !isBad(result.quality)) return settle(result);
        if (result && (!best || compareQuality(result.quality, best.quality) < 0)) best = result;
        if (--left === 0) settle(best);
      };
      const { signal: _signal, ...plain } = options;
      for (let k = 0; k < count; k++) {
        const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
        mine.push(worker);
        live.add(worker);
        worker.onmessage = (e: MessageEvent<WeekJobResult>) => finished(e.data.result);
        worker.onerror = () => finished(null);
        const job: WeekJob = { options: { ...plain, seed: (options.seed + k * 0x3c6ef372) | 0 }, settings: request.settings };
        worker.postMessage(job);
      }
    });

  void generateRun({
    ...request,
    signal: abort.signal,
    onProgress: handlers.onProgress,
    onWeek: handlers.onWeek,
    generate: typeof Worker === 'undefined' ? undefined : race,
  }).then(
    (run) => {
      if (!abort.signal.aborted) handlers.onDone(run);
    },
    () => {
      if (!abort.signal.aborted) handlers.onDone(null);
    },
  );
  return {
    stop: () => {
      abort.abort();
      [...live].forEach(end);
    },
  };
}
