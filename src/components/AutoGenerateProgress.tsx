import { useEffect, useState } from 'react';

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

/**
 * The panel under the week bar while Auto generate runs in the background: how many weeks are done, where each one stands,
 * and how long it has been. A week that did not come out right is generated again; it only says "another try".
 */
export default function AutoGenerateProgress({ progress, onStop, now }: Props) {
  const [tick, setTick] = useState(() => now ?? Date.now());
  useEffect(() => {
    if (now !== undefined) return;
    const id = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [now]);

  const { weekNumbers, states, tries } = progress;
  const done = states.filter((s) => s === 'done').length;
  const total = weekNumbers.length;
  return (
    <div className="autogen-progress" role="status">
      <div>
        <span className="spinner" aria-hidden="true" />
        <strong>
          {done} of {total} {total === 1 ? 'week' : 'weeks'} done
        </strong>{' '}
        <span className="muted">{clockText((now ?? tick) - progress.startedAt)}</span>{' '}
        <button type="button" onClick={onStop}>
          Stop
        </button>
      </div>
      {/* one week: there is nothing to count, so the bar only shows that it is busy */}
      {total > 1 ? <progress value={done} max={total} aria-label="Weeks done" /> : <progress aria-label="Working" />}
      <ul>
        {weekNumbers.map((w, i) => (
          <li key={w} data-state={states[i]}>
            Week {w}: {WORD[states[i]]}
            {states[i] === 'working' && tries > 0 ? `, try ${tries + 1}` : ''}
          </li>
        ))}
      </ul>
      <div className="muted">
        You can keep using the page. Finished weeks are already there to look at. A week that does not come out right is
        generated again, so a hard week can take a few minutes. Stop keeps the weeks that are done.
      </div>
    </div>
  );
}
