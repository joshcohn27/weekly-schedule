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
        <table border={1}>
          <thead>
            <tr>
              <th>Bunk</th>
              {result.areas.map((a) => (
                <th key={a}>{a}</th>
              ))}
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.map((r) => (
              <tr key={r.bunk.id}>
                <th scope="row" data-village={r.bunk.name.trim().charAt(0).toUpperCase()}>
                  {r.bunk.name}
                </th>
                {r.counts.map((n, i) => (
                  <td key={result.areas[i]} className={n === 0 ? 'zero' : undefined}>
                    {n === 0 ? '-' : n}
                  </td>
                ))}
                <td>{r.total}</td>
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
