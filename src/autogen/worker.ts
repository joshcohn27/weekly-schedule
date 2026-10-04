import { generateRun } from './session';
import type { RunEvent, RunRequest } from './background';

// Runs a whole Auto generate off the page's own thread, so the page stays usable while it works.
// Stopping it is done from outside, by ending the worker.
const scope = self as unknown as { onmessage: ((e: MessageEvent<RunRequest>) => void) | null; postMessage: (event: RunEvent) => void };

scope.onmessage = async (e) => {
  const run = await generateRun({
    ...e.data,
    onProgress: (step, tries) => scope.postMessage({ type: 'progress', step, tries }),
    onWeek: (step, schedule) => scope.postMessage({ type: 'week', step, schedule }),
  });
  scope.postMessage({ type: 'done', run });
};
