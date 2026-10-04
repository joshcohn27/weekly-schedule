import type { Schedule } from '../types';
import { generateRun, type RunOptions, type RunResult } from './session';

/** What a run is asked to do: everything in RunOptions that can be sent to a worker. */
export type RunRequest = Omit<RunOptions, 'signal' | 'onProgress' | 'onWeek'>;

export type RunEvent =
  | { type: 'progress'; step: number; tries: number }
  | { type: 'week'; step: number; schedule: Schedule }
  | { type: 'done'; run: RunResult | null };

export interface RunHandlers {
  /** A week was started. `tries` counts its failed tries so far; a step lower than before means that week is being redone. */
  onProgress: (step: number, tries: number) => void;
  /** A week is finished and kept. */
  onWeek: (step: number, schedule: Schedule) => void;
  /** The run is over. Not called after stop(). */
  onDone: (run: RunResult | null) => void;
}

/**
 * Start an Auto generate run in the background and report as it goes. The page stays usable meanwhile. Returns a way to
 * stop it; after stopping nothing more is reported. Where there are no workers (tests, a very old browser) it runs on the
 * page's own thread instead, pausing between rounds.
 */
export function startRun(request: RunRequest, handlers: RunHandlers): { stop: () => void } {
  if (typeof Worker === 'undefined') {
    const abort = new AbortController();
    void generateRun({ ...request, signal: abort.signal, onProgress: handlers.onProgress, onWeek: handlers.onWeek }).then((run) => {
      if (!abort.signal.aborted) handlers.onDone(run);
    });
    return { stop: () => abort.abort() };
  }
  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (e: MessageEvent<RunEvent>) => {
    const event = e.data;
    if (event.type === 'progress') handlers.onProgress(event.step, event.tries);
    else if (event.type === 'week') handlers.onWeek(event.step, event.schedule);
    else {
      worker.terminate();
      handlers.onDone(event.run);
    }
  };
  worker.onerror = () => {
    worker.terminate();
    handlers.onDone(null);
  };
  worker.postMessage(request);
  return { stop: () => worker.terminate() };
}
