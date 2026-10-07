import { useEffect, useRef, useState } from 'react';

/** Where one week of a run stands. */
export type WeekProgress = 'waiting' | 'working' | 'done';

export interface RunProgress {
  /** 1-based numbers of the weeks being generated, in order. */
  weekNumbers: number[];
  /** One per week, in the same order. */
  states: WeekProgress[];
  /** Failed tries at the week being worked on. */
  tries: number;
  /** When the run started, in milliseconds (Date.now()). */
  startedAt: number;
  /** Time worked on each week so far, in milliseconds, up to the start of the try that is going on now. */
  spent?: number[];
  /** The longest each week may be worked on, in milliseconds: a bigger camp is given longer. */
  budgets?: number[];
  /** When the try that is going on now started (Date.now()). */
  tryStartedAt?: number;
}

interface Props {
  progress: RunProgress;
  onStop: () => void;
  /** The clock, for tests. */
  now?: number;
}

export const clockText = (ms: number): string => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

const WORD: Record<WeekProgress, string> = { waiting: 'waiting', working: 'working', done: 'done' };
/** How finely the bar is drawn. */
const STOPS = 1000;

/** Most weeks come out in the first quarter of their time limit (measured), so that quarter is given most of a week's stretch of the bar. */
const USUAL_SHARE_OF_LIMIT = 0.25;
const BAR_SHARE_FOR_USUAL = 0.8;
/** How much of its stretch of the bar a week has covered after `used` of a limit of `budget` milliseconds: 0 to 1, never backwards, 1 only at the limit. */
export function weekShare(used: number, budget: number): number {
  if (budget <= 0) return 0;
  const usual = budget * USUAL_SHARE_OF_LIMIT;
  const t = Math.min(budget, Math.max(0, used));
  return t <= usual ? (BAR_SHARE_FOR_USUAL * t) / usual : BAR_SHARE_FOR_USUAL + ((1 - BAR_SHARE_FOR_USUAL) * (t - usual)) / (budget - usual);
}

/**
 * How far a run has got, from 0 to 1, and the most time it can still take. Every week has a time limit. A week that is done
 * counts in full; a week being worked on counts by the clock against its limit (weekShare). So the bar moves all the time,
 * jumps ahead when a week comes out early, never fills a week's stretch before the week is done or out of time, and is
 * full when the run is over.
 */
export function runMeasure(progress: RunProgress, now: number): { share: number; leftAtMost: number } | null {
  const { states, spent, budgets, tryStartedAt } = progress;
  if (!spent || !budgets || states.length === 0) return null;
  let share = 0;
  let leftAtMost = 0;
  states.forEach((state, i) => {
    if (state === 'done') {
      share += 1;
      return;
    }
    const used = Math.min(budgets[i], spent[i] + (state === 'working' && tryStartedAt !== undefined ? Math.max(0, now - tryStartedAt) : 0));
    share += weekShare(used, budgets[i]);
    leftAtMost += budgets[i] - used;
  });
  return { share: share / states.length, leftAtMost };
}

/**
 * The panel while Auto generate runs in the background: a bar that moves with the clock, how many weeks are done, where
 * each one stands, how long it has been and the most it can still take.
 */
export default function AutoGenerateProgress({ progress, onStop, now }: Props) {
  const [tick, setTick] = useState(() => now ?? Date.now());
  useEffect(() => {
    if (now !== undefined) return;
    const id = setInterval(() => setTick(Date.now()), 250);
    return () => clearInterval(id);
  }, [now]);
  // a week that is taken back to be redone must not pull the bar backwards
  const furthest = useRef(0);

  const { weekNumbers, states, tries } = progress;
  const at = now ?? tick;
  const done = states.filter((s) => s === 'done').length;
  const total = weekNumbers.length;
  const measure = runMeasure(progress, at);
  if (measure) furthest.current = Math.max(furthest.current, measure.share);
  const working = states.indexOf('working');
  return (
    <div className="autogen-progress" role="status">
      <div>
        <span className="spinner" aria-hidden="true" />
        <strong>
          {done} of {total} {total === 1 ? 'week' : 'weeks'} done
        </strong>{' '}
        <span className="muted">
          {clockText(at - progress.startedAt)}
          {measure && measure.leftAtMost > 0 ? `, ${clockText(measure.leftAtMost)} more at the most` : ''}
        </span>{' '}
        <button type="button" onClick={onStop}>
          Stop
        </button>
      </div>
      {measure ? (
        <progress value={Math.round(furthest.current * STOPS)} max={STOPS} aria-label="How far the run has got" />
      ) : total > 1 ? (
        <progress value={done} max={total} aria-label="Weeks done" />
      ) : (
        // one week and no clock to go by: the bar only shows that it is busy
        <progress aria-label="Working" />
      )}
      <ul>
        {weekNumbers.map((w, i) => (
          <li key={w} data-state={states[i]}>
            Week {w}: {WORD[states[i]]}
            {states[i] === 'working' && tries > 0 ? `, try ${tries + 1}` : ''}
          </li>
        ))}
      </ul>
      <div className="muted">
        {measure && working >= 0 && progress.budgets
          ? `Each week is tried several ways at once until one keeps every rule. Week ${weekNumbers[working]} may take up to ${clockText(progress.budgets[working])}; a bigger camp is given longer. `
          : ''}
        You can keep using the page. Finished weeks are already there to look at. Stop keeps the weeks that are done.
      </div>
    </div>
  );
}
