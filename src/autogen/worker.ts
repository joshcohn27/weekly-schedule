import { generateWeekAsync } from './index';
import { applySettings } from './settings';
import type { WeekJob, WeekJobResult } from './background';

// One attempt at one week, off the page's own thread. Several of these run at once with different seeds, and the page
// takes the first good week. Stopping one is done from outside, by ending the worker.
const scope = self as unknown as { onmessage: ((e: MessageEvent<WeekJob>) => void) | null; postMessage: (result: WeekJobResult) => void };

scope.onmessage = async (e) => {
  applySettings(e.data.settings);
  scope.postMessage({ result: await generateWeekAsync(e.data.options) });
};
