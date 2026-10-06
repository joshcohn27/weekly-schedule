import { useMemo, useState } from 'react';
import { computeSessionTracking, computeTracking } from '../tracking';
import type { Bunk, Schedule } from '../types';

interface Props {
  bunks: Bunk[];
  weekLabel: string;
  schedules: Schedule[];
}

type Mode = 'week' | 'session';

export default function TrackingView({ bunks, weekLabel, schedules }: Props) {
  const [mode, setMode] = useState<Mode>('week');
  const weekResult = useMemo(() => computeTracking(bunks), [bunks]);
  const sessionResult = useMemo(() => computeSessionTracking(schedules), [schedules]);
  const result = mode === 'week' ? weekResult : sessionResult;
  // the box the pointer is on: its bunk and its program area light up, and a faint band runs from each of them to the box
  const [hover, setHover] = useState<[number, number] | null>(null);
  const mark = (row: number, col: number): string | undefined =>
    !hover ? undefined : hover[0] === row && hover[1] === col ? 'pair-here' : (row === hover[0] && col < hover[1]) || (col === hover[1] && row < hover[0]) ? 'pair-line' : undefined;
  const classes = (...names: (string | undefined)[]): string | undefined => names.filter(Boolean).join(' ') || undefined;

  return (
    <section>
      <h2>Tracking</h2>
      <p>How many times each bunk has each program area.</p>
      <div className="mode-toggle">
        <button type="button" aria-pressed={mode === 'week'} onClick={() => setMode('week')}>
          {weekLabel}
        </button>
        <button type="button" aria-pressed={mode === 'session'} onClick={() => setMode('session')}>
          Whole session
        </button>
      </div>
      <div className="scroll">
        <table border={1} className="tracking-grid" onMouseLeave={() => setHover(null)}>
          <thead>
            <tr>
              <th>Bunk</th>
              {result.areas.map((a, i) => (
                <th key={a} className={hover?.[1] === i ? 'pair-hover' : undefined}>
                  {a}
                </th>
              ))}
              <th className={hover?.[1] === result.areas.length ? 'pair-hover' : undefined}>Total</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.map((r, row) => (
              <tr key={r.bunk.id}>
                <th scope="row" data-village={r.bunk.name.trim().charAt(0).toUpperCase()} className={hover?.[0] === row ? 'pair-hover' : undefined}>
                  {r.bunk.name}
                </th>
                {r.counts.map((n, i) => (
                  <td key={result.areas[i]} className={classes(n === 0 ? 'zero' : undefined, mark(row, i))} onMouseEnter={() => setHover([row, i])}>
                    {n === 0 ? '-' : n}
                  </td>
                ))}
                <td className={mark(row, result.areas.length)} onMouseEnter={() => setHover([row, result.areas.length])}>
                  {r.total}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">All bunks</th>
              {result.totals.map((n, i) => (
                <td key={result.areas[i]}>{n}</td>
              ))}
              <td>{result.grandTotal}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
