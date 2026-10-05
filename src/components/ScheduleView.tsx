import { useMemo, useState } from 'react';
import { isCleared } from '../clear';
import { DAYS, PERIODS_PER_DAY } from '../config';
import { highlightFor, isHighlighted, sameHighlight, type Highlight } from '../highlight';
import { blocksByRow, computeBlocks } from '../merge';
import type { Bunk, DayInfo } from '../types';

interface Props {
  bunks: Bunk[];
  days: DayInfo[];
}

export default function ScheduleView({ bunks, days }: Props) {
  const rows = useMemo(() => blocksByRow(computeBlocks(bunks), bunks.length), [bunks]);
  /** The block that was clicked, and what it lights up elsewhere. */
  const [picked, setPicked] = useState<{ row: number; col: number; highlight: Highlight } | null>(null);
  const highlight = picked?.highlight ?? null;
  const periods = Array.from({ length: PERIODS_PER_DAY }, (_, i) => i);
  const half = PERIODS_PER_DAY / 2;

  return (
    <section>
      <h2>Schedule</h2>
      <p>
        <button type="button" onClick={() => window.print()}>
          Print
        </button>
      </p>
      <p className="hint">Click a block to highlight every block in the same program area. Leagues light up within their village.</p>
      <div className="scroll" onClick={() => setPicked(null)}>
        <table border={1} className="schedule">
          <thead>
            <tr>
              <th rowSpan={2}>Bunk</th>
              <th rowSpan={2}>Grades</th>
              <th rowSpan={2}>#</th>
              {DAYS.map((d, i) => (
                <th key={d} colSpan={PERIODS_PER_DAY} className="day">
                  <div>{d}</div>
                  <div>R"H &amp; LOD: {days[i].rhLod}</div>
                  <div>
                    TS: {days[i].ts} General Day: {days[i].generalDay} DOD: {days[i].dod}
                  </div>
                </th>
              ))}
            </tr>
            <tr>
              {DAYS.flatMap((d) => periods.map((p) => <th key={`${d}${p}`}>Period {p + 1}</th>))}
            </tr>
          </thead>
          <tbody>
            {bunks.map((b, r) => (
              <tr key={b.id}>
                <th scope="row" data-village={b.name.trim().charAt(0).toUpperCase()}>
                  {b.name}
                </th>
                <td>{b.grades}</td>
                <td>{b.count}</td>
                {rows[r].map((blk) => {
                  if (!blk.label) return <td key={blk.col} rowSpan={blk.rowSpan} colSpan={blk.colSpan} className={isCleared(b, blk.col) ? 'cleared' : undefined} />;
                  const names = bunks.slice(r, r + blk.rowSpan).map((x) => x.name);
                  const lit = isHighlighted(highlight, blk.label, names);
                  const isPicked = picked?.row === r && picked.col === blk.col;
                  const choose = () => {
                    const next = highlightFor(blk.label, b.name);
                    setPicked(next && !(isPicked && sameHighlight(next, highlight)) ? { row: r, col: blk.col, highlight: next } : null);
                  };
                  return (
                    <td
                      key={blk.col}
                      rowSpan={blk.rowSpan}
                      colSpan={blk.colSpan}
                      className={`filled${lit ? ' hl' : ''}${isPicked ? ' picked' : ''}`}
                      role="button"
                      tabIndex={0}
                      aria-pressed={isPicked}
                      onClick={(e) => {
                        e.stopPropagation();
                        choose();
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          choose();
                        } else if (e.key === 'Escape') setPicked(null);
                      }}
                    >
                      {blk.label}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} />
              {DAYS.flatMap((d, i) => [
                <td key={`${d}b`} colSpan={half}>
                  Birthdays: {days[i].birthdays}
                </td>,
                <td key={`${d}e`} colSpan={PERIODS_PER_DAY - half}>
                  EVP: {days[i].evp}
                </td>,
              ])}
            </tr>
            <tr>
              <td colSpan={3} />
              {DAYS.map((d, i) => (
                <td key={d} colSpan={PERIODS_PER_DAY}>
                  Notes: {days[i].notes}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
