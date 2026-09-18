import { useMemo } from 'react';
import { computeTracking } from '../tracking';
import type { Bunk } from '../types';

export default function TrackingView({ bunks }: { bunks: Bunk[] }) {
  const result = useMemo(() => computeTracking(bunks), [bunks]);

  return (
    <section>
      <h2>Tracking</h2>
      <p>How many times each bunk has each program area this week.</p>
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
